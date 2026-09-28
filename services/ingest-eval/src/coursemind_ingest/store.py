"""Database write operations for chunks and embeddings (ADR-0001, ADR-0002).

Responsibilities:
  set_document_status — update the documents.status (and failure_reason) column.
  store_chunks_and_embeddings — insert chunks + chunk_embeddings in one atomic
      transaction with a mandatory dimension guard before any write (ADR-0002).

Schema contract (verified against live migrations):
  documents(id, course_id, filename, content_hash, status, pages,
            created_at, failure_reason)
  chunks(id, document_id, course_id, page, char_start, char_end, text,
         created_at)
  chunk_embeddings(chunk_id PK → chunks.id ON DELETE CASCADE,
                   embedding vector(768) NOT NULL)

psycopg3 notes:
  - Uses %s positional parameters throughout (psycopg3 style).
  - Vectors are passed as a formatted string '[x,y,z,...]' with a ::vector
    cast in SQL; this avoids depending on the pgvector Python adapter.
  - store_chunks_and_embeddings does NOT commit; the pipeline owns commit
    boundaries so that chunks + embeddings + status='ready' can be committed
    atomically.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import psycopg

logger = logging.getLogger(__name__)


def set_document_status(
    conn: psycopg.Connection,
    document_id: str,
    status: str,
    failure_reason: str | None = None,
) -> None:
    """UPDATE documents.status (and optionally failure_reason) for *document_id*.

    Valid status values mirror the CHECK constraint in the schema:
      'queued', 'processing', 'ready', 'failed'

    Args:
        conn:           Open psycopg3 connection (caller manages commit).
        document_id:    UUID of the target documents row.
        status:         New status string.
        failure_reason: Human-readable error message; written on 'failed'
                        transitions.  Explicitly cleared (set to NULL) when
                        status is not 'failed', to avoid stale reasons.
    """
    reason: str | None = failure_reason if status == "failed" else None
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status = %s, failure_reason = %s WHERE id = %s",
            (status, reason, document_id),
        )
    logger.debug("Document %s → status=%s", document_id, status)


def store_chunks_and_embeddings(
    conn: psycopg.Connection,
    chunks: list[dict],
    embeddings: list[list[float]],
    expected_dim: int,
) -> None:
    """Insert *chunks* and their *embeddings* in a single atomic transaction.

    Dimension guard (ADR-0002): asserts ``len(embedding) == expected_dim`` for
    EVERY vector BEFORE touching the database.  Raises ``ValueError`` on the
    first mismatch so no partial writes can ever occur (ADR-0001).

    Args:
        conn:         Open psycopg3 connection (caller manages outer commit).
        chunks:       List of chunk dicts from chunker.chunk_document; each
                      must have keys: document_id, course_id, page,
                      char_start, char_end, text.
        embeddings:   Parallel list of float vectors — one per chunk.
        expected_dim: Required vector length (Settings.EMBEDDING_DIM = 768).

    Raises:
        ValueError:  If len(chunks) != len(embeddings) or any embedding does
                     not have exactly expected_dim dimensions.
    """
    if len(chunks) != len(embeddings):
        raise ValueError(
            f"Mismatch: {len(chunks)} chunks but {len(embeddings)} embeddings"
        )

    # ADR-0002 dim guard: check ALL vectors before the first INSERT.
    for idx, emb in enumerate(embeddings):
        if len(emb) != expected_dim:
            raise ValueError(
                f"Embedding {idx} has dimension {len(emb)}, "
                f"expected {expected_dim} (ADR-0002 guard)"
            )

    with conn.transaction(), conn.cursor() as cur:
        for chunk, embedding in zip(chunks, embeddings):
            # Insert the chunk row; RETURNING id gives us the PK for the
            # chunk_embeddings FK.
            cur.execute(
                """
                    INSERT INTO chunks
                        (document_id, course_id, page, char_start, char_end, text)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                (
                    chunk["document_id"],
                    chunk["course_id"],
                    chunk["page"],
                    chunk["char_start"],
                    chunk["char_end"],
                    chunk["text"],
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("INSERT INTO chunks returned no id")
            chunk_id = row[0]

            # Format embedding as '[x,y,z,...]' and cast to vector in SQL.
            # This avoids a dependency on the pgvector Python adapter.
            embedding_str = "[" + ",".join(f"{v:.10f}" for v in embedding) + "]"
            cur.execute(
                "INSERT INTO chunk_embeddings (chunk_id, embedding) "
                "VALUES (%s, %s::vector)",
                (chunk_id, embedding_str),
            )

    logger.info(
        "Stored %d chunks + embeddings for document %s",
        len(chunks),
        chunks[0]["document_id"] if chunks else "?",
    )
