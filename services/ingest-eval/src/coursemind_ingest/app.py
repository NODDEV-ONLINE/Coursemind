"""FastAPI application for the CourseMind ingestion service (C1, C8).

Endpoints:
  GET  /health  — liveness probe; returns service name + 'ok'.
  POST /ingest  — trigger ingestion of a document on disk.
  POST /embed   — embed a single query string (ADR-0004, M3 Task A-1).

Design notes:
  - Settings are instantiated once at startup (lifespan) and fail fast on
    missing env vars.  If GOOGLE_API_KEY or DATABASE_URL is absent the app
    refuses to start rather than failing on the first request.
  - Endpoint handlers are plain ``def`` (synchronous) functions.  FastAPI
    runs them in a thread-pool executor automatically, which avoids blocking
    the event loop when using the synchronous psycopg3 driver.
  - One psycopg3 connection is opened per /ingest request and closed in a
    finally block.  A connection pool (e.g. psycopg_pool) is the right
    next step once concurrency requirements are known, but is out of scope
    for M2.
  - /embed uses FastAPI dependency injection (Depends) for the embedding
    client and settings so tests can inject mocks without network calls.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any

import psycopg
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import Settings
from .embedder import EmbeddingProtocol, GoogleEmbeddingClient
from .pipeline import ingest_document

logger = logging.getLogger(__name__)

# Module-level settings singleton; populated by lifespan.
_settings: Settings | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Validate settings at startup; fail fast on missing env vars."""
    global _settings
    _settings = Settings()  # type: ignore[call-arg]  # reads required vars from env
    logger.info(
        "ingest-eval starting: embedding_model=%s dim=%d",
        _settings.EMBEDDING_MODEL,
        _settings.EMBEDDING_DIM,
    )
    yield
    logger.info("ingest-eval shutting down")


app = FastAPI(
    title="CourseMind ingest-eval",
    description="Document ingestion + evaluation service (Python, SDD §4.3).",
    version="0.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class IngestRequest(BaseModel):
    document_id: str
    course_id: str
    file_path: str


class IngestResponse(BaseModel):
    document_id: str
    status: str


class EmbedRequest(BaseModel):
    """Request body for POST /embed (ADR-0004).

    Text is treated as data, never as instructions (CLAUDE.md §2).
    """

    text: str = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    """Response body for POST /embed (ADR-0004).

    ``dim`` equals ``len(embedding)``; callers MUST validate it matches
    ``EMBEDDING_DIM`` (768) before writing to the vector store (ADR-0002).
    """

    embedding: list[float]
    model: str
    dim: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def get_settings() -> Settings:
    """Return the module-level settings; raises if lifespan has not run."""
    if _settings is None:
        raise RuntimeError("Settings not initialised; lifespan not executed")
    return _settings


def get_embedder() -> EmbeddingProtocol:
    """FastAPI dependency: return a production GoogleEmbeddingClient.

    Override via ``app.dependency_overrides[get_embedder]`` in tests to inject
    a mock that satisfies EmbeddingProtocol without making network calls.
    """
    settings = get_settings()
    return GoogleEmbeddingClient(
        api_key=settings.GOOGLE_API_KEY,
        model=settings.EMBEDDING_MODEL,
    )


@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness probe — returns 200 with service identity."""
    return {"status": "ok", "service": "ingest-eval"}


@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    """Trigger synchronous ingestion of a document already on disk.

    The TS API is expected to:
      1. Persist the document file to a shared volume / temp path.
      2. Create a ``documents`` row with status='queued'.
      3. POST here with document_id + course_id + file_path.

    Returns the final document_id and status ('ready' or 'failed').
    HTTP 500 is returned when ingestion fails; the failure_reason is also
    written to the documents row so it can be surfaced via GET /status.
    """
    settings = get_settings()
    embedder = GoogleEmbeddingClient(
        api_key=settings.GOOGLE_API_KEY,
        model=settings.EMBEDDING_MODEL,
    )

    conn: psycopg.Connection | None = None
    try:
        conn = psycopg.connect(settings.DATABASE_URL)
        ingest_document(
            file_path=req.file_path,
            document_id=req.document_id,
            course_id=req.course_id,
            conn=conn,
            settings=settings,
            embedder=embedder,
        )
        return IngestResponse(document_id=req.document_id, status="ready")

    except Exception as exc:
        logger.exception("Ingestion failed for document %s", req.document_id)
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {exc}",
        ) from exc

    finally:
        if conn is not None:
            conn.close()


@app.post("/embed", response_model=EmbedResponse)
def embed(
    req: EmbedRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    embedder: Annotated[EmbeddingProtocol, Depends(get_embedder)],
) -> EmbedResponse:
    """Embed a single query string for retrieval (ADR-0004, M3 Task A-1).

    Called by ``packages/retrieval`` (TS) so query vectors use the same model
    and normalisation as document vectors — one embedding implementation, no
    drift (ADR-0004 §Decision).

    The tenacity retry in GoogleEmbeddingClient already handles quota/backoff
    (NFR-5); this handler does not add a second retry layer.  Text is treated
    as data, never as instructions (CLAUDE.md §2).

    Returns:
        200: ``{ embedding: float[768], model: str, dim: 768 }``
        422: validation error — empty or missing ``text``.
        500: upstream Google embedding error after retries exhausted.
    """
    try:
        vectors = embedder.embed_batch([req.text])
    except Exception as exc:
        logger.exception("Upstream embedding error in POST /embed")
        raise HTTPException(
            status_code=500,
            detail=f"Embedding error: {exc}",
        ) from exc

    embedding = vectors[0]
    return EmbedResponse(
        embedding=embedding,
        model=settings.EMBEDDING_MODEL,
        dim=len(embedding),
    )
