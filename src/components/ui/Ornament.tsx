import type { ReactNode } from 'react';

/**
 * Islamic ornament kit (redesign 2026-09). Every piece draws in
 * `currentColor`, so it takes the palette through a text-* class
 * (text-gold for ornament, text-teal for accent).
 *
 *  - <Star8/>        eight-pointed star (khatam / rub el-hizb)
 *  - <Medallion/>    a number or icon set inside an 8-point star seal
 *  - <OrnamentRule/> hairline · star · hairline divider
 *  - <ArchMotif/>    faint mihrab-arch outline for hero corners
 *  - <SectionTitle/> the shared section header (star + title + action)
 */

const STAR = 'M12 1l3.2 7.8L23 12l-7.8 3.2L12 23l-3.2-7.8L1 12l7.8-3.2z';
const STAR_ROT = 'M4.2 4.2L12 7.4l7.8-3.2-3.2 7.8 3.2 7.8L12 16.6l-7.8 3.2 3.2-7.8z';

export function Star8({
  size = 14,
  className = '',
  filled = true,
}: {
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? 0 : 1.4}
      strokeLinejoin="round"
    >
      <path d={STAR} />
      <path d={STAR_ROT} />
    </svg>
  );
}

/** Value inside an 8-point seal — streaks, counts, ranks. */
export function Medallion({
  children,
  size = 56,
  tone = 'gold',
  className = '',
}: {
  children: ReactNode;
  size?: number;
  tone?: 'gold' | 'teal' | 'onAccent';
  className?: string;
}) {
  const ring =
    tone === 'gold' ? 'text-gold' : tone === 'teal' ? 'text-teal dark:text-teal-light' : 'text-on-accent';
  const fill =
    tone === 'gold'
      ? 'text-gold/12'
      : tone === 'teal'
        ? 'text-teal/10'
        : 'text-on-accent/12';
  return (
    <span
      className={['relative inline-flex items-center justify-center shrink-0', className].join(' ')}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className={['absolute inset-0 w-full h-full', fill].join(' ')} aria-hidden>
        <path d={STAR} fill="currentColor" />
        <path d={STAR_ROT} fill="currentColor" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className={['absolute inset-0 w-full h-full', ring].join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.9}
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={STAR} />
        <path d={STAR_ROT} />
      </svg>
      <span className="relative font-counter font-bold leading-none">{children}</span>
    </span>
  );
}

export function OrnamentRule({ className = '' }: { className?: string }) {
  return (
    <div className={['flex items-center gap-2.5 text-gold', className].join(' ')} aria-hidden>
      <span className="flex-1 h-px bg-gradient-to-l from-current to-transparent opacity-40" />
      <Star8 size={10} />
      <span className="flex-1 h-px bg-gradient-to-r from-current to-transparent opacity-40" />
    </div>
  );
}

/** A faint pointed-arch outline (mihrab) — decorative, for hero cards. */
export function ArchMotif({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 160"
      className={['pointer-events-none', className].join(' ')}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      aria-hidden
    >
      <path d="M8 160V70C8 38 34 14 60 4c26 10 52 34 52 66v90" />
      <path d="M20 160V74c0-26 20-46 40-56 20 10 40 30 40 56v86" opacity={0.6} />
      <path d="M60 4v12" opacity={0.6} />
      <circle cx="60" cy="24" r="3" opacity={0.6} />
    </svg>
  );
}

/** Shared section header: gold star · title (· subtitle) · trailing action. */
export function SectionTitle({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={['flex items-end justify-between gap-3 px-1', className].join(' ')}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary dark:text-text-on-dark">
          <Star8 size={11} className="text-gold shrink-0" />
          <span className="truncate">{title}</span>
        </h2>
        {subtitle ? <p className="text-xs text-text-muted mt-0.5 ms-5">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
