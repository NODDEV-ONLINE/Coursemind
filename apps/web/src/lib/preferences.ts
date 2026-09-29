import { createStorageStore } from './store';

/**
 * Low-data mode preference (FR-14, NFR-2). Persisted per device; ON by default —
 * the target users are on metered mobile data. When on, the ask request carries
 * `?lowData=1` (compact answer) and the heading webfont is skipped.
 */
export const LOW_DATA_KEY = 'cm.lowData';

export const lowDataStore = createStorageStore<boolean>({
  area: 'local',
  key: LOW_DATA_KEY,
  parse: (raw) => raw !== '0',
  serialize: (on) => (on ? '1' : '0'),
});

export function setLowData(on: boolean): void {
  lowDataStore.set(on);
  try {
    if (on) document.documentElement.dataset.lowData = '1';
    else delete document.documentElement.dataset.lowData;
  } catch {
    // no DOM (tests / SSR)
  }
}

/**
 * Inline <head> script: marks <html data-low-data="1"> before first paint so the
 * heading webfont is never requested in low-data mode. Keep it tiny.
 */
export const LOW_DATA_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(LOW_DATA_KEY)})!=='0')document.documentElement.dataset.lowData='1'}catch(e){document.documentElement.dataset.lowData='1'}`;
