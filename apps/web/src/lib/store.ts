/**
 * Tiny external stores for per-device preferences, read with
 * `useSyncExternalStore` (no hydration mismatch, no setState-in-effect).
 *
 * Browser storage can throw (private mode, blocked site data) or be empty, so
 * every access is guarded and the app works without it.
 */

export type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(kind: StorageArea, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(kind: StorageArea, key: string, value: string | null): void {
  try {
    const s = area(kind);
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage full or blocked: the in-memory value still applies this session.
  }
}

export interface ExternalStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

/**
 * A store over one storage key. The parsed value is cached by its raw string so
 * `get()` is referentially stable between changes (required by
 * useSyncExternalStore), and other tabs' writes are picked up via `storage`.
 */
export function createStorageStore<T>(opts: {
  area: StorageArea;
  key: string;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null;
}): ExternalStore<T> & { set(value: T): void } {
  const listeners = new Set<() => void>();
  let primed = false;
  let lastRaw: string | null = null;
  let lastValue: T;
  // Fallback when storage is unavailable: remember the last write in memory.
  let memoryRaw: string | null | undefined;

  function currentRaw(): string | null {
    const raw = readStorage(opts.area, opts.key);
    if (raw === null && memoryRaw !== undefined) return memoryRaw;
    return raw;
  }

  return {
    get(): T {
      const raw = currentRaw();
      if (!primed || raw !== lastRaw) {
        primed = true;
        lastRaw = raw;
        lastValue = opts.parse(raw);
      }
      return lastValue;
    },
    set(value: T): void {
      const raw = opts.serialize(value);
      memoryRaw = raw;
      writeStorage(opts.area, opts.key, raw);
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      const onStorage = (e: StorageEvent): void => {
        if (e.key === null || e.key === opts.key) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
