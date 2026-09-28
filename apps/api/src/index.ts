/**
 * CourseMind API (NestJS) — auth, rate limits, retrieval orchestration, grounded
 * prompt building, streaming, cost telemetry (SDD §4.2).
 *
 * The runnable entrypoint is `main.ts`. This barrel re-exports the root module so
 * the workspace has a stable public surface.
 */
export { AppModule } from './app.module.js';
