'use client';

import { useId, type KeyboardEvent } from 'react';
import { formatCountdown } from '@/lib/format';
import { SendIcon } from '@/components/ui/icons';

export const MAX_QUESTION_LENGTH = 2000;
const COUNTER_FROM = MAX_QUESTION_LENGTH - 200;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** An answer is streaming: typing is fine, sending waits. */
  busy: boolean;
  /** Rate-limit cooldown in seconds (0 = none). */
  cooldownSeconds: number;
  placeholder: string;
}

function isCoarsePointer(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Ask box (C2). Enter sends and Shift+Enter adds a line on hardware keyboards; on
 * touch keyboards Enter is a newline and the Send button sends. Grows with its
 * content (CSS field-sizing where supported).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  cooldownSeconds,
  placeholder,
}: ComposerProps) {
  const inputId = useId();
  const hintId = useId();
  const canSend = value.trim() !== '' && !busy && cooldownSeconds === 0;
  const remaining = MAX_QUESTION_LENGTH - value.length;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (isCoarsePointer()) return;
    e.preventDefault();
    if (canSend) onSubmit();
  };

  let sendLabel = 'Send';
  if (cooldownSeconds > 0) sendLabel = `Send, available in ${formatCountdown(cooldownSeconds)}`;
  else if (busy) sendLabel = 'Send, available when the current answer finishes';

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface py-1.5 pr-1.5 pl-3.5 focus-within:border-accent-400 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-300">
        <label htmlFor={inputId} className="sr-only">
          Ask a question about your course
        </label>
        <textarea
          id={inputId}
          rows={1}
          value={value}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-describedby={hintId}
          className="max-h-40 min-h-11 grow resize-none bg-transparent py-2.5 text-base leading-snug text-text outline-none [field-sizing:content] focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sendLabel}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500 px-2 text-on-accent hover:bg-accent-600 disabled:bg-surface-raised disabled:text-text-muted"
        >
          {cooldownSeconds > 0 ? (
            <span className="text-xs font-semibold tabular-nums" aria-hidden="true">
              {formatCountdown(cooldownSeconds)}
            </span>
          ) : (
            <SendIcon />
          )}
        </button>
      </div>
      <p id={hintId} className="text-center text-xs text-text-muted">
        {value.length >= COUNTER_FROM
          ? `${remaining} characters left`
          : 'Answers come only from your course materials.'}
      </p>
    </form>
  );
}
