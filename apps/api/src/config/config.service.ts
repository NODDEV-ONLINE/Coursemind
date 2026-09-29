import { Injectable } from '@nestjs/common';
import { loadEnv, type Env } from '@coursemind/config';

/**
 * Typed configuration provider (CLAUDE.md §4: "Config via env, typed + validated
 * at startup; fail fast on missing/invalid env").
 *
 * Wraps the shared `loadEnv()` from packages/config so the rest of the app never
 * touches `process.env` directly — everything injects this service instead.
 */
@Injectable()
export class ConfigService {
  private readonly env: Env;

  constructor() {
    // Validates and freezes the environment once at construction. Throwing here
    // fails app bootstrap fast (see main.ts, which also calls loadEnv early).
    this.env = loadEnv();
  }

  /** Fully validated, typed environment. */
  get(): Env {
    return this.env;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get ingestServiceUrl(): string {
    return this.env.INGEST_SERVICE_URL;
  }

  get uploadDir(): string {
    return this.env.UPLOAD_DIR;
  }

  /** Top-K chunks to retrieve per question (ADR-0004; default 5). */
  get retrievalTopK(): number {
    return this.env.RETRIEVAL_TOP_K;
  }

  /** Max cosine distance for the best hit before we refuse (FR-12; default 0.35). */
  get retrievalScoreThreshold(): number {
    return this.env.RETRIEVAL_SCORE_THRESHOLD;
  }

  /**
   * LLM provider selection + credentials (ADR-0002 §1). Secrets come from env
   * only (SR-4); never hardcode keys. `fallback` is optional secondary wiring for
   * NFR-4 — undefined when `LLM_FALLBACK_PROVIDER`/`LLM_FALLBACK_MODEL` are unset.
   */
  get llm(): {
    provider: Env['LLM_PROVIDER'];
    model: string;
    apiKey: string | undefined;
    baseUrl: string | undefined;
    fallback: { provider: string; model: string } | undefined;
  } {
    const fallback =
      this.env.LLM_FALLBACK_PROVIDER && this.env.LLM_FALLBACK_MODEL
        ? { provider: this.env.LLM_FALLBACK_PROVIDER, model: this.env.LLM_FALLBACK_MODEL }
        : undefined;
    return {
      provider: this.env.LLM_PROVIDER,
      model: this.env.LLM_MODEL,
      apiKey: this.env.LLM_API_KEY,
      baseUrl: this.env.LLM_BASE_URL,
      fallback,
    };
  }

  /**
   * HTTP listen port. `PORT` is intentionally not part of the shared config
   * schema (it is a process-level concern, not a CourseMind domain setting), so
   * it is read here with a documented default rather than added to packages/config.
   */
  get port(): number {
    const raw = process.env.PORT;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
  }
}
