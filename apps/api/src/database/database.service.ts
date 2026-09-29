import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import { ConfigService } from '../config/config.service.js';

/**
 * Thin, typed wrapper over a `pg.Pool` (no ORM — ADR-0001 / M2 Task D decision).
 *
 * All SQL in the app is raw + parameterised and goes through {@link query}. The
 * connection string comes from the typed ConfigService, never `process.env`
 * (CLAUDE.md §4). Course isolation (SR-2) is enforced by callers always passing
 * `course_id` as a bound parameter — see CoursesService.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
  }

  /**
   * Run a parameterised query and return typed rows.
   *
   * @typeParam T - the row shape the caller expects for each returned record.
   * @param text - SQL with `$1`, `$2`, ... placeholders (never string-interpolate values).
   * @param params - bound parameter values, in order.
   */
  async query<T extends QueryResultRow>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<T[]> {
    // `pg` types params as `any[]`; we accept `unknown[]` at the boundary and
    // cast at the single call site to keep callers type-safe.
    const result = await this.pool.query<T>(text, params as unknown[]);
    return result.rows;
  }

  /**
   * The underlying `pg.Pool`. Exposed for `@coursemind/retrieval`'s
   * {@link retrieveChunks}, which takes a Pool directly (course scoping is enforced
   * inside retrieval via a bound `course_id` param — SR-2). Prefer {@link query}
   * for app SQL; this is only for the shared retrieval client.
   */
  getPool(): Pool {
    return this.pool;
  }

  /** Close the pool cleanly on shutdown so connections are not leaked. */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
