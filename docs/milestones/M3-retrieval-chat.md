# Milestone 3 — Retrieval + Chat UI (Plan)

**Status:** Planned (not started)
**Timeframe:** weeks 5–6 (plan)
**Goal:** A student asks a question and gets a **streamed, cited answer generated
only from the course materials** — or an explicit refusal when the answer isn't in
them. The product's core promise, made real.
**Satisfies:** FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16 (and
NFR-1, NFR-2, NFR-6, SR-2, SR-3).
**Depends on:** M2 (stored chunks + 768-dim embeddings in pgvector; `embedding_meta`
guard). Uses ADR-0001 (pgvector), ADR-0002 (LLM `.env`-pluggable/Anthropic default;
no reranker for MVP; HNSW).
**Rules that apply:** project-wide [`CLAUDE.md`](../../CLAUDE.md) + M3-specific rules below.

---

## Definition of done

- [ ] A student can ask a free-text question scoped to one course and get an answer.
- [ ] The answer is generated **only** from retrieved chunks (grounded), and **every
      claim carries a citation** to `document + page/slide` (FR-10, FR-11).
- [ ] Off-syllabus questions get an explicit **refusal** ("not in your course
      materials"), not a hallucinated answer (FR-12).
- [ ] Cited chunk ids are **validated to exist** before the answer is returned — no
      invented citations.
- [ ] The answer **streams** token-by-token to the client (FR-13).
- [ ] A **low-data text mode** returns a compact answer < 30 KB (FR-14, NFR-2).
- [ ] The chat UI renders the stream + inline citations and a source viewer (FR-15).
- [ ] Question + answer + citations + cost/tokens/latency are persisted (fills the M2
      stub tables) and each answer emits a trace (NFR-6).
- [ ] p95 time-to-first-token < 3 s on a simulated 3G profile (NFR-1) — measured.
- [ ] LLM provider is swappable via `.env` (Anthropic default), with fallback wiring.
- [ ] Tests: retrieval, grounding/refusal, citation-validation, streaming, web smoke.
- [ ] CI green (lint + type-check + TS & Python tests).

---

## Open decisions to resolve at kickoff (mini-ADRs)

1. **Query-embedding location (→ ADR-0004).** Retrieval must embed the *query* with
   the **same** model as ingestion (`text-embedding-004`, 768-dim) or vectors won't
   match. Options:
   - **(a) Reuse the Python service** — add a small `POST /embed` to `ingest-eval` and
     have `packages/retrieval` call it. *Pro:* one embedding implementation, consistent
     with `embedding_meta`, no drift, deprecation handled in one place. *Con:* adds a
     network hop to query latency (NFR-1 budget).
   - **(b) Embed in TS** — call Google's JS SDK from `packages/retrieval`. *Pro:* lower
     latency. *Con:* a second embedding implementation to keep in lockstep (model, dim,
     normalization) — drift risk.
   - **Recommendation:** (a) for correctness/DRY in the pilot; revisit for latency.
     Record as ADR-0004 before building retrieval.
2. **Refusal threshold.** The cosine-distance cutoff below which we refuse. Start with a
   conservative default, tune against the WAEC/off-syllabus test set in M4. Make it
   configurable per course.
3. **Reranker:** none (ADR-0002) — vector-search-only for MVP.
4. **LLM streaming via the provider abstraction** — confirm the interface streams
   uniformly across providers (Anthropic default) behind one SSE contract.

---

## Task list

### A. Retrieval — `packages/retrieval` (shared by API + future MCP) *(core)* — ✅ done
- [x] A1 — [ADR-0004](../adr/0004-query-embedding-location.md) + query-embedding client (Python `/embed`, dim guard).
- [x] A2 — Course-scoped vector search (`WHERE c.course_id=$2`, `<=>` distance, top-K) joining `chunks` for text/page/doc (SR-2).
- [x] A3 — Score threshold + insufficient-context refusal signal (FR-12; default 0.35, configurable).
- [x] A4 — Typed `RetrievalHit`/`RetrievalResult` + `retrieveChunks`; 12 unit tests (E1).

### B. Grounded answering — `apps/api` (NestJS) *(core)*
- [ ] B1 — LLM provider abstraction: `.env`-selected (Anthropic default), streaming,
      optional fallback (ADR-0002 §1, NFR-4).
- [ ] B2 — Grounded prompt builder: retrieved chunks as **untrusted** context, instruct
      cite-every-claim by `[doc:page]`, emit refusal token when context is insufficient (SR-3).
- [ ] B3 — `POST /courses/:id/ask` → **SSE stream** of answer + citations (FR-8, FR-13).
- [ ] B4 — Citation extraction + **validation** (cited chunk ids must exist; invalid →
      treated as failure) (FR-11).
- [ ] B5 — Refusal path returns the explicit "not in your course materials" message (FR-12).
- [ ] B6 — Low-data mode: compact text response < 30 KB, no heavy assets (FR-14, NFR-2).
- [ ] B7 — Persist `questions`, `answers`, `answer_citations` + `latency_ms`, tokens,
      `cost_usd`, `model` (fills M2 stub tables); consent recorded before storing (PR-2).
- [ ] B8 — Per-student rate limit on the ask endpoint (FR-30).

### C. Chat UI — `apps/web` (Next.js + React + Tailwind) *(surface)*
- [ ] C1 — Next.js (App Router) scaffold + Tailwind wired to brand tokens (`brand/BRAND.md`).
- [ ] C2 — Student chat page: ask box + streamed answer render (consumes the SSE) (FR-13).
- [ ] C3 — Inline citations + source viewer (open the cited page/slide passage) (FR-11, FR-15).
- [ ] C4 — Refusal state styled distinctly (uses `--refused`; icon + label, not colour alone).
- [ ] C5 — Low-data mode toggle (compact, asset-light) (FR-14) + responsive on low-end Android.
- [ ] C6 — Answer rating (thumbs up/down); down-votes logged (FR-16).
- [ ] C7 — Minimal consent capture on first use (PR-2).

### D. Observability & limits *(evidence)*
- [ ] D1 — Per-answer trace: retrieval time, LLM time, tokens, cost (OpenTelemetry) (NFR-6).
- [ ] D2 — Cost per question / per 1,000 queryable (NFR-7) — dashboard is M6, capture here.
- [ ] D3 — Measure p95 time-to-first-token on a throttled 3G profile (NFR-1).

### E. Tests & CI *(gate)*
- [x] E1 — Retrieval unit tests (course scoping, top-K, threshold, dim guard) — 12 tests.
- [ ] E2 — Grounding + **refusal** tests: off-syllabus question is refused; on-syllabus
      answer carries valid citations.
- [ ] E3 — Citation-validation test: an answer citing a non-existent chunk fails.
- [ ] E4 — Streaming test (SSE contract).
- [ ] E5 — Web smoke test (chat renders a streamed answer + citation).
- [ ] E6 — CI runs all of the above (builds on M2's E5 pipeline).

---

## Sequencing

```
A (retrieval) ──► B (grounded answer + stream) ──► C (chat UI) ──► D (observability) 
     │                                                              
     └─ ADR-0004 (query embedding) first                            E (tests) runs alongside B/C
```

Retrieval (A) is the foundation — build and unit-test it before the answer loop. B is
the correctness core (grounding, citations, refusal). C consumes B's SSE. D and E run
alongside, not bolted on at the end.

## Rules (M3-specific, on top of `CLAUDE.md`)

- **Grounded or refuse — never both, never neither.** Below-threshold retrieval →
  refusal; never let the LLM answer from its own knowledge (FR-10, FR-12).
- **No invented citations.** Every cited chunk id is validated against the DB before the
  answer is returned (FR-11).
- **Document text is untrusted** in the prompt — structurally separated, never treated
  as instructions (SR-3).
- **Course isolation** applies to every retrieval query (`WHERE course_id = $1`) (SR-2).
- **Low-data budget is a requirement:** text answers < 30 KB; nothing heavy in the
  critical path (FR-14, NFR-2).
- **Every answer is traced** (latency, tokens, cost) — no silent LLM calls (NFR-6).
- **Retrieval has one home** (`packages/retrieval`) shared by API and MCP — no duplication.

## Out of scope (deferred)
- MCP server exposing the course → **Milestone 5**.
- Accuracy test set + CI accuracy gate → **Milestone 4**.
- Semantic caching, prompt-injection test suite, reranker → stretch / later (ADR-0002).
- Full lecturer analytics dashboard + student pilot → **Milestone 6**.
- WhatsApp/SMS channel → stretch.

## Risks
| Risk | Mitigation |
| --- | --- |
| Query/ingest embedding drift | Single embedding impl via ADR-0004 (prefer Python `/embed`) |
| Latency blows the 3 s TTFT budget | Stream early; vector-only (no reranker); measure on 3G (D3) |
| Model ignores grounding / invents citations | Strict prompt + citation validation + refusal; hardened in M4 gate |
| Streaming complexity across providers | One SSE contract behind the provider abstraction (B1) |
| Cost creep | Per-answer cost telemetry (D1/D2); rate limits (B8) |

## Next milestone
**M4 — Accuracy tests + CI gate** (week 7): the 50–100 question test set (WAEC-seeded +
off-syllabus refusals), scoring correctness + citation presence, and a CI job that
**fails the build** when accuracy regresses (FR-19–FR-23).
