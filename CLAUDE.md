# CourseMind — Project Rules & Conventions

These are the durable engineering rules for CourseMind. They apply to every
milestone and every contributor (human or AI). Milestone plans in
[`docs/milestones/`](./docs/milestones/) add task-specific rules on top of these.

> Source of truth for *what* to build: [PRD](./docs/PRD.md) · [SRS](./docs/SRS.md).
> Source of truth for *how*: [SDD](./docs/SDD.md) · [ADR-0001](./docs/adr/0001-vector-store-pgvector-vs-dedicated.md) · [ADR-0002](./docs/adr/0002-model-and-retrieval-configuration.md).

---

## 1. Architecture rules

- **Language split is fixed:** TypeScript for `apps/web`, `apps/api`, `packages/*`
  (web, API, MCP, shared retrieval). Python only in `services/ingest-eval`
  (parsing, embeddings, evaluation). Don't add a second language to a package.
- **One datastore:** PostgreSQL + pgvector. No separate vector DB (ADR-0001). If you
  think you need one, meet the exit criteria in ADR-0001 and write an ADR first.
- **Retrieval has one home:** all vector search + course-scoping lives in
  `packages/retrieval` and is shared by the API and the MCP server. Never duplicate
  retrieval logic.
- **Embedding dimension is `768` and pinned** (ADR-0002). Changing the embedding
  model = a migration + full re-embed, guarded by `embedding_meta`. Never mix models
  in one corpus.

## 2. Grounding rules (the product's core promise)

- **No answer without a supporting chunk.** If retrieval score is below threshold,
  return the refusal — never let the LLM answer from its own knowledge (FR-10, FR-12).
- **Every claim is cited** to `document + page/slide`; validate that cited chunk ids
  actually exist before returning. Invented citations = a failed answer (FR-11).
- **Uploaded document text is untrusted.** Treat it as data, never instructions;
  keep it structurally separated in the prompt (SR-3).

## 3. Privacy & security rules (non-negotiable)

- **Pseudonymous student ids** — never require a real name to ask a question (PR-1).
- **Secrets never in code or git.** LLM/DB/embedding keys come from env only (SR-4).
  `.env` is git-ignored; `.env.example` holds placeholders only.
- **Retention + erasure must stay possible.** Any new table holding student data must
  be reachable by the retention job and the erasure path (PR-4, PR-5).
- **Cross-border data is disclosed.** Embeddings currently go to Google
  (ADR-0002) — anything that adds a new third-party data flow updates the privacy
  notice (PR-7) and this file.
- **Course isolation always applies** — every query is scoped to permitted courses
  (SR-2). No cross-course reads, ever.

## 4. Code & repo rules

- **Monorepo:** pnpm workspaces + Turborepo. Shared code goes in `packages/`, never
  copy-pasted between apps.
- **TypeScript strict mode on.** No `any` without a written reason. Validate all
  external input with Zod at the boundary.
- **Config via env, typed + validated** at startup; fail fast on missing/invalid env.
- **Small, reviewable commits** with a type prefix (`docs:`, `feat:`, `fix:`,
  `chore:`, `test:`, `brand:`). End messages with the Co-Authored-By trailer.
- **Every requirement is traceable.** Reference the FR/NFR/PR/SR id in code comments,
  PRs, or the milestone task when it implements one.

## 5. Testing & CI rules

- **Nothing merges red.** Lint + type-check + unit tests pass on every PR (NFR-11).
- **The accuracy gate is sacred** (from Milestone 4 on): if evaluation accuracy drops
  below threshold, CI fails and the change does not merge (FR-22). Don't lower the
  threshold to make CI pass — fix the regression or justify it in an ADR.
- **Test behaviour, not implementation.** Ingestion, retrieval, and evaluation logic
  must have tests. UI gets at least smoke coverage.

## 6. Observability & cost rules

- **Every answered question emits a trace:** latency, tokens, cost, retrieval hits
  (NFR-6). No silent LLM calls.
- **Cost is a first-class metric**, queryable per question and per 1,000 (NFR-7).
- **Respect free-tier limits.** External API calls (embeddings, LLM) use retry +
  backoff and handle quota errors gracefully (NFR-4, NFR-5).

## 7. Performance rules

- **Low-data mode is a requirement, not a toggle we forget:** text answers < 30 KB;
  don't put heavy assets in the critical path (FR-14, NFR-2).
- **p95 time-to-first-token < 3 s on 3G** is the budget any retrieval/answer change is
  measured against (NFR-1).

## 8. Documentation rules

- **Decisions get ADRs.** Any choice that's expensive to reverse (datastore, provider,
  protocol, schema shape) is recorded as an ADR before or with the code.
- **Docs stay in sync.** If code changes a documented decision or schema, update the
  PRD/SRS/SDD/ADR in the same PR.
- **Milestone plans live in `docs/milestones/`** with a task checklist kept current.
