import React from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';

interface TopAppBarProps {
  title: string;
  /** Small line under the title (context, date, count…). */
  subtitle?: string;
  showBack?: boolean;
  actions?: React.ReactNode;
  transparent?: boolean;
}

/**
 * Sticky page bar: blurred page-colour glass, a squircle back button, a
 * strong ink title and a gold ornamental keyline instead of a grey border.
 */
export const TopAppBar = React.memo(function TopAppBar({
  title,
  subtitle,
  showBack = false,
  actions,
  transparent = false,
}: TopAppBarProps) {
  const navigate = useNavigate();

  return (
    <header
      className={[
        'sticky top-0 z-30',
        transparent ? 'bg-transparent' : 'bg-cream/85 dark:bg-dark-bg/85 backdrop-blur-xl',
      ].join(' ')}
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex items-center gap-3 px-4 h-14">
        {showBack ? (
          <button
            onClick={() => navigate(-1)}
            aria-label="رجوع"
            className="-ms-1 w-10 h-10 rounded-xl bg-white/80 dark:bg-dark-card/80 ring-1 ring-black/[0.05] dark:ring-white/[0.06] text-teal dark:text-teal-light inline-flex items-center justify-center hover:bg-white dark:hover:bg-dark-card active:scale-95 transition"
          >
            {/* RTL: chevron-right points "back" naturally */}
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
        ) : null}

        <div className="flex-1 min-w-0">
          <h1 className="text-[19px] leading-tight font-bold text-text-primary dark:text-text-on-dark font-display truncate">
            {title}
          </h1>
          {subtitle ? <p className="text-[11px] text-text-muted truncate">{subtitle}</p> : null}
        </div>

        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      {!transparent ? (
        <div
          aria-hidden
          className="h-px mx-4 bg-gradient-to-l from-transparent via-gold/40 to-transparent"
        />
      ) : null}
    </header>
  );
});
