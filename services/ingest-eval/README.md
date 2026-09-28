# ingest-eval (Python)

CourseMind's ingestion + evaluation service. The only Python in the repo
(CLAUDE.md §1).

**Responsibilities:** parse documents (PyMuPDF, python-pptx) → chunk with page/slide
metadata → embed (Google `text-embedding-004`, 768-dim) → store in Postgres+pgvector.
Later: run the accuracy evaluation + CI gate (Milestone 4).

## Status
🟡 Scaffold only (M2 Task A). Pipeline lands in **M2 Task C**.

## Local dev (once implemented)
```bash
cd services/ingest-eval
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn coursemind_ingest.app:app --reload   # (app module added in Task C)
```

Config comes from environment (see repo `.env.example`): `DATABASE_URL`,
`EMBEDDING_MODEL`, `EMBEDDING_DIM=768`, `GOOGLE_API_KEY`.
