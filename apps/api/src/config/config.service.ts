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
