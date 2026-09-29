# Milestone 3 — Retrieval + Chat UI (Plan)

**Status:** In progress (A done; B slice 1 done; C mobile MVP done)
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

### B. Grounded answering — `apps/api` (NestJS) *(core)* — 🟡 slice 1 (B1–B6) done; slice 2 (B7–B8) pending
- [x] B1 — LLM provider abstraction: `.env`-selected (Anthropic default), streaming,
      optional fallback (ADR-0002 §1, NFR-4).
- [x] B2 — Grounded prompt builder: retrieved chunks as **untrusted** context, instruct
      cite-every-claim by `[doc:page]`, emit refusal token when context is insufficient (SR-3).
- [x] B3 — `POST /courses/:id/ask` → **SSE stream** of answer + citations (FR-8, FR-13).
- [x] B4 — Citation extraction + **validation** (cited chunk ids must exist; invalid →
      treated as failure) (FR-11).
- [x] B5 — Refusal path returns the explicit "not in your course materials" message (FR-12).
- [x] B6 — Low-data mode: compact text response < 30 KB, no heavy assets (FR-14, NFR-2).
- [ ] B7 — Persist `questions`, `answers`, `answer_citations` + `latency_ms`, tokens,
      `cost_usd`, `model` (fills M2 stub tables); consent recorded before storing (PR-2).
- [ ] B8 — Per-student rate limit on the ask endpoint (FR-30).

### C. Chat UI — `apps/web` (Next.js + React + Tailwind) *(surface)* — 🟡 mobile MVP done; C6 logging pending
Mobile student chat per [`docs/design/web-app`](../design/web-app/README.md) (desktop
three-pane + lecturer dashboard out of scope). Course = link `/c/<courseId>`. The
browser only talks to Next route handlers (`/api/courses/:id/ask`, `…/chunks/:chunkId`),
which proxy to `API_URL` and inject `X-User-Id` from server-only `DEMO_USER_ID`.
- [x] C1 — Next.js 16 (App Router, TS strict) + Tailwind 4; `BRAND.md` tokens as CSS vars +
      the only Tailwind palette; Space Grotesk 600 via `next/font` (skipped in low-data mode).
- [x] C2 — Chat page: ask box (Enter/Shift+Enter, Send), instant echo, "Searching…"
      skeleton, streamed render with caret (rAF-batched), Stop (partial kept), auto-scroll
      + "Scroll to latest", suggested questions (FR-13).
- [x] C3 — Inline `[doc:… p…]` markers → citation-chip buttons (partial markers hidden;
      unvalidated chips dropped on `citations`), Sources footer, bottom-drawer source viewer
      that fetches the passage lazily on open; 404 → "being updated" (FR-11, FR-15).
      Backed by `GET /courses/:id/chunks/:chunkId` → `{ chunk_id, document_id, filename, page, text }`
      (course-scoped, SR-2; mocked in web tests).
- [x] C4 — Amber refusal card (book icon + "Not in your course materials"), distinct from
      the red error card (Retry); connection-lost + rate-limit (FR-30-ready) states.
- [x] C5 — Low-data toggle (localStorage, default on) → `?lowData=1`; session data meter
      (answers / sources / app). Mobile-first, 320 px, 44 px targets. *Not yet profiled
      on a real low-end Android device (see follow-ups / D3).*
- [ ] C6 — Thumbs up/down + optional "What was wrong?" note **UI done, client-side only**;
      down-votes are **not logged** until a feedback endpoint exists (FR-16).
- [x] C7 — First-visit consent screen (pseudonym, 90-day retention, Anthropic + Google,
      privacy summary) gates the first question; version + timestamp stored on-device.
      Server-side recording lands with B7 (PR-2).

**Task C follow-ups**
- [ ] Real student identity/access: the API authorises `X-User-Id` as the course
      **owner**, so the web proxy sends one `DEMO_USER_ID` for every student. Needs
      student auth + enrolment-based access (SR-2, PR-1) before the pilot.
- [ ] Feedback endpoint (FR-16): log votes + notes server-side; wire `useChat` feedback
      callbacks (TODO in `apps/web/src/hooks/useChat.ts`).
- [ ] Server-side consent recording with B7 (PR-2); refuse to persist questions without it
      (TODO in `apps/web/src/lib/consent.ts`).
- [ ] Full privacy notice (PR-7) to replace the `/privacy` summary page.
- [ ] Contract gaps: `citations` event carries no filename/title (chips read "Doc 1 · p.3"
      instead of "L6 · p.3"); no course-metadata endpoint (name/code, doc count, topics
      for the empty state + refusal "closest topics"); refusal "Tell my lecturer" needs a
      flag endpoint.
- [ ] Move the SSE event contract into a shared `packages/*` module (web mirrors it with
      Zod today; marker regex mirrors `CITATION_RE`).
- [ ] Brand tokens: canvas-only colours (`--surface-raised`, `--refused-surface`,
      `--error-text`, …), radii and type sizes are named in `globals.css` but missing from
      `BRAND.md`; add them + run the WCAG contrast pass (BRAND.md TODO).
- [ ] Add `apps/web` to `infra/docker-compose.yml`; profile first-load JS on 3G (Zod is
      ~15 KB gz of the client bundle).

### D. Observability & limits *(evidence)*
- [ ] D1 — Per-answer trace: retrieval time, LLM time, tokens, cost (OpenTelemetry) (NFR-6).
- [ ] D2 — Cost per question / per 1,000 queryable (NFR-7) — dashboard is M6, capture here.
- [ ] D3 — Measure p95 time-to-first-token on a throttled 3G profile (NFR-1).

### E. Tests & CI *(gate)*
- [x] E1 — Retrieval unit tests (course scoping, top-K, threshold, dim guard) — 12 tests.
- [x] E2 — Grounding + **refusal** tests: off-syllabus question is refused; on-syllabus
      answer carries valid citations.
- [x] E3 — Citation-validation test: an answer citing a non-existent chunk fails.
- [x] E4 — Streaming test (SSE contract).
- [x] E5 — Web smoke test (chat renders a streamed answer + citation): jsdom smoke suite
      (cited answer, source drawer + 404, refusal, error, connection lost, stop, consent,
      low-data) plus SSE/citation/reducer/proxy unit tests — 105 web tests.
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
