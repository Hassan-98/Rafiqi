import type { ReactNode } from 'react';

/**
 * Minimal progress ring drawn in currentColor — colour it with text-* classes
 * (`className` for the arc, `trackClassName` for the track) so it follows the
 * palette in every theme.
 */
export function Ring({
  value,
  size = 44,
  stroke = 8,
  className = 'text-teal dark:text-teal-light',
  trackClassName = 'text-cream-dark dark:text-dark-surface',
  children,
}: {
  /** 0–1 */
  value: number;
  size?: number;
  /** In viewBox units (of 100). */
  stroke?: number;
  className?: string;
  trackClassName?: string;
  children?: ReactNode;
}) {
  const r = 50 - stroke / 2;
  const v = Math.min(1, Math.max(0, value));
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - v * 100}
          className={['transition-[stroke-dashoffset] duration-500 ease-out-soft motion-reduce:transition-none', className].join(' ')}
          opacity={v === 0 ? 0 : 1}
        />
      </svg>
      {children != null ? <span className="relative">{children}</span> : null}
    </span>
  );
}
