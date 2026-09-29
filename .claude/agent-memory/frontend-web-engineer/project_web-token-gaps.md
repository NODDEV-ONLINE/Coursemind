---
name: web-token-gaps
description: Design-canvas colours/radii/type sizes used by apps/web that brand/BRAND.md does not define yet, plus API contract gaps the chat UI works around
metadata:
  type: project
---

BRAND.md only defines the core palette. The v1 design canvas (docs/design/web-app) also
uses surface-raised #262A45, surface-sunken #0E1322, skeleton #1C2138, refused-surface
#17140C, refused-text #FCD58A, error-surface #1A0E12, error-text #FCA5A5, scrim, plus 10/14/20px
radii and 11/13/15/26px type sizes. apps/web names these in `globals.css` under a
"Canvas extensions (NOT yet in BRAND.md)" block; Tailwind's default palette is disabled.

Contract gaps (as of 2026-09-29): the `citations` SSE event has no filename, so chips read
"Doc 1 · p.3" instead of the comp's "L6 · p.3"; no course-metadata endpoint (name, doc
count, topics); no feedback (FR-16) or "tell my lecturer" endpoint.

**Why:** Flagged rather than invented, per the brand-tokens-are-law rule.

**How to apply:** When BRAND.md gains these tokens, move them from the extensions block to
the brand block. If the API adds filenames to citations, update `citationLabel`.
Related: [[web-identity-proxy]].
