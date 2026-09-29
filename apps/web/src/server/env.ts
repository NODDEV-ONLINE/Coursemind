import 'server-only';
import { parseServerEnv, type ServerEnv } from './env-schema';

let cached: ServerEnv | null = null;

/** Validated server env, parsed once. Also checked at startup (instrumentation.ts). */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Test helper: re-read process.env on next access. */
export function resetServerEnvCache(): void {
  cached = null;
}
