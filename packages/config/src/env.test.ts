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
    expect(env.UPLOAD_DIR).toBe('/tmp/coursemind-uploads');
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
