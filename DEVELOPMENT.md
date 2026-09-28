# CourseMind — monorepo (pnpm + Turborepo)

TypeScript workspaces in `apps/*` and `packages/*`; the Python ingestion service in `services/ingest-eval`.

```bash
pnpm install        # install workspace deps
pnpm typecheck      # tsc --noEmit across TS packages
pnpm lint           # eslint
pnpm test           # vitest
```

Copy `.env.example` to `.env` before running services. Structure: see [SDD §11](./docs/SDD.md#11-monorepo-layout-target).

## Run the whole stack (one command)

```bash
cp .env.example .env        # then set GOOGLE_API_KEY (embeddings, ADR-0002 §2)
docker compose -f infra/docker-compose.yml up
```

This brings up, in order (enforced by healthchecks + `depends_on`):

1. **postgres** — Postgres 16 + pgvector, on `localhost:5432`.
2. **migrate** — one-shot; applies the schema (`pnpm migrate`) then exits.
3. **ingest-eval** — Python FastAPI ingestion service, on `localhost:8000`.
4. **api** — NestJS API, on `localhost:3000`.

The API and the ingest service share a named `uploads` volume mounted at
`/uploads` in both: the API writes an uploaded file there and hands the
`file_path` to the ingest service, which reads it from the same path.

`GOOGLE_API_KEY` must be set in `.env` (the ingest service needs it and compose
will refuse to start it otherwise). All other values have dev defaults; secrets
are never baked into images — they come from `.env`/host env only (CLAUDE.md §3).

### Individual images

```bash
docker build -t coursemind-ingest-eval services/ingest-eval
docker build -t coursemind-api -f apps/api/Dockerfile .   # context = repo root (monorepo-aware)
```

## CI

`.github/workflows/ci.yml` runs two parallel jobs on every PR to `dev`/`master`
(and pushes to those branches): a **TypeScript** job (`pnpm lint` · `typecheck`
· `test`) and a **Python** job (`ruff check .` · `mypy src` · `pytest`). Tests
are fully mocked, so CI needs no database or service containers. Nothing merges
red (CLAUDE.md §5).
