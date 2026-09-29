import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E2 (grounding/refusal) + E3 (citation validation) + E4 (streaming order) for the
 * grounded-answer orchestration (M3 Task B). Everything is mocked: `retrieveChunks`
 * (module mock) and the AI SDK `streamText` (a fake injected via the constructor).
 * No network, no DB, no API keys.
 */

// Module mock for the shared retrieval client. `vi.hoisted` lets the factory
// reference the mock without the "cannot access before initialization" trap.
const { retrieveChunksMock } = vi.hoisted(() => ({ retrieveChunksMock: vi.fn() }));
vi.mock('@coursemind/retrieval', () => ({
  retrieveChunks: retrieveChunksMock,
}));

import { AskService, type StreamTextFn } from '../src/ask/ask.service.js';
import type { AskEvent } from '../src/ask/ask.events.js';
import { REFUSAL_MESSAGE } from '../src/ask/prompt.builder.js';

const COURSE_ID = '22222222-2222-2222-2222-222222222222';
const DOC_ID = '44444444-4444-4444-4444-444444444444';

/** Minimal fakes for the injected services AskService depends on. */
const fakeConfig = {
  ingestServiceUrl: 'http://ingest.test:8000',
  retrievalTopK: 5,
  retrievalScoreThreshold: 0.35,
} as unknown as ConstructorParameters<typeof AskService>[0];

const fakeDb = {
  getPool: () => ({}) as never,
} as unknown as ConstructorParameters<typeof AskService>[1];

const fakeLlm = {
  getModel: () => ({}) as never,
} as unknown as ConstructorParameters<typeof AskService>[2];

/** Build a fake `streamText` that emits the given deltas then resolves usage. */
function fakeStreamText(deltas: string[], usage = { inputTokens: 10, outputTokens: 5 }): {
  fn: StreamTextFn;
  calls: Array<{ system: string; prompt: string }>;
} {
  const calls: Array<{ system: string; prompt: string }> = [];
  const fn: StreamTextFn = (args) => {
    calls.push({ system: args.system, prompt: args.prompt });
    return {
      textStream: (async function* () {
        for (const d of deltas) yield d;
      })(),
      usage: Promise.resolve(usage),
    };
  };
  return { fn, calls };
}

async function collect(gen: AsyncGenerator<AskEvent>): Promise<AskEvent[]> {
  const out: AskEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function run(service: AskService, opts?: { lowData?: boolean }): AsyncGenerator<AskEvent> {
  return service.streamAnswer({
    courseId: COURSE_ID,
    question: 'What is X?',
    lowData: opts?.lowData ?? false,
    signal: new AbortController().signal,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AskService — refusal path (E2, FR-12)', () => {
  it('refuses and NEVER calls the LLM when retrieval is insufficient', async () => {
    retrieveChunksMock.mockResolvedValueOnce({ insufficient: true, hits: [] });
    const { fn, calls } = fakeStreamText(['should not run']);
    const service = new AskService(fakeConfig, fakeDb, fakeLlm, fn);

    const events = await collect(run(service));

    // LLM was not invoked at all.
    expect(calls).toHaveLength(0);
    // Exactly the refusal token, an empty citations list, then done/refusal.
    expect(events).toEqual([
      { event: 'token', data: { delta: REFUSAL_MESSAGE } },
      { event: 'citations', data: { citations: [] } },
      {
        event: 'done',
        data: { finishReason: 'refusal', usage: { promptTokens: 0, completionTokens: 0 } },
      },
    ]);
  });
});

describe('AskService — grounded path (E2, FR-10/FR-11)', () => {
  const hits = [{ chunk_id: 'c1', document_id: DOC_ID, page: 3, text: 'X is a thing.', score: 0.1 }];

  beforeEach(() => {
    retrieveChunksMock.mockResolvedValue({ insufficient: false, hits });
  });

  it('streams the answer and emits a valid citation', async () => {
    const answer = `X is a thing [doc:${DOC_ID} p3].`;
    const { fn, calls } = fakeStreamText([answer]);
    const service = new AskService(fakeConfig, fakeDb, fakeLlm, fn);

    const events = await collect(run(service));

    // LLM was called with the grounded prompt containing the chunk text (untrusted block).
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain('X is a thing.');
    expect(calls[0]!.system).toMatch(/only/i);

    const citationsEvent = events.find((e) => e.event === 'citations');
    expect(citationsEvent?.data).toEqual({
      citations: [{ document_id: DOC_ID, page: 3, chunk_id: 'c1' }],
    });

    const done = events.find((e) => e.event === 'done');
    expect(done?.data).toMatchObject({
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5 },
    });
  });

  it('low-data mode still produces a grounded answer under the same contract', async () => {
    const { fn } = fakeStreamText([`Short [doc:${DOC_ID} p3].`]);
    const service = new AskService(fakeConfig, fakeDb, fakeLlm, fn);

    const events = await collect(run(service, { lowData: true }));
    const text = events
      .filter((e) => e.event === 'token')
      .map((e) => (e as { data: { delta: string } }).data.delta)
      .join('');

    expect(text).toContain('Short');
    // Payload stays tiny — well under the 30 KB low-data budget (FR-14/NFR-2).
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(30 * 1024);
  });
});

describe('AskService — citation validation (E3, FR-11)', () => {
  const hits = [{ chunk_id: 'c1', document_id: DOC_ID, page: 3, text: 'X is a thing.', score: 0.1 }];

  beforeEach(() => {
    retrieveChunksMock.mockResolvedValue({ insufficient: false, hits });
  });

  it('drops a citation that is NOT in the retrieved set', async () => {
    // Model cites a real chunk (p3) and an invented one (unknown doc / p99).
    const answer =
      `X is a thing [doc:${DOC_ID} p3]. ` +
      `Also [doc:99999999-9999-9999-9999-999999999999 p99].`;
    const { fn } = fakeStreamText([answer]);
    const service = new AskService(fakeConfig, fakeDb, fakeLlm, fn);

    const events = await collect(run(service));
    const citationsEvent = events.find((e) => e.event === 'citations');

    // Only the retrieved citation survives; the invented one is dropped.
    expect(citationsEvent?.data).toEqual({
      citations: [{ document_id: DOC_ID, page: 3, chunk_id: 'c1' }],
    });
  });
});

describe('AskService — streaming order (E4, SSE contract)', () => {
  const hits = [{ chunk_id: 'c1', document_id: DOC_ID, page: 3, text: 'X is a thing.', score: 0.1 }];

  beforeEach(() => {
    retrieveChunksMock.mockResolvedValue({ insufficient: false, hits });
  });

  it('emits token deltas, then citations, then done — in that order', async () => {
    const deltas = ['X ', 'is ', `a thing [doc:${DOC_ID} p3].`];
    const { fn } = fakeStreamText(deltas);
    const service = new AskService(fakeConfig, fakeDb, fakeLlm, fn);

    const events = await collect(run(service));
    const order = events.map((e) => e.event);

    // All token events come first, then exactly one citations, then one done.
    expect(order).toEqual(['token', 'token', 'token', 'citations', 'done']);
    // Deltas are streamed incrementally, not buffered into one blob.
    expect(events.slice(0, 3).map((e) => (e as { data: { delta: string } }).data.delta)).toEqual(
      deltas,
    );
  });
});
