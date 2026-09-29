import { ArrowDownIcon, StopIcon } from '@/components/ui/icons';

/** "Stop generating" (C2): aborts the stream; the partial answer is kept. */
export function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      onClick={onStop}
      className="inline-flex h-11 items-center gap-2 self-center rounded-full border border-border bg-surface px-4 text-meta text-text hover:border-accent-400"
    >
      <StopIcon size={12} />
      Stop generating
    </button>
  );
}

/** Shown when the reader has scrolled up while new content arrives. */
export function ScrollToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-meta text-text hover:border-accent-400"
    >
      <ArrowDownIcon size={16} />
      Scroll to latest
    </button>
  );
}
