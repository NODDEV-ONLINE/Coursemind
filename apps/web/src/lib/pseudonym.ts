import { readStorage, writeStorage, type ExternalStore } from './store';

/**
 * Pseudonymous display id (PR-1): `anon-XXXX`, generated on this device and kept in
 * localStorage. No real name is ever asked for or shown. It is display-only for now:
 * it is NOT sent to the server (student identity is a tracked M3 follow-up).
 */
export const PSEUDONYM_KEY = 'cm.pseudonym';

// No 0/O, 1/I/L: easy to read aloud and copy.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PSEUDONYM_RE = /^anon-[A-HJKMNP-Z2-9]{4}$/;

export function isPseudonym(value: string | null): value is string {
  return value !== null && PSEUDONYM_RE.test(value);
}

export function generatePseudonym(
  randomValues: (arr: Uint32Array) => Uint32Array = (arr) => crypto.getRandomValues(arr),
): string {
  const buf = randomValues(new Uint32Array(4));
  let id = '';
  for (const n of buf) id += ALPHABET[n % ALPHABET.length];
  return `anon-${id}`;
}

let cached: string | null = null;

/** Read-or-create; stable for the page's lifetime even if storage is blocked. */
function getPseudonym(): string {
  const stored = readStorage('local', PSEUDONYM_KEY);
  if (isPseudonym(stored)) {
    cached = stored;
    return stored;
  }
  if (cached === null) cached = generatePseudonym();
  writeStorage('local', PSEUDONYM_KEY, cached);
  return cached;
}

export const pseudonymStore: ExternalStore<string> = {
  get: getPseudonym,
  subscribe: () => () => undefined,
};
