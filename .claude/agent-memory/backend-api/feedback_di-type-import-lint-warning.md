---
name: di-type-import-lint-warning
description: consistent-type-imports lint warnings on NestJS DI-injected services are expected, not fixable
metadata:
  type: feedback
---

In `apps/api`, `@typescript-eslint/consistent-type-imports` is set to `warn` (see
`eslint.config.mjs`). NestJS constructor DI requires injected services
(ConfigService, DatabaseService, LlmService, CoursesService, etc.) to be **value**
imports so `emitDecoratorMetadata` can capture the type at runtime. ESLint flags
these as "only used as types" but converting them to `import type` breaks DI.

**Why:** The lint rule can't see that decorator metadata needs the runtime import.
Pre-existing service files (courses.service.ts, database.service.ts,
ingest-client.service.ts) already carry these same warnings.

**How to apply:** Leave DI value-imports as value imports; do not run `eslint --fix`
on them. The "nothing merges red" gate (CLAUDE.md §5) means 0 *errors* — these
warnings are acceptable and consistent with the codebase. Only convert imports to
`import type` in files where the symbol is genuinely used only as a type (e.g. test
files casting fakes).
