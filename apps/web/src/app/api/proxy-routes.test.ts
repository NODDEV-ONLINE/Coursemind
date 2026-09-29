import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvCache } from '@/server/env';
import { frame, sseResponse, usage } from '../../../test/sse-helpers';
import { POST as askPOST } from './courses/[courseId]/ask/route';
import { GET as chunkGET } from './courses/[courseId]/chunks/[chunkId]/route';

const COURSE = '8d0f3c2a-5b7e-4c1d-9a2b-3c4d5e6f7a8b';
const CHUNK = 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';
const OWNER = '11111111-2222-4333-8444-555555555555';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('API_URL', 'http://api.internal:3000');
  vi.stubEnv('DEMO_USER_ID', OWNER);
  resetServerEnvCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetServerEnvCache();
});

function askRequest(courseId: string, body: unknown, query = '') {
  const controller = new AbortController();
  const request = new Request(`http://web.local/api/courses/${courseId}/ask${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: controller.signal,
  });
  return { request, controller, ctx: { params: Promise.resolve({ courseId }) } };
}

function upstreamCall() {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
}

describe('POST /api/courses/:courseId/ask (proxy)', () => {
  it('injects X-User-Id server-side and streams the upstream SSE body through', async () => {
    const body =
      frame('token', { delta: 'Hi' }) +
      frame('citations', { citations: [] }) +
      frame('done', { finishReason: 'stop', usage });
    fetchMock.mockResolvedValue(sseResponse({ chunks: [body] }));
    const { request, ctx } = askRequest(COURSE, { question: '  What is a stack? ' }, '?lowData=1');

    const res = await askPOST(request, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toContain('no-transform');
    expect(await res.text()).toBe(body);

    const call = upstreamCall();
    expect(call.url).toBe(`http://api.internal:3000/courses/${COURSE}/ask?lowData=1`);
    expect(call.headers.get('x-user-id')).toBe(OWNER);
    expect(JSON.parse(call.init.body as string)).toEqual({ question: 'What is a stack?' });
    // The identity never flows back to the browser.
    expect([...res.headers.values()].join(' ')).not.toContain(OWNER);
  });

  it('forwards client aborts to the upstream request', async () => {
    fetchMock.mockResolvedValue(sseResponse({ chunks: [] }));
    const { request, controller, ctx } = askRequest(COURSE, { question: 'q' });
    await askPOST(request, ctx);
    const { signal } = upstreamCall().init;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it('does not forward lowData unless it is exactly "1"', async () => {
    fetchMock.mockResolvedValue(sseResponse({ chunks: [] }));
    const { request, ctx } = askRequest(COURSE, { question: 'q' }, '?lowData=yes&x=1');
    await askPOST(request, ctx);
    expect(upstreamCall().url).toBe(`http://api.internal:3000/courses/${COURSE}/ask`);
  });

  it.each(['not-a-uuid', '../../admin', `${COURSE}x`])(
    'rejects a non-UUID course id (%s) without calling upstream',
    async (courseId) => {
      const { request, ctx } = askRequest(courseId, { question: 'q' });
      const res = await askPOST(request, ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_params' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([['{bad json'], [{ question: '   ' }], [{ question: 'x'.repeat(2001) }], [{}]])(
    'rejects an invalid body %#',
    async (body) => {
      const { request, ctx } = askRequest(COURSE, body);
      const res = await askPOST(request, ctx);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [429, 429, 'rate_limited'],
    [403, 403, 'no_access'],
    [401, 403, 'no_access'],
    [404, 404, 'not_found'],
    [500, 502, 'upstream_error'],
  ])('maps upstream %i to %i %s', async (upstream, status, error) => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: upstream, message: 'You do not own this course' },
        { status: upstream, headers: upstream === 429 ? { 'Retry-After': '30' } : {} },
      ),
    );
    const { request, ctx } = askRequest(COURSE, { question: 'q' });
    const res = await askPOST(request, ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    if (upstream === 429) expect(res.headers.get('retry-after')).toBe('30');
  });

  it('returns 502 when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { request, ctx } = askRequest(COURSE, { question: 'q' });
    const res = await askPOST(request, ctx);
    expect(res.status).toBe(502);
  });

  it('fails closed with 500 (no secret in the body) when env is invalid', async () => {
    vi.stubEnv('DEMO_USER_ID', 'not-a-uuid');
    resetServerEnvCache();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { request, ctx } = askRequest(COURSE, { question: 'q' });
    const res = await askPOST(request, ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'misconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('GET /api/courses/:courseId/chunks/:chunkId (proxy)', () => {
  function chunkRequest(courseId: string, chunkId: string) {
    return {
      request: new Request(`http://web.local/api/courses/${courseId}/chunks/${chunkId}`),
      ctx: { params: Promise.resolve({ courseId, chunkId }) },
    };
  }

  const chunk = {
    chunk_id: CHUNK,
    document_id: '7b1d2e3f-2222-4a2b-9c3d-000000000002',
    filename: 'Lecture 6: Stacks & Queues.pdf',
    page: 3,
    text: '<b>LIFO</b> means last in, first out.',
  };

  it('injects X-User-Id and returns the validated passage', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...chunk, extra: 'dropped' }));
    const { request, ctx } = chunkRequest(COURSE, CHUNK);
    const res = await chunkGET(request, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(chunk);
    const call = upstreamCall();
    expect(call.url).toBe(`http://api.internal:3000/courses/${COURSE}/chunks/${CHUNK}`);
    expect(call.headers.get('x-user-id')).toBe(OWNER);
  });

  it('passes a 404 through as not_found', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 404 }, { status: 404 }));
    const { request, ctx } = chunkRequest(COURSE, CHUNK);
    const res = await chunkGET(request, ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it.each([
    ['bad-course', CHUNK],
    [COURSE, 'bad-chunk'],
  ])('rejects non-UUID params (%s, %s)', async (courseId, chunkId) => {
    const { request, ctx } = chunkRequest(courseId, chunkId);
    const res = await chunkGET(request, ctx);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an upstream payload that breaks the contract', async () => {
    fetchMock.mockResolvedValue(Response.json({ chunk_id: CHUNK, text: 42 }));
    const { request, ctx } = chunkRequest(COURSE, CHUNK);
    const res = await chunkGET(request, ctx);
    expect(res.status).toBe(502);
  });
});
