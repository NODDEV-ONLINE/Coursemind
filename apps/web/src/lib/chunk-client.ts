import { z } from 'zod';

/**
 * Source passage contract: `GET /courses/:courseId/chunks/:chunkId` (FR-15).
 * `text` is UNTRUSTED document content (SR-3): it is only ever rendered as a React
 * text node, never as HTML. The proxy route validates with this same schema.
 */
export const sourceChunkSchema = z.object({
  chunk_id: z.string().min(1),
  document_id: z.string().min(1),
  filename: z.string(),
  page: z.number().int().nonnegative().nullable(),
  text: z.string(),
});
export type SourceChunk = z.infer<typeof sourceChunkSchema>;

export type ChunkResult =
  | { status: 'ok'; chunk: SourceChunk; bytes: number }
  /** 404: the document is being re-processed or was removed. */
  | { status: 'not_found' }
  | { status: 'error' };

export function chunkUrl(courseId: string, chunkId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/chunks/${encodeURIComponent(chunkId)}`;
}

export async function fetchChunk(opts: {
  courseId: string;
  chunkId: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ChunkResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(chunkUrl(opts.courseId, opts.chunkId), {
      headers: { Accept: 'application/json' },
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'error' };

    const buf = await res.arrayBuffer();
    const parsed = sourceChunkSchema.safeParse(JSON.parse(new TextDecoder().decode(buf)));
    if (!parsed.success) return { status: 'error' };
    return { status: 'ok', chunk: parsed.data, bytes: buf.byteLength };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    return { status: 'error' };
  }
}
