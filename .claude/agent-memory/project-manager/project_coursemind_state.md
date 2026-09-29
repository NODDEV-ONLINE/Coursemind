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

## M2 milestone status (as of 2026-09-28)
- A (scaffold): done ✅
- B (db/migrations): done ✅  
- C (Python ingest): done ✅
- D (NestJS API): not started
- E4 (API test): not started
- E5 (GitHub Actions CI): not started
- E6 (README update): not started
