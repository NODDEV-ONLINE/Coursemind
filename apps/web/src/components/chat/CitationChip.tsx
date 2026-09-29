export interface CitationChipProps {
  sourceNumber: number;
  page: number;
  /** False while the answer is still streaming: sources are checked at the end. */
  verified: boolean;
  /** True while the source viewer shows this citation. */
  active?: boolean;
  onOpen?: () => void;
}

export function citationLabel(sourceNumber: number, page: number): string {
  return `Doc ${sourceNumber} · p.${page}`;
}

/**
 * Inline citation chip (FR-11, FR-15), styled with the --cited token. A real
 * <button>; the invisible ::before extends the tap target to ~44px tall without
 * disturbing the line of text around it.
 */
export function CitationChip({
  sourceNumber,
  page,
  verified,
  active = false,
  onOpen,
}: CitationChipProps) {
  const label = verified
    ? `Source: document ${sourceNumber}, page ${page}`
    : `Source: document ${sourceNumber}, page ${page} (checking)`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={verified ? undefined : true}
      aria-haspopup={verified ? 'dialog' : undefined}
      onClick={verified ? onOpen : undefined}
      className={[
        "relative mx-0.5 inline-flex items-center rounded-md border px-1.5 align-baseline text-xs leading-normal font-semibold whitespace-nowrap before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']",
        active
          ? 'border-cited bg-cited text-on-accent outline-2 outline-offset-2 outline-accent-300'
          : 'border-cited/50 bg-cited/18 text-accent-300 hover:bg-cited/30',
        verified ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      {citationLabel(sourceNumber, page)}
    </button>
  );
}
