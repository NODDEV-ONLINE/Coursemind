import { z } from 'zod';
import type { SseMessage } from './sse';

/**
 * Client-side schemas for the `POST /courses/:id/ask` SSE contract (FR-13). The
 * authoritative contract is documented in apps/api/src/ask/ask.events.ts; this is
 * the web app's boundary validation of that wire format (CLAUDE.md §4: validate
 * external input with Zod). Order: token* → citations (1) → done (1).
 *
 * TODO(M3 follow-up): move the contract into a shared `packages/*` module so the API
 * and web import one definition instead of mirroring it.
 */

export const citationSchema = z.object({
  document_id: z.string().min(1),
  page: z.number().int().nonnegative(),
  chunk_id: z.string().min(1),
});
export type Citation = z.infer<typeof citationSchema>;

const tokenDataSchema = z.object({ delta: z.string() });
const citationsDataSchema = z.object({ citations: z.array(citationSchema) });
const doneDataSchema = z.object({
  finishReason: z.enum(['stop', 'refusal', 'error']),
  usage: z.object({
    promptTokens: z.number().nonnegative(),
    completionTokens: z.number().nonnegative(),
  }),
});

type TokenData = z.infer<typeof tokenDataSchema>;
type CitationsData = z.infer<typeof citationsDataSchema>;
type DoneData = z.infer<typeof doneDataSchema>;
export type FinishReason = DoneData['finishReason'];

export type AskEvent =
  | { event: 'token'; data: TokenData }
  | { event: 'citations'; data: CitationsData }
  | { event: 'done'; data: DoneData };

/** Thrown when a known event carries data that doesn't match the contract. */
export class AskProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AskProtocolError';
  }
}

function validate<S extends z.ZodTypeAny>(schema: S, msg: SseMessage): z.infer<S> {
  let json: unknown;
  try {
    json = JSON.parse(msg.data);
  } catch {
    throw new AskProtocolError(`Malformed JSON in "${msg.event}" event`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AskProtocolError(`Invalid "${msg.event}" event payload`);
  }
  return parsed.data;
}

/**
 * Validate one SSE message against the contract. Unknown event names return null
 * (forward-compatible: new events must not break old clients); a known event with
 * bad data throws {@link AskProtocolError}.
 */
export function parseAskEvent(msg: SseMessage): AskEvent | null {
  switch (msg.event) {
    case 'token':
      return { event: 'token', data: validate(tokenDataSchema, msg) };
    case 'citations':
      return { event: 'citations', data: validate(citationsDataSchema, msg) };
    case 'done':
      return { event: 'done', data: validate(doneDataSchema, msg) };
    default:
      return null;
  }
}
