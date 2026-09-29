/**
 * Course-scoped vector search (M3 Task A-2/A-3/A-4).
 *
 * Every query is scoped to a single course via a bound `course_id` parameter —
 * no cross-course reads, ever (CLAUDE.md §3, SR-2). The embedding is bound as a
 * `$1::vector` parameter (never string-interpolated) and results are ranked by
 * cosine *distance* (`<=>`, lower = closer).
 */

import type { Pool } from 'pg';
import { embedQuery, toVectorLiteral } from './embed.js';

/** A single retrieved chunk with the metadata the answer layer needs to cite it. */
export interface RetrievalHit {
  chunk_id: string;
  document_id: string;
  page: number;
  text: string;
  /** Cosine distance from the query (lower = closer). */
  score: number;
}

/**
 * Result of a retrieval. `insufficient: true` is the refusal signal (FR-12):
 * no rows matched, or the best hit's distance exceeded the threshold.
 */
export type RetrievalResult =
  | { insufficient: false; hits: RetrievalHit[] }
  | { insufficient: true; hits: [] };

/** Row shape returned by the vector-search SQL. */
interface HitRow {
  chunk_id: string;
  document_id: string;
  page: number;
  text: string;
  score: number;
}

/**
 * Course-scoped nearest-neighbour search. ALWAYS filters by `c.course_id = $2`
 * (SR-2). The pgvector `<=>` operator returns cosine distance; ordering ascending
 * puts the closest chunks first.
 */
export const VECTOR_SEARCH_SQL = `
SELECT ce.chunk_id, c.document_id, c.page, c.text,
       ce.embedding <=> $1::vector AS score
FROM chunk_embeddings ce JOIN chunks c ON c.id = ce.chunk_id
WHERE c.course_id = $2
ORDER BY score ASC LIMIT $3;
`.trim();

/** Default top-K and refusal threshold (ADR-0004; mirrors packages/config defaults). */
export const DEFAULT_TOP_K = 5;
export const DEFAULT_SCORE_THRESHOLD = 0.35;

/** Pinned embedding dimension (ADR-0002); must match `chunk_embeddings.vector(N)`. */
export const EMBEDDING_DIM = 768;

/**
 * Embed the query, run a course-scoped vector search, and apply the refusal
 * threshold. Returns `{ insufficient: true, hits: [] }` when there is no
 * grounded answer (empty result or best hit beyond `scoreThreshold`).
 *
 * @param params.query - the (untrusted) student question; treated as data.
 * @param params.courseId - the course to scope the search to (SR-2).
 * @param params.db - a `pg.Pool` (or compatible) used for the parameterised query.
 * @param params.ingestServiceUrl - base URL of the Python ingest service (for /embed).
 * @param params.topK - max hits to return (default {@link DEFAULT_TOP_K}).
 * @param params.scoreThreshold - max cosine distance for the best hit
 *   (default {@link DEFAULT_SCORE_THRESHOLD}).
 * @param params.signal - optional AbortSignal for cancellation of the embed call.
 */
export async function retrieveChunks(params: {
  query: string;
  courseId: string;
  db: Pool;
  ingestServiceUrl: string;
  topK?: number;
  scoreThreshold?: number;
  signal?: AbortSignal;
}): Promise<RetrievalResult> {
  const {
    query,
    courseId,
    db,
    ingestServiceUrl,
    topK = DEFAULT_TOP_K,
    scoreThreshold = DEFAULT_SCORE_THRESHOLD,
    signal,
  } = params;

  const embedding = await embedQuery({
    text: query,
    ingestServiceUrl,
    embeddingDim: EMBEDDING_DIM,
    ...(signal ? { signal } : {}),
  });

  const result = await db.query<HitRow>(VECTOR_SEARCH_SQL, [
    toVectorLiteral(embedding),
    courseId,
    topK,
  ]);

  const rows = result.rows;
  if (rows.length === 0) {
    return { insufficient: true, hits: [] };
  }

  // Rows are ordered by ascending distance, so the first is the best hit.
  const best = rows[0];
  if (best === undefined || best.score > scoreThreshold) {
    return { insufficient: true, hits: [] };
  }

  const hits: RetrievalHit[] = rows.map((r) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    page: r.page,
    text: r.text,
    score: r.score,
  }));

  return { insufficient: false, hits };
}
