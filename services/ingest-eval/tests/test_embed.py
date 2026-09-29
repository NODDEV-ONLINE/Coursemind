"""Unit tests for POST /embed (ADR-0004, M3 Task A-1).

Strategy:
  - Call the ``embed`` handler function directly.  The ``Annotated[T,
    Depends(...)]`` annotations are metadata only; the function is freely
    callable without FastAPI's dependency-injection machinery.
  - Inject a deterministic mock that satisfies EmbeddingProtocol — no network.
  - Test Pydantic model validation directly for the 422 cases: FastAPI converts
    ``ValidationError`` to a 422 response, so validating the model is
    equivalent to testing the HTTP 422 path.

Note: TestClient is not used here because Starlette 1.7 requires ``httpx2``
(not ``httpx``), and ``httpx2`` is not in the project's declared dev
dependencies.  Direct handler invocation provides equivalent coverage for
a unit-test suite.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from coursemind_ingest.app import EmbedRequest, EmbedResponse, embed
from coursemind_ingest.config import Settings
from coursemind_ingest.embedder import EmbeddingProtocol

EMBEDDING_DIM = 768

# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class _MockEmbedder:
    """Deterministic mock satisfying EmbeddingProtocol — no network calls.

    Returns 768-dim vectors where each element equals its own index * 0.001,
    giving a non-trivial, reproducible vector for all input texts.
    """

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[i * 0.001 for i in range(EMBEDDING_DIM)] for _ in texts]


def _make_settings() -> Settings:
    """Settings with dummy secrets — no real credentials needed for unit tests."""
    return Settings(
        DATABASE_URL="postgresql://test:test@localhost:5432/testdb",
        GOOGLE_API_KEY="test-key-not-used",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _call_embed(text: str) -> EmbedResponse:
    """Call the embed handler directly with the mock embedder."""
    return embed(
        req=EmbedRequest(text=text),
        settings=_make_settings(),
        embedder=_MockEmbedder(),
    )


# ---------------------------------------------------------------------------
# 200 — successful embed
# ---------------------------------------------------------------------------


class TestEmbedSuccess:
    """Verify the 200 response shape when a valid text is submitted."""

    def test_returns_embed_response_type(self) -> None:
        result = _call_embed("What is Newton's first law?")
        assert isinstance(result, EmbedResponse)

    def test_embedding_is_768_floats(self) -> None:
        result = _call_embed("What is Newton's first law?")
        assert len(result.embedding) == EMBEDDING_DIM, (
            f"Expected {EMBEDDING_DIM}-dim embedding, got {len(result.embedding)}"
        )
        assert all(isinstance(v, float) for v in result.embedding), (
            "All embedding elements must be floats"
        )

    def test_dim_field_matches_embedding_length(self) -> None:
        result = _call_embed("Explain photosynthesis.")
        assert result.dim == len(result.embedding), (
            "dim field must equal len(embedding)"
        )
        assert result.dim == EMBEDDING_DIM

    def test_model_field_is_non_empty_string(self) -> None:
        result = _call_embed("Describe the water cycle.")
        assert isinstance(result.model, str)
        assert len(result.model) > 0

    def test_model_field_matches_settings(self) -> None:
        settings = _make_settings()
        result = embed(
            req=EmbedRequest(text="test query"),
            settings=settings,
            embedder=_MockEmbedder(),
        )
        assert result.model == settings.EMBEDDING_MODEL

    def test_embedding_values_are_deterministic(self) -> None:
        """Two calls with any text must return the same vector from the mock."""
        r1 = _call_embed("query one")
        r2 = _call_embed("query two")
        # The mock returns the same vector regardless of text.
        assert r1.embedding == r2.embedding

    def test_mock_satisfies_embedding_protocol(self) -> None:
        """_MockEmbedder must satisfy EmbeddingProtocol at runtime."""
        assert isinstance(_MockEmbedder(), EmbeddingProtocol), (
            "_MockEmbedder must satisfy EmbeddingProtocol"
        )


# ---------------------------------------------------------------------------
# 422 — validation rejects empty / missing text
# ---------------------------------------------------------------------------


class TestEmbedValidation:
    """EmbedRequest validation maps to HTTP 422 in FastAPI.

    FastAPI converts Pydantic ValidationError to a 422 response automatically,
    so testing the Pydantic model directly is equivalent to the HTTP 422 path.
    """

    def test_empty_string_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            EmbedRequest(text="")

    def test_missing_text_field_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            EmbedRequest.model_validate({})

    def test_non_empty_text_is_accepted(self) -> None:
        req = EmbedRequest(text="a")
        assert req.text == "a"

    def test_whitespace_text_is_accepted(self) -> None:
        # A single space satisfies min_length=1; callers can trim if desired.
        req = EmbedRequest(text=" ")
        assert req.text == " "


# ---------------------------------------------------------------------------
# 500 — upstream embedding error propagates as HTTPException
# ---------------------------------------------------------------------------


class TestEmbedUpstreamError:
    """When the embedder raises, the handler must re-raise as HTTP 500."""

    def test_upstream_error_raises_http_exception(self) -> None:
        from fastapi import HTTPException

        class _FailingEmbedder:
            def embed_batch(self, texts: list[str]) -> list[list[float]]:
                raise RuntimeError("simulated quota exhausted")

        with pytest.raises(HTTPException) as exc_info:
            embed(
                req=EmbedRequest(text="test"),
                settings=_make_settings(),
                embedder=_FailingEmbedder(),
            )

        assert exc_info.value.status_code == 500
        assert "Embedding error" in exc_info.value.detail
