import { z } from 'zod';
import { sourceChunkSchema } from '@/lib/chunk-client';
import { jsonError, mapUpstreamError, upstream } from '@/server/proxy';

/**
 * GET /api/courses/:courseId/chunks/:chunkId → apps/api GET
 * /courses/:courseId/chunks/:chunkId (FR-15, source viewer).
 *
 * The response is re-validated against the contract before it reaches the
 * browser; `text` stays untrusted content and is rendered as plain text only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  courseId: z.string().uuid(),
  chunkId: z.string().uuid(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string; chunkId: string }> },
): Promise<Response> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, 'invalid_params');

  const { courseId, chunkId } = params.data;
  const target = upstream(`/courses/${courseId}/chunks/${chunkId}`);
  if (!target.ok) return target.response;

  let res: Response;
  try {
    res = await fetch(target.url, {
      headers: { ...target.headers, Accept: 'application/json' },
      signal: request.signal,
      cache: 'no-store',
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return jsonError(502, 'upstream_unreachable');
  }

  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return mapUpstreamError(res);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return jsonError(502, 'upstream_error');
  }
  const chunk = sourceChunkSchema.safeParse(json);
  if (!chunk.success) return jsonError(502, 'upstream_error');

  return Response.json(chunk.data, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
