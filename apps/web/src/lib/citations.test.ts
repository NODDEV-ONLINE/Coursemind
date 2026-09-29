import { describe, expect, it } from 'vitest';
import { parseAnswerText, resolveAnswer } from './citations';

const DOC_A = '3f2a9c1e-1111-4a2b-9c3d-000000000001';
const DOC_B = '7b1d2e3f-2222-4a2b-9c3d-000000000002';
const CHUNK_A3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHUNK_A7 = 'aaaaaaaa-0000-4000-8000-000000000007';
const CHUNK_B12 = 'bbbbbbbb-0000-4000-8000-000000000012';

describe('parseAnswerText', () => {
  it('turns complete markers into cite segments and never leaves raw markers', () => {
    const segs = parseAnswerText(`A stack is LIFO. [doc:${DOC_A} p3] A queue is FIFO.`);
    expect(segs).toEqual([
      { kind: 'text', text: 'A stack is LIFO. ' },
      { kind: 'cite', documentId: DOC_A, page: 3 },
      { kind: 'text', text: ' A queue is FIFO.' },
    ]);
  });

  it('accepts the tolerant whitespace the API regex allows and normalises case', () => {
    const segs = parseAnswerText(`x [doc: ${DOC_A.toUpperCase()}  p 12 ]`);
    expect(segs[1]).toEqual({ kind: 'cite', documentId: DOC_A, page: 12 });
  });

  it.each([
    '[',
    '[d',
    '[doc',
    '[doc:',
    '[doc: ',
    '[doc:3f2a',
    `[doc:${DOC_A}`,
    `[doc:${DOC_A} `,
    `[doc:${DOC_A} p`,
    `[doc:${DOC_A} p1`,
    `[doc:${DOC_A} p12 `,
  ])('hides a partial marker at the end of the buffer: %s', (partial) => {
    const segs = parseAnswerText(`Recursion uses a stack ${partial}`);
    expect(segs).toEqual([{ kind: 'text', text: 'Recursion uses a stack ' }]);
  });

  it('keeps ordinary brackets that cannot be a marker', () => {
    expect(parseAnswerText('see [1] and [note')).toEqual([
      { kind: 'text', text: 'see [1] and [note' },
    ]);
  });

  it('shows the marker as a chip once the rest of it streams in', () => {
    const first = parseAnswerText(`pop. [doc:${DOC_A} p`);
    const later = parseAnswerText(`pop. [doc:${DOC_A} p3] Then`);
    expect(first).toEqual([{ kind: 'text', text: 'pop. ' }]);
    expect(later.map((s) => s.kind)).toEqual(['text', 'cite', 'text']);
  });
});

describe('resolveAnswer', () => {
  const text =
    `A stack is last-in, first-out. [doc:${DOC_A} p3] A queue is first-in, first-out. ` +
    `[doc:${DOC_A} p7] Slides use plates. [doc:${DOC_B} p12] Made up. [doc:${DOC_B} p99]`;

  it('while streaming (no validated list yet) keeps every chip, unverified', () => {
    const r = resolveAnswer(text, null);
    const cites = r.segments.filter((s) => s.kind === 'cite');
    expect(cites).toHaveLength(4);
    expect(cites.every((c) => c.kind === 'cite' && c.chunkId === null)).toBe(true);
  });

  it('after the citations event keeps only validated (document, page) pairs', () => {
    const r = resolveAnswer(text, [
      { document_id: DOC_A, page: 3, chunk_id: CHUNK_A3 },
      { document_id: DOC_A, page: 7, chunk_id: CHUNK_A7 },
      { document_id: DOC_B, page: 12, chunk_id: CHUNK_B12 },
    ]);
    const cites = r.segments.flatMap((s) => (s.kind === 'cite' ? [s] : []));
    expect(cites.map((c) => [c.page, c.chunkId])).toEqual([
      [3, CHUNK_A3],
      [7, CHUNK_A7],
      [12, CHUNK_B12],
    ]); // p99 was never validated → dropped
    expect(r.plainText).not.toContain('[doc:');
  });

  it('drops every chip when the validated list is empty', () => {
    const r = resolveAnswer(text, []);
    expect(r.segments.every((s) => s.kind === 'text')).toBe(true);
    expect(r.groups).toEqual([]);
  });

  it('numbers documents by first appearance and groups pages for the Sources footer', () => {
    const r = resolveAnswer(text, [
      { document_id: DOC_A, page: 7, chunk_id: CHUNK_A7 },
      { document_id: DOC_A, page: 3, chunk_id: CHUNK_A3 },
      { document_id: DOC_B, page: 12, chunk_id: CHUNK_B12 },
    ]);
    expect(r.groups.map((g) => [g.sourceNumber, g.refs.map((ref) => ref.page)])).toEqual([
      [1, [3, 7]],
      [2, [12]],
    ]);
    expect(r.refs.map((ref) => ref.key)).toEqual([`${DOC_A}#3`, `${DOC_A}#7`, `${DOC_B}#12`]);
  });

  it('records the sentence each chip was cited for', () => {
    const r = resolveAnswer(text, [{ document_id: DOC_A, page: 7, chunk_id: CHUNK_A7 }]);
    expect(r.refs[0]?.claim).toBe('A queue is first-in, first-out.');
  });

  it('matches validated ids case-insensitively', () => {
    const r = resolveAnswer(`Claim. [doc:${DOC_A.toUpperCase()} p3]`, [
      { document_id: DOC_A, page: 3, chunk_id: CHUNK_A3 },
    ]);
    expect(r.refs).toHaveLength(1);
  });
});
