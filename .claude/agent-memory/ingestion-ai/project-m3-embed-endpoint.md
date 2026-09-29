---
name: project-m3-embed-endpoint
description: M3 Task A-1 — POST /embed added to ingest-eval; contract, test approach, and httpx2 blocker noted
metadata:
  type: project
---

POST /embed implemented in `services/ingest-eval/src/coursemind_ingest/app.py` per ADR-0004 on 2026-09-29.

**Contract:**
- Request: `{ "text": string }` — Pydantic `EmbedRequest` with `Field(min_length=1)`; empty/missing → 422
- Response 200: `{ "embedding": list[float], "model": str, "dim": int }`
- Response 500: upstream Google error propagated via `HTTPException`

**Implementation details:**
- `EmbedRequest`, `EmbedResponse` Pydantic models added to `app.py`
- `get_embedder() -> EmbeddingProtocol` FastAPI dependency added; returns `GoogleEmbeddingClient`; overridable via `app.dependency_overrides[get_embedder]`
- Handler uses `Depends(get_settings)` and `Depends(get_embedder)` — both injected parameters, enabling direct function-call testing without HTTP machinery
- No new retry layer added (tenacity in `GoogleEmbeddingClient` is sufficient per NFR-5)
- Single text only — no batching surface

**Test approach (tests/test_embed.py):**
- `TestClient` is NOT usable: Starlette 1.7.0 requires `httpx2` (not `httpx`), and `httpx2` is blocked as a potential typosquat. httpx2 is not in declared dev dependencies.
- Tests call the `embed()` handler function directly — `Annotated[T, Depends(fn)]` is metadata only; function is freely callable
- `EmbedRequest` Pydantic validation tested directly for 422 equivalence (FastAPI converts `ValidationError` → 422)
- `_MockEmbedder` returns deterministic 768-dim vectors (index * 0.001); satisfies `EmbeddingProtocol`

**Gate results:** 55 tests passed (43 pre-existing + 12 new), ruff clean, mypy clean.

**Why:** ADR-0004 decision — one embedding implementation in Python; no drift; `packages/retrieval` (TS) calls this endpoint instead of duplicating Google embedding SDK.

**How to apply:** If adding more HTTP endpoints to `app.py` that need testable dependencies, use the same `Depends(get_settings)` / `Depends(get_embedder)` injection pattern and test via direct function calls, not TestClient.
