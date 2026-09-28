# ADR-0003: Use node-pg-migrate for database migrations

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Reiker Nodd
- **Context docs:** [PRD](../PRD.md) · [SRS](../SRS.md) · [SDD](../SDD.md) · [ADR-0001](./0001-vector-store-pgvector-vs-dedicated.md) · [ADR-0002](./0002-model-and-retrieval-configuration.md)

## Context

CourseMind uses a single PostgreSQL + pgvector database (ADR-0001). We need a way to
create and evolve the schema (SDD §5) reproducibly across local dev, CI, and any
deployment — including pgvector-specific DDL (`CREATE EXTENSION vector`, a
`vector(768)` column, an HNSW index) that most ORMs don't model natively.

Constraints: solo developer; the project values *readable, inspectable* schema
history (CLAUDE.md §8, §1 "one datastore"); no ORM is otherwise in use for M2
(ingestion writes are plain SQL from a Python service and, later, a NestJS API).

## Options considered

### Option A — node-pg-migrate (raw-SQL migrations)

A lightweight migration runner where each migration is a small JS file that runs
plain SQL via `pgm.sql(...)` (or SQL files), tracked in a `pgmigrations` table.

- **Pros:** the DDL is written out verbatim, so pgvector extensions/indexes work
  with zero abstraction; migration history reads like SQL; no ORM lock-in; tiny
  dependency; up/down per migration; runs the same in CI and locally via one script.
- **Cons:** no automatic schema-from-models generation; the developer owns the DDL
  (which for this project is the point, not a drawback).

### Option B — Prisma Migrate

- **Pros:** batteries included, generated client, schema drift detection.
- **Cons:** pgvector isn't a first-class Prisma type (needs `Unsupported`/raw SQL
  escapes for the vector column + HNSW index anyway); heavier; introduces an ORM and
  a schema DSL as the source of truth when we deliberately keep SQL as the source of
  truth; more than a solo M2 needs.

### Option C — Drizzle ORM + drizzle-kit

- **Pros:** TypeScript-first, decent SQL transparency, growing pgvector support.
- **Cons:** still an ORM/query-builder layer we don't otherwise want yet; couples the
  schema definition to TS when the first schema *consumer* is the Python ingestion
  service; more moving parts than raw migrations at this stage.

## Decision

**Adopt Option A: node-pg-migrate with raw-SQL migrations.**

It matches the project's "one Postgres, see-the-SQL" ethos: pgvector DDL is expressed
directly, the migration history is transparent, and there's no ORM to fight or lock
into. Migrations live in `infra/migrations/` and run from the repo root via
`pnpm migrate` (which reads `DATABASE_URL` from the environment).

**Home:** the `migrate*` scripts and the `node-pg-migrate` + `pg` dev dependencies
live in the **root `package.json`**, not an `infra/package.json`. Rationale: the pnpm
workspace only globs `apps/*` and `packages/*`; keeping migrations at the root avoids
expanding workspace membership just to hold a runner.

## Consequences

### Positive
- pgvector `CREATE EXTENSION` / `vector(768)` / HNSW index are plain SQL — no escapes.
- Schema history is readable by any Postgres tool; diffs are just SQL.
- Minimal footprint; one command in dev and CI.

### Negative / accepted risk
- No generated types or drift detection — consumers (Python service, later the API)
  must keep their own typed views of the schema in sync (guarded by tests + the
  `embedding_meta` dimension check from ADR-0002).
- The developer writes DDL by hand (intended).

## Revisit criteria
- If/when a TypeScript ORM is adopted for the API layer and we want a single schema
  source of truth, reconsider Drizzle. Migrations would remain the deployment
  mechanism regardless.
