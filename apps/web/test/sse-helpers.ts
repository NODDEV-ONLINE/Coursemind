/** Test helpers: build SSE bodies the way apps/api serialises them (ask.events.ts). */

export function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const usage = { promptTokens: 10, completionTokens: 5 };

export interface StreamScript {
  chunks: string[];
  /** Error the stream after the chunks instead of closing it (network drop). */
  failAtEnd?: boolean;
  /** Keep the stream open after the chunks until aborted. */
  hang?: boolean;
}

/** A byte stream that yields each chunk on its own macrotask. */
export function scriptedStream(
  script: StreamScript,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.aborted) {
        controller.error(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const chunk = script.chunks[i++];
      if (chunk !== undefined) {
        controller.enqueue(encoder.encode(chunk));
        return;
      }
      if (script.failAtEnd) {
        controller.error(new TypeError('network error'));
      } else if (script.hang) {
        await new Promise<void>((resolve) => {
          if (signal?.aborted) return resolve();
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        controller.error(new DOMException('Aborted', 'AbortError'));
      } else {
        controller.close();
      }
    },
  });
}

export function sseResponse(script: StreamScript, signal?: AbortSignal): Response {
  return new Response(scriptedStream(script, signal), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
