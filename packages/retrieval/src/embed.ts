/**
 * Query-embedding client (ADR-0004; M3 Task A-1).
 *
 * The query MUST be embedded with the *same* model and dimension as ingestion
 * (`text-embedding-004`, 768-dim) or the vectors are not comparable. Rather than
 * ship a second embedding implementation in TypeScript (drift risk), we call the
 * single authoritative implementation in the Python ingest service via
 * `POST {ingestServiceUrl}/embed` (ADR-0004 Option a; CLAUDE.md §1).
 *
 * No Google key lives in the TS runtime — this calls a service URL, not Google.
 */

/** Shape of the ingest service `POST /embed` 200 response (ADR-0004 contract). */
interface EmbedResponse {
  embedding: number[];
  model: string;
  dim: number;
}

/** Raised when the ingest `/embed` call fails or returns an unusable result. */
export class QueryEmbeddingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QueryEmbeddingError';
  }
}

function isEmbedResponse(value: unknown): value is EmbedResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.embedding) &&
    v.embedding.every((n) => typeof n === 'number') &&
    typeof v.model === 'string' &&
    typeof v.dim === 'number'
  );
}

/**
 * Embed a single query string by calling the ingest service.
 *
 * Validates the returned dimension against the pinned `EMBEDDING_DIM` and throws
 * loudly on any mismatch — never returns a silently-wrong vector (ADR-0002
 * `embedding_meta` guard).
 *
 * @param params.text - the (untrusted) query text to embed; treated as data.
 * @param params.ingestServiceUrl - base URL of the Python ingest service.
 * @param params.embeddingDim - pinned expected dimension (768).
 * @param params.signal - optional AbortSignal for cancellation.
 */
export async function embedQuery(params: {
  text: string;
  ingestServiceUrl: string;
  embeddingDim: number;
  signal?: AbortSignal;
}): Promise<number[]> {
  const { text, ingestServiceUrl, embeddingDim, signal } = params;

  const url = new URL('/embed', ingestServiceUrl).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    throw new QueryEmbeddingError(
      `Query embedding request to ${url} failed (network error).`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new QueryEmbeddingError(
      `Query embedding request to ${url} returned HTTP ${response.status}.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new QueryEmbeddingError(
      `Query embedding response from ${url} was not valid JSON.`,
      { cause },
    );
  }

  if (!isEmbedResponse(body)) {
    throw new QueryEmbeddingError(
      `Query embedding response from ${url} did not match the expected { embedding, model, dim } contract.`,
    );
  }

  // ADR-0002 embedding_meta guard: fail loudly on any dimension mismatch.
  if (body.dim !== embeddingDim || body.embedding.length !== embeddingDim) {
    throw new QueryEmbeddingError(
      `Query embedding dimension mismatch: expected ${embeddingDim}, got dim=${body.dim} ` +
        `(embedding length ${body.embedding.length}). Model=${body.model}. ` +
        `Vectors would not be comparable to the ingested corpus (ADR-0002).`,
    );
  }

  return body.embedding;
}

/**
 * Format a `number[]` as a pgvector literal string, e.g. `[0.1,0.2,0.3]`.
 * Bound as a parameter (`$1::vector`) — never string-interpolated into SQL.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
