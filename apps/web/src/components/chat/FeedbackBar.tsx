'use client';

import { useId, useState } from 'react';
import { FEEDBACK_REASONS, type Feedback, type FeedbackReason } from '@/lib/chat-state';
import { CheckIcon, CopyIcon, ThumbDownIcon, ThumbUpIcon } from '@/components/ui/icons';

export interface FeedbackBarProps {
  feedback: Feedback;
  onCopy: () => Promise<boolean>;
  onVote: (vote: 'up' | 'down') => void;
  onToggleReason: (reason: FeedbackReason) => void;
  onNoteChange: (note: string) => void;
  onSend: () => void;
}

const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-control text-text-muted hover:bg-surface aria-pressed:bg-cited/16 aria-pressed:text-accent-300';

/** Copy + thumbs up/down (FR-16, C6); a down-vote opens the optional note. */
export function FeedbackBar({
  feedback,
  onCopy,
  onVote,
  onToggleReason,
  onNoteChange,
  onSend,
}: FeedbackBarProps) {
  const [copied, setCopied] = useState(false);
  const noteId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="-ml-2.5 flex items-center gap-0.5">
        <button
          type="button"
          aria-label={copied ? 'Answer copied' : 'Copy answer'}
          className={iconButton}
          onClick={() => {
            void onCopy().then((ok) => {
              if (!ok) return;
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <CheckIcon size={17} /> : <CopyIcon size={17} />}
        </button>
        <button
          type="button"
          aria-label="Helpful"
          aria-pressed={feedback.vote === 'up'}
          className={iconButton}
          onClick={() => onVote('up')}
        >
          <ThumbUpIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="Not helpful"
          aria-pressed={feedback.vote === 'down'}
          className={iconButton}
          onClick={() => onVote('down')}
        >
          <ThumbDownIcon size={17} />
        </button>
        {feedback.vote === 'up' && (
          <span role="status" className="text-xs text-text-muted">
            Thanks!
          </span>
        )}
      </div>

      {feedback.vote === 'down' &&
        (feedback.sent ? (
          <p role="status" className="text-xs text-text-muted">
            Thanks. Noted.
          </p>
        ) : (
          <form
            className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-meta font-semibold">
                What was wrong? <span className="font-normal text-text-muted">Optional</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_REASONS.map((reason) => {
                  const on = feedback.reasons.includes(reason);
                  return (
                    <button
                      key={reason}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggleReason(reason)}
                      className={`min-h-11 rounded-full border px-3 text-xs ${
                        on
                          ? 'border-accent-500 bg-cited/18 text-accent-300'
                          : 'border-border text-text'
                      }`}
                    >
                      {reason}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label htmlFor={noteId} className="sr-only">
              Tell us more (optional)
            </label>
            <textarea
              id={noteId}
              rows={2}
              maxLength={500}
              value={feedback.note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Tell us more…"
              className="resize-none rounded-lg border border-border bg-surface px-2.5 py-2 text-base text-text"
            />
            <button
              type="submit"
              className="h-11 self-end rounded-control bg-accent-500 px-4 text-meta font-semibold text-on-accent hover:bg-accent-600"
            >
              Send<span className="sr-only"> feedback</span>
            </button>
          </form>
        ))}
    </div>
  );
}
