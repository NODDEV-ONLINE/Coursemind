/**
 * CourseMind mark + wordmark, as inline SVG (no raster in the critical path, FR-14).
 * NOTE: the mark is the design canvas's hand-drawn approximation; swap in the
 * official SVG master when brand/BRAND.md's TODO lands.
 */
export function LogoMark({ size = 28, withSpine = true }: { size?: number; withSpine?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <polyline
        points="39,12 24,4 8,13 8,35 24,44 39,36"
        fill="none"
        className="stroke-text"
        strokeWidth="7"
      />
      {withSpine && <polygon points="17,17 22,15 22,33 17,31" className="fill-text" />}
      <rect x="27" y="18" width="11" height="3" rx="1" className="fill-accent-500" />
      <rect x="27" y="23" width="11" height="3" rx="1" className="fill-accent-500" />
      <rect x="27" y="28" width="11" height="3" rx="1" className="fill-accent-500" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      Course<span className="text-accent-400">Mind</span>
    </span>
  );
}
