---
name: ask-sse-contract
description: The SSE event contract for POST /courses/:id/ask that the chat UI (Task C) consumes
metadata:
  type: project
---

`POST /courses/:id/ask` streams answers as Server-Sent Events. The authoritative
contract lives as a doc comment in `apps/api/src/ask/ask.events.ts` (the `AskEvent`
union). Task C (apps/web chat UI) is built against it.

**Why:** M3 Task B Slice 1 (grounded answering) had to define a stable streaming
contract before the frontend could consume it.

**How to apply:** Event order is always `token*` (deltas: `{delta}`) → `citations`
(exactly one: `{citations:[{document_id,page,chunk_id}]}`) → `done`
(`{finishReason: stop|refusal|error, usage:{promptTokens,completionTokens}}`).
Refusal path (FR-12) streams the one refusal sentence as a single `token`, empty
citations, then `done`/refusal — LLM never called. If you change the contract,
update Task C. Slice 2 (persistence, rate limit, consent) was deferred.
