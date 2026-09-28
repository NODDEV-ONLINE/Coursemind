# CourseMind API (NestJS / TypeScript) — M2 Task E6.
# Build context: the REPOSITORY ROOT (monorepo-aware) — the API depends on the
# workspace package @coursemind/config, so the whole workspace must be present.
#   docker build -t coursemind-api -f apps/api/Dockerfile .
#
# Runtime: `tsx dist/main.js` on :3000. We compile the API to dist/ with tsc
# (NestJS decorators need experimentalDecorators + emitDecoratorMetadata, which
# tsc honors) and run the compiled JS under `tsx`. tsx is used only so the
# workspace import `@coursemind/config` — whose package "exports" points at raw
# TypeScript source (src/index.ts) — resolves at runtime without touching any
# application source. Config comes from env at runtime (SR-4); no secrets baked in.

# ---- Stage 1: build (install full workspace, compile config + api) -----------
FROM node:20-slim AS build
WORKDIR /repo

# Enable the exact pnpm version pinned in package.json's packageManager field.
RUN corepack enable

# Copy workspace manifests first for dependency-layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/

# Install all workspace deps (frozen lockfile = reproducible).
RUN pnpm install --frozen-lockfile

# Copy the sources needed to build the API and its one workspace dependency.
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY apps/api apps/api

# Build @coursemind/config then @coursemind/api (tsc → dist/).
RUN pnpm --filter @coursemind/config build \
    && pnpm --filter @coursemind/api build

# ---- Stage: migrate (one-shot schema apply) ---------------------------------
# Reuses the build stage, which already has the root dev deps installed
# (node-pg-migrate + pg live in the root package.json). Runs `pnpm migrate`
# against DATABASE_URL, then exits — so `docker compose up` yields a ready schema.
FROM build AS migrate
USER root
RUN useradd --create-home --uid 10002 migrator && chown -R migrator:migrator /repo
USER migrator
WORKDIR /repo
CMD ["pnpm", "migrate"]

# ---- Stage 2: runtime (prod deps + compiled output) -------------------------
FROM node:20-slim AS runtime
WORKDIR /repo
RUN corepack enable

ENV NODE_ENV=production

# Manifests again, then install prod deps only (no dev tooling in the image).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --prod

# tsx as the runtime loader (see header). Installed globally with npm so it does
# not touch the workspace lockfile (installed --frozen --prod above).
RUN npm install -g tsx@4.19.2

# Bring in compiled output. @coursemind/config needs its src (the package
# "exports" resolves to src/index.ts) — tsx transpiles it on load.
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages/config/src packages/config/src

# Non-root runtime user, and the shared uploads volume mount point.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /uploads && chown -R appuser:appuser /uploads /repo
USER appuser

ENV UPLOAD_DIR=/uploads \
    PORT=3000
WORKDIR /repo/apps/api
EXPOSE 3000

# Liveness against the Nest /health route.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Run the compiled API under tsx (resolves the TS-source config export).
CMD ["tsx", "dist/main.js"]
