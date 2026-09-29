# ADR-0004: Embed queries via the Python ingest service (`POST /embed`)

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Reiker Nodd
- **Context docs:** [PRD](../PRD.md) · [SRS](../SRS.md) · [SDD](../SDD.md) · [ADR-0001](./0001-vector-store-pgvector-vs-dedicated.md) · [ADR-0002](./0002-model-and-retrieval-configuration.md) · [M3 plan](../milestones/M3-retrieval-chat.md)

## Context

Milestone 3 adds retrieval: to vector-search a course, the **query** must be embedded
with the **same model and dimension as ingestion** (`text-embedding-004`, 768-dim) or
the vectors won't be comparable. Ingestion already embeds documents in the Python
`ingest-eval` service (`GoogleEmbeddingClient.embed_batch`, with tenacity retry and the
deprecated-SDK `FutureWarning` handling). Retrieval lives in `packages/retrieval` (TS),
shared by the API and the future MCP server (CLAUDE.md §1). So: where does query
embedding run?

## Options considered

### Option (a) — Add `POST /embed` to the Python service; `packages/retrieval` calls it
- **Pros:** one embedding implementation (no drift); the `embedding_meta` model/dim
  guard (ADR-0002) stays authoritative in one place; the future `google-generativeai`
  → `google-genai` migration happens once; the endpoint is ~15 lines reusing existing
  code. No new secret exposure (`packages/retrieval` calls a service URL, not Google).
- **Cons:** one extra network hop per query (loopback in dev/compose; negligible vs. the
  LLM call and streaming setup).

### Option (b) — Embed in TypeScript via Google's JS SDK in `packages/retrieval`
- **Pros:** lower latency (no hop).
- **Cons:** a **second** embedding implementation to keep in lockstep (model, dim,
  normalization, retry) — drift risk; doubles the work at the `google-genai` migration;
  needs its own `embedding_meta`-consistency enforcement and a Google key in the TS
  runtime.

## Decision

**Adopt Option (a): add `POST /embed` to `services/ingest-eval`; `packages/retrieval`
embeds queries by calling it.**

Correctness and DRY win at pilot scale: one embedding path, one place to guard the
model/dim, one place to migrate the SDK. The extra hop is negligible against the
answer-latency budget (NFR-1), and it will be measured in M3 Task D3 (3G p95).

**Endpoint contract:**
```
POST /embed   Body: { "text": string }
200: { "embedding": number[768], "model": "text-embedding-004", "dim": 768 }
422: validation error (empty/missing text)   500: upstream Google error
```
The TS caller validates `dim === EMBEDDING_DIM` and errors loudly on mismatch
(ADR-0002 `embedding_meta` guard principle).

## Related retrieval-config decisions (made at the same time)
- **Refusal threshold:** default **0.35 cosine distance** (lower = more similar); if the
  best hit's distance exceeds it, retrieval signals *insufficient context* → the answer
  layer refuses (FR-12). **Env-configurable** (`RETRIEVAL_SCORE_THRESHOLD`), tuned
  against the test set in M4.
- **Top-K:** default 5 (`RETRIEVAL_TOP_K`).
- **Reranker:** none for MVP (ADR-0002 §3).

## Consequences
- **Positive:** single embedding implementation; consistent `embedding_meta`; small,
  reversible surface; no Google key needed in the TS runtime.
- **Negative / accepted risk:** +1 network hop per query (measured in D3); the Python
  service is now on the query hot path (already required to be up for the product).

## Revisit criteria
Move query embedding into TS (Option b) if D3 (or later profiling) shows the `/embed`
hop meaningfully threatens the NFR-1 budget after other optimizations. The refactor is
isolated to `packages/retrieval` because embedding is already a structural interface.
