import { AskProtocolError, parseAskEvent, type AskEvent } from './ask-events';
import { createSseParser } from './sse';

/**
 * Browser client for the ask stream (FR-13). Talks only to this app's own proxy
 * route (`/api/courses/:id/ask`), never to the API directly: the proxy injects the
 * server-held identity so the browser never sees it.
 */

export type AskOutcome =
  /** The terminal `done` event arrived. */
  | { type: 'completed' }
  /** The caller aborted (Stop). Whatever arrived was already delivered. */
  | { type: 'aborted' }
  /** Non-2xx before the stream started. */
  | { type: 'http_error'; status: number; retryAfterSeconds: number | null }
  /** Network failure, or the stream ended without `done`. Partial text is kept. */
  | { type: 'connection_lost' }
  /** A known event carried data that breaks the contract. */
  | { type: 'protocol_error' };

export interface StreamAskOptions {
  courseId: string;
  question: string;
  lowData: boolean;
  signal: AbortSignal;
  onEvent: (event: AskEvent) => void;
  /** Called with each received chunk's byte length (data meter, FR-14). */
  onBytes?: (bytes: number) => void;
  fetchImpl?: typeof fetch;
}

export function askUrl(courseId: string, lowData: boolean): string {
  return `/api/courses/${encodeURIComponent(courseId)}/ask${lowData ? '?lowData=1' : ''}`;
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into seconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

export async function streamAsk(opts: StreamAskOptions): Promise<AskOutcome> {
  const { signal, onEvent, onBytes } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(askUrl(opts.courseId, opts.lowData), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ question: opts.question }),
      signal,
      cache: 'no-store',
    });
  } catch {
    return signal.aborted ? { type: 'aborted' } : { type: 'connection_lost' };
  }

  if (!res.ok || res.body === null) {
    try {
      await res.body?.cancel();
    } catch {
      // ignore: we only wanted to release the connection
    }
    return {
      type: 'http_error',
      status: res.status,
      retryAfterSeconds: parseRetryAfter(res.headers.get('Retry-After')),
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let sawDone = false;

  const deliver = (text: string): void => {
    for (const msg of parser.push(text)) {
      const event = parseAskEvent(msg);
      if (event === null) continue;
      onEvent(event);
      if (event.event === 'done') sawDone = true;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      onBytes?.(value.byteLength);
      deliver(decoder.decode(value, { stream: true }));
    }
    deliver(decoder.decode());
    parser.flush();
  } catch (err) {
    if (signal.aborted) return { type: 'aborted' };
    if (err instanceof AskProtocolError) {
      void reader.cancel().catch(() => undefined);
      return { type: 'protocol_error' };
    }
    return { type: 'connection_lost' };
  }

  if (signal.aborted && !sawDone) return { type: 'aborted' };
  return sawDone ? { type: 'completed' } : { type: 'connection_lost' };
}
