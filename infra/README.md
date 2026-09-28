# infra

Local + deployment infrastructure for CourseMind.

## Status
🟡 Scaffold only (M2 Task A). Lands in **M2 Task B**:

- `docker-compose.yml` — Postgres with the `pgvector` extension (+ healthcheck).
- `migrations/` — initial schema from [SDD §5](../docs/SDD.md#5-data-model-initial):
  `chunk_embeddings.embedding vector(768)`, an **HNSW** index, and `embedding_meta`
  seeded with the active model (ADR-0001, ADR-0002).

Local Postgres data is written to `infra/pgdata/` (git-ignored).
