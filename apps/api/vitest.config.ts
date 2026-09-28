import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * NestJS relies on `emitDecoratorMetadata` for constructor-based DI. Vitest's
 * default esbuild transform does not emit decorator metadata, so tests that
 * build a Nest testing module fail to resolve injected providers. The SWC plugin
 * restores that metadata (the NestJS-recommended Vitest setup).
 */
export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
