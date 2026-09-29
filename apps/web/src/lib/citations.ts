import type { Citation } from './ask-events';

/**
 * Inline citation markers → renderable segments (FR-11, FR-15).
 *
 * The model cites inline as `[doc:<uuid> p<n>]`. Raw markers must never reach the
 * screen: complete markers become citation chips, and a marker that is still
 * arriving at the end of the stream buffer (e.g. `[doc:3f2a`) is held back until it
 * completes. Once the `citations` event arrives it is the VALIDATED list: chips whose
 * (document_id, page) is not in it are dropped (invented citation, FR-11).
 */

/** Mirrors `CITATION_RE` in apps/api/src/ask/citations.ts (tolerant whitespace). */
const MARKER_RE = /\[doc:\s*([0-9a-fA-F-]{8,})\s+p\s*(\d+)\s*\]/g;

/** Any prefix of a marker, anchored at the end of the buffer. */
const PARTIAL_MARKER_RE =
  /\[(?:d(?:o(?:c(?::\s*(?:[0-9a-fA-F-]+(?:\s+(?:p\s*(?:\d+\s*)?)?)?)?)?)?)?)?$/;

export type ParsedSegment =
  { kind: 'text'; text: string } | { kind: 'cite'; documentId: string; page: number };

function pushText(out: ParsedSegment[], text: string): void {
  if (text === '') return;
  const prev = out[out.length - 1];
  if (prev?.kind === 'text') {
    prev.text += text;
  } else {
    out.push({ kind: 'text', text });
  }
}

/** Split raw answer text into text + citation segments, hiding a partial marker. */
export function parseAnswerText(raw: string): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  let last = 0;
  for (const match of raw.matchAll(MARKER_RE)) {
    const [whole, documentId, pageRaw] = match;
    if (documentId === undefined || pageRaw === undefined) continue;
    pushText(out, raw.slice(last, match.index));
    out.push({ kind: 'cite', documentId: documentId.toLowerCase(), page: Number(pageRaw) });
    last = match.index + whole.length;
  }
  const tail = raw.slice(last);
  const partial = PARTIAL_MARKER_RE.exec(tail);
  pushText(out, partial ? tail.slice(0, partial.index) : tail);
  return out;
}

export function citationKey(documentId: string, page: number): string {
  return `${documentId.toLowerCase()}#${page}`;
}

/** A chip ready to render. `chunkId` is null until the validated list arrives. */
export interface CiteSegment {
  kind: 'cite';
  key: string;
  documentId: string;
  page: number;
  chunkId: string | null;
  /** 1-based number of the cited document within this answer (first-seen order). */
  sourceNumber: number;
  /** The sentence the chip is attached to ("Cited for" in the source viewer). */
  claim: string;
}

export type RenderSegment = { kind: 'text'; text: string } | CiteSegment;

export interface SourceRef {
  key: string;
  documentId: string;
  page: number;
  chunkId: string | null;
  sourceNumber: number;
  claim: string;
}

export interface SourceGroup {
  documentId: string;
  sourceNumber: number;
  refs: SourceRef[];
}

export interface ResolvedAnswer {
  segments: RenderSegment[];
  /** Unique (document, page) citations in reading order — drawer prev/next. */
  refs: SourceRef[];
  /** Cited documents with their pages — the Sources footer. */
  groups: SourceGroup[];
  /** Answer text without any markers (copy, screen-reader announcements). */
  plainText: string;
}

function lastSentence(text: string): string {
  const parts = text.trimEnd().match(/[^.!?\n]+[.!?]*/g);
  return parts?.[parts.length - 1]?.trim() ?? '';
}

/**
 * Resolve parsed segments against the validated citation list.
 *
 * @param validated - `null` while streaming (chips are provisional, not openable);
 *   an array once the `citations` event arrived (only listed pairs survive).
 */
export function resolveAnswer(raw: string, validated: readonly Citation[] | null): ResolvedAnswer {
  const chunkByKey = new Map<string, string>();
  if (validated !== null) {
    for (const c of validated) {
      const key = citationKey(c.document_id, c.page);
      if (!chunkByKey.has(key)) chunkByKey.set(key, c.chunk_id);
    }
  }

  const segments: RenderSegment[] = [];
  const numbers = new Map<string, number>();
  const refs: SourceRef[] = [];
  const seenRefs = new Set<string>();
  let textSoFar = '';

  for (const seg of parseAnswerText(raw)) {
    if (seg.kind === 'text') {
      const prev = segments[segments.length - 1];
      if (prev?.kind === 'text') prev.text += seg.text;
      else segments.push({ kind: 'text', text: seg.text });
      textSoFar += seg.text;
      continue;
    }

    const key = citationKey(seg.documentId, seg.page);
    let chunkId: string | null = null;
    if (validated !== null) {
      const found = chunkByKey.get(key);
      if (found === undefined) continue; // not validated → drop the chip (FR-11)
      chunkId = found;
    }

    let sourceNumber = numbers.get(seg.documentId);
    if (sourceNumber === undefined) {
      sourceNumber = numbers.size + 1;
      numbers.set(seg.documentId, sourceNumber);
    }
    const cite: CiteSegment = {
      kind: 'cite',
      key,
      documentId: seg.documentId,
      page: seg.page,
      chunkId,
      sourceNumber,
      claim: lastSentence(textSoFar),
    };
    segments.push(cite);
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      refs.push({
        key,
        documentId: cite.documentId,
        page: cite.page,
        chunkId,
        sourceNumber,
        claim: cite.claim,
      });
    }
  }

  const groups: SourceGroup[] = [];
  for (const ref of refs) {
    let group = groups.find((g) => g.documentId === ref.documentId);
    if (!group) {
      group = { documentId: ref.documentId, sourceNumber: ref.sourceNumber, refs: [] };
      groups.push(group);
    }
    group.refs.push(ref);
  }
  for (const g of groups) g.refs.sort((a, b) => a.page - b.page);
  groups.sort((a, b) => a.sourceNumber - b.sourceNumber);

  return { segments, refs, groups, plainText: textSoFar };
}
