import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig keeps `jsx: react-jsx` for Next; tell esbuild the same for tests.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.join(appDir, 'src'),
      // `server-only` throws outside a React Server bundle; tests import the
      // route handlers directly, so swap in an empty module.
      'server-only': path.join(appDir, 'test/stubs/server-only.ts'),
    },
  },
  test: {
    // Pure logic + route handlers run in node; component tests opt into jsdom
    // with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
