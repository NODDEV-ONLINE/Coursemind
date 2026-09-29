import { describe, expect, it, vi } from 'vitest';
import { frame, sseResponse, usage } from '../../test/sse-helpers';
import type { AskEvent } from './ask-events';
import { askUrl, parseRetryAfter, streamAsk } from './ask-client';

const COURSE = '8d0f3c2a-5b7e-4c1d-9a2b-3c4d5e6f7a8b';

function collect(fetchImpl: typeof fetch, signal = new AbortController().signal) {
  const events: AskEvent[] = [];
  let bytes = 0;
  const done = streamAsk({
    courseId: COURSE,
    question: 'What is a stack?',
    lowData: true,
    signal,
    onEvent: (e) => events.push(e),
    onBytes: (n) => (bytes += n),
    fetchImpl,
  });
  return { events, done, bytes: () => bytes };
}

describe('streamAsk', () => {
  it('posts to the same-origin proxy with lowData and delivers events in order', async () => {
    const body =
      frame('token', { delta: 'A stack ' }) +
      frame('token', { delta: 'is LIFO.' }) +
      frame('citations', { citations: [] }) +
      frame('done', { finishReason: 'stop', usage });
    const fetchImpl = vi.fn(async () =>
      sseResponse({ chunks: [body.slice(0, 30), body.slice(30)] }),
    );
    const { events, done, bytes } = collect(fetchImpl as unknown as typeof fetch);

    await expect(done).resolves.toEqual({ type: 'completed' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/courses/${COURSE}/ask?lowData=1`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ question: 'What is a stack?' }),
      }),
    );
    expect(events.map((e) => e.event)).toEqual(['token', 'token', 'citations', 'done']);
    expect(bytes()).toBe(new TextEncoder().encode(body).byteLength);
  });

  it('reports connection_lost when the stream errors mid-answer (partial delivered)', async () => {
    const fetchImpl = async () =>
      sseResponse({ chunks: [frame('token', { delta: 'A queue is' })], failAtEnd: true });
    const { events, done } = collect(fetchImpl);
    await expect(done).resolves.toEqual({ type: 'connection_lost' });
    expect(events).toHaveLength(1);
  });

  it('reports connection_lost when the stream closes without a done event', async () => {
    const fetchImpl = async () => sseResponse({ chunks: [frame('token', { delta: 'x' })] });
    await expect(collect(fetchImpl).done).resolves.toEqual({ type: 'connection_lost' });
  });

  it('reports connection_lost when fetch itself fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(collect(fetchImpl).done).resolves.toEqual({ type: 'connection_lost' });
  });

  it('reports aborted when the caller stops mid-stream', async () => {
    const controller = new AbortController();
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) =>
      sseResponse(
        { chunks: [frame('token', { delta: 'Half' })], hang: true },
        init?.signal ?? undefined,
      );
    const { events, done } = collect(fetchImpl, controller.signal);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    controller.abort();
    await expect(done).resolves.toEqual({ type: 'aborted' });
  });

  it('maps non-2xx to http_error with Retry-After', async () => {
    const fetchImpl = async () =>
      Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '100' } });
    await expect(collect(fetchImpl).done).resolves.toEqual({
      type: 'http_error',
      status: 429,
      retryAfterSeconds: 100,
    });
  });

  it('treats a contract-breaking payload as a protocol error', async () => {
    const fetchImpl = async () =>
      sseResponse({ chunks: [frame('done', { finishReason: 'maybe' })] });
    await expect(collect(fetchImpl).done).resolves.toEqual({ type: 'protocol_error' });
  });

  it('ignores unknown event names (forward compatible)', async () => {
    const body =
      frame('trace', { ms: 12 }) +
      frame('citations', { citations: [] }) +
      frame('done', { finishReason: 'stop', usage });
    const { events, done } = collect(async () => sseResponse({ chunks: [body] }));
    await expect(done).resolves.toEqual({ type: 'completed' });
    expect(events.map((e) => e.event)).toEqual(['citations', 'done']);
  });
});

describe('askUrl / parseRetryAfter', () => {
  it('omits lowData when off', () => {
    expect(askUrl(COURSE, false)).toBe(`/api/courses/${COURSE}/ask`);
  });

  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('42')).toBe(42);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});
