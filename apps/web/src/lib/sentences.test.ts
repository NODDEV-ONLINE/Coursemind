import { describe, expect, it } from 'vitest';
import { completedSentences } from './sentences';

describe('completedSentences', () => {
  it('withholds the unfinished sentence while streaming', () => {
    expect(completedSentences('A stack is LIFO. A queue is', false)).toEqual(['A stack is LIFO.']);
  });

  it('needs whitespace after the terminator (the next token may continue it)', () => {
    expect(completedSentences('It costs 3.', false)).toEqual([]);
    expect(completedSentences('It costs 3.5 KB. Next', false)).toEqual(['It costs 3.5 KB.']);
  });

  it('includes the remainder once finished', () => {
    expect(completedSentences('One! Two? Three', true)).toEqual(['One!', 'Two?', 'Three']);
  });

  it('only ever appends as text grows (so each item is announced once)', () => {
    const full = 'First point. Second point. Third';
    let prev: string[] = [];
    for (let i = 0; i <= full.length; i++) {
      const next = completedSentences(full.slice(0, i), false);
      expect(next.slice(0, prev.length)).toEqual(prev);
      prev = next;
    }
  });
});
