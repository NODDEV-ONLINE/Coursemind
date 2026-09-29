/**
 * Sentence splitting for the polite live region (NFR-9): screen readers hear
 * finished sentences, not every token.
 *
 * The live region renders each returned sentence as its own node with a stable
 * key. As the stream grows the list only gains items, so assistive tech announces
 * just the newly completed sentence(s) (`aria-relevant="additions"`).
 */

/** A `.`, `!` or `?` (plus closing quotes/brackets) followed by whitespace. */
const BOUNDARY_RE = /[.!?]["')\]]*(?=\s)/g;

/**
 * Completed sentences of `text`. While streaming, a trailing unfinished sentence is
 * withheld; once `finished`, the remainder is included as the last item.
 */
export function completedSentences(text: string, finished: boolean): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(BOUNDARY_RE)) {
    const end = m.index + m[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence !== '') out.push(sentence);
    start = end;
  }
  if (finished) {
    const rest = text.slice(start).trim();
    if (rest !== '') out.push(rest);
  }
  return out;
}
