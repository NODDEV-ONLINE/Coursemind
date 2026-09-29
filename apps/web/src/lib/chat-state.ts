import type { Citation, FinishReason } from './ask-events';

/**
 * Chat state machine (FR-13). One `Turn` = one question and its answer.
 *
 *   searching ──token──▶ streaming ──done(stop)────▶ done
 *       │                   │     ──done(refusal)─▶ refused
 *       │                   │     ──done(error)───▶ error
 *       └───────────────────┴──── stopped (user abort, partial kept)
 *                                 connection_lost (stream dropped, partial kept)
 *                                 error / rate_limited (HTTP or protocol failure)
 *
 * Stream events are only applied while a turn is active (searching/streaming), so
 * late events after a Stop can't resurrect it. `retried` resets a turn to searching.
 */

export type TurnStatus =
  | 'searching'
  | 'streaming'
  | 'done'
  | 'refused'
  | 'error'
  | 'stopped'
  | 'connection_lost'
  | 'rate_limited';

/** Why a turn is in the `error` state. */
export type ErrorKind =
  | 'stream' // done.finishReason = "error" (upstream LLM failure)
  | 'server' // 5xx / proxy failure
  | 'protocol' // malformed SSE payload
  | 'not_found' // course doesn't exist
  | 'no_access' // not permitted for this course
  | 'bad_request'; // question rejected by validation

export type Vote = 'up' | 'down' | null;

export const FEEDBACK_REASONS = ['Wrong source', 'Unclear', 'Incomplete'] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export interface Feedback {
  vote: Vote;
  reasons: FeedbackReason[];
  note: string;
  sent: boolean;
}

export interface Turn {
  id: string;
  question: string;
  askedAt: number;
  status: TurnStatus;
  /** Raw streamed text, including inline `[doc:… p…]` markers. */
  text: string;
  /** Validated citations; null until the `citations` event arrives. */
  citations: Citation[] | null;
  errorKind: ErrorKind | null;
  /** Rate-limited turns: epoch ms when asking is allowed again. */
  retryAt: number | null;
  /** Response bytes received for this answer (low-data meter, FR-14). */
  bytes: number;
  answeredAt: number | null;
  feedback: Feedback;
}

export interface ChatState {
  turns: Turn[];
}

export type ChatAction =
  | { type: 'asked'; id: string; question: string; at: number }
  | { type: 'token'; id: string; delta: string }
  | { type: 'bytes'; id: string; bytes: number }
  | { type: 'citations'; id: string; citations: Citation[] }
  | { type: 'done'; id: string; finishReason: FinishReason; at: number }
  | { type: 'stopped'; id: string; at: number }
  | { type: 'connection_lost'; id: string; at: number }
  | { type: 'failed'; id: string; errorKind: ErrorKind; at: number }
  | { type: 'rate_limited'; id: string; retryAt: number; at: number }
  | { type: 'retried'; id: string; at: number }
  | { type: 'voted'; id: string; vote: Vote }
  | { type: 'feedback_reason_toggled'; id: string; reason: FeedbackReason }
  | { type: 'feedback_note_changed'; id: string; note: string }
  | { type: 'feedback_sent'; id: string };

export const initialChatState: ChatState = { turns: [] };

const emptyFeedback: Feedback = { vote: null, reasons: [], note: '', sent: false };

export function isActive(turn: Pick<Turn, 'status'>): boolean {
  return turn.status === 'searching' || turn.status === 'streaming';
}

function update(state: ChatState, id: string, fn: (turn: Turn) => Turn): ChatState {
  let changed = false;
  const turns = state.turns.map((t) => {
    if (t.id !== id) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { turns } : state;
}

/** Apply `fn` only while the turn is still receiving its stream. */
function updateActive(state: ChatState, id: string, fn: (turn: Turn) => Turn): ChatState {
  return update(state, id, (t) => (isActive(t) ? fn(t) : t));
}

function finishStatus(reason: FinishReason): Pick<Turn, 'status' | 'errorKind'> {
  switch (reason) {
    case 'stop':
      return { status: 'done', errorKind: null };
    case 'refusal':
      return { status: 'refused', errorKind: null };
    case 'error':
      return { status: 'error', errorKind: 'stream' };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'asked':
      return {
        turns: [
          ...state.turns,
          {
            id: action.id,
            question: action.question,
            askedAt: action.at,
            status: 'searching',
            text: '',
            citations: null,
            errorKind: null,
            retryAt: null,
            bytes: 0,
            answeredAt: null,
            feedback: emptyFeedback,
          },
        ],
      };

    case 'token':
      if (action.delta === '') return state;
      return updateActive(state, action.id, (t) => ({
        ...t,
        status: 'streaming',
        text: t.text + action.delta,
      }));

    case 'bytes':
      return updateActive(state, action.id, (t) => ({ ...t, bytes: t.bytes + action.bytes }));

    case 'citations':
      return updateActive(state, action.id, (t) => ({ ...t, citations: action.citations }));

    case 'done':
      return updateActive(state, action.id, (t) => ({
        ...t,
        ...finishStatus(action.finishReason),
        answeredAt: action.at,
      }));

    case 'stopped':
      return updateActive(state, action.id, (t) => ({
        ...t,
        status: 'stopped',
        answeredAt: action.at,
      }));

    case 'connection_lost':
      return updateActive(state, action.id, (t) => ({
        ...t,
        status: 'connection_lost',
        answeredAt: action.at,
      }));

    case 'failed':
      return updateActive(state, action.id, (t) => ({
        ...t,
        status: 'error',
        errorKind: action.errorKind,
        answeredAt: action.at,
      }));

    case 'rate_limited':
      return updateActive(state, action.id, (t) => ({
        ...t,
        status: 'rate_limited',
        retryAt: action.retryAt,
        answeredAt: action.at,
      }));

    case 'retried':
      return update(state, action.id, (t) =>
        isActive(t)
          ? t
          : {
              ...t,
              askedAt: action.at,
              status: 'searching',
              text: '',
              citations: null,
              errorKind: null,
              retryAt: null,
              bytes: 0,
              answeredAt: null,
              feedback: emptyFeedback,
            },
      );

    case 'voted':
      return update(state, action.id, (t) => {
        // Tapping the pressed thumb again clears the vote.
        const vote = t.feedback.vote === action.vote ? null : action.vote;
        return { ...t, feedback: { ...emptyFeedback, vote } };
      });

    case 'feedback_reason_toggled':
      return update(state, action.id, (t) => {
        const has = t.feedback.reasons.includes(action.reason);
        const reasons = has
          ? t.feedback.reasons.filter((r) => r !== action.reason)
          : [...t.feedback.reasons, action.reason];
        return { ...t, feedback: { ...t.feedback, reasons } };
      });

    case 'feedback_note_changed':
      return update(state, action.id, (t) => ({
        ...t,
        feedback: { ...t.feedback, note: action.note },
      }));

    case 'feedback_sent':
      return update(state, action.id, (t) => ({ ...t, feedback: { ...t.feedback, sent: true } }));
  }
}
