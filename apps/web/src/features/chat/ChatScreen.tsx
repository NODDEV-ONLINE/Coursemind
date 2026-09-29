'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnswerMessage } from '@/components/chat/AnswerMessage';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { EmptyState } from '@/components/chat/EmptyState';
import { LiveRegion } from '@/components/chat/LiveRegion';
import { ScrollToLatestButton, StopButton } from '@/components/chat/StreamControls';
import { UserMessage } from '@/components/chat/UserMessage';
import { SourceDrawer } from '@/components/source/SourceDrawer';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { useChat } from '@/hooks/useChat';
import { useCountdown } from '@/hooks/useCountdown';
import { useSourcePassage } from '@/hooks/useSourcePassage';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import { resolveAnswer } from '@/lib/citations';
import { RETENTION_DAYS, type ConsentRecord } from '@/lib/consent';
import { dataMeterStore, refreshAppBytes, totalBytes, type DataUsage } from '@/lib/data-meter';
import { formatClock, formatKB, formatKBSpoken } from '@/lib/format';
import { setLowData } from '@/lib/preferences';
import { liveAnnouncements } from './live-announcements';

/** Static starters (C2). Course-specific suggestions need a course-topics endpoint. */
export const SUGGESTED_QUESTIONS = [
  'Summarise the key ideas from the first lecture',
  'Explain the most important definitions in this course',
  'Give me a worked example from the course notes',
] as const;

const EMPTY_USAGE: DataUsage = { answers: 0, sources: 0, app: 0 };
const consentDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface ChatScreenProps {
  courseId: string;
  lowData: boolean;
  pseudonym: string;
  consent: ConsentRecord;
}

/**
 * Student chat (C2–C6): wires the chat hook, stores and overlays to the
 * presentational components. No business rules live here — grounding, citation
 * validation and refusals are decided by the API; this only renders them.
 */
export function ChatScreen({ courseId, lowData, pseudonym, consent }: ChatScreenProps) {
  const chat = useChat({ courseId, lowData });
  const { turns, busy } = chat;
  const [draft, setDraft] = useState('');
  const [drawer, setDrawer] = useState<{ turnId: string; key: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const usage = useSyncExternalStore(
    dataMeterStore.subscribe,
    dataMeterStore.get,
    () => EMPTY_USAGE,
  );
  useEffect(() => {
    refreshAppBytes();
    window.addEventListener('load', refreshAppBytes);
    return () => window.removeEventListener('load', refreshAppBytes);
  }, []);

  const last = turns[turns.length - 1];
  const scrollRef = useRef<HTMLElement>(null);
  const { atBottom, scrollToLatest } = useStickToBottom(
    scrollRef,
    `${turns.length}:${last?.status}:${last?.text.length}`,
  );

  const cooldown = useCountdown(last?.status === 'rate_limited' ? last.retryAt : null);

  const { ask } = chat;
  const submit = useCallback(() => {
    if (ask(draft)) setDraft('');
  }, [ask, draft]);

  const openSource = useCallback((turnId: string, key: string) => {
    setDrawer({ turnId, key });
  }, []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Source viewer: navigable list = this answer's validated citations, in order.
  const drawerTurn = drawer ? turns.find((t) => t.id === drawer.turnId) : undefined;
  const drawerRefs = useMemo(
    () =>
      drawerTurn
        ? resolveAnswer(drawerTurn.text, drawerTurn.citations ?? []).refs.filter(
            (r) => r.chunkId !== null,
          )
        : [],
    [drawerTurn],
  );
  const drawerIndex = drawer ? drawerRefs.findIndex((r) => r.key === drawer.key) : -1;
  const current = drawerIndex >= 0 ? drawerRefs[drawerIndex] : undefined;
  const passage = useSourcePassage(courseId, current?.chunkId ?? null);
  const goTo = (i: number) => {
    const ref = drawerRefs[i];
    if (drawer && ref) setDrawer({ turnId: drawer.turnId, key: ref.key });
  };

  const liveItems = useMemo(() => liveAnnouncements(last), [last]);
  const overlayOpen = current !== undefined || settingsOpen;

  return (
    <div className="flex h-dvh flex-col">
      <div inert={overlayOpen} className="flex min-h-0 grow flex-col">
        <ChatHeader
          dataLabel={formatKB(totalBytes(usage))}
          dataSpoken={formatKBSpoken(totalBytes(usage))}
          lowData={lowData}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main ref={scrollRef} className="min-h-0 grow overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4">
            {turns.length === 0 ? (
              <EmptyState suggestions={SUGGESTED_QUESTIONS} onPick={chat.ask} disabled={busy} />
            ) : (
              <>
                <h1 className="sr-only">Course chat</h1>
                {turns.map((turn) => (
                  <Fragment key={turn.id}>
                    <UserMessage question={turn.question} time={formatClock(turn.askedAt)} />
                    <AnswerMessage
                      turn={turn}
                      activeSourceKey={drawer?.turnId === turn.id ? drawer.key : null}
                      busy={busy}
                      onOpenSource={openSource}
                      onRetry={chat.retry}
                      onVote={chat.vote}
                      onToggleReason={chat.toggleReason}
                      onNoteChange={chat.setNote}
                      onSendFeedback={chat.sendFeedback}
                      onCopy={copyText}
                    />
                  </Fragment>
                ))}
              </>
            )}
          </div>
        </main>

        <div className="relative shrink-0 border-t border-border">
          {!atBottom && turns.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center">
              <div className="pointer-events-auto">
                <ScrollToLatestButton onClick={scrollToLatest} />
              </div>
            </div>
          )}
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-3 pt-2 pb-[max(--spacing(3.5),env(safe-area-inset-bottom))]">
            {busy && <StopButton onStop={chat.stop} />}
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              busy={busy}
              cooldownSeconds={cooldown}
              placeholder={turns.length === 0 ? 'Ask about your course…' : 'Ask a follow-up…'}
            />
          </div>
        </div>
      </div>

      <LiveRegion turnKey={last?.id ?? null} items={liveItems} />

      {drawer && current && (
        <SourceDrawer
          sourceNumber={current.sourceNumber}
          page={current.page}
          claim={current.claim}
          state={passage.state}
          index={drawerIndex}
          total={drawerRefs.length}
          onPrev={() => goTo(drawerIndex - 1)}
          onNext={() => goTo(drawerIndex + 1)}
          onClose={closeDrawer}
          onRetry={passage.reload}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          lowData={lowData}
          onLowDataChange={setLowData}
          usage={usage}
          pseudonym={pseudonym}
          consentLabel={`Given ${consentDate.format(new Date(consent.acceptedAt))} · v${consent.version}`}
          retentionDays={RETENTION_DAYS}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
