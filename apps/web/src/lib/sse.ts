/**
 * Incremental Server-Sent Events parser (FR-13).
 *
 * Network chunks do not respect frame boundaries: one chunk can hold several
 * frames, and one frame (or even one line, or a CRLF pair) can be split across
 * chunks. This parser buffers partial lines and only emits a message when its
 * terminating blank line has arrived. It follows the WHATWG event-stream rules we
 * rely on: `event:`/`data:` fields, one optional space after the colon, multi-line
 * `data` joined with "\n", `:` comment lines ignored, LF / CRLF / CR line endings.
 *
 * Decoding bytes → text is the caller's job (use one `TextDecoder` with
 * `{ stream: true }` so multi-byte characters split across chunks survive).
 */

export interface SseMessage {
  /** Event name; defaults to "message" per the spec when no `event:` field. */
  event: string;
  /** Concatenated `data:` lines. */
  data: string;
}

export interface SseParser {
  /** Feed decoded text; returns every message completed by this chunk. */
  push(chunk: string): SseMessage[];
  /** End of stream: a trailing frame without its blank line is discarded (spec). */
  flush(): SseMessage[];
}

export function createSseParser(): SseParser {
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];
  let hasData = false;

  function dispatch(out: SseMessage[]): void {
    if (hasData) {
      out.push({ event: eventName || 'message', data: dataLines.join('\n') });
    }
    eventName = '';
    dataLines = [];
    hasData = false;
  }

  function processLine(line: string, out: SseMessage[]): void {
    if (line === '') {
      dispatch(out);
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
      hasData = true;
    }
    // `id` and `retry` are not used by the ask contract; ignore them.
  }

  return {
    push(chunk: string): SseMessage[] {
      const out: SseMessage[] = [];
      buffer += chunk;

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch !== '\n' && ch !== '\r') continue;
        // A CR at the very end may be the first half of a CRLF split across chunks:
        // wait for the next chunk before deciding.
        if (ch === '\r' && i === buffer.length - 1) break;
        processLine(buffer.slice(start, i), out);
        if (ch === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      return out;
    },

    flush(): SseMessage[] {
      const out: SseMessage[] = [];
      if (buffer.endsWith('\r')) {
        processLine(buffer.slice(0, -1), out);
        buffer = '';
      }
      // Per spec an unterminated final frame is not dispatched.
      buffer = '';
      eventName = '';
      dataLines = [];
      hasData = false;
      return out;
    },
  };
}
