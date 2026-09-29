import { describe, expect, it } from 'vitest';
import { createSseParser, type SseMessage } from './sse';

function feed(chunks: string[]): SseMessage[] {
  const parser = createSseParser();
  const out: SseMessage[] = [];
  for (const c of chunks) out.push(...parser.push(c));
  out.push(...parser.flush());
  return out;
}

const token = (delta: string) => `event: token\ndata: ${JSON.stringify({ delta })}\n\n`;

describe('createSseParser', () => {
  it('parses one complete frame', () => {
    expect(feed([token('Hi')])).toEqual([{ event: 'token', data: '{"delta":"Hi"}' }]);
  });

  it('emits several events delivered in a single chunk, in order', () => {
    const chunk = token('A') + token('B') + 'event: done\ndata: {"finishReason":"stop"}\n\n';
    expect(feed([chunk]).map((m) => m.event)).toEqual(['token', 'token', 'done']);
  });

  it('reassembles a frame split across chunk boundaries at every offset', () => {
    const stream =
      token('stack') + token(' queue') + 'event: citations\ndata: {"citations":[]}\n\n';
    const expected = feed([stream]);
    for (let i = 1; i < stream.length; i++) {
      expect(feed([stream.slice(0, i), stream.slice(i)])).toEqual(expected);
    }
  });

  it('handles one-character chunks', () => {
    const stream = token('x') + token('y');
    expect(feed(stream.split('')).map((m) => m.data)).toEqual(['{"delta":"x"}', '{"delta":"y"}']);
  });

  it('does not emit a frame until its blank line arrives', () => {
    const parser = createSseParser();
    expect(parser.push('event: token\ndata: {"delta":"a"}\n')).toEqual([]);
    expect(parser.push('\n')).toHaveLength(1);
  });

  it('supports CRLF line endings, including a CR/LF pair split across chunks', () => {
    const crlf = 'event: token\r\ndata: {"delta":"a"}\r\n\r\n';
    expect(feed([crlf])).toHaveLength(1);
    const cut = crlf.indexOf('\r\n') + 1; // between \r and \n
    expect(feed([crlf.slice(0, cut), crlf.slice(cut)])).toEqual([
      { event: 'token', data: '{"delta":"a"}' },
    ]);
  });

  it('joins multi-line data, ignores comments, defaults the event name', () => {
    expect(feed([': keep-alive\n\ndata: line1\ndata: line2\n\n'])).toEqual([
      { event: 'message', data: 'line1\nline2' },
    ]);
  });

  it('strips exactly one leading space after the colon', () => {
    expect(feed(['event:token\ndata:  two\n\n'])).toEqual([{ event: 'token', data: ' two' }]);
  });

  it('drops an unterminated trailing frame at end of stream', () => {
    expect(feed([token('ok') + 'event: token\ndata: {"delta":"cut'])).toHaveLength(1);
  });

  it('survives a multi-byte character split across byte chunks (with a streaming decoder)', () => {
    const bytes = new TextEncoder().encode(token('café — ok'));
    const split = bytes.indexOf(0xc3) + 1; // inside "é"
    const decoder = new TextDecoder();
    const parser = createSseParser();
    const out = [
      ...parser.push(decoder.decode(bytes.slice(0, split), { stream: true })),
      ...parser.push(decoder.decode(bytes.slice(split), { stream: true })),
      ...parser.push(decoder.decode()),
    ];
    expect(JSON.parse(out[0]!.data)).toEqual({ delta: 'café — ok' });
  });
});
