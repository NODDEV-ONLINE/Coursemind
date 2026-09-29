---
name: api-runtime-tsx
description: Why the apps/api Docker image runs the compiled API under tsx instead of plain node
metadata:
  type: project
---

The `apps/api` Docker image runs `tsx dist/main.js` (tsx installed globally via npm in the runtime stage), NOT `node dist/main.js`.

**Why:** `@coursemind/config`'s package.json sets `main`/`types`/`exports` to raw TypeScript source (`./src/index.ts`). Plain `node dist/main.js` fails at runtime with `ERR_MODULE_NOT_FOUND` because the config export resolves to a `.ts` file (and its `./env.js` import doesn't exist as JS in `src/`). This means `pnpm start` / `node dist/main.js` is broken outside a TS-aware runtime — a pre-existing source/packaging issue, not something the Docker work introduced. Fixing it properly would require editing `packages/config/package.json` (point exports at built `dist/`), which was out of scope for the E6 task (source/package config changes forbidden).

**How to apply:** If you later make the config package publish a real build (exports → `dist/`), the API image can switch back to plain `node` and drop the tsx dependency. Running the *compiled* `dist/main.js` (decorators already emitted by tsc) under tsx works because tsx only transpiles the `.ts` files it loads (config's decorator-free source); running the API *source* directly under tsx fails because esbuild doesn't honor NestJS `experimentalDecorators`/`emitDecoratorMetadata`. So: build with tsc, run the JS under tsx.
