export interface LiveRegionProps {
  /** Identifies the answer; a new key replaces the region's contents. */
  turnKey: string | null;
  /** Append-only list of phrases to announce (completed sentences, status). */
  items: readonly string[];
}

/**
 * Polite, visually hidden live region (NFR-9). Items only ever get appended for a
 * given answer, so screen readers announce each newly finished sentence once
 * (`aria-relevant="additions"`) instead of every streamed token.
 */
export function LiveRegion({ turnKey, items }: LiveRegionProps) {
  return (
    <div className="sr-only" aria-live="polite" aria-relevant="additions" aria-atomic="false">
      <div key={turnKey ?? 'idle'}>
        {items.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}
