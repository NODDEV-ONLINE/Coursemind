import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults and coerces EMBEDDING_DIM', () => {
    const env = loadEnv({ ...base } as NodeJS.ProcessEnv);
    expect(env.LLM_PROVIDER).toBe('anthropic');
    expect(env.EMBEDDING_PROVIDER).toBe('google');
    expect(env.EMBEDDING_DIM).toBe(768);
    expect(typeof env.EMBEDDING_DIM).toBe('number');
    expect(env.RETRIEVAL_TOP_K).toBe(5);
    expect(env.RETRIEVAL_SCORE_THRESHOLD).toBe(0.35);
    expect(env.UPLOAD_DIR).toBe('/tmp/coursemind-uploads');
  });

  it('coerces retrieval tuning values from strings', () => {
    const env = loadEnv({
      ...base,
      RETRIEVAL_TOP_K: '8',
      RETRIEVAL_SCORE_THRESHOLD: '0.5',
    } as NodeJS.ProcessEnv);
    expect(env.RETRIEVAL_TOP_K).toBe(8);
    expect(env.RETRIEVAL_SCORE_THRESHOLD).toBe(0.5);
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('rejects an unknown LLM provider', () => {
    expect(() =>
      loadEnv({ ...base, LLM_PROVIDER: 'nope' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/LLM_PROVIDER/);
  });
});
