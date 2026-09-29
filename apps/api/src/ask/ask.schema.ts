import { z } from 'zod';

/**
 * Boundary schemas for the ask endpoint (CLAUDE.md §4: validate all external input
 * with Zod). The question is untrusted free text (SR-3) — bounded in length to keep
 * the prompt (and cost) sane, and trimmed to reject whitespace-only questions.
 */

/** `POST /courses/:id/ask` body. */
export const askQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
export type AskQuestionInput = z.infer<typeof askQuestionSchema>;

/** Route param `:id` must be a UUID (reuses the courses convention, SR-2). */
export const uuidParamSchema = z.string().uuid();

/** Auth placeholder header, validated as a UUID (M2 pattern, SR-2). */
export const userIdHeaderSchema = z.string().uuid();
