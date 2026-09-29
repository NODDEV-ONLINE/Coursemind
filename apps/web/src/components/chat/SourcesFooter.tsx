import type { SourceGroup } from '@/lib/citations';
import { FileIcon } from '@/components/ui/icons';

export interface SourcesFooterProps {
  groups: readonly SourceGroup[];
  onOpenSource: (key: string) => void;
}

/** "Sources" list under a finished answer: each cited document and its pages. */
export function SourcesFooter({ groups, onOpenSource }: SourcesFooterProps) {
  if (groups.length === 0) return null;
  return (
    <section
      aria-label="Sources"
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5"
    >
      <h3 className="text-xs font-semibold text-text-muted">Sources</h3>
      <ul className="flex flex-col gap-1">
        {groups.map((g) => (
          <li key={g.documentId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FileIcon size={14} className="shrink-0 text-accent-300" />
            <span className="text-meta text-text">Document {g.sourceNumber}</span>
            {g.refs.map((ref) => (
              <button
                key={ref.key}
                type="button"
                onClick={() => onOpenSource(ref.key)}
                aria-haspopup="dialog"
                aria-label={`Open document ${g.sourceNumber}, page ${ref.page}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-meta text-accent-300 underline-offset-2 hover:underline"
              >
                p.{ref.page}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
