'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRightIcon, DataIcon } from '@/components/ui/icons';
import { LogoMark, Wordmark } from '@/components/ui/Logo';
import { HowItsDifferent } from './HowItsDifferent';

export interface ConsentScreenProps {
  pseudonym: string;
  retentionDays: number;
  lowData: boolean;
  onAccept: () => void;
}

/**
 * First-use consent (C7, PR-2) per the Main comp: what is stored, for how long,
 * which processors see it — before the first question can be sent. The box starts
 * unchecked: pre-ticked consent isn't consent.
 */
export function ConsentScreen({ pseudonym, retentionDays, lowData, onAccept }: ConsentScreenProps) {
  const [agreed, setAgreed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const checkboxId = useId();
  const nudgeId = useId();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-5 pt-5 pb-6">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <LogoMark size={28} />
          <Wordmark className="text-lg" />
        </span>
        {lowData && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-muted">
            <DataIcon size={12} className="text-accent-300" />
            Low data on
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight">
          A tutor that only answers from <span className="text-accent-300">your course.</span>
        </h1>
        <p className="text-body text-text-muted">
          It&apos;s different from a chatbot. Here&apos;s how.
        </p>
      </div>

      <HowItsDifferent />

      <form
        className="mt-auto flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (agreed) onAccept();
          else setNudge(true);
        }}
      >
        <section
          aria-labelledby="before-you-start"
          className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-sunken p-3.5"
        >
          <h2 id="before-you-start" className="text-meta font-semibold">
            Before you start
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-meta text-text-muted">
            <li>
              You&apos;re <strong className="font-semibold text-text">{pseudonym}</strong>. No real
              name, ever.
            </li>
            <li>
              We keep your questions and answers for {retentionDays} days to check answer quality,
              then delete them.
            </li>
            <li>
              Answers use Anthropic; search uses Google. <Link href="/privacy">Privacy notice</Link>
            </li>
          </ul>
          <div className="flex min-h-11 items-center gap-2.5">
            <input
              id={checkboxId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                setNudge(false);
              }}
              aria-describedby={nudge ? nudgeId : undefined}
              className="size-5 shrink-0 accent-accent-500"
            />
            <label htmlFor={checkboxId} className="text-sm text-text">
              I understand and agree
            </label>
          </div>
          {nudge && (
            <p id={nudgeId} role="alert" className="text-meta text-refused-text">
              Tick the box to agree before you start.
            </p>
          )}
        </section>

        <button
          type="submit"
          aria-disabled={!agreed}
          className={`flex h-13 items-center justify-center gap-2 rounded-card text-base font-semibold ${
            agreed
              ? 'bg-accent-500 text-on-accent hover:bg-accent-600'
              : 'bg-surface-raised text-text-muted'
          }`}
        >
          Start asking
          <ArrowRightIcon size={18} />
        </button>
      </form>
    </main>
  );
}
