# CourseMind — Product Requirements Document (PRD)

**Status:** Draft v1.0
**Author:** Reiker Nodd
**Last updated:** 2026-09-25
**Related docs:** [SRS](./SRS.md) · [SDD](./SDD.md) · [ADR-0001](./adr/0001-vector-store-pgvector-vs-dedicated.md)

---

## 1. Summary

CourseMind is an AI course tutor that answers student questions **using only a
lecturer's own materials** (slides, notes, PDFs, past papers). Every answer cites
the exact source page or slide, and the system **refuses** to answer anything not
covered by the uploaded materials. It continuously grades its own accuracy against
a lecturer-curated question set and blocks releases in CI when accuracy regresses.
The same course is also exposed as an **MCP server** so tools like Claude, ChatGPT,
or VS Code can query it directly.

One line: *a syllabus-bounded, self-testing, citeable AI tutor.*

## 2. Problem

Generic chatbots (ChatGPT, Gemini) confidently answer beyond the syllabus, invent
facts, and cite nothing. For a lecturer this is worse than useless — it teaches
students content that won't be examined and that the lecturer can't vouch for.
Students, meanwhile, want 24/7 help that is *actually aligned with what their
course covers and how their lecturer frames it*.

There is no cheap, trustworthy way for a lecturer to say: "here are my materials;
answer only from these, cite them, and tell me how often you're right."

## 3. Goals & non-goals

### Goals

- **G1** — Answer strictly from uploaded course materials, with a citation on every claim.
- **G2** — Refuse (explicitly) when the answer is not in the materials.
- **G3** — Measure answer accuracy against a lecturer question set, and gate CI on it.
- **G4** — Expose the course as an MCP server (`search_course`, `get_lecture_outline`, `quiz_me`).
- **G5** — Run affordably and legibly: known cost, speed, and token use per question.
- **G6** — Work on low-end Android phones and expensive/slow data (text-only low-data mode).

### Non-goals (v1)

- Not a general-purpose chatbot; no open-web knowledge.
- No auto-grading of student work / plagiarism detection.
- No native mobile app (responsive PWA-friendly web only in v1).
- No voice interface in v1 (WhatsApp/SMS is a stretch item).
- Not multi-institution SaaS billing; single-institution pilot scope.

## 4. Target users & personas

| Persona | Who | Primary need |
| --- | --- | --- |
| **Dr. Ada (lecturer)** | Course owner, uploads materials | Trust that answers match her syllabus; visibility into accuracy and cost |
| **Chidi (student)** | Undergrad on a cheap Android phone, metered data | Fast, correct, cited answers; works when data is slow |
| **Tunde (tutor/TA)** | Reviews flagged answers | Curate the test set; mark bad answers |
| **Agent/tool (MCP client)** | Claude / VS Code / ChatGPT | Programmatic course search and quizzing |

## 5. User stories (v1 MVP)

- As a **lecturer**, I upload a PDF/slide deck and the system ingests it into a searchable course.
- As a **student**, I ask a question and get a streamed answer with citations to the source page/slide.
- As a **student**, when I ask something off-syllabus, I get a clear "not in your course materials" refusal.
- As a **lecturer**, I see an accuracy score for my course against a 50–100 question test set.
- As a **lecturer**, I see cost per question and per 1,000 questions.
- As a **student on slow data**, I can switch to a text-only low-data mode.
- As an **MCP client**, I can call `search_course` and get cited snippets.

## 6. Scope

### 6.1 MVP (must-have)

1. Course upload (PDF, slides) → parsed, chunked, embedded.
2. Chat with **cited** answers; hard refusal for off-syllabus questions.
3. A 50–100 question **test set** per course with an accuracy dashboard.
4. Per-student **rate limits**.
5. **Text-only low-data mode.**
6. Basic auth (lecturer + student roles).
7. MCP server exposing `search_course` (minimum viable tool).

### 6.2 Stretch (post-MVP)

- Compare chunking strategies and embedding models (with hit-rate numbers).
- Semantic caching to cut cost.
- Prompt-injection test suite.
- `quiz_me` quizzes inside MCP apps.
- WhatsApp/SMS channel (Africa's Talking).
- Multi-course isolation / security tests.
- Thumbs-down answers auto-added to the test set.

## 7. Success metrics

| Metric | Target (pilot) |
| --- | --- |
| Answer accuracy on lecturer test set | ≥ 85% correct-with-citation |
| Off-syllabus refusal rate | ≥ 95% correctly refused |
| Hallucinated (uncited or wrong-cited) claims | < 2% of answers |
| p95 answer latency (first token) | < 3 s on 3G |
| Cost per 1,000 questions | tracked & reported (target < $2) |
| Pilot participation | 40–60 students asking real questions |
| Data per answer (low-data mode) | < 30 KB per text answer |

## 8. Key decisions (see ADRs)

- **Vector store:** PostgreSQL + pgvector vs. dedicated vector DB → [ADR-0001](./adr/0001-vector-store-pgvector-vs-dedicated.md).
- **Language split:** TypeScript for web/API/MCP; Python for ingestion + evaluation (best library ecosystem).

## 9. Constraints & assumptions

- **Nigerian context:** many students on Android over metered, unstable data (1GB ≈ ₦431 as of Jan 2025). Low-data mode is a requirement, not a nicety.
- **Privacy:** student questions are personal data under NDPA 2023 → see [SRS §Privacy](./SRS.md#7-privacy--data-protection-requirements). Minimal collection, consent, retention limits.
- **Budget:** solo developer, free/low-cost tiers where possible; single managed Postgres.
- **Consent:** student pilot requires institutional approval and informed consent.
- **Time:** ~10–12 hrs/week; MVP in 9–10 weeks per the portfolio plan.

## 10. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Model still hallucinates despite RAG | High | Strict grounding prompt + citation check + refusal + CI accuracy gate |
| Cost runs away with usage | Med | Rate limits, semantic caching (stretch), cost telemetry, cheaper model tiers |
| Poor retrieval on slide-heavy PDFs | High | Layout-aware parsing (PyMuPDF), chunking experiments, reranker |
| Privacy/consent gap | High (legal + trust) | NDPA-aligned data handling, consent flow, data minimisation |
| Prompt injection via uploaded docs | Med | Treat doc text as untrusted; injection test suite (stretch) |

## 11. Milestones (from portfolio plan)

1. **Docs (wk 1–2):** PRD, SRS (with privacy req), SDD, ADR-0001. ← *this deliverable*
2. **Ingestion (wk 3–4).**
3. **Retrieval + chat UI (wk 5–6).**
4. **Accuracy tests + CI gate (wk 7).**
5. **MCP server (wk 8).**
6. **Student pilot + observability (wk 9–10).**

## 12. Decisions & open questions

**Resolved** (see [ADR-0002](./adr/0002-model-and-retrieval-configuration.md)):

- **LLM provider** — pluggable via `.env`; Anthropic model is the default placeholder.
- **Embeddings** — Google `text-embedding-004` (768-dim), free hosted tier; configurable, with a local 768-dim fallback. (Cross-border → disclose per PR-7.)
- **Vector index** — HNSW (refines [ADR-0001](./adr/0001-vector-store-pgvector-vs-dedicated.md)).
- **Reranker** — none for MVP; add a local cross-encoder later only if needed.
- **Test set** — seeded from WAEC past questions (~10 yrs) + off-syllabus items for refusal; general-university scope unchanged.

**Still open:**

- LLM fallback ordering (decide with real cost/latency numbers).
- Whether pilot course materials fully cover the WAEC test topics (affects accuracy-half of the gate).
