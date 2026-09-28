/**
 * Shared retrieval client — the single home for vector search + course-scoping,
 * used by both the API and the MCP server (CLAUDE.md §1: "Retrieval has one home").
 *
 * Implemented in Milestone 3 (Retrieval + chat). Ingestion (M2) only *writes*
 * embeddings; it does not query them.
 */

export const RETRIEVAL_PLACEHOLDER = true;
