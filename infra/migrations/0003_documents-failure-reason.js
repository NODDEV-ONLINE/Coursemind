/* eslint-disable */
/**
 * M2 (Task C support) — add documents.failure_reason.
 * The M2 Definition of Done requires a failed ingest to report a reason; the
 * ingestion pipeline (Task C) writes it here on the queued→failed transition so
 * Task D's status endpoint can surface it to the lecturer (FR-5).
 */

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE documents ADD COLUMN failure_reason text;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE documents DROP COLUMN IF EXISTS failure_reason;`);
};
