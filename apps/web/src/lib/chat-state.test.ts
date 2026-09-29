import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState, type ChatAction, type ChatState } from './chat-state';

const ID = 't1';
const CITATION = { document_id: 'doc-1', page: 3, chunk_id: 'chunk-1' };

function run(actions: ChatAction[], from: ChatState = initialChatState): ChatState {
  return actions.reduce(chatReducer, from);
}

const asked: ChatAction = { type: 'asked', id: ID, question: 'What is a stack?', at: 1 };
const turn = (s: ChatState) => s.turns[0]!;

describe('chatReducer', () => {
  it('echoes the question immediately in the searching state', () => {
    const s = run([asked]);
    expect(turn(s)).toMatchObject({ question: 'What is a stack?', status: 'searching', text: '' });
  });

  it('token → citations → done(stop): streams then finishes with validated citations', () => {
    let s = run([asked, { type: 'token', id: ID, delta: 'A stack ' }]);
    expect(turn(s).status).toBe('streaming');
    s = run(
      [
        { type: 'token', id: ID, delta: 'is LIFO.' },
        { type: 'citations', id: ID, citations: [CITATION] },
      ],
      s,
    );
    expect(turn(s)).toMatchObject({ status: 'streaming', text: 'A stack is LIFO.' });
    s = run([{ type: 'done', id: ID, finishReason: 'stop', at: 5 }], s);
    expect(turn(s)).toMatchObject({ status: 'done', citations: [CITATION], answeredAt: 5 });
  });

  it('done(refusal) → refused, with the refusal sentence as text and no citations', () => {
    const s = run([
      asked,
      { type: 'token', id: ID, delta: "That isn't covered in your course materials." },
      { type: 'citations', id: ID, citations: [] },
      { type: 'done', id: ID, finishReason: 'refusal', at: 2 },
    ]);
    expect(turn(s)).toMatchObject({ status: 'refused', citations: [], errorKind: null });
  });

  it('done(error) → error (kind "stream"), partial text kept', () => {
    const s = run([
      asked,
      { type: 'token', id: ID, delta: 'Partial' },
      { type: 'citations', id: ID, citations: [] },
      { type: 'done', id: ID, finishReason: 'error', at: 2 },
    ]);
    expect(turn(s)).toMatchObject({ status: 'error', errorKind: 'stream', text: 'Partial' });
  });

  it('abort keeps the partial answer and ignores late stream events', () => {
    let s = run([asked, { type: 'token', id: ID, delta: 'Half an ans' }]);
    s = run([{ type: 'stopped', id: ID, at: 3 }], s);
    expect(turn(s)).toMatchObject({ status: 'stopped', text: 'Half an ans' });
    const after = run(
      [
        { type: 'token', id: ID, delta: 'wer' },
        { type: 'citations', id: ID, citations: [CITATION] },
        { type: 'done', id: ID, finishReason: 'stop', at: 4 },
      ],
      s,
    );
    expect(after).toBe(s); // unchanged, same reference
  });

  it('connection lost keeps what arrived', () => {
    const s = run([
      asked,
      { type: 'token', id: ID, delta: 'A queue is first-in' },
      { type: 'connection_lost', id: ID, at: 3 },
    ]);
    expect(turn(s)).toMatchObject({ status: 'connection_lost', text: 'A queue is first-in' });
  });

  it('rate limit records when asking is allowed again', () => {
    const s = run([asked, { type: 'rate_limited', id: ID, retryAt: 100_000, at: 1 }]);
    expect(turn(s)).toMatchObject({ status: 'rate_limited', retryAt: 100_000 });
  });

  it('retry resets a finished turn to searching; ignored while active', () => {
    const active = run([asked]);
    expect(run([{ type: 'retried', id: ID, at: 9 }], active)).toBe(active);
    const failed = run([{ type: 'failed', id: ID, errorKind: 'server', at: 2 }], active);
    const retried = run([{ type: 'retried', id: ID, at: 9 }], failed);
    expect(turn(retried)).toMatchObject({
      status: 'searching',
      text: '',
      citations: null,
      errorKind: null,
      askedAt: 9,
    });
  });

  it('only touches the targeted turn (others keep identity for memoised rendering)', () => {
    let s = run([asked, { type: 'done', id: ID, finishReason: 'stop', at: 2 }]);
    s = run([{ type: 'asked', id: 't2', question: 'Next?', at: 3 }], s);
    const first = s.turns[0];
    s = run([{ type: 'token', id: 't2', delta: 'x' }], s);
    expect(s.turns[0]).toBe(first);
  });

  it('feedback: vote toggles, reasons toggle, note + sent recorded', () => {
    let s = run([asked, { type: 'done', id: ID, finishReason: 'stop', at: 2 }]);
    s = run([{ type: 'voted', id: ID, vote: 'down' }], s);
    s = run([{ type: 'feedback_reason_toggled', id: ID, reason: 'Wrong source' }], s);
    s = run([{ type: 'feedback_note_changed', id: ID, note: 'page 3 is about queues' }], s);
    s = run([{ type: 'feedback_sent', id: ID }], s);
    expect(turn(s).feedback).toEqual({
      vote: 'down',
      reasons: ['Wrong source'],
      note: 'page 3 is about queues',
      sent: true,
    });
    s = run([{ type: 'voted', id: ID, vote: 'down' }], s);
    expect(turn(s).feedback.vote).toBeNull();
  });
});
