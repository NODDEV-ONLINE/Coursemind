'use client';

import { useEffect, useState } from 'react';
import { fetchChunk, type ChunkResult } from '@/lib/chunk-client';
import { recordBytes } from '@/lib/data-meter';

export type PassageState = { status: 'loading' } | ChunkResult;

// Session cache: re-opening a source (or paging back to it) costs no data.
const cache = new Map<string, ChunkResult>();

/**
 * Lazily loads one source passage (FR-15) — only when the drawer is open on it,
 * never prefetched (FR-14). 404 → `not_found` ("being updated" state).
 */
export function useSourcePassage(
  courseId: string,
  chunkId: string | null,
): { state: PassageState; reload: () => void } {
  const key = chunkId === null ? null : `${courseId}/${chunkId}`;
  const [result, setResult] = useState<{ key: string; value: ChunkResult } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null || chunkId === null) return;
    const hit = cache.get(key);
    if (hit?.status === 'ok') return;
    const controller = new AbortController();
    fetchChunk({ courseId, chunkId, signal: controller.signal })
      .then((value) => {
        if (value.status === 'ok') {
          cache.set(key, value);
          recordBytes('sources', value.bytes);
        }
        setResult({ key, value });
      })
      .catch(() => {
        // aborted: the drawer closed or moved on
      });
    return () => controller.abort();
  }, [courseId, chunkId, key, attempt]);

  const cached = key === null ? undefined : cache.get(key);
  let state: PassageState = { status: 'loading' };
  if (cached?.status === 'ok') state = cached;
  else if (result !== null && result.key === key && result.value.status !== 'ok') {
    state = result.value;
  }

  return {
    state,
    reload: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** Test helper. */
export function clearPassageCache(): void {
  cache.clear();
}
