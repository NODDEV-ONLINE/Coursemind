# ADR-0001: Use PostgreSQL + pgvector instead of a dedicated vector database

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** Reiker Nodd
- **Context docs:** [PRD](../PRD.md) · [SRS](../SRS.md) · [SDD](../SDD.md)

## Context

CourseMind needs to store and similarity-search embeddings of course-material
chunks, alongside plenty of ordinary relational data: users, courses, documents,
questions, answers, citations, ratings, consents, and evaluation runs.

Constraints that shape this decision:
- **Solo developer**, ~10–12 hrs/week, pilot scale (~60 students, a handful of
  courses, low tens of thousands of chunks — not millions).
- **Cost-sensitive** (Nigerian pilot on free/low-cost tiers). *(NFR-8)*
- **Consistency matters:** citations must point at chunks that exist, and privacy
  requires deleting a student's data cleanly *(FR-11, PR-4, PR-5)* — easier when
  vectors and relational rows are transactional in one place.
- **Portfolio signal:** the decision and its tradeoff should read as deliberate.

## Options considered

### Option A — PostgreSQL + pgvector (one database)

Store embeddings in a `vector` column in the same Postgres that holds relational
data; index with IVFFlat or HNSW.

- **Pros:** one datastore to run/back up/secure; transactional consistency between
  chunks, embeddings, citations, and deletions; SQL joins between metadata and
  vectors (course-scoping, filters) are trivial; no extra service cost; simplest
  ops for a solo dev; erasure/retention jobs are ordinary SQL. *(SR-2, PR-4, PR-5)*
- **Cons:** not purpose-built for billion-scale ANN; index tuning (lists/`ef`) is
  manual; very large corpora would eventually outgrow it.

### Option B — Dedicated vector DB (Pinecone / Qdrant / Weaviate) + Postgres

Keep relational data in Postgres; keep vectors in a specialised service.

- **Pros:** best-in-class ANN performance and scaling; advanced filtering/hybrid
  search features; managed options offload index tuning.
- **Cons:** **two** systems to run, secure, and keep in sync; cross-store
  consistency is now *my* problem (dangling vectors on delete, split-brain on
  failure) — directly at odds with citation integrity and erasure *(FR-11, PR-5)*;
  added cost and a second failure domain; overkill at pilot scale; more moving
  parts for reviewers to see fail.

### Option C — Embedded/local index (FAISS/sqlite-vss in-process)

- **Pros:** zero external dependency, fast for small data.
- **Cons:** persistence, concurrency, and multi-instance sharing are awkward;
  poor fit once there's an API + worker + MCP server all needing the index; weak
  operational story for a deployed pilot.

## Decision

**Adopt Option A: PostgreSQL + pgvector as the single datastore.**

At pilot scale the corpus is small (low tens of thousands of chunks), so pgvector's
ANN performance is more than adequate, and the dominant win is **operational
simplicity + transactional consistency**. Keeping vectors and relational rows in
one database means citations can't dangle, and privacy deletes/retention are single
transactions rather than a distributed cleanup. This removes the hardest failure
mode (cross-store drift) for the least cost — the right tradeoff for a solo,
cost-constrained, correctness-focused project.

## Consequences

### Positive

- One thing to deploy, back up, secure, and reason about *(NFR-8, NFR-12)*.
- Course-scoped retrieval is a `WHERE course_id = ?` next to the vector search *(SR-2)*.
- Erasure and retention are plain SQL, satisfying privacy requirements cleanly *(PR-4, PR-5)*.

### Negative / accepted risk

- Manual index tuning (IVFFlat lists vs. HNSW `m`/`ef_construction`); revisit when
  data volume is known (open question in [SDD §12](../SDD.md#12-open-technical-questions-mirror-prd-12)).
- A future multi-institution scale-up may outgrow pgvector.

## Revisit / exit criteria
Reconsider a dedicated vector DB if any of these hold:
- Chunk count approaches **> ~1–2 million** vectors, or
- p95 retrieval latency breaches the answer budget *(NFR-1)* after index tuning, or
- We need advanced hybrid/filtered search that pgvector can't serve efficiently.

If we migrate, the retrieval module ([SDD §4.4/§6](../SDD.md#6-retrieval--answer-pipeline))
is the single seam to change, since the API and MCP server both depend on it.

## Portfolio note
This ADR is intended to double as a LinkedIn carousel: *"pgvector vs Pinecone vs
Qdrant for a solo developer"* — the honest framing is **consistency and ops over
raw ANN scale, at the scale I actually have.**
