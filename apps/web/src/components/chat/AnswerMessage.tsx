'use client';

import { memo, useMemo } from 'react';
import { isActive, type FeedbackReason, type Turn } from '@/lib/chat-state';
import { resolveAnswer } from '@/lib/citations';
import { formatClock, formatKB } from '@/lib/format';
import { useCountdown } from '@/hooks/useCountdown';
import { LogoMark } from '@/components/ui/Logo';
import { AnswerBody } from './AnswerBody';
import { FeedbackBar } from './FeedbackBar';
import { SourcesFooter } from './SourcesFooter';
import {
  ConnectionLostNotice,
  ErrorCard,
  RateLimitNotice,
  RefusalCard,
  SearchingIndicator,
  StoppedNote,
} from './StateCards';

export interface AnswerMessageProps {
  turn: Turn;
  /** Citation key shown in the source viewer, if it belongs to this turn. */
  activeSourceKey: string | null;
  /** Another answer is streaming: retry buttons wait. */
  busy: boolean;
  onOpenSource: (turnId: string, key: string) => void;
  onRetry: (turnId: string) => void;
  onVote: (turnId: string, vote: 'up' | 'down') => void;
  onToggleReason: (turnId: string, reason: FeedbackReason) => void;
  onNoteChange: (turnId: string, note: string) => void;
  onSendFeedback: (turnId: string) => void;
  onCopy: (text: string) => Promise<boolean>;
}

/**
 * One tutor answer in any state (States comp). Memoised: during streaming only the
 * active turn's object changes, so finished answers never re-render per token.
 */
export const AnswerMessage = memo(function AnswerMessage({
  turn,
  activeSourceKey,
  busy,
  onOpenSource,
  onRetry,
  onVote,
  onToggleReason,
  onNoteChange,
  onSendFeedback,
  onCopy,
}: AnswerMessageProps) {
  const active = isActive(turn);
  // A turn that ended without the validated list (stopped / connection lost) must
  // not show unverified sources: resolve against an empty list so chips drop.
  const unverifiedTerminal = !active && turn.citations === null;
  const resolved = useMemo(
    () => resolveAnswer(turn.text, active ? turn.citations : (turn.citations ?? [])),
    [turn.text, turn.citations, active],
  );
  const secondsLeft = useCountdown(turn.status === 'rate_limited' ? turn.retryAt : null);
  const totalWait =
    turn.retryAt !== null && turn.answeredAt !== null
      ? Math.max(1, Math.round((turn.retryAt - turn.answeredAt) / 1000))
      : 0;

  const hasText = resolved.plainText.trim() !== '' || resolved.segments.length > 0;
  const openSource = (key: string) => onOpenSource(turn.id, key);
  const retry = () => onRetry(turn.id);

  let meta: string;
  if (turn.status === 'searching') meta = 'searching…';
  else if (turn.status === 'streaming') meta = 'writing…';
  else
    meta = `${formatClock(turn.answeredAt ?? turn.askedAt)}${turn.bytes > 0 ? ` · ${formatKB(turn.bytes)}` : ''}`;

  return (
    <article aria-busy={active} className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-meta font-semibold">
        <LogoMark size={18} withSpine={false} />
        Tutor
        <span className={`text-xs font-normal ${active ? 'text-accent-300' : 'text-text-muted'}`}>
          · {meta}
        </span>
      </h2>

      {turn.status === 'searching' && <SearchingIndicator />}

      {turn.status === 'refused' ? (
        <RefusalCard message={resolved.plainText} />
      ) : (
        hasText && (
          <AnswerBody
            segments={resolved.segments}
            streaming={turn.status === 'streaming'}
            dimmed={turn.status === 'connection_lost' || turn.status === 'error'}
            activeKey={activeSourceKey}
            onOpenSource={openSource}
          />
        )
      )}

      {turn.status === 'done' && (
        <>
          <SourcesFooter groups={resolved.groups} onOpenSource={openSource} />
          <FeedbackBar
            feedback={turn.feedback}
            onCopy={() => onCopy(resolved.plainText)}
            onVote={(v) => onVote(turn.id, v)}
            onToggleReason={(r) => onToggleReason(turn.id, r)}
            onNoteChange={(n) => onNoteChange(turn.id, n)}
            onSend={() => onSendFeedback(turn.id)}
          />
        </>
      )}

      {turn.status === 'error' && turn.errorKind !== null && (
        <ErrorCard kind={turn.errorKind} onRetry={retry} retryDisabled={busy} />
      )}
      {turn.status === 'connection_lost' && (
        <ConnectionLostNotice hasPartial={hasText} onRetry={retry} retryDisabled={busy} />
      )}
      {turn.status === 'rate_limited' && (
        <RateLimitNotice secondsLeft={secondsLeft} totalSeconds={totalWait} onRetry={retry} />
      )}
      {turn.status === 'stopped' && (
        <StoppedNote
          hasPartial={hasText}
          sourcesHidden={unverifiedTerminal && turn.text.includes('[doc:')}
          onRetry={retry}
          retryDisabled={busy}
        />
      )}
    </article>
  );
});
