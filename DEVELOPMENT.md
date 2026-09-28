# CourseMind — monorepo (pnpm + Turborepo)

TypeScript workspaces in `apps/*` and `packages/*`; the Python ingestion service in `services/ingest-eval`.

```bash
pnpm install        # install workspace deps
pnpm typecheck      # tsc --noEmit across TS packages
pnpm lint           # eslint
pnpm test           # vitest
```

Copy `.env.example` to `.env` before running services. Structure: see [SDD §11](./docs/SDD.md#11-monorepo-layout-target).
