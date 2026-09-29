'use client';

import { useId, useRef } from 'react';
import type { PassageState } from '@/hooks/useSourcePassage';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { formatKB } from '@/lib/format';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DataIcon,
  FileIcon,
  InfoIcon,
  SpinnerIcon,
} from '@/components/ui/icons';

export interface SourceDrawerProps {
  sourceNumber: number;
  page: number;
  /** The sentence this source was cited for. */
  claim: string;
  state: PassageState;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onRetry: () => void;
}

function describeFile(filename: string, page: number | null) {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? '';
  const isSlides = ext === 'ppt' || ext === 'pptx' || ext === 'key';
  const unit = isSlides ? 'slide' : 'page';
  const parts = [ext ? ext.toUpperCase() : null, page !== null ? `${unit} ${page}` : null];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Source viewer (FR-15): a bottom drawer showing the cited passage, text only
 * (FR-14). The passage is untrusted document text (SR-3) and is rendered as a
 * plain text node — never as HTML.
 */
export function SourceDrawer({
  sourceNumber,
  page,
  claim,
  state,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onRetry,
}: SourceDrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocus(ref, true, onClose);

  const fallbackTitle = `Document ${sourceNumber}, page ${page}`;
  const title = state.status === 'ok' ? state.chunk.filename || fallbackTitle : fallbackTitle;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-sheet border-t border-border bg-surface pt-2"
      >
        <div aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-border" />

        <div className="flex items-start gap-2.5 border-b border-border py-3 pr-2 pl-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-cited/18 text-accent-300">
            <FileIcon size={18} />
          </span>
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <h2 id={titleId} className="text-body font-semibold break-words">
              {title}
            </h2>
            <span className="text-xs text-text-muted">
              {state.status === 'ok'
                ? describeFile(state.chunk.filename, state.chunk.page ?? page)
                : `Source ${sourceNumber} · page ${page}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source"
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-text hover:bg-bg"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex grow flex-col gap-3.5 overflow-y-auto overscroll-contain p-4">
          {state.status === 'loading' && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <p className="flex items-center gap-2 text-meta text-accent-300">
                <SpinnerIcon size={14} />
                Opening the source…
              </p>
              <div aria-hidden="true" className="flex flex-col gap-2.5 motion-safe:animate-pulse">
                <div className="h-3.5 w-3/5 rounded-md bg-skeleton" />
                <div className="h-3.5 w-11/12 rounded-md bg-skeleton" />
                <div className="h-3.5 w-4/5 rounded-md bg-skeleton" />
              </div>
            </div>
          )}

          {state.status === 'not_found' && (
            <div
              role="status"
              className="flex gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-meta"
            >
              <SpinnerIcon size={16} className="mt-0.5 shrink-0 text-accent-300" />
              <p>
                <strong className="font-semibold">This source is being updated.</strong> Your
                lecturer is updating this document. The source opens once it&apos;s ready.
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl border border-error/50 bg-error-surface p-3 text-meta"
            >
              <p className="flex items-center gap-2 font-semibold text-error-text">
                <InfoIcon size={16} />
                Couldn&apos;t load this source.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="h-11 self-start rounded-lg bg-text px-4 font-semibold text-bg"
              >
                Try again
              </button>
            </div>
          )}

          {state.status === 'ok' && (
            <>
              <p className="flex items-center gap-2 rounded-control bg-bg px-2.5 py-2 text-xs text-text-muted">
                <DataIcon size={14} className="text-accent-300" />
                Text only · {formatKB(state.bytes)}
              </p>
              <blockquote className="rounded-lg bg-cited/20 px-3 py-2.5 font-passage text-base leading-relaxed break-words whitespace-pre-wrap text-text ring-1 ring-accent-400/55 ring-inset">
                {state.chunk.text}
              </blockquote>
            </>
          )}

          {claim !== '' && (
            <div className="flex flex-col gap-1 rounded-control border border-dashed border-border px-3 py-2.5">
              <span className="text-xs text-text-muted">Cited for</span>
              <q className="text-sm">{claim}</q>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 pt-2.5 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label="Previous source"
            className="flex size-11 items-center justify-center rounded-xl border border-border text-text disabled:opacity-40"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <span className="grow text-center text-meta text-text-muted tabular-nums">
            Source {index + 1} of {total}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="Next source"
            className="flex size-11 items-center justify-center rounded-xl border border-border text-text disabled:opacity-40"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
