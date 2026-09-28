/* eslint-disable */
/**
 * M2 Task B — initial schema (SDD §5).
 * Raw SQL via node-pg-migrate (ADR-0003): the DDL is written out in full so the
 * schema history is readable by any Postgres tool, not hidden behind an ORM.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- pgvector must exist before the vector column / HNSW index (ADR-0001).
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Users: pseudonymous student id — no real name required (PR-1).
    CREATE TABLE users (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role           text NOT NULL,
      institution_id uuid,
      created_at     timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE courses (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id   uuid NOT NULL REFERENCES users(id),
      title      text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- content_hash UNIQUE enforces idempotent re-upload (FR-6).
    CREATE TABLE documents (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      filename     text NOT NULL,
      content_hash text NOT NULL UNIQUE,
      status       text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','processing','ready','failed')),
      pages        int,
      created_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE chunks (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      page        int,
      char_start  int,
      char_end    int,
      text        text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    );

    -- ON DELETE CASCADE keeps citation integrity + erasure clean (PR-5, ADR-0001).
    -- Embedding dimension is pinned to 768 (ADR-0002).
    CREATE TABLE chunk_embeddings (
      chunk_id  uuid PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      embedding vector(768) NOT NULL
    );

    -- HNSW index with pgvector defaults; m/ef_construction tuning deferred (ADR-0002).
    CREATE INDEX chunk_embeddings_embedding_hnsw
      ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);

    -- Guard row the ingestion service asserts against before writing (ADR-0002).
    CREATE TABLE embedding_meta (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      embedding_model text NOT NULL,
      dim             int NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    -- B5 seed.
    INSERT INTO embedding_meta (embedding_model, dim)
      VALUES ('text-embedding-004', 768);

    -- Course-scoping / lookup indexes (SR-2 course isolation queries).
    CREATE INDEX documents_course_id_idx ON documents(course_id);
    CREATE INDEX chunks_course_id_idx    ON chunks(course_id);
    CREATE INDEX chunks_document_id_idx  ON chunks(document_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS chunk_embeddings;
    DROP TABLE IF EXISTS chunks;
    DROP TABLE IF EXISTS documents;
    DROP TABLE IF EXISTS courses;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS embedding_meta;
    -- The vector extension is left installed intentionally.
  `);
};
