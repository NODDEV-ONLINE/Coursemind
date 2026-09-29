import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');

// The monorepo keeps ONE `.env` at the repo root (DEVELOPMENT.md). Next only reads
// app-local env files by default, so load the root one too. Server-only values
// (API_URL, DEMO_USER_ID) never reach the browser: nothing here is NEXT_PUBLIC_.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root so tracing/bundling never walks above the monorepo.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // Low-data (FR-14, NFR-2): the chat ships no raster images, so skip the
  // image-optimisation pipeline entirely.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
