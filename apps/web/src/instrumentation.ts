/**
 * Fail fast on a bad server environment when the Next server boots (CLAUDE.md §4),
 * instead of on the first proxied request. Skipped during `next build`, which
 * needs no runtime secrets.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { parseServerEnv } = await import('./server/env-schema');
  parseServerEnv(process.env);
}
