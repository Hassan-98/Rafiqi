import type { ReactNode } from 'react';

interface StatsPanelProps {
  title?: string;
  /** Optional one-line explanation under the title. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Drop the card chrome (used when embedding charts that bring their own). */
  bare?: boolean;
  className?: string;
}

/**
 * A titled content panel used throughout the stats pages — the plain card
 * surface (hairline ring + palette-tinted shadow) with an icon-chip header.
 * Keeps every chart block visually consistent without each page re-styling.
 */
export function StatsPanel({ title, subtitle, icon, action, children, bare = false, className = '' }: StatsPanelProps) {
  return (
    <section
      className={[
        bare
          ? ''
          : 'rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4',
        'flex flex-col gap-3 min-w-0',
        className,
      ].join(' ')}
    >
      {title ? (
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon ? (
              <span className="w-8 h-8 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-text-primary dark:text-text-on-dark text-balance leading-snug">
                {title}
              </h3>
              {subtitle ? <p className="text-[11px] text-text-muted leading-snug text-pretty">{subtitle}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0 pt-1">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
