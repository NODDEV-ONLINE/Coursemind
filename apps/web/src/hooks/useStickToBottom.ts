'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const THRESHOLD_PX = 48;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Auto-scroll for a streaming log: follows new content while the reader is at the
 * bottom; once they scroll up, it stops following and reports `atBottom=false` so
 * the UI can offer "Scroll to latest".
 *
 * @param contentKey - changes whenever content grows (e.g. text length).
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  contentKey: unknown,
): { atBottom: boolean; scrollToLatest: () => void } {
  const [atBottom, setAtBottom] = useState(true);
  const pinned = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD_PX;
      pinned.current = near;
      setAtBottom(near);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  // Follow new content before paint (no visible jump) while pinned.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [ref, contentKey]);

  const scrollToLatest = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [ref]);

  return { atBottom, scrollToLatest };
}
