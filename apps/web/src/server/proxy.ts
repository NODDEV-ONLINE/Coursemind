import 'server-only';
import { getServerEnv } from './env';

/**
 * Shared helpers for the /api/* route handlers that proxy to apps/api.
 *
 * The browser talks only to this Next app. These handlers add the server-held
 * `X-User-Id` (DEMO_USER_ID) — the browser never sees it — and normalise upstream
 * errors to small `{ error }` bodies so API internals don't leak to the client.
 */

export type ProxyErrorCode =
  | 'invalid_params'
  | 'invalid_body'
  | 'not_found'
  | 'no_access'
  | 'rate_limited'
  | 'upstream_error'
  | 'upstream_unreachable'
  | 'misconfigured';

export function jsonError(
  status: number,
  error: ProxyErrorCode,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } },
  );
}

/** Build the upstream URL + identity header, or a 500 if the env is invalid. */
export function upstream(
  path: string,
): { ok: true; url: URL; headers: Record<string, string> } | { ok: false; response: Response } {
  let env;
  try {
    env = getServerEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return { ok: false, response: jsonError(500, 'misconfigured') };
  }
  return {
    ok: true,
    url: new URL(path, env.API_URL),
    headers: { 'X-User-Id': env.DEMO_USER_ID },
  };
}

/** Map a non-2xx upstream status to what the browser is told. */
export function mapUpstreamError(res: Response): Response {
  switch (res.status) {
    case 400:
      return jsonError(400, 'invalid_body');
    case 401:
    case 403:
      return jsonError(403, 'no_access');
    case 404:
      return jsonError(404, 'not_found');
    case 429: {
      const retryAfter = res.headers.get('Retry-After');
      return jsonError(429, 'rate_limited', retryAfter ? { 'Retry-After': retryAfter } : {});
    }
    default:
      return jsonError(502, 'upstream_error');
  }
}
