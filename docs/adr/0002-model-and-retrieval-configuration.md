# ADR-0002: Model & retrieval configuration (LLM, embeddings, reranking, index)

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** Reiker Nodd
- **Context docs:** [PRD](../PRD.md) · [SRS](../SRS.md) · [SDD](../SDD.md) · [ADR-0001](./0001-vector-store-pgvector-vs-dedicated.md)

## Context

ADR-0001 chose PostgreSQL + pgvector as the single datastore. This ADR resolves the
remaining model/retrieval open questions from [PRD §12](../PRD.md#12-open-questions)
so ingestion (Milestone 2) is unblocked. Overriding constraints: **solo dev, no
budget for hosting/paid APIs, Nigerian latency + NDPA privacy** *(NFR-8, PR-7)*.

## Decisions

### 1. LLM provider — pluggable via `.env`, Anthropic default *(FR-13, NFR-4)*

The API talks to LLMs through a thin provider interface selected at runtime by
environment variables. Any provider (Anthropic, OpenAI, Google, local/Ollama, an
OpenAI-compatible endpoint) can be swapped without code changes. The shipped
default/placeholder is an **Anthropic** model.

```env
# .env (placeholders)
LLM_PROVIDER=anthropic            # anthropic | openai | google | ollama | openai-compatible
LLM_MODEL=claude-opus-4-8         # provider-specific model id
LLM_API_KEY=                      # secret, never committed (SR-4)
LLM_BASE_URL=                     # for openai-compatible / self-hosted
LLM_FALLBACK_PROVIDER=            # optional secondary for NFR-4
LLM_FALLBACK_MODEL=
```

- **Why:** avoids lock-in, lets cost/latency be tuned per deployment, and keeps
  secrets out of source *(SR-4)*. A live provider swap is a config change only —
  no re-processing of data.
- **Fallback ordering** stays open until real cost/latency numbers exist; the
  interface already supports a secondary provider.

### 2. Embeddings — Google `text-embedding-004` (768-dim), free hosted tier *(FR-4)*

Use **Google `text-embedding-004`** via the AI Studio free tier → **768 dimensions**.

- **Why:** best-quality free option, no local CPU cost during ingestion, and no
  infra to run. Frees the app container from carrying an embedding model.
- **Privacy tradeoff (accepted):** course text and (indirectly) query text are sent
  **cross-border to Google** for embedding. This must be disclosed in the privacy
  notice per **PR-7**, and factored into the NDPA data-flow description. Prefer
  embedding *course materials* (lecturer-owned) over raw student PII where possible;
  apply PII redaction before embedding query text *(PR-8)*.
- **Quota risk (accepted):** the free tier has rate/volume limits; batch ingestion
  must handle throttling/retries *(NFR-5)*.
- **Embedding model is configurable** (`.env`), **but the vector dimension is fixed
  in the schema.** Changing the embedding model = re-embed the whole corpus = a
  migration, *not* a live swap (unlike the LLM). To make swaps safe, store the
  active `embedding_model` + `dim` in an `embedding_meta` row and refuse mixed-model
  reads.

```env
EMBEDDING_PROVIDER=google         # google | local | voyage | jina | openai
EMBEDDING_MODEL=text-embedding-004
EMBEDDING_DIM=768                 # must match the vector(N) column; migration if changed
GOOGLE_API_KEY=                   # secret, never committed (SR-4)
```

**Alternatives considered (all viable, none chosen for MVP):**

| Option | Dim | Cost | Rejected because |
| --- | --- | --- | --- |
| `bge-small-en-v1.5` (local, fastembed) | 384 | free | no cross-border data, but adds CPU cost + model in-container; lower quality than 004 |
| `bge-base-en-v1.5` (local) | 768 | free | heavier on CPU than desired at pilot scale |
| Voyage `voyage-3-lite` (hosted) | 512 | free tier | external dependency, quota risk |
| Jina v3 (hosted) | 1024 | free tier | external dependency |
| OpenAI `text-embedding-3-small` | 1536 | paid | costs money; cross-border |

**Fallback if the free tier is exhausted:** switch `EMBEDDING_PROVIDER=local`
(`bge-base-en-v1.5`, also 768-dim → no schema migration needed).

### 3. Reranker — none for MVP; local cross-encoder later if needed *(FR-9)*

MVP uses **vector search only** (top-K by cosine) with no reranker, to stay inside
the <3 s time-to-first-token budget *(NFR-1)*.

- If retrieval quality proves weak during evaluation, add a **local** cross-encoder
  (`bge-reranker-base`) on CPU during the chunking-experiments stretch — still free.
- A hosted reranker (Cohere/Voyage) is only considered if local CPU latency becomes
  the bottleneck. This keeps reranking a measured optimization, not an MVP guess.

### 4. Vector index — HNSW *(refines ADR-0001)*

Use a **pgvector HNSW** index on `chunk_embeddings.embedding`.

- **Why:** better recall/latency than IVFFlat as the corpus grows, and no need to
  rebuild lists as data changes — the better long-run choice for a system meant to
  accumulate courses. Slightly higher memory/build cost is acceptable at pilot scale.
- Tune `m` / `ef_construction` (build) and `ef_search` (query) once real data volume
  is known.

### 5. Test-set data source — WAEC past questions (last ~10 years) *(FR-19)*

Seed the lecturer test set from **WAEC past-exam questions** as realistic,
Nigerian-context questions, supplemented with deliberate **off-syllabus questions**
to exercise refusal *(FR-12)*.

- **Scope note:** this does **not** pivot the product to exam-prep — WAEC is just a
  convenient real question bank for evaluation. The product stays general-university
  (personas unchanged).
- **Caveat:** for the accuracy half of the gate to be meaningful, the uploaded pilot
  course must cover the topics the WAEC questions test; otherwise items only exercise
  the refusal path.
- **Sourcing:** WAEC questions live in scattered PDFs/books/sites (no clean API), so
  they need scraping + cleaning into `(question, expected, must_cite)` rows. Mild IP
  caveat: fine for a private internal test set; do not redistribute.

## Consequences

- **Positive:** ingestion is unblocked (dim = 768, HNSW); $0 embedding (free tier) +
  $0 reranking; no embedding model to run in-container; LLM stays swappable per
  deployment; local `bge-base` fallback is also 768-dim, so switching needs no
  schema migration.
- **Negative / accepted risk:** hosted embedding sends course/query text
  cross-border to Google → **must be disclosed (PR-7)** and PII-redacted (PR-8);
  free-tier quota/rate limits require retry/backoff in ingestion (NFR-5);
  embedding-model change to a *different dimension* requires re-embedding (mitigated
  by `embedding_meta` guard); WAEC test set needs manual cleaning effort.

## Revisit criteria
- Retrieval hit-rate too low in evaluation → add local reranker (§3).
- Multilingual materials appear → swap to a multilingual embedding model (re-embed).
- Corpus/scale grows → retune HNSW params or revisit ADR-0001 exit criteria.
