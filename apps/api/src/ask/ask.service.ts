import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { streamText as defaultStreamText, type LanguageModel } from 'ai';
import { retrieveChunks, type RetrievalHit } from '@coursemind/retrieval';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { LlmService } from '../llm/llm.service.js';
import { buildSystemPrompt, buildUserPrompt, REFUSAL_MESSAGE } from './prompt.builder.js';
import { validateCitations } from './citations.js';
import type { AskEvent } from './ask.events.js';

/**
 * Minimal structural type of the AI SDK `streamText` result we depend on. Keeping
 * it narrow lets tests inject a fake without pulling the SDK's full result type.
 */
interface StreamTextResult {
  /** Async iterable of incremental text deltas (token stream). */
  textStream: AsyncIterable<string>;
  /** Resolves once generation finishes; used for token telemetry (NFR-6). */
  usage: Promise<{ inputTokens?: number; outputTokens?: number } | undefined>;
}

/** The subset of `streamText`'s signature we call. Injectable for tests. */
export type StreamTextFn = (args: {
  model: LanguageModel;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}) => StreamTextResult;

/** DI token for the injected `streamText` implementation (real one by default). */
export const STREAM_TEXT = Symbol('STREAM_TEXT');

/** Compact-mode output cap: keeps low-data answers well under the 30 KB budget (B6). */
const LOW_DATA_MAX_OUTPUT_TOKENS = 512;

/**
 * B3/B4/B5/B6 — grounded answer orchestration.
 *
 * Flow: retrieve (course-scoped) → refuse if insufficient (never call the LLM) →
 * otherwise build a grounded prompt, stream tokens, validate citations against the
 * retrieved set, then emit citations + a terminal done with token usage.
 *
 * {@link streamAnswer} is an async generator of {@link AskEvent}s so it can be unit
 * tested without HTTP; the controller adapts it to an SSE response.
 */
@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private readonly streamText: StreamTextFn;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly llm: LlmService,
    // Optional injection: falls back to the real AI SDK `streamText` in prod.
    // Tests provide a fake via the STREAM_TEXT token; prod leaves it unbound.
    @Optional() @Inject(STREAM_TEXT) streamText?: StreamTextFn,
  ) {
    this.streamText = streamText ?? (defaultStreamText as unknown as StreamTextFn);
  }

  /**
   * Stream a grounded, cited answer (or a refusal) for `question` scoped to
   * `courseId`. Ownership MUST already be verified by the caller (SR-2).
   *
   * @param signal - client-disconnect signal; aborts the embed + LLM calls
   *   (cancellation + backpressure: we stop pulling tokens once aborted).
   */
  async *streamAnswer(params: {
    courseId: string;
    question: string;
    lowData: boolean;
    signal: AbortSignal;
  }): AsyncGenerator<AskEvent> {
    const { courseId, question, lowData, signal } = params;

    // 1. Retrieve, course-scoped (SR-2). Retrieval owns embedding + vector search.
    const retrieval = await retrieveChunks({
      query: question,
      courseId,
      db: this.db.getPool(),
      ingestServiceUrl: this.config.ingestServiceUrl,
      topK: this.config.retrievalTopK,
      scoreThreshold: this.config.retrievalScoreThreshold,
      signal,
    });

    // 2. Refusal path (FR-10/FR-12): no grounded chunk → refuse, never call the LLM.
    if (retrieval.insufficient) {
      yield { event: 'token', data: { delta: REFUSAL_MESSAGE } };
      yield { event: 'citations', data: { citations: [] } };
      yield {
        event: 'done',
        data: { finishReason: 'refusal', usage: { promptTokens: 0, completionTokens: 0 } },
      };
      return;
    }

    yield* this.streamGroundedAnswer(question, retrieval.hits, lowData, signal);
  }

  /** Grounded generation path: prompt → stream tokens → validate + emit citations. */
  private async *streamGroundedAnswer(
    question: string,
    hits: readonly RetrievalHit[],
    lowData: boolean,
    signal: AbortSignal,
  ): AsyncGenerator<AskEvent> {
    const system = buildSystemPrompt();
    const prompt = buildUserPrompt(question, hits);

    let accumulated = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: 'stop' | 'error' = 'stop';

    try {
      const result = this.streamText({
        model: this.llm.getModel(),
        system,
        prompt,
        abortSignal: signal,
        ...(lowData ? { maxOutputTokens: LOW_DATA_MAX_OUTPUT_TOKENS } : {}),
      });

      for await (const delta of result.textStream) {
        // Stop pulling if the client has gone away (cancellation/backpressure).
        if (signal.aborted) break;
        accumulated += delta;
        yield { event: 'token', data: { delta } };
      }

      // Token telemetry for cost tracking (NFR-6/NFR-7). No silent LLM calls.
      const usage = await result.usage;
      promptTokens = usage?.inputTokens ?? 0;
      completionTokens = usage?.outputTokens ?? 0;
    } catch (err) {
      // Aborts are expected on client disconnect — not an error to surface.
      if (!signal.aborted) {
        finishReason = 'error';
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`LLM stream failed: ${message}`);
      }
    }

    // 4. Validate citations against the retrieved set (FR-11): invented → dropped.
    const citations = validateCitations(accumulated, hits);
    yield { event: 'citations', data: { citations } };
    yield {
      event: 'done',
      data: { finishReason, usage: { promptTokens, completionTokens } },
    };
  }
}
