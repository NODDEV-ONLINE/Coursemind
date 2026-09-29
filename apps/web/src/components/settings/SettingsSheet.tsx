'use client';

import Link from 'next/link';
import { useId, useRef } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type { DataUsage } from '@/lib/data-meter';
import { formatKB, formatKBSpoken } from '@/lib/format';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';

export interface SettingsSheetProps {
  lowData: boolean;
  onLowDataChange: (on: boolean) => void;
  usage: DataUsage;
  pseudonym: string;
  consentLabel: string | null;
  retentionDays: number;
  onClose: () => void;
}

const legendSwatch = {
  answers: 'bg-accent-400',
  sources: 'bg-accent-300',
  app: 'bg-accent-700',
} as const;

/**
 * Settings-Privacy comp, scoped to C5: low-data toggle + session data meter, plus
 * the read-only privacy facts (pseudonym, consent, retention). Install and
 * "Delete my data" are later milestones.
 */
export function SettingsSheet({
  lowData,
  onLowDataChange,
  usage,
  pseudonym,
  consentLabel,
  retentionDays,
  onClose,
}: SettingsSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const switchLabelId = useId();
  const switchDescId = useId();
  useDialogFocus(ref, true, onClose);

  const total = usage.answers + usage.sources + usage.app;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : '0%');
  const parts = [
    { key: 'answers', label: 'Answers', bytes: usage.answers },
    { key: 'sources', label: 'Sources', bytes: usage.sources },
    { key: 'app', label: 'App', bytes: usage.app },
  ] as const;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg"
    >
      <header className="flex h-15 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to chat"
          className="flex size-11 items-center justify-center rounded-control text-text hover:bg-surface"
        >
          <ChevronLeftIcon />
        </button>
        <h1 id={titleId} className="font-display text-lg font-semibold">
          Settings
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-4.5 pb-5">
        <section className="flex flex-col gap-2.5" aria-labelledby="settings-data">
          <h2
            id="settings-data"
            className="text-xs font-semibold tracking-wider text-text-muted uppercase"
          >
            Data
          </h2>
          <div className="flex flex-col rounded-card border border-border bg-surface">
            <div className="flex items-center gap-3 border-b border-border p-3.5">
              <span className="flex grow flex-col gap-1">
                <span id={switchLabelId} className="text-body font-semibold">
                  Low-data mode
                </span>
                <span id={switchDescId} className="text-meta text-text-muted">
                  Compact, text-only answers under 30 KB. Skips the heading font.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={lowData}
                aria-labelledby={switchLabelId}
                aria-describedby={switchDescId}
                onClick={() => onLowDataChange(!lowData)}
                className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-full`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-12 rounded-full p-0.75 ${
                    lowData ? 'justify-end bg-accent-500' : 'justify-start bg-surface-raised'
                  }`}
                >
                  <span className="size-5.5 rounded-full bg-on-accent" />
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5 p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-text-muted">This session</span>
                <span className="font-display text-2xl font-semibold tabular-nums">
                  ~{formatKB(total)}
                </span>
              </div>
              <div
                role="img"
                aria-label={`Answers ${formatKBSpoken(usage.answers)}, sources ${formatKBSpoken(usage.sources)}, app ${formatKBSpoken(usage.app)}`}
                className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-raised"
              >
                {parts.map((p) =>
                  p.bytes > 0 ? (
                    <span
                      key={p.key}
                      className={legendSwatch[p.key]}
                      style={{ width: pct(p.bytes) }}
                    />
                  ) : null,
                )}
              </div>
              <ul
                className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-text-muted"
                aria-hidden="true"
              >
                {parts.map((p) => (
                  <li key={p.key} className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-xs ${legendSwatch[p.key]}`} />
                    {p.label} {formatKB(p.bytes)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted">
                Counted on this device for this browser session. The app itself is cached after the
                first visit.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="settings-privacy">
          <h2
            id="settings-privacy"
            className="text-xs font-semibold tracking-wider text-text-muted uppercase"
          >
            Privacy
          </h2>
          <dl className="flex flex-col rounded-card border border-border bg-surface text-sm">
            <div className="flex justify-between gap-3 border-b border-border px-3.5 py-3">
              <dt className="text-text-muted">Your ID</dt>
              <dd className="font-semibold">{pseudonym}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border px-3.5 py-3">
              <dt className="text-text-muted">Consent</dt>
              <dd className="text-right">{consentLabel ?? 'Not given yet'}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border px-3.5 py-3">
              <dt className="text-text-muted">Questions kept for</dt>
              <dd>{retentionDays} days</dd>
            </div>
            <div>
              <dt className="sr-only">Privacy notice</dt>
              <dd>
                <Link
                  href="/privacy"
                  className="flex min-h-11 items-center justify-between px-3.5 py-3"
                >
                  Read the privacy notice
                  <ChevronRightIcon size={16} />
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
