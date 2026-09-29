import { afterEach } from 'vitest';

// RTL only auto-cleans when test globals are on; we keep globals off, so unmount
// rendered trees ourselves (only relevant in jsdom test files).
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
