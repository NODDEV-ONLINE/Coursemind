---
name: project-m2-ingestion-pipeline
description: M2 Task C ingestion pipeline — what was built, key decisions, exception classes, test approach
metadata:
  type: project
---

Milestone 2 Task C (C1–C8, E1–E3) implemented 2026-09-28. All 9 source modules live
under `services/ingest-eval/src/coursemind_ingest/`. Tests: 43/43 pass, ruff clean, mypy clean.

**Why:** First code milestone; unlocks embeddings in Postgres and sets the base for M3 retrieval.

**How to apply:** Use this as the authoritative record of what exists and where to look.

## Modules
- `config.py` — pydantic-settings Settings; `DATABASE_URL` + `GOOGLE_API_KEY` required from env only
- `hashing.py` — `sha256_file(path)` binary SHA-256 hex digest
- `parser.py` — `parse_pdf` (PyMuPDF, `import pymupdf as fitz`), `parse_pptx` (python-pptx)
- `chunker.py` — `chunk_document(pages, doc_id, course_id, chunk_size=800, overlap=160)`; char offsets per page
- `embedder.py` — `EmbeddingProtocol` + `GoogleEmbeddingClient`; tenacity retry on `ResourceExhausted`/`ServiceUnavailable`
- `store.py` — `set_document_status`, `store_chunks_and_embeddings`; dim guard before any write
- `pipeline.py` — `ingest_document`; orchestrates all steps + status transitions + idempotency
- `app.py` — FastAPI `GET /health`, `POST /ingest`; sync def endpoints
- `cli.py` — `python -m coursemind_ingest.cli ingest <file> --document-id X --course-id Y`

## Exception classes (verified against google-generativeai==0.8.6)
- `google.api_core.exceptions.ResourceExhausted` — HTTP 429 quota
- `google.api_core.exceptions.ServiceUnavailable` — HTTP 503
- `google.generativeai.errors` module does NOT exist in v0.8.6
- tenacity: `wait_exponential(min=1, max=60)`, `stop_after_attempt(5)`, `reraise=True`

## Test approach
- No network, no real DB in any test
- `EmbeddingProtocol` injected as `_MockEmbedder` (returns 768-dim zeros)
- DB patched at `pipeline.store_chunks_and_embeddings` and `pipeline.set_document_status`
- E3 idempotency: `_make_stub_conn(existing_hash=sha256_file(path))` returns matching hash on second call

## How to run tests
```bash
cd services/ingest-eval
source .venv/bin/activate
pytest -v
```

## Fixture files
- `tests/fixtures/sample.pdf` — 2 pages, ~2.5 KB; regenerate with `generate_fixtures.py`
- `tests/fixtures/sample.pptx` — 3 slides, ~30 KB

## pyproject.toml deps (do NOT modify unless genuinely missing)
fastapi, uvicorn[standard], pydantic, pydantic-settings, pymupdf, python-pptx,
google-generativeai>=0.8, psycopg[binary]>=3.2, tenacity>=9.0
dev: pytest, ruff, mypy

## psycopg3 vector storage pattern
Embed as `'[x,y,z]'::vector` string with `%s::vector` cast in SQL. No pgvector Python adapter needed.
`conn.transaction()` used inside `store_chunks_and_embeddings`; pipeline owns `conn.commit()` boundaries.

## Known notes
- `google-generativeai` 0.8.x emits FutureWarning; suppressed with `warnings.catch_warnings()` in embedder
- `Settings()` calls require `# type: ignore[call-arg]` in mypy because pydantic-settings reads from env
- BLE001 noqa comments in cli.py are intentional (top-level error boundary)
