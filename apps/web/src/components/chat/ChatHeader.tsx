import Link from 'next/link';
import { DataIcon, SettingsIcon } from '@/components/ui/icons';
import { LogoMark, Wordmark } from '@/components/ui/Logo';

export interface ChatHeaderProps {
  /** Pre-formatted session data use, e.g. "11 KB" (FR-14). */
  dataLabel: string;
  /** Spoken form, e.g. "11 kilobytes". */
  dataSpoken: string;
  lowData: boolean;
  onOpenSettings: () => void;
}

export function ChatHeader({ dataLabel, dataSpoken, lowData, onOpenSettings }: ChatHeaderProps) {
  return (
    <header className="flex h-15 shrink-0 items-center gap-1 border-b border-border px-2">
      <Link
        href="/"
        aria-label="CourseMind home"
        className="flex size-11 items-center justify-center rounded-control"
      >
        <LogoMark size={26} />
      </Link>
      <div className="flex min-w-0 grow flex-col">
        <Wordmark className="truncate text-body leading-tight" />
        <span className="truncate text-xs text-text-muted">
          Answers only from your course materials
        </span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-muted tabular-nums">
        <DataIcon size={12} className="text-accent-300" />
        <span aria-hidden="true">{dataLabel}</span>
        <span className="sr-only">
          Data used this session: {dataSpoken}
          {lowData ? ', low-data mode on' : ''}
        </span>
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="flex size-11 shrink-0 items-center justify-center rounded-control text-text hover:bg-surface"
      >
        <SettingsIcon />
      </button>
    </header>
  );
}
