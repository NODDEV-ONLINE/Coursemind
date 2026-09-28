"""End-to-end document ingestion pipeline (SDD §4.3, FR-1..FR-6).

Orchestrates: hash → idempotency check → parse → chunk → embed → store →
status transitions.  Consumes the EmbeddingProtocol interface so tests can
inject a mock embedder without network calls.

Status-transition contract (FR-5):
  queued  → processing  (set at pipeline entry, committed immediately)
  processing → ready    (set + committed atomically with chunks/embeddings)
  processing → failed   (set + committed on any exception; reason written to
                          documents.failure_reason column — migration 0003)

Idempotency (FR-6):
  Same file re-uploaded (same document_id, same content hash) → log and return.
  Different file re-uploaded (same document_id, different hash) → delete
  existing chunks (ON DELETE CASCADE removes chunk_embeddings) and re-ingest.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from .chunker import chunk_document
from .embedder import EmbeddingProtocol
from .hashing import sha256_file
from .parser import parse_pdf, parse_pptx
from .store import set_document_status, store_chunks_and_embeddings

if TYPE_CHECKING:
    import psycopg

    from .config import Settings

logger = logging.getLogger(__name__)


def ingest_document(
    file_path: str | Path,
    document_id: str,
    course_id: str,
    conn: psycopg.Connection,
    settings: Settings,
    embedder: EmbeddingProtocol,
) -> None:
    """Ingest *file_path* into the database under *document_id*.

    Args:
        file_path:    Absolute path to the PDF or PPTX file on disk.
        document_id:  UUID of the pre-existing ``documents`` row (created by
                      the TS API when the upload was queued).
        course_id:    UUID of the owning course (propagated to every chunk).
        conn:         Open psycopg3 connection; this function manages commit
                      boundaries but does NOT open or close the connection.
        settings:     Validated Settings instance (chunk sizes, embedding dim).
        embedder:     Any object satisfying EmbeddingProtocol — production uses
                      GoogleEmbeddingClient; tests inject a deterministic mock.

    Raises:
        Re-raises any exception that occurs during processing after setting the
        document status to 'failed' with the error message as failure_reason.
    """
    file_path = Path(file_path)

    # --- 1. Content hash ---------------------------------------------------
    new_hash = sha256_file(file_path)

    # --- 2. Idempotency check (FR-6) ----------------------------------------
    with conn.cursor() as cur:
        cur.execute(
            "SELECT content_hash FROM documents WHERE id = %s",
            (document_id,),
        )
        row = cur.fetchone()

    existing_hash: str | None = row[0] if row else None

    if existing_hash == new_hash:
        logger.info(
            "Document %s already ingested (hash=%s…), skipping",
            document_id,
            new_hash[:12],
        )
        return

    if existing_hash is not None:
        # Different file content for the same document_id — replace.
        logger.info(
            "Document %s has new content (old=%s… new=%s…), replacing chunks",
            document_id,
            existing_hash[:12],
            new_hash[:12],
        )
        with conn.cursor() as cur:
            # ON DELETE CASCADE removes chunk_embeddings automatically.
            cur.execute(
                "DELETE FROM chunks WHERE document_id = %s",
                (document_id,),
            )
        conn.commit()

    # --- 3–9. Main pipeline (with failure guard) ----------------------------
    try:
        # 3. Set processing; commit so the status is visible immediately.
        set_document_status(conn, document_id, "processing")
        conn.commit()

        # 4. Parse -------------------------------------------------------
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            pages = parse_pdf(file_path)
        elif suffix in (".pptx", ".ppt"):
            pages = parse_pptx(file_path)
        else:
            raise ValueError(
                f"Unsupported file extension '{suffix}' for {file_path.name}; "
                "expected .pdf or .pptx"
            )

        if not pages:
            raise ValueError(
                f"Parsed 0 pages from {file_path.name}; the file may be empty or corrupt"
            )

        # 5. Chunk -------------------------------------------------------
        chunks = chunk_document(
            pages,
            document_id,
            course_id,
            settings.CHUNK_SIZE,
            settings.CHUNK_OVERLAP,
        )

        if not chunks:
            raise ValueError(
                f"Chunking produced 0 chunks for {file_path.name}; "
                "all pages may have been empty after stripping whitespace"
            )

        # 6. Embed -------------------------------------------------------
        texts = [c["text"] for c in chunks]
        embeddings = embedder.embed_batch(texts)

        # 7. Store chunks + embeddings (ADR-0002 dim guard inside) --------
        # store_chunks_and_embeddings uses conn.transaction() internally;
        # it does NOT commit — the outer commit below is intentional so that
        # chunks, embeddings, content_hash update, and status='ready' are
        # all visible to readers at the same time.
        store_chunks_and_embeddings(
            conn, chunks, embeddings, settings.EMBEDDING_DIM
        )

        # 8. Persist content hash on the document row --------------------
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE documents SET content_hash = %s WHERE id = %s",
                (new_hash, document_id),
            )

        # 9. Set ready and commit everything atomically ------------------
        set_document_status(conn, document_id, "ready")
        conn.commit()

        logger.info(
            "Document %s ingested: %d pages → %d chunks (hash=%s…)",
            document_id,
            len(pages),
            len(chunks),
            new_hash[:12],
        )

    except Exception as exc:
        # Rollback any uncommitted work from this pipeline run, then mark
        # the document failed with the reason so it can be investigated and
        # retried.  We always re-raise so callers (app, cli) can propagate
        # the error to their own error-handling layer.
        try:
            conn.rollback()
        except Exception:
            logger.exception("Rollback failed for document %s", document_id)

        failure_reason = str(exc)
        logger.exception(
            "Ingestion failed for document %s: %s", document_id, failure_reason
        )
        set_document_status(conn, document_id, "failed", failure_reason=failure_reason)
        try:
            conn.commit()
        except Exception:
            logger.exception(
                "Could not commit failed status for document %s", document_id
            )
        raise
