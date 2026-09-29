import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  DEFAULT_SCORE_THRESHOLD,
  VECTOR_SEARCH_SQL,
  type RetrievalHit,
  retrieveChunks,
} from './search.js';

const INGEST_URL = 'http://ingest.test:8000';
const DIM = 768;
const COURSE_ID = 'course-1111-2222-3333';

/** A 768-dim embedding so embedQuery's dim guard passes. */
function validEmbedding(): number[] {
  return Array.from({ length: DIM }, () => 0.01);
}

/** Stub fetch so embedQuery resolves without touching the network. */
function stubEmbed(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ embedding: validEmbedding(), model: 'text-embedding-004', dim: DIM }),
    })) as unknown as typeof fetch,
  );
}

/** Build a mocked pg Pool whose `query` returns the given rows. */
function mockDb(rows: Array<Partial<RetrievalHit>>): {
  db: Pool;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async () => ({ rows }));
  return { db: { query } as unknown as Pool, query };
}

function row(overrides: Partial<RetrievalHit> = {}): RetrievalHit {
  return {
    chunk_id: 'chunk-a',
    document_id: 'doc-a',
    page: 1,
    text: 'some course text',
    score: 0.1,
    ...overrides,
  };
}

beforeEach(() => {
  stubEmbed();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('retrieveChunks', () => {
  it('always scopes the SQL to the given course_id (SR-2)', async () => {
    const { db, query } = mockDb([row()]);

    await retrieveChunks({ query: 'q', courseId: COURSE_ID, db, ingestServiceUrl: INGEST_URL });

    expect(query).toHaveBeenCalledOnce();
    const call = query.mock.calls[0] as [string, unknown[]];
    const sql = call[0];
    const params = call[1];
    expect(sql).toBe(VECTOR_SEARCH_SQL);
    expect(sql).toContain('WHERE c.course_id = $2');
    // $2 is the courseId; the embedding is bound as $1, topK as $3.
    expect(params[1]).toBe(COURSE_ID);
    expect(typeof params[0]).toBe('string'); // pgvector literal
    expect(params[0]).toMatch(/^\[.*\]$/);
  });

  it('returns at most topK hits and passes topK as the LIMIT parameter', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      row({ chunk_id: `chunk-${i}`, score: 0.1 + i * 0.01 }),
    );
    const { db, query } = mockDb(rows);

    const result = await retrieveChunks({
      query: 'q',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
      topK: 3,
    });

    const call = query.mock.calls[0] as [string, unknown[]];
    expect(call[1][2]).toBe(3); // $3 = topK
    expect(result.insufficient).toBe(false);
    expect(result.hits).toHaveLength(3);
    expect(result.hits.length).toBeLessThanOrEqual(3);
  });

  it('signals insufficient context when the best hit exceeds the threshold (FR-12)', async () => {
    // Best (first) row's distance is above the default 0.35 threshold.
    const { db } = mockDb([
      row({ chunk_id: 'far', score: DEFAULT_SCORE_THRESHOLD + 0.1 }),
      row({ chunk_id: 'farther', score: 0.9 }),
    ]);

    const result = await retrieveChunks({
      query: 'off-syllabus question',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
    });

    expect(result).toEqual({ insufficient: true, hits: [] });
  });

  it('signals insufficient context when there are no rows', async () => {
    const { db } = mockDb([]);

    const result = await retrieveChunks({
      query: 'q',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
    });

    expect(result).toEqual({ insufficient: true, hits: [] });
  });

  it('returns grounded hits with full citation metadata when within threshold', async () => {
    const { db } = mockDb([
      row({ chunk_id: 'c1', document_id: 'd1', page: 4, text: 'grounded', score: 0.2 }),
    ]);

    const result = await retrieveChunks({
      query: 'q',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
    });

    expect(result.insufficient).toBe(false);
    expect(result.hits[0]).toEqual({
      chunk_id: 'c1',
      document_id: 'd1',
      page: 4,
      text: 'grounded',
      score: 0.2,
    });
  });

  it('respects a custom scoreThreshold', async () => {
    const { db } = mockDb([row({ score: 0.4 })]);

    // With a stricter threshold of 0.3, a 0.4 best hit is insufficient.
    const strict = await retrieveChunks({
      query: 'q',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
      scoreThreshold: 0.3,
    });
    expect(strict.insufficient).toBe(true);

    // With a looser threshold of 0.5, the same hit is sufficient.
    const loose = await retrieveChunks({
      query: 'q',
      courseId: COURSE_ID,
      db,
      ingestServiceUrl: INGEST_URL,
      scoreThreshold: 0.5,
    });
    expect(loose.insufficient).toBe(false);
  });
});
