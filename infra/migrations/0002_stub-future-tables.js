/* eslint-disable */
/**
 * M2 Task B — stub tables for later milestones (SDD §5).
 * Minimal (id + created_at) so migration ordering is stable; full columns are
 * added in M3 (retrieval/chat) and M4 (evaluation). Keeps M2 from over-building.
 */

const STUB_TABLES = [
  'questions',
  'answers',
  'answer_citations',
  'ratings',
  'test_items',
  'eval_runs',
  'consents',
  'audit_log',
];

exports.up = (pgm) => {
  for (const t of STUB_TABLES) {
    pgm.sql(`
      CREATE TABLE IF NOT EXISTS ${t} (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }
};

exports.down = (pgm) => {
  for (const t of [...STUB_TABLES].reverse()) {
    pgm.sql(`DROP TABLE IF EXISTS ${t};`);
  }
};
