import Link from 'next/link';
import type { ErrorKind } from '@/lib/chat-state';
import { formatCountdown } from '@/lib/format';
import {
  BookOffIcon,
  ClockIcon,
  InfoIcon,
  RetryIcon,
  SpinnerIcon,
  WarningIcon,
  WifiOffIcon,
} from '@/components/ui/icons';

/**
 * Answer states from the States comp. Every state pairs an icon with a text label —
 * never colour alone (NFR-9). Refusal (amber, book) is deliberately calm and
 * distinct from errors (red, warning triangle): a refusal is the product working.
 */

/** 01 · Searching — skeleton, not spinner, so 3G feels fast. */
export function SearchingIndicator() {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-meta text-accent-300">
        <SpinnerIcon size={14} />
        Searching your course materials…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2 motion-safe:animate-pulse">
        <div className="h-3 w-[92%] rounded-md bg-skeleton" />
        <div className="h-3 w-[78%] rounded-md bg-skeleton" />
        <div className="h-3 w-[60%] rounded-md bg-skeleton" />
      </div>
    </div>
  );
}

/** 04 · Refused (FR-12, C4): amber card, book icon, explicit label. */
export function RefusalCard({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3.5 rounded-2xl border border-refused/45 bg-refused-surface p-4">
        <p className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-refused/16 text-refused">
            <BookOffIcon size={18} />
          </span>
          <span className="text-body font-semibold text-refused-text">
            Not in your course materials
          </span>
        </p>
        <p className="text-body text-text">
          {message.trim() || "That isn't covered in your course materials."} I won&apos;t guess.
        </p>
      </div>
      <p className="text-center text-xs text-text-muted">
        This isn&apos;t an error. The tutor refuses rather than make things up.
      </p>
    </div>
  );
}

const ERROR_COPY: Record<ErrorKind, { title: string; body: string; retry: boolean }> = {
  stream: {
    title: 'Something broke on our side',
    body: 'The answer stopped partway. Your question is still here, so you can try again.',
    retry: true,
  },
  server: {
    title: 'Something broke on our side',
    body: 'Your question is still here. Try again in a moment.',
    retry: true,
  },
  protocol: {
    title: 'Something broke on our side',
    body: 'We got an answer we couldn’t read. Your question is still here.',
    retry: true,
  },
  not_found: {
    title: 'Course not found',
    body: 'This link doesn’t match a course. Check the link from your lecturer.',
    retry: false,
  },
  no_access: {
    title: 'This course isn’t available to you',
    body: 'Ask your lecturer for a fresh course link.',
    retry: false,
  },
  bad_request: {
    title: 'That question couldn’t be sent',
    body: 'Questions can be up to 2,000 characters. Try rephrasing it.',
    retry: false,
  },
};

/** 05 · Error: red card, warning icon, Retry where retrying can help. */
export function ErrorCard({
  kind,
  onRetry,
  retryDisabled = false,
}: {
  kind: ErrorKind;
  onRetry: () => void;
  retryDisabled?: boolean;
}) {
  const copy = ERROR_COPY[kind];
  return (
    <div
      role="alert"
      className="flex flex-col gap-2.5 rounded-xl border border-error/50 bg-error-surface p-3.5"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-error-text">
        <WarningIcon size={16} />
        {copy.title}
      </p>
      <p className="text-meta text-text">{copy.body}</p>
      {copy.retry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-text px-4 text-meta font-semibold text-bg disabled:opacity-60"
        >
          <RetryIcon size={16} />
          Try again
        </button>
      ) : (
        (kind === 'not_found' || kind === 'no_access') && (
          <Link href="/" className="inline-flex min-h-11 items-center self-start text-meta">
            Enter a different course link
          </Link>
        )
      )}
    </div>
  );
}

/** 06 · Connection lost: partial text stays (dimmed by the caller). */
export function ConnectionLostNotice({
  hasPartial,
  onRetry,
  retryDisabled = false,
}: {
  hasPartial: boolean;
  onRetry: () => void;
  retryDisabled?: boolean;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5"
    >
      <WifiOffIcon size={18} className="shrink-0 text-text" />
      <span className="grow text-meta">
        {hasPartial
          ? 'Connection lost. We kept what arrived.'
          : 'Connection lost before the answer arrived.'}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="h-11 shrink-0 rounded-lg border border-border px-3 text-meta text-accent-300 disabled:opacity-60"
      >
        Retry
      </button>
    </div>
  );
}

/** 07 · Rate limit (FR-30): never a raw 429; countdown, draft kept. */
export function RateLimitNotice({
  secondsLeft,
  totalSeconds,
  onRetry,
}: {
  secondsLeft: number;
  totalSeconds: number;
  onRetry: () => void;
}) {
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 1;
  return (
    <div
      role="status"
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-bg p-3.5"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ClockIcon size={16} className="text-accent-300" />
        You&apos;re asking fast. Nice.
      </p>
      {secondsLeft > 0 ? (
        <p className="text-meta">
          Take a breather: you can ask again in{' '}
          <strong className="tabular-nums">{formatCountdown(secondsLeft)}</strong>. Your draft is
          kept.
        </p>
      ) : (
        <p className="text-meta">You can ask again now.</p>
      )}
      <div aria-hidden="true" className="flex h-1.5 rounded-full bg-surface-raised">
        <span
          className="rounded-full bg-accent-400"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
        />
      </div>
      {secondsLeft === 0 && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center gap-2 self-start rounded-lg border border-border px-3 text-meta text-accent-300"
        >
          <RetryIcon size={16} />
          Ask this again
        </button>
      )}
    </div>
  );
}

/** Stopped by the student: the partial answer stays. */
export function StoppedNote({
  hasPartial,
  sourcesHidden,
  onRetry,
  retryDisabled = false,
}: {
  hasPartial: boolean;
  sourcesHidden: boolean;
  onRetry: () => void;
  retryDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <InfoIcon size={14} />
        {hasPartial ? 'Stopped.' : 'Stopped before an answer arrived.'}
        {sourcesHidden && ' Sources weren’t checked, so they’re hidden.'}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="inline-flex min-h-11 items-center gap-1.5 text-accent-300 disabled:opacity-60"
      >
        <RetryIcon size={14} />
        Ask again
      </button>
    </div>
  );
}
