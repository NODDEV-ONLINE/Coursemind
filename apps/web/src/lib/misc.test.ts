import { describe, expect, it } from 'vitest';
import { parseCourseInput } from './course-link';
import { formatCountdown, formatKB } from './format';
import { generatePseudonym, isPseudonym } from './pseudonym';

const COURSE = '8d0f3c2a-5b7e-4c1d-9a2b-3c4d5e6f7a8b';

describe('parseCourseInput', () => {
  it.each([
    [COURSE],
    [`  ${COURSE.toUpperCase()}  `],
    [`https://coursemind.app/c/${COURSE}`],
    [`https://coursemind.app/c/${COURSE}?ref=whatsapp`],
    [`/c/${COURSE}`],
  ])('accepts %s', (input) => {
    expect(parseCourseInput(input)).toEqual({ ok: true, courseId: COURSE });
  });

  it.each([[''], ['CSC 201'], ['https://coursemind.app/c/not-a-uuid'], ['<script>']])(
    'rejects %j with a friendly message',
    (input) => {
      const r = parseCourseInput(input);
      expect(r.ok).toBe(false);
    },
  );
});

describe('pseudonym (PR-1)', () => {
  it('generates anon-XXXX from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const id = generatePseudonym();
      expect(isPseudonym(id)).toBe(true);
      expect(id).not.toMatch(/[01ILO]/);
    }
  });

  it('is deterministic for given random values', () => {
    expect(generatePseudonym((arr) => arr.fill(0))).toBe('anon-AAAA');
  });
});

describe('format', () => {
  it('formats KB like the comps', () => {
    expect(formatKB(3174)).toBe('3.1 KB');
    expect(formatKB(38_900)).toBe('38 KB');
    expect(formatKB(0)).toBe('0.0 KB');
  });

  it('formats a countdown as m:ss', () => {
    expect(formatCountdown(100)).toBe('1:40');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
