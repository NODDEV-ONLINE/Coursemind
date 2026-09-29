import type { ValidatedCitation } from './citations.js';

/**
 * SSE EVENT CONTRACT for `POST /courses/:id/ask` (B3, FR-13). Task C (chat UI)
 * consumes exactly this. The response is `text/event-stream`; each event is a
 * standard SSE frame: `event: <name>\n` followed by one `data: <json>\n` line and a
 * blank line. Events arrive in this order:
 *
 *   1. `event: token`      — zero or more; incremental answer text deltas.
 *                            data: { "delta": "<partial answer text>" }
 *   2. `event: citations`  — exactly one; the VALIDATED citation list (may be empty
 *                            on the refusal path). Emitted after the last token.
 *                            data: { "citations": [ { document_id, page, chunk_id } ] }
 *   3. `event: done`       — exactly one; terminal marker with lightweight usage.
 *                            data: { "finishReason": "stop" | "refusal" | "error",
 *                                    "usage": { "promptTokens": n, "completionTokens": n } }
 *
 * On an upstream error mid-stream we still emit a terminal `done` with
 * finishReason "error" (never leave the stream hanging). The refusal path (FR-12)
 * streams the refusal sentence as a single `token`, an empty `citations` list, then
 * `done` with finishReason "refusal" — the LLM is never called.
 *
 * Low-data mode (B6, `?lowData=1` or `X-Low-Data: 1`) uses the SAME contract; it
 * only shrinks the payload (compact answer, no extra fields) — no heavy assets.
 */

/** Discriminated union of every SSE event this endpoint emits. */
export type AskEvent =
  | { event: 'token'; data: TokenData }
  | { event: 'citations'; data: CitationsData }
  | { event: 'done'; data: DoneData };

export interface TokenData {
  delta: string;
}

export interface CitationsData {
  citations: ValidatedCitation[];
}

export type FinishReason = 'stop' | 'refusal' | 'error';

export interface DoneData {
  finishReason: FinishReason;
  /** Token usage for cost tracking (NFR-6/NFR-7). Zeroed on the refusal path. */
  usage: { promptTokens: number; completionTokens: number };
}

/** Serialize one event to a raw SSE frame (`event:`/`data:`/blank line). */
export function serializeSseEvent(evt: AskEvent): string {
  return `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`;
}
