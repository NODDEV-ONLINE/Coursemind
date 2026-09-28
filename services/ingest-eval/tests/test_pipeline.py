"""Pipeline integration tests (E2, E3) — no network, no real database.

E2: parse → chunk → embed → store path with mock embedder + stub DB conn.
    Asserts: chunks > 0, correct metadata, all vectors are 768-dim.

E3: Idempotency.  Re-ingesting the same file (same document_id + content hash)
    must not trigger a second store call.

Design:
  - EmbeddingProtocol is satisfied by _MockEmbedder (returns 768-dim zeros).
  - The psycopg3 connection is simulated by _StubConn / _StubCursor which
    record INSERT calls and let us assert on captured chunks/embeddings.
  - store_chunks_and_embeddings is patched so we can inspect its arguments
    without needing a real Postgres instance.
  - set_document_status is patched to prevent UPDATE queries reaching a DB.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from coursemind_ingest.config import Settings
from coursemind_ingest.embedder import EmbeddingProtocol
from coursemind_ingest.hashing import sha256_file
from coursemind_ingest.pipeline import ingest_document

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_PDF = FIXTURES_DIR / "sample.pdf"
SAMPLE_PPTX = FIXTURES_DIR / "sample.pptx"

DOC_ID = "doc-e2e2e2e2-test-test-test-e2e2e2e2e2e2"
COURSE_ID = "course-e3e3e3e3-test-test-test-e3e3e3e3e3e3"
EMBEDDING_DIM = 768


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class _MockEmbedder:
    """Deterministic mock that satisfies EmbeddingProtocol.

    Returns 768-dim zero vectors without any network call.
    """

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * EMBEDDING_DIM for _ in texts]


def _make_stub_conn(existing_hash: str | None = None) -> MagicMock:
    """Return a MagicMock psycopg3 connection.

    The cursor context manager returns a cursor whose fetchone() is set to
    return *existing_hash* (simulating what SELECT content_hash returns).
    All other cursor calls (execute, etc.) are no-ops.
    """
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = (existing_hash,) if existing_hash is not None else None

    mock_conn = MagicMock()
    # Support `with conn.cursor() as cur:` syntax
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


def _make_settings() -> Settings:
    """Create a Settings instance with dummy secrets for unit testing."""
    return Settings(
        DATABASE_URL="postgresql://test:test@localhost:5432/testdb",
        GOOGLE_API_KEY="test-key-not-used",
        CHUNK_SIZE=800,
        CHUNK_OVERLAP=160,
        EMBEDDING_DIM=EMBEDDING_DIM,
    )


# ---------------------------------------------------------------------------
# E2 — parse → chunk → embed → store with mock embedder + stub DB
# ---------------------------------------------------------------------------


class TestPipelineBasic:
    """E2: Full pipeline run; assert chunks, metadata, and vector dimensions."""

    def _run_ingest(
        self,
        file_path: Path,
        doc_id: str = DOC_ID,
        course_id: str = COURSE_ID,
    ) -> tuple[list[dict], list[list[float]]]:
        """Run ingest with mocks; return (chunks_captured, embeddings_captured)."""
        if not file_path.exists():
            pytest.skip(
                f"Fixture not found: {file_path} — run tests/fixtures/generate_fixtures.py"
            )

        settings = _make_settings()
        mock_conn = _make_stub_conn(existing_hash=None)  # fresh document
        mock_embedder = _MockEmbedder()

        chunks_captured: list[dict] = []
        embeddings_captured: list[list[float]] = []

        def fake_store(conn, chunks, embeddings, expected_dim):
            chunks_captured.extend(chunks)
            embeddings_captured.extend(embeddings)

        with (
            patch(
                "coursemind_ingest.pipeline.store_chunks_and_embeddings",
                side_effect=fake_store,
            ),
            patch("coursemind_ingest.pipeline.set_document_status"),
        ):
            ingest_document(
                file_path=str(file_path),
                document_id=doc_id,
                course_id=course_id,
                conn=mock_conn,
                settings=settings,
                embedder=mock_embedder,
            )

        return chunks_captured, embeddings_captured

    # --- PDF ---

    def test_pdf_produces_chunks(self) -> None:
        chunks, _ = self._run_ingest(SAMPLE_PDF)
        assert len(chunks) > 0, "Expected at least one chunk from sample.pdf"

    def test_pdf_chunk_metadata_correct(self) -> None:
        chunks, _ = self._run_ingest(SAMPLE_PDF)
        for c in chunks:
            assert c["document_id"] == DOC_ID
            assert c["course_id"] == COURSE_ID
            assert c["page"] >= 1
            assert c["char_start"] >= 0
            assert c["char_end"] > c["char_start"]
            assert c["text"].strip()

    def test_pdf_all_embeddings_768_dim(self) -> None:
        chunks, embeddings = self._run_ingest(SAMPLE_PDF)
        assert len(embeddings) == len(chunks), (
            "One embedding per chunk required"
        )
        for i, emb in enumerate(embeddings):
            assert len(emb) == EMBEDDING_DIM, (
                f"Embedding {i} has dim {len(emb)}, expected {EMBEDDING_DIM}"
            )

    # --- PPTX ---

    def test_pptx_produces_chunks(self) -> None:
        chunks, _ = self._run_ingest(SAMPLE_PPTX)
        assert len(chunks) > 0, "Expected at least one chunk from sample.pptx"

    def test_pptx_chunk_metadata_correct(self) -> None:
        chunks, _ = self._run_ingest(SAMPLE_PPTX)
        for c in chunks:
            assert c["document_id"] == DOC_ID
            assert c["course_id"] == COURSE_ID
            assert c["page"] >= 1

    def test_pptx_all_embeddings_768_dim(self) -> None:
        chunks, embeddings = self._run_ingest(SAMPLE_PPTX)
        assert len(embeddings) == len(chunks)
        for i, emb in enumerate(embeddings):
            assert len(emb) == EMBEDDING_DIM, (
                f"Embedding {i} has dim {len(emb)}, expected {EMBEDDING_DIM}"
            )

    def test_embedder_protocol_satisfied(self) -> None:
        """_MockEmbedder must satisfy EmbeddingProtocol at runtime."""
        assert isinstance(_MockEmbedder(), EmbeddingProtocol), (
            "_MockEmbedder must satisfy EmbeddingProtocol"
        )

    def test_no_chunk_exceeds_chunk_size(self) -> None:
        settings = _make_settings()
        chunks, _ = self._run_ingest(SAMPLE_PDF)
        for c in chunks:
            assert len(c["text"]) <= settings.CHUNK_SIZE, (
                f"Chunk len {len(c['text'])} exceeds CHUNK_SIZE {settings.CHUNK_SIZE}"
            )


# ---------------------------------------------------------------------------
# E3 — Idempotency: re-ingest same file → no new chunks
# ---------------------------------------------------------------------------


class TestIdempotency:
    """E3: Second ingest of identical file (same hash) must skip store."""

    def test_second_ingest_same_hash_skips_store(self) -> None:
        if not SAMPLE_PDF.exists():
            pytest.skip("Fixture not found — run tests/fixtures/generate_fixtures.py")

        settings = _make_settings()
        mock_embedder = _MockEmbedder()
        existing_hash = sha256_file(SAMPLE_PDF)

        # First call: no existing hash (fresh document)
        store_call_count = {"n": 0}

        def counting_store(conn, chunks, embeddings, expected_dim):
            store_call_count["n"] += 1

        mock_conn_first = _make_stub_conn(existing_hash=None)
        with (
            patch(
                "coursemind_ingest.pipeline.store_chunks_and_embeddings",
                side_effect=counting_store,
            ),
            patch("coursemind_ingest.pipeline.set_document_status"),
        ):
            ingest_document(
                file_path=str(SAMPLE_PDF),
                document_id=DOC_ID,
                course_id=COURSE_ID,
                conn=mock_conn_first,
                settings=settings,
                embedder=mock_embedder,
            )

        assert store_call_count["n"] == 1, (
            "store_chunks_and_embeddings should be called exactly once on first ingest"
        )

        # Second call: existing hash matches → skip
        mock_conn_second = _make_stub_conn(existing_hash=existing_hash)
        with (
            patch(
                "coursemind_ingest.pipeline.store_chunks_and_embeddings",
                side_effect=counting_store,
            ),
            patch("coursemind_ingest.pipeline.set_document_status"),
        ):
            ingest_document(
                file_path=str(SAMPLE_PDF),
                document_id=DOC_ID,
                course_id=COURSE_ID,
                conn=mock_conn_second,
                settings=settings,
                embedder=mock_embedder,
            )

        assert store_call_count["n"] == 1, (
            "store_chunks_and_embeddings must NOT be called again on idempotent re-ingest"
        )

    def test_different_hash_triggers_store(self, tmp_path: Path) -> None:
        """If the stored hash differs, the pipeline should re-ingest (replace)."""
        if not SAMPLE_PDF.exists():
            pytest.skip("Fixture not found — run tests/fixtures/generate_fixtures.py")

        settings = _make_settings()
        mock_embedder = _MockEmbedder()
        stale_hash = "0" * 64  # definitely not the real hash

        store_call_count = {"n": 0}

        def counting_store(conn, chunks, embeddings, expected_dim):
            store_call_count["n"] += 1

        mock_conn = _make_stub_conn(existing_hash=stale_hash)
        with (
            patch(
                "coursemind_ingest.pipeline.store_chunks_and_embeddings",
                side_effect=counting_store,
            ),
            patch("coursemind_ingest.pipeline.set_document_status"),
        ):
            ingest_document(
                file_path=str(SAMPLE_PDF),
                document_id=DOC_ID,
                course_id=COURSE_ID,
                conn=mock_conn,
                settings=settings,
                embedder=mock_embedder,
            )

        assert store_call_count["n"] == 1, (
            "Re-ingest with changed hash should store new chunks"
        )


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestPipelineErrorHandling:
    """Verify that failures set document status to 'failed' with a reason."""

    def test_unsupported_extension_sets_failed(self, tmp_path: Path) -> None:
        """A .docx file should trigger failure with a clear reason."""
        fake_file = tmp_path / "document.docx"
        fake_file.write_bytes(b"fake docx content")

        settings = _make_settings()
        mock_conn = _make_stub_conn(existing_hash=None)
        mock_embedder = _MockEmbedder()

        status_calls: list[tuple] = []

        def capturing_status(conn, doc_id, status, failure_reason=None):
            status_calls.append((status, failure_reason))

        with patch(
            "coursemind_ingest.pipeline.set_document_status",
            side_effect=capturing_status,
        ), pytest.raises(ValueError, match="Unsupported"):
            ingest_document(
                file_path=str(fake_file),
                document_id=DOC_ID,
                course_id=COURSE_ID,
                conn=mock_conn,
                settings=settings,
                embedder=mock_embedder,
            )

        # Must have called set_document_status with 'failed'
        failed_calls = [(s, r) for s, r in status_calls if s == "failed"]
        assert len(failed_calls) == 1, (
            f"Expected exactly one 'failed' status call; got {status_calls}"
        )
        _, reason = failed_calls[0]
        assert reason is not None and len(reason) > 0, (
            "failure_reason must be non-empty"
        )

    def test_dim_mismatch_sets_failed(self) -> None:
        """A mock embedder returning wrong-dim vectors should cause 'failed' status."""
        if not SAMPLE_PDF.exists():
            pytest.skip("Fixture not found — run tests/fixtures/generate_fixtures.py")

        class _WrongDimEmbedder:
            def embed_batch(self, texts: list[str]) -> list[list[float]]:
                return [[0.0] * 512 for _ in texts]  # wrong: 512 not 768

        settings = _make_settings()
        mock_conn = _make_stub_conn(existing_hash=None)
        embedder = _WrongDimEmbedder()

        status_calls: list[tuple] = []

        def capturing_status(conn, doc_id, status, failure_reason=None):
            status_calls.append((status, failure_reason))

        with patch(
            "coursemind_ingest.pipeline.set_document_status",
            side_effect=capturing_status,
        ), pytest.raises(ValueError, match="dimension|dim"):
            ingest_document(
                file_path=str(SAMPLE_PDF),
                document_id=DOC_ID,
                course_id=COURSE_ID,
                conn=mock_conn,
                settings=settings,
                embedder=embedder,
            )

        failed_calls = [(s, r) for s, r in status_calls if s == "failed"]
        assert len(failed_calls) == 1
