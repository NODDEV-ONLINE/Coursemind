/**
 * Shared retrieval client — the single home for vector search + course-scoping,
 * used by both the API and the MCP server (CLAUDE.md §1: "Retrieval has one home").
 *
 * Public API (M3 Task A). Query embedding goes through the Python ingest service
 * `POST /embed` (ADR-0004); vector search is always course-scoped (SR-2).
 */

export {
  retrieveChunks,
  VECTOR_SEARCH_SQL,
  DEFAULT_TOP_K,
  DEFAULT_SCORE_THRESHOLD,
  EMBEDDING_DIM,
  type RetrievalHit,
  type RetrievalResult,
} from './search.js';

export { embedQuery, toVectorLiteral, QueryEmbeddingError } from './embed.js';
