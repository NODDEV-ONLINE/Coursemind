"""Embedding client abstraction (FR-4, NFR-5, ADR-0002 §2).

Design:
  EmbeddingProtocol — structural Protocol (typing.Protocol) that any embedder
    must satisfy.  Tests inject a mock; production uses GoogleEmbeddingClient.

  GoogleEmbeddingClient — calls google-generativeai embed_content in batches
    of 100 (matching EMBEDDING_MAX_BATCH_SIZE inside the SDK), wrapped with
    tenacity exponential back-off for free-tier quota resilience (NFR-5).

Exception classes (verified against google-generativeai==0.8.6 installed in
this venv — see venv inspection notes in services/ingest-eval/README.md):

  google.api_core.exceptions.ResourceExhausted  — HTTP 429 quota exceeded.
  google.api_core.exceptions.ServiceUnavailable — HTTP 503 transient error.

  Both are subclasses of google.api_core.exceptions.GoogleAPICallError.
  google-api-core is a mandatory transitive dependency of google-generativeai,
  so the import is always resolvable within this virtualenv.

  There is NO separate google.generativeai.errors module in v0.8.6.
  The google.generativeai.types module only contains generation-specific errors
  (BlockedPromptException, BrokenResponseError, etc.) — not embedding errors.

Note: google-generativeai 0.8.x is deprecated upstream in favour of
google-genai >= 1.0 (FutureWarning emitted on import).  The package is pinned
by pyproject.toml to google-generativeai>=0.8.  Migration to google-genai is
a future task that requires updating this file, pyproject.toml, and the
exception references documented here.
"""

from __future__ import annotations

import warnings
from typing import Protocol, runtime_checkable

# Verified import paths for google-generativeai==0.8.6:
#   google.api_core is a required transitive dependency of google-generativeai
#   and is always present in this virtualenv.
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

# Exceptions that indicate a transient / quota error worth retrying.
_RETRYABLE = (ResourceExhausted, ServiceUnavailable)


@runtime_checkable
class EmbeddingProtocol(Protocol):
    """Structural interface for embedding clients.

    Any class exposing ``embed_batch(texts) -> list[list[float]]`` satisfies
    this protocol without inheritance.  Test doubles implement it without
    touching the network (required for E2/E3 tests).
    """

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Return one float vector per input text."""
        ...


class GoogleEmbeddingClient:
    """Production embedding client using Google AI Studio text-embedding-004.

    Sends requests in batches of 100 (BATCH_SIZE == EMBEDDING_MAX_BATCH_SIZE
    inside the google-generativeai SDK so no secondary batching occurs inside
    the SDK call).  Each batch is wrapped in independent retry logic so a
    quota error on batch N does not retry batches 0..N-1 (NFR-5).

    Args:
        api_key:  Google AI Studio API key (Settings.GOOGLE_API_KEY; SR-4).
        model:    Embedding model name without the ``models/`` prefix, e.g.
                  ``'text-embedding-004'``.  The full API path is constructed
                  as ``models/<model>``.
    """

    BATCH_SIZE: int = 100  # == EMBEDDING_MAX_BATCH_SIZE in the SDK

    def __init__(self, api_key: str, model: str = "text-embedding-004") -> None:
        self._model = model
        # Suppress the FutureWarning about the package being deprecated;
        # the migration to google-genai is tracked as a separate task.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            self._genai = genai

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed all *texts*, processing in batches of BATCH_SIZE.

        Returns a flat list: one 768-dim vector per input text, in the same
        order as *texts*.

        Raises:
            tenacity.RetryError: when all 5 retry attempts for a single batch
                are exhausted.  The pipeline catches this, marks the document
                'failed', and stores ``str(exc)`` as the failure_reason.
        """
        results: list[list[float]] = []
        for i in range(0, len(texts), self.BATCH_SIZE):
            batch = texts[i : i + self.BATCH_SIZE]
            batch_embeddings = self._embed_single_batch(batch)
            results.extend(batch_embeddings)
        return results

    @retry(
        retry=retry_if_exception_type(_RETRYABLE),
        wait=wait_exponential(multiplier=1, min=1, max=60),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    def _embed_single_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed one batch; retried on ResourceExhausted / ServiceUnavailable.

        tenacity retries only when the raised exception is an instance of
        _RETRYABLE = (ResourceExhausted, ServiceUnavailable).  All other
        exceptions propagate immediately without consuming retry slots.

        embed_content with a list of strings returns:
            {'embedding': list[list[float]]}   (BatchEmbeddingDict)
        """
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            response = self._genai.embed_content(
                model=f"models/{self._model}",
                content=texts,
            )
        # google-generativeai typing stubs return Any for dict access;
        # when content is a list the SDK returns BatchEmbeddingDict where
        # 'embedding' is list[list[float]].  The cast makes mypy happy.
        from typing import cast

        return cast(list[list[float]], response["embedding"])


__all__ = ["EmbeddingProtocol", "GoogleEmbeddingClient"]
