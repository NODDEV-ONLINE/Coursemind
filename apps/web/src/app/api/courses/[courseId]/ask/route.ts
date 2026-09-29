import { z } from 'zod';
import { jsonError, mapUpstreamError, upstream } from '@/server/proxy';

/**
 * POST /api/courses/:courseId/ask → apps/api POST /courses/:courseId/ask (FR-13).
 *
 * Streams the upstream SSE body straight through (no buffering, NFR-1 TTFT) and
 * forwards client aborts upstream so the API stops retrieval + generation.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ courseId: z.string().uuid() });
// Mirrors the API's boundary schema (question 1..2000 chars, trimmed).
const bodySchema = z.object({ question: z.string().trim().min(1).max(2000) });

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, 'invalid_params');

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'invalid_body');
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return jsonError(400, 'invalid_body');

  const target = upstream(`/courses/${params.data.courseId}/ask`);
  if (!target.ok) return target.response;
  // Low-data mode (FR-14): forward only the flag we recognise.
  if (new URL(request.url).searchParams.get('lowData') === '1') {
    target.url.searchParams.set('lowData', '1');
  }

  let res: Response;
  try {
    res = await fetch(target.url, {
      method: 'POST',
      headers: {
        ...target.headers,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ question: body.data.question }),
      // Client disconnect / Stop → abort the upstream request (API aborts the LLM).
      signal: request.signal,
      cache: 'no-store',
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return jsonError(502, 'upstream_unreachable');
  }

  if (!res.ok || res.body === null) {
    await res.body?.cancel().catch(() => undefined);
    return mapUpstreamError(res);
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps compression middleware from buffering the stream.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
