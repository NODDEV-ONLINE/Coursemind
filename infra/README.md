# infra

Local + deployment infrastructure for CourseMind.

## Status
🟢 **M2 Task B done.** Postgres + pgvector, migrations, schema, HNSW index, and the
`embedding_meta` seed are in place and verified against a real `pgvector/pgvector:pg16`
container.

## Contents
- `docker-compose.yml` — Postgres `pgvector/pgvector:pg16` (port 5432) with a
  `pg_isready` healthcheck. Data is bind-mounted to `./pgdata/` (git-ignored).
- `migrations/` — node-pg-migrate raw-SQL migrations ([ADR-0003](../docs/adr/0003-migration-tooling-node-pg-migrate.md)):
  - `0001_initial-schema.js` — `CREATE EXTENSION vector`, core tables (SDD §5),
    `chunk_embeddings.embedding vector(768)`, HNSW index, `embedding_meta` seed.
  - `0002_stub-future-tables.js` — id+created_at stubs for M3/M4 tables.

## Usage
```bash
# 1. start the database
docker compose -f infra/docker-compose.yml up -d

# 2. from the repo root, apply migrations (reads DATABASE_URL from env/.env)
pnpm migrate
```

`DATABASE_URL` defaults to `postgresql://coursemind:coursemind@localhost:5432/coursemind`
(see repo `.env.example`). Roll back the last migration with `pnpm migrate:down`.

> Verified locally by running the same image via `docker run` (the compose v2 plugin
> wasn't installed on the dev box): migrations applied cleanly, `chunk_embeddings.embedding`
> is `vector(768)` with an HNSW index, and `embedding_meta` holds `text-embedding-004`/768.
