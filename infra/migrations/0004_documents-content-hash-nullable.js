/* eslint-disable */
/**
 * M2 (Task C integration fix) — documents.content_hash nullable + per-course unique.
 *
 * Surfaced by the live ingestion E2E: the `documents` row is created in the
 * `queued` state by the API *before* the content hash is known — the pipeline
 * computes and fills the hash on the ready transition (FR-6). A NOT NULL column
 * made that first insert impossible.
 *
 * Also narrows uniqueness from global to (course_id, content_hash): the same
 * public material may legitimately exist in different courses, but shouldn't be
 * ingested twice within one course. NULLs are distinct, so multiple queued rows
 * coexist fine.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE documents ALTER COLUMN content_hash DROP NOT NULL;
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_content_hash_key;
    ALTER TABLE documents
      ADD CONSTRAINT documents_course_content_uniq UNIQUE (course_id, content_hash);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_course_content_uniq;
    ALTER TABLE documents
      ADD CONSTRAINT documents_content_hash_key UNIQUE (content_hash);
    ALTER TABLE documents ALTER COLUMN content_hash SET NOT NULL;
  `);
};
