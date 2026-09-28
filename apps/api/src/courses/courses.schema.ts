import { z } from 'zod';

/**
 * Boundary schemas for the courses endpoints (CLAUDE.md §4: validate all external
 * input with Zod). Colocated with the controller per M2 Task D conventions.
 */

/** `POST /courses` body. */
export const createCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

/** Route param `:id` must be a UUID. */
export const uuidParamSchema = z.string().uuid();

/**
 * The auth placeholder for M2: a trusted `X-User-Id` header carrying the caller's
 * user id, validated as a UUID and used as `owner_id` / for ownership checks.
 *
 * NOTE (auth): this is a temporary stand-in. A real authentication guard
 * (JWT/session) replaces this header trust in a later milestone — see M2 plan
 * "Out of scope: Auth hardening beyond a basic guard". Until then, callers are
 * trusted and isolation is enforced by the owner_id/course_id checks (SR-2).
 */
export const userIdHeaderSchema = z.string().uuid();
