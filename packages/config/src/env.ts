import { z } from 'zod';

/**
 * Typed, validated environment (CLAUDE.md §4: "Config via env, typed + validated
 * at startup; fail fast on missing/invalid env").
 *
 * Mirrors .env.example. The embedding dimension is pinned and must match
 * chunk_embeddings.vector(N) (ADR-0002 §2).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database — single Postgres + pgvector (ADR-0001)
  DATABASE_URL: z.string().url(),

  // LLM provider — pluggable, Anthropic default (ADR-0002 §1)
  LLM_PROVIDER: z
    .enum(['anthropic', 'openai', 'google', 'ollama', 'openai-compatible'])
    .default('anthropic'),
  LLM_MODEL: z.string().min(1).default('claude-opus-4-8'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_FALLBACK_PROVIDER: z.string().optional(),
  LLM_FALLBACK_MODEL: z.string().optional(),

  // Embeddings — Google text-embedding-004, 768-dim (ADR-0002 §2)
  EMBEDDING_PROVIDER: z
    .enum(['google', 'local', 'voyage', 'jina', 'openai'])
    .default('google'),
  EMBEDDING_MODEL: z.string().min(1).default('text-embedding-004'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  GOOGLE_API_KEY: z.string().optional(),

  // Retrieval tuning (ADR-0004; M3 Task A). Cosine *distance* (lower = closer).
  // Top-K results per query; if the best hit's distance exceeds the threshold,
  // retrieval signals insufficient context and the answer layer refuses (FR-12).
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(5),
  RETRIEVAL_SCORE_THRESHOLD: z.coerce.number().positive().default(0.35),

  // Service wiring
  INGEST_SERVICE_URL: z.string().url().default('http://localhost:8000'),

  // Local filesystem directory the API writes uploaded documents to before
  // handing the path off to the Python ingest service (M2 Task D). A shared
  // volume/broker replaces this in a later milestone.
  UPLOAD_DIR: z.string().default('/tmp/coursemind-uploads'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate `process.env` (or a provided record). Throws a readable
 * error and exits the caller's startup if anything is missing/invalid.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
