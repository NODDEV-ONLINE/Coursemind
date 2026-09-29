import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryEmbeddingError, embedQuery, toVectorLiteral } from './embed.js';

const INGEST_URL = 'http://ingest.test:8000';
const DIM = 768;

/** Build a mocked fetch that returns a JSON body with the given status. */
function mockFetch(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('embedQuery', () => {
  it('returns the embedding when the ingest service responds with the pinned dim', async () => {
    const embedding = Array.from({ length: DIM }, (_, i) => i / DIM);
    mockFetch({ embedding, model: 'text-embedding-004', dim: DIM });

    const result = await embedQuery({
      text: 'photosynthesis',
      ingestServiceUrl: INGEST_URL,
      embeddingDim: DIM,
    });

    expect(result).toEqual(embedding);
    expect(fetch).toHaveBeenCalledOnce();
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const url = call[0];
    const init = call[1];
    expect(url).toBe('http://ingest.test:8000/embed');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'photosynthesis' });
  });

  it('throws a clear error when the returned dim does not match EMBEDDING_DIM', async () => {
    // Ingest returns a 512-dim vector — incomparable to the 768-dim corpus.
    const embedding = Array.from({ length: 512 }, () => 0.1);
    mockFetch({ embedding, model: 'text-embedding-004', dim: 512 });

    await expect(
      embedQuery({ text: 'q', ingestServiceUrl: INGEST_URL, embeddingDim: DIM }),
    ).rejects.toThrow(QueryEmbeddingError);
    await expect(
      embedQuery({ text: 'q', ingestServiceUrl: INGEST_URL, embeddingDim: DIM }),
    ).rejects.toThrow(/dimension mismatch: expected 768, got dim=512/);
  });

  it('throws when dim reports 768 but the embedding array length disagrees', async () => {
    const embedding = Array.from({ length: 512 }, () => 0.1);
    mockFetch({ embedding, model: 'text-embedding-004', dim: DIM });

    await expect(
      embedQuery({ text: 'q', ingestServiceUrl: INGEST_URL, embeddingDim: DIM }),
    ).rejects.toThrow(/dimension mismatch/);
  });

  it('throws on a non-2xx HTTP status', async () => {
    mockFetch({}, false, 500);
    await expect(
      embedQuery({ text: 'q', ingestServiceUrl: INGEST_URL, embeddingDim: DIM }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the response does not match the { embedding, model, dim } contract', async () => {
    mockFetch({ unexpected: true });
    await expect(
      embedQuery({ text: 'q', ingestServiceUrl: INGEST_URL, embeddingDim: DIM }),
    ).rejects.toThrow(/did not match the expected/);
  });
});

describe('toVectorLiteral', () => {
  it('formats a number[] as a pgvector literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });
});
