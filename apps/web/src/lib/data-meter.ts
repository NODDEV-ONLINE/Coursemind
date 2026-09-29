import { readStorage, writeStorage, type ExternalStore } from './store';

/**
 * Session data meter (FR-14, NFR-2): approximate bytes received this browser
 * session, split into answer streams, source passages, and the app itself.
 *
 * Answers/sources are counted from response bodies as they are read (decoded
 * size, so it slightly over-estimates compressed transfers). App bytes come from
 * the Resource Timing API's transferSize (0 for cached files — which is the point).
 */
export type MeterCategory = 'answers' | 'sources';

export interface DataUsage {
  answers: number;
  sources: number;
  app: number;
}

const KEY = 'cm.dataMeter';
const listeners = new Set<() => void>();
let usage: DataUsage | null = null;

function load(): DataUsage {
  try {
    const raw = readStorage('session', KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'answers' in parsed &&
      'sources' in parsed &&
      typeof parsed.answers === 'number' &&
      typeof parsed.sources === 'number'
    ) {
      return { answers: parsed.answers, sources: parsed.sources, app: 0 };
    }
  } catch {
    // corrupt value: start fresh
  }
  return { answers: 0, sources: 0, app: 0 };
}

function current(): DataUsage {
  usage ??= load();
  return usage;
}

function commit(next: DataUsage): void {
  usage = next;
  writeStorage('session', KEY, JSON.stringify({ answers: next.answers, sources: next.sources }));
  listeners.forEach((l) => l());
}

export function recordBytes(category: MeterCategory, bytes: number): void {
  if (!(bytes > 0)) return;
  const u = current();
  commit({ ...u, [category]: u[category] + bytes });
}

/** Bytes the app shell itself cost (HTML, JS, CSS, fonts), excluding API calls. */
export function measureAppBytes(): number {
  try {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) return 0;
    let total = 0;
    for (const e of performance.getEntriesByType('navigation')) {
      total += (e as PerformanceNavigationTiming).transferSize || 0;
    }
    for (const e of performance.getEntriesByType('resource')) {
      const r = e as PerformanceResourceTiming;
      if (r.name.includes('/api/')) continue; // counted precisely above
      total += r.transferSize || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export function refreshAppBytes(): void {
  const app = measureAppBytes();
  const u = current();
  if (app !== u.app) {
    usage = { ...u, app };
    listeners.forEach((l) => l());
  }
}

export function totalBytes(u: DataUsage): number {
  return u.answers + u.sources + u.app;
}

export const dataMeterStore: ExternalStore<DataUsage> = {
  get: current,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Test helper: forget in-memory totals. */
export function resetDataMeter(): void {
  usage = null;
}
