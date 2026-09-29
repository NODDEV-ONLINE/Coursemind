---
name: coursemind-project-state
description: CourseMind monorepo topology, milestone state, and key architectural decisions
metadata:
  type: project
---

CourseMind is a pnpm+Turborepo monorepo (Node >=20). Active milestone is M2 (Ingestion). Tasks A, B, C are committed to `dev`. Task D (NestJS API) and E4/E5/E6 remain.

**Why:** M2 goal is upload → parse → embed → store with visible status. Task D is the thin TS slice that accepts uploads and hands off to the Python service.

**How to apply:** Never advance to M3 (retrieval/chat/streaming) work. No message broker in M2. No auth hardening beyond a placeholder guard.

## Monorepo topology
- `apps/web` — Next.js (not yet scaffolded beyond placeholder)
- `apps/api` — NestJS (placeholder `src/index.ts`; Task D adds real implementation)
- `packages/config` — Zod env loader (`loadEnv`, `envSchema`, `Env`). Source of truth for all env config.
- `packages/retrieval` — placeholder; implemented in M3
- `packages/mcp` — placeholder; implemented later
- `services/ingest-eval` — Python FastAPI worker; fully implemented in Task C

## Key constraints
- TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- `apps/api/tsconfig.json` has `experimentalDecorators: true, emitDecoratorMetadata: true` (NestJS ready)
- `packages/config` exports `loadEnv`, `envSchema`, `Env` — NestJS config module must wrap this, not re-implement
- `INGEST_SERVICE_URL` already in `envSchema` (defaults to `http://localhost:8000`)
- `pg` (the postgres driver) is a root devDependency; NestJS app should depend on it directly in `apps/api/package.json`

## Python ingest contract (POST /ingest)
Body: `{ document_id: string, course_id: string, file_path: string }` (absolute path on disk)
Response: `{ document_id: string, status: "ready" | "failed" }`
HTTP 500 on failure. The `documents` row must exist (status=queued) BEFORE calling `/ingest`.

## DB schema key facts (as of migration 0004)
- `documents(id, course_id, filename, content_hash NULLABLE, status CHECK queued|processing|ready|failed, pages, created_at, failure_reason)`
- `content_hash` is nullable at insert time (API creates the row queued; pipeline fills hash on ready)
- Unique constraint: `(course_id, content_hash)` — NULLs are distinct
- `courses(id, owner_id, title, created_at)`
- `users(id, role, institution_id, created_at)` — no auth in M2 beyond a placeholder

## Upload file-sharing decision (recommended for Task D)
Multipart upload to NestJS → API saves file to a shared local dir → passes absolute path to Python `/ingest`. For MVP the shared dir is a local volume (same host in docker-compose). This does NOT require a Python contract change.

## M2 milestone status — COMPLETE (merged to master, merge commit 9454d34)
All tasks A–E shipped and merged. dev branch is 3 commits ahead of master (agent memory + CI + Task D commits that were merged post-snapshot). CI green.

## Active milestone: M3 — Retrieval + Chat UI (not started)
Tasks A (packages/retrieval), B (apps/api grounded answering), C (apps/web chat UI), D (observability), E (tests/CI).
ADR-0004 (query-embedding location) must be decided and written before Task A implementation begins.
Key open decisions: refusal threshold (default + configurable), LLM streaming interface contract.
No MCP server in M3 (deferred to M5). No accuracy gate in M3 (deferred to M4).

## ingest-eval service contract (relevant to ADR-0004)
Existing routes: GET /health, POST /ingest.
embedder.py: GoogleEmbeddingClient wraps google-generativeai 0.8.x (deprecated; migration to google-genai tracked).
EmbeddingProtocol: structural Protocol exposing embed_batch(texts) -> list[list[float]].
No /embed route yet — adding it is Option (a) of ADR-0004.
GOOGLE_API_KEY is a required env var consumed by GoogleEmbeddingClient.

## packages/retrieval current state
Stub only: exports RETRIEVAL_PLACEHOLDER = true. Has vitest, @coursemind/config dep. Build/test scripts wired. Ready for implementation.

## packages/config env schema additions needed for M3
INGEST_SERVICE_URL already present (defaults to http://localhost:8000).
LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_FALLBACK_PROVIDER, LLM_FALLBACK_MODEL already present.
EMBEDDING_PROVIDER, EMBEDDING_MODEL (default text-embedding-004), EMBEDDING_DIM (default 768), GOOGLE_API_KEY already present.
New vars needed: RETRIEVAL_TOP_K, RETRIEVAL_SCORE_THRESHOLD (configurable per course).

## ADR sequence
0001: pgvector. 0002: LLM+embedding config. 0003: migration tooling. Next: 0004 (query-embedding location).
