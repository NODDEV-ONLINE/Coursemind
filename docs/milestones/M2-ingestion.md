# Milestone 2 — Ingestion (Plan)

**Status:** Planned (not started)
**Timeframe:** weeks 3–4 (plan)
**Goal:** A lecturer uploads a PDF/slide deck → it is parsed, chunked, embedded, and
stored, with visible status. First code milestone.
**Satisfies:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 (and PR-8, SR-3 groundwork).
**Depends on:** Milestone 1 docs + ADR-0001/0002 (all decisions resolved).
**Rules that apply:** project-wide [`CLAUDE.md`](../../CLAUDE.md) + the M2-specific
rules in §Rules below.

---

## Definition of done

- [ ] A PDF and a PPTX can be uploaded and reach `ready` status.
- [ ] Chunks are stored with correct `document`, `page/slide`, and `char range`.
- [ ] Each chunk has a `768`-dim embedding; `embedding_meta` records model + dim.
- [ ] Re-uploading the same file does **not** duplicate chunks (content-hash idempotent).
- [ ] Ingestion status transitions `queued → processing → ready | failed` are visible.
- [ ] A failed ingest reports a reason and is retryable.
- [ ] `docker compose up` brings up Postgres+pgvector and the services; documented in README.
- [ ] Tests: ingest a sample PDF, assert chunks + embeddings land and dims match.
- [ ] CI green (lint + type-check + tests).

---

## Task list

### A. Monorepo scaffold *(foundation)* — ✅ done
- [x] A1 — Root `package.json`, pnpm workspace, Turborepo `turbo.json`, `.gitignore`.
- [x] A2 — Shared TS config (`tsconfig.base.json`), ESLint (flat) + Prettier, strict mode on.
- [x] A3 — Directory skeleton per SDD §11: `apps/{web,api}`, `packages/{config,mcp,retrieval}`, `services/ingest-eval`, `infra/`.
- [x] A4 — `.env.example` with placeholders (no secrets): `DATABASE_URL`, `LLM_*`, `EMBEDDING_*`, `GOOGLE_API_KEY`.
- [x] A5 — Typed, validated env loader (Zod) in `packages/config`; fail fast on missing env (+ tests).

### B. Database & migrations *(infra)* — ✅ done (verified against real pgvector)
- [x] B1 — `infra/docker-compose.yml`: Postgres `pgvector/pgvector:pg16` + `pg_isready` healthcheck.
- [x] B2 — node-pg-migrate wired (root `pnpm migrate`); decision recorded in [ADR-0003](../adr/0003-migration-tooling-node-pg-migrate.md).
- [x] B3 — Initial schema migration from SDD §5: `users, courses, documents, chunks, chunk_embeddings, embedding_meta` + 8 stub tables.
- [x] B4 — `chunk_embeddings.embedding vector(768)`; **HNSW** index created (`vector_cosine_ops`, defaults).
- [x] B5 — `embedding_meta` seeded (`text-embedding-004`, 768) — verified via psql.

### C. Ingestion service — Python `services/ingest-eval` *(core)*
- [x] C1 — FastAPI app skeleton + health endpoint + typed settings from env.
- [x] C2 — **Parse:** PyMuPDF for PDF, python-pptx for PPTX; preserve page/slide numbers + text order (FR-2).
- [x] C3 — **Chunk:** fixed-size w/ overlap default; attach `document_id, page/slide, char_start, char_end` (FR-3).
- [x] C4 — **Content hash** per document; skip/replace on re-upload (idempotent, FR-6).
- [x] C5 — **Embed:** Google `text-embedding-004`; batch + retry/backoff for free-tier quota (FR-4, NFR-5).
- [x] C6 — **Store:** write chunks + embeddings in a transaction; verify dim == `embedding_meta.dim`.
- [x] C7 — Status transitions + failure reason on `documents.status` (FR-5).
- [x] C8 — Runnable as an internal HTTP API **and** a CLI (CI-friendly).

### D. Upload trigger + status — TS `apps/api` (NestJS) *(thin slice)*
- [ ] D1 — NestJS app bootstrap + config module (typed env) + health route.
- [ ] D2 — `POST /courses` and `POST /courses/:id/documents` (accept upload → enqueue ingest) (FR-1).
- [ ] D3 — `GET /courses/:id/status` returns per-document ingest status (FR-5).
- [ ] D4 — Hand-off to the Python service (direct HTTP call for MVP; a broker is later scope).

### E. Tests & CI *(gate)*
- [x] E1 — Sample fixtures: a small PDF and a small PPTX in the repo.
- [x] E2 — Python test: parse→chunk→embed→store; assert chunk count, metadata, dim.
- [x] E3 — Idempotency test: re-ingest same file → no duplicate chunks.
- [ ] E4 — API test: upload → status reaches `ready`.
- [ ] E5 — GitHub Actions: install, lint, type-check, run Python + TS tests on PR (NFR-11).
- [ ] E6 — Update README: one-command local run (NFR-12).

---

## Sequencing

```
A (scaffold) ──► B (db) ──► C (ingestion core) ──► D (API slice) ──► E (tests+CI)
                     └────────────► C6 needs B4/B5 (dim + meta)
```

Do A and B fully before C. C is the meat. D is deliberately thin (no message broker
yet — that arrives with KoboBooks-style event work, out of scope here). E runs
alongside C/D, not bolted on at the end.

## Rules (M2-specific, on top of `CLAUDE.md`)

- **Embedding dim guard:** every write path asserts `len(embedding) == 768` and
  matches `embedding_meta`; refuse mismatches loudly (ADR-0002).
- **Idempotency by content hash** is mandatory, not optional — no duplicate chunks (FR-6).
- **Quota resilience:** all Google embedding calls use batching + exponential backoff;
  a quota failure marks the document `failed` with a clear reason, never a silent partial.
- **Secrets:** `GOOGLE_API_KEY` and `DATABASE_URL` from env only; `.env` git-ignored;
  commit only `.env.example` (SR-4).
- **No retrieval logic here yet** — M2 stops at *storing* embeddings. Query/rerank/answer
  is Milestone 3. Resist scope creep.
- **Privacy groundwork:** documents are lecturer-owned (lower sensitivity), but keep
  the parsing layer ready to redact PII before any student-text embedding later (PR-8).

## Out of scope (deferred)
- Message broker / async queue (thin HTTP hand-off for now).
- Retrieval, reranking, chat, streaming → Milestone 3.
- Chunking-strategy comparison + hit-rate tooling → stretch (FR-7).
- Auth hardening beyond a basic guard → later milestone.

## Risks
| Risk | Mitigation |
| --- | --- |
| Slide-heavy PDFs parse poorly | Start with text PDFs; log parse coverage; revisit chunking in M3 stretch |
| Free-tier embedding quota hit during testing | Batch + backoff; local `bge-base` (also 768-dim) fallback per ADR-0002 |
| pgvector/HNSW setup friction in Docker | Use a prebuilt `pgvector` image; healthcheck before migrations |

## Next milestone
**M3 — Retrieval + chat UI** (weeks 5–6): vector search + grounding + citations +
streaming + low-data mode. Depends on this milestone's stored embeddings.
