import { LogoMark } from '@/components/ui/Logo';

export interface EmptyStateProps {
  suggestions: readonly string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

/** Chat-Empty comp: what the tutor does + suggested first questions. */
export function EmptyState({ suggestions, onPick, disabled = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col gap-6 px-1 pt-4">
      <div className="flex flex-col items-start gap-3">
        <LogoMark size={40} />
        <h1 className="font-display text-display font-semibold tracking-tight">
          What do you want to understand?
        </h1>
        <p className="text-sm text-text-muted">
          I answer only from your course documents, and show you the page for every claim.
        </p>
      </div>

      <section aria-labelledby="try-asking" className="flex flex-col gap-2">
        <h2
          id="try-asking"
          className="text-xs font-semibold tracking-wider text-text-muted uppercase"
        >
          Try asking
        </h2>
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="min-h-12 rounded-xl border border-border bg-surface px-3.5 py-3 text-left text-body leading-snug text-text hover:border-accent-400 disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </section>
    </div>
  );
}
