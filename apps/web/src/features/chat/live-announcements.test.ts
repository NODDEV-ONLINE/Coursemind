import { describe, expect, it } from 'vitest';
import type { Turn } from '@/lib/chat-state';
import { liveAnnouncements } from './live-announcements';

const DOC = '7b1d2e3f-2222-4a2b-9c3d-000000000002';

function turn(partial: Partial<Turn>): Turn {
  return {
    id: 't1',
    question: 'q',
    askedAt: 0,
    status: 'searching',
    text: '',
    citations: null,
    errorKind: null,
    retryAt: null,
    bytes: 0,
    answeredAt: null,
    feedback: { vote: null, reasons: [], note: '', sent: false },
    ...partial,
  };
}

describe('liveAnnouncements (NFR-9)', () => {
  it('announces finished sentences only, without citation markers, and only appends', () => {
    const streaming = liveAnnouncements(
      turn({ status: 'streaming', text: `A stack is LIFO. [doc:${DOC} p3] A queue is` }),
    );
    expect(streaming).toEqual(['Searching your course materials.', 'A stack is LIFO.']);

    const done = liveAnnouncements(
      turn({
        status: 'done',
        text: `A stack is LIFO. [doc:${DOC} p3] A queue is FIFO.`,
        citations: [{ document_id: DOC, page: 3, chunk_id: 'c3' }],
      }),
    );
    expect(done.slice(0, streaming.length)).toEqual(streaming);
    expect(done.slice(streaming.length)).toEqual([
      'A queue is FIFO.',
      'Answer complete. 1 source document.',
    ]);
  });

  it('labels refusals explicitly', () => {
    expect(
      liveAnnouncements(
        turn({
          status: 'refused',
          text: "That isn't covered in your course materials.",
          citations: [],
        }),
      ),
    ).toEqual([
      'Searching your course materials.',
      'Not in your course materials.',
      "That isn't covered in your course materials.",
    ]);
  });
});
