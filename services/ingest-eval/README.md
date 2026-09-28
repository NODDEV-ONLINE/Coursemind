# ingest-eval (Python)

CourseMind's ingestion + evaluation service — the only Python in the repo
(`CLAUDE.md §1`).

**Responsibilities (M2):** parse documents (PyMuPDF, python-pptx) → chunk with
page/slide metadata → embed (`text-embedding-004`, 768-dim) → store in
Postgres+pgvector.

**Later (M4):** run the accuracy evaluation + CI gate.

---

## Module reference (`src/coursemind_ingest/`)

| Module | Responsibility |
|--------|----------------|
| `config.py` | Pydantic-Settings `Settings`; fails fast on missing env vars (SR-4) |
| `hashing.py` | `sha256_file(path)` — content fingerprint for idempotent re-upload (FR-6) |
| `parser.py` | `parse_pdf` (PyMuPDF) and `parse_pptx` (python-pptx); 1-indexed, skip blanks (FR-2) |
| `chunker.py` | `chunk_document` — fixed-size char windows with overlap; char offsets per page (FR-3) |
| `embedder.py` | `EmbeddingProtocol` + `GoogleEmbeddingClient`; batching + tenacity retry (FR-4, NFR-5) |
| `store.py` | `set_document_status`, `store_chunks_and_embeddings`; dim guard + atomic transaction (ADR-0001, ADR-0002) |
| `pipeline.py` | `ingest_document` — orchestrates the full pipeline with status transitions (FR-5) |
| `app.py` | FastAPI: `GET /health`, `POST /ingest`; sync endpoints in threadpool (C1, C8) |
| `cli.py` | `python -m coursemind_ingest.cli ingest` (C8) |

---

## Required environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | psycopg3 connection string, e.g. `postgresql://user:pass@localhost:5432/coursemind` |
| `GOOGLE_API_KEY` | yes | — | Google AI Studio API key for `text-embedding-004` (ADR-0002) |
| `EMBEDDING_MODEL` | no | `text-embedding-004` | Embedding model name (without `models/` prefix) |
| `EMBEDDING_DIM` | no | `768` | Expected vector dimension — must match `vector(N)` schema column |
| `CHUNK_SIZE` | no | `800` | Max characters per chunk window |
| `CHUNK_OVERLAP` | no | `160` | Overlap characters between adjacent windows |

Copy `.env.example` to `.env` and fill in the required values. The `.env` file
is git-ignored; never commit secrets.

---

## Local dev

```bash
cd services/ingest-eval
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

Start the HTTP server:
```bash
uvicorn coursemind_ingest.app:app --reload --port 8001
```

Verify it is running:
```bash
curl http://localhost:8001/health
# {"status":"ok","service":"ingest-eval"}
```

Trigger ingestion via HTTP:
```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{"document_id":"<uuid>","course_id":"<uuid>","file_path":"/abs/path/to/file.pdf"}'
```

---

## CLI usage

```bash
# Ingest a PDF
python -m coursemind_ingest.cli ingest /path/to/lecture.pdf \
    --document-id "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
    --course-id   "11111111-2222-3333-4444-555555555555"

# Ingest a PPTX
python -m coursemind_ingest.cli ingest /path/to/slides.pptx \
    --document-id "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff" \
    --course-id   "11111111-2222-3333-4444-555555555555"
```

Exit 0 on success, 1 on failure. Error details are also written to the
`documents.failure_reason` column so they are queryable.

---

## Running tests

```bash
# All tests
pytest

# Verbose output
pytest -v

# A single test file
pytest tests/test_parser.py -v
```

**Fixture files** (`tests/fixtures/sample.pdf`, `tests/fixtures/sample.pptx`)
are committed to the repo. To regenerate them:

```bash
python tests/fixtures/generate_fixtures.py
```

Tests never touch the network or a real database. The embedding client is
injected via `EmbeddingProtocol` and replaced with a `_MockEmbedder` that
returns deterministic 768-dim zero vectors.

---

## Embedding client — exception classes (verified against installed version)

`google-generativeai==0.8.6` is installed in this service's virtualenv.
Quota and availability errors come from `google.api_core.exceptions` (a
mandatory transitive dependency):

| Exception | HTTP status | Meaning |
|-----------|-------------|---------|
| `google.api_core.exceptions.ResourceExhausted` | 429 | Quota exceeded; retried with backoff |
| `google.api_core.exceptions.ServiceUnavailable` | 503 | Transient unavailable; retried with backoff |

The `google.generativeai.errors` module does **not** exist in v0.8.6.
`google.generativeai.types` contains only generation-specific errors
(`BlockedPromptException`, `BrokenResponseError`, etc.), not embedding errors.

tenacity retry parameters: `min=1s, max=60s, multiplier=1, attempts=5`.

**Deprecation notice:** `google-generativeai` 0.8.x is deprecated upstream
in favour of `google-genai >= 1.0` (a FutureWarning is emitted on import).
Migration is a future task tracked outside this README.

---

## Design decisions

- **`import pymupdf as fitz`** — PyMuPDF >= 1.24 ships `pymupdf` as the
  preferred package name; the legacy `fitz` alias still works but emits a
  deprecation warning.
- **Sync `def` endpoints in FastAPI** — FastAPI runs them in a thread-pool
  executor automatically, preventing event-loop blocking from the synchronous
  psycopg3 driver.
- **One connection per request** — simple and correct for M2. A connection
  pool (`psycopg_pool`) is the right upgrade once concurrency requirements
  are measured.
- **Vectors as `'[x,y,z]'::vector` strings** — avoids a dependency on the
  `pgvector` Python adapter package; psycopg3 escapes the string safely and
  Postgres performs the cast.
