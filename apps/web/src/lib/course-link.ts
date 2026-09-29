import { z } from 'zod';

/**
 * Course selection is by link (`/c/<courseId>`). Students either open the link
 * their lecturer shared or paste it (or the bare id) on the home page.
 */
export const courseIdSchema = z.string().uuid();

export type CourseInputResult = { ok: true; courseId: string } | { ok: false; error: string };

const LINK_RE = /\/c\/([^/?#\s]+)/;

export function parseCourseInput(input: string): CourseInputResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Paste the course link your lecturer shared.' };
  }
  const candidate = LINK_RE.exec(trimmed)?.[1] ?? trimmed;
  const parsed = courseIdSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: "That doesn't look like a CourseMind course link. Check it and try again.",
    };
  }
  return { ok: true, courseId: parsed.data.toLowerCase() };
}
