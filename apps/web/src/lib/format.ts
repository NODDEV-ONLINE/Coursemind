/** "0.4 KB", "3.1 KB", "38 KB" — one decimal under 10 KB, whole numbers above. */
export function formatKB(bytes: number): string {
  const kb = Math.max(0, bytes) / 1024;
  if (kb < 10) return `${(Math.round(kb * 10) / 10).toFixed(1)} KB`;
  return `${Math.round(kb)} KB`;
}

/** Screen-reader form of {@link formatKB}: "3.1 kilobytes". */
export function formatKBSpoken(bytes: number): string {
  return formatKB(bytes).replace('KB', 'kilobytes');
}

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function formatClock(epochMs: number): string {
  return clock.format(epochMs);
}

/** 100 → "1:40". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
