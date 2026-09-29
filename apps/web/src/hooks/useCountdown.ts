'use client';

import { useEffect, useState } from 'react';

/** Seconds remaining until `until` (epoch ms), ticking once a second; 0 when past. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  if (until === null) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}
