import type { RetrievalHit } from '@coursemind/retrieval';

/**
 * B4 — Citation extraction + validation (FR-11, CLAUDE.md §2).
 *
 * The model is instructed to cite claims as `[doc:<document_id> p<page>]`. We parse
 * those markers out of the streamed answer and validate each against the set of
 * chunks actually retrieved for THIS answer. A citation that does not map to a
 * retrieved chunk is an invented citation and a failed answer — we DROP it rather
 * than emit it, so the client only ever sees verifiable sources.
 */

/** A validated, emit-safe citation tied to a real retrieved chunk. */
export interface ValidatedCitation {
  document_id: string;
  page: number;
  /** The chunk the citation resolves to (kept lean; used by the source viewer). */
  chunk_id: string;
}

/**
 * Matches `[doc:<id> p<n>]` with tolerant whitespace. `document_id` is a UUID; we
 * accept the general UUID shape and defer authenticity to validation against the
 * retrieved set (a well-formed but unknown id is still dropped).
 */
const CITATION_RE = /\[doc:\s*([0-9a-fA-F-]{8,})\s+p\s*(\d+)\s*\]/g;

/**
 * Extract raw `(document_id, page)` pairs from model output, in first-seen order,
 * de-duplicated. Pure string parsing — no trust decisions here.
 */
export function extractCitations(text: string): Array<{ document_id: string; page: number }> {
  const seen = new Set<string>();
  const out: Array<{ document_id: string; page: number }> = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const documentId = match[1];
    const pageRaw = match[2];
    if (documentId === undefined || pageRaw === undefined) continue;
    const page = Number.parseInt(pageRaw, 10);
    const key = `${documentId}#${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ document_id: documentId, page });
  }
  return out;
}

/**
 * Validate extracted citations against the retrieved chunk set. Only citations
 * whose `(document_id, page)` maps to a chunk that was actually retrieved for this
 * answer are returned; everything else (invented / hallucinated) is dropped
 * (FR-11). Order and de-duplication follow {@link extractCitations}.
 */
export function validateCitations(
  text: string,
  hits: readonly RetrievalHit[],
): ValidatedCitation[] {
  // Index the retrieved chunks by (document_id, page) → chunk_id. If several
  // chunks share a page, the first retrieved (highest-ranked) wins.
  const index = new Map<string, string>();
  for (const h of hits) {
    const key = `${h.document_id}#${h.page}`;
    if (!index.has(key)) index.set(key, h.chunk_id);
  }

  const validated: ValidatedCitation[] = [];
  for (const c of extractCitations(text)) {
    const key = `${c.document_id}#${c.page}`;
    const chunkId = index.get(key);
    if (chunkId === undefined) continue; // invented citation → drop (FR-11)
    validated.push({ document_id: c.document_id, page: c.page, chunk_id: chunkId });
  }
  return validated;
}
