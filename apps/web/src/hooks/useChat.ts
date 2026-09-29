'use client';

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { streamAsk, type AskOutcome } from '@/lib/ask-client';
import {
  chatReducer,
  initialChatState,
  isActive,
  type ChatAction,
  type FeedbackReason,
  type Vote,
} from '@/lib/chat-state';
import { recordBytes } from '@/lib/data-meter';

const DEFAULT_RATE_LIMIT_SECONDS = 60;

type FrameHandle = { cancel: () => void };

function scheduleFrame(cb: () => void): FrameHandle {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb);
    return { cancel: () => cancelAnimationFrame(id) };
  }
  const id = setTimeout(cb, 16);
  return { cancel: () => clearTimeout(id) };
}

function outcomeAction(id: string, outcome: AskOutcome, now: number): ChatAction | null {
  switch (outcome.type) {
    case 'completed':
      return null;
    case 'aborted':
      return { type: 'stopped', id, at: now };
    case 'connection_lost':
      return { type: 'connection_lost', id, at: now };
    case 'protocol_error':
      return { type: 'failed', id, errorKind: 'protocol', at: now };
    case 'http_error':
      switch (outcome.status) {
        case 429:
          return {
            type: 'rate_limited',
            id,
            at: now,
            retryAt: now + (outcome.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_SECONDS) * 1000,
          };
        case 400:
          return { type: 'failed', id, errorKind: 'bad_request', at: now };
        case 401:
        case 403:
          return { type: 'failed', id, errorKind: 'no_access', at: now };
        case 404:
          return { type: 'failed', id, errorKind: 'not_found', at: now };
        default:
          return { type: 'failed', id, errorKind: 'server', at: now };
      }
  }
}

/**
 * Chat orchestration (FR-13): owns the stream lifecycle and hands components
 * plain state + callbacks. Tokens are coalesced to one render per animation frame
 * so a fast stream never re-renders once per token; finished turns keep their
 * object identity, so memoised messages don't re-render at all.
 */
export function useChat({ courseId, lowData }: { courseId: string; lowData: boolean }) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const controllerRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const pending = useRef<{ id: string; delta: string; bytes: number } | null>(null);
  const frame = useRef<FrameHandle | null>(null);

  const flush = useCallback(() => {
    frame.current?.cancel();
    frame.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    // Dispatched together → React batches them into one render.
    if (p.bytes > 0) dispatch({ type: 'bytes', id: p.id, bytes: p.bytes });
    if (p.delta !== '') dispatch({ type: 'token', id: p.id, delta: p.delta });
  }, []);

  const queue = useCallback(
    (id: string, delta: string, bytes: number) => {
      if (pending.current && pending.current.id !== id) flush();
      const prev = pending.current;
      pending.current = {
        id,
        delta: (prev?.delta ?? '') + delta,
        bytes: (prev?.bytes ?? 0) + bytes,
      };
      frame.current ??= scheduleFrame(flush);
    },
    [flush],
  );

  const run = useCallback(
    async (id: string, question: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const outcome = await streamAsk({
        courseId,
        question,
        lowData,
        signal: controller.signal,
        onBytes: (n) => {
          recordBytes('answers', n);
          queue(id, '', n);
        },
        onEvent: (event) => {
          if (event.event === 'token') {
            queue(id, event.data.delta, 0);
            return;
          }
          flush();
          if (event.event === 'citations') {
            dispatch({ type: 'citations', id, citations: event.data.citations });
          } else {
            dispatch({ type: 'done', id, finishReason: event.data.finishReason, at: Date.now() });
          }
        },
      });

      flush();
      if (controllerRef.current === controller) controllerRef.current = null;
      const action = outcomeAction(id, outcome, Date.now());
      if (action) dispatch(action);
    },
    [courseId, lowData, queue, flush],
  );

  const busy = state.turns.some(isActive);

  // Callbacks read the latest turns through a ref so their identity stays stable
  // across tokens (memoised answers depend on it).
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });

  const ask = useCallback(
    (question: string): boolean => {
      const q = question.trim();
      if (q === '' || latest.current.turns.some(isActive) || controllerRef.current) return false;
      seq.current += 1;
      const id = `t${Date.now().toString(36)}-${seq.current}`;
      dispatch({ type: 'asked', id, question: q, at: Date.now() });
      void run(id, q);
      return true;
    },
    [run],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback(
    (id: string) => {
      const { turns } = latest.current;
      const turn = turns.find((t) => t.id === id);
      if (!turn || turns.some(isActive) || controllerRef.current) return;
      dispatch({ type: 'retried', id, at: Date.now() });
      void run(id, turn.question);
    },
    [run],
  );

  // TODO(FR-16): send votes + notes to a feedback endpoint once the API has one
  // (down-votes must be logged server-side). Until then feedback stays in memory.
  const vote = useCallback((id: string, v: Exclude<Vote, null>) => {
    dispatch({ type: 'voted', id, vote: v });
  }, []);
  const toggleReason = useCallback((id: string, reason: FeedbackReason) => {
    dispatch({ type: 'feedback_reason_toggled', id, reason });
  }, []);
  const setNote = useCallback((id: string, note: string) => {
    dispatch({ type: 'feedback_note_changed', id, note });
  }, []);
  const sendFeedback = useCallback((id: string) => {
    dispatch({ type: 'feedback_sent', id });
  }, []);

  // Leaving the page aborts any in-flight stream.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      frame.current?.cancel();
    },
    [],
  );

  return {
    turns: state.turns,
    busy,
    ask,
    stop,
    retry,
    vote,
    toggleReason,
    setNote,
    sendFeedback,
  };
}

export type ChatController = ReturnType<typeof useChat>;
