import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from '@/lib/motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { toArabicDigits, CHART } from '@/services/statsService';

export interface StatTileProps {
  value: ReactNode;
  label: string;
  delta?: { pct: number; positive: boolean; neutral?: boolean };
  spark?: number[];
  icon?: ReactNode;
  accent?: 'teal' | 'gold';
  to?: string;
  onClick?: () => void;
  /** Small secondary line under the value (e.g. "من ٣٠ يوماً"). */
  hint?: ReactNode;
}

/**
 * The atomic KPI card of the stats section: a big tabular-nums number, an
 * Arabic label, and optional delta badge / sparkline / icon. Tappable when
 * `to` (route) or `onClick` is provided.
 */
export function StatTile({ value, label, delta, spark, icon, accent = 'teal', to, onClick, hint }: StatTileProps) {
  const navigate = useNavigate();
  const interactive = !!to || !!onClick;

  const accentText = accent === 'gold' ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light';
  const chip = accent === 'gold' ? 'bg-gold/15' : 'bg-teal/10 dark:bg-teal/15';
  const accentColor = accent === 'gold' ? CHART.gold : CHART.teal;

  const handleClick = () => {
    if (onClick) onClick();
    else if (to) navigate(to);
  };

  return (
    <motion.div
      whileTap={interactive ? { scale: 0.97 } : undefined}
      onClick={interactive ? handleClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={[
        'rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] p-3 flex flex-col gap-1.5 min-w-0',
        interactive ? 'cursor-pointer hover:ring-teal/25 transition-shadow' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-text-muted font-medium leading-tight">{label}</span>
        {icon ? (
          <span className={`w-6 h-6 rounded-lg inline-flex items-center justify-center shrink-0 ${chip} ${accentText}`}>
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-1">
        <span className={`text-xl font-bold font-counter tabular-nums leading-tight ${accentText}`}>{value}</span>
        {spark && spark.length > 1 ? <Sparkline points={spark} color={accentColor} width={48} height={18} fill /> : null}
      </div>
      {hint ? <span className="text-[10px] text-text-muted leading-tight -mt-1">{hint}</span> : null}

      {delta && !delta.neutral ? (
        <span
          className={[
            'inline-flex items-center gap-0.5 text-[10px] font-bold w-fit px-1.5 py-0.5 rounded-full',
            delta.positive ? 'text-teal bg-teal/10 dark:text-teal-light' : 'text-danger bg-danger/10',
          ].join(' ')}
        >
          {delta.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {toArabicDigits(Math.abs(delta.pct))}٪
        </span>
      ) : null}
    </motion.div>
  );
}
