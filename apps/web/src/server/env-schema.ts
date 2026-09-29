import { z } from 'zod';

/**
 * Server-only environment for the web app's API proxy (CLAUDE.md §4: typed,
 * validated, fail fast). Neither value may carry a NEXT_PUBLIC_ prefix: the
 * browser must never see DEMO_USER_ID.
 *
 * DEMO_USER_ID stands in for real student identity until student auth lands
 * (tracked M3 follow-up): the API currently authorises `X-User-Id` as the course
 * OWNER, so every student request is proxied as that one owner.
 */
export const serverEnvSchema = z.object({
  /** Base URL of apps/api, e.g. http://localhost:3000. */
  API_URL: z.string().url(),
  /** UUID sent upstream as `X-User-Id` (server-side only). */
  DEMO_USER_ID: z.string().uuid(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parse env; throws a readable error listing the bad keys (never their values). */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    API_URL: source.API_URL,
    DEMO_USER_ID: source.DEMO_USER_ID,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid web server environment:\n${issues}`);
  }
  return parsed.data;
}
