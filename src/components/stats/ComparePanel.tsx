import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { StatsPanel } from './StatsPanel';
import { toArabicDigits, periodDelta, CHART } from '@/services/statsService';

export interface CompareRow {
  label: string;
  now: number;
  prev: number;
  format?: (v: number) => string;
  /** Lower is better (e.g. missed prayers). */
  inverse?: boolean;
}

interface ComparePanelProps {
  rows: CompareRow[];
  /** e.g. "هذا الأسبوع" / range label. */
  nowLabel: string;
  prevLabel?: string;
  title?: string;
}

/**
 * This period vs the previous one — paired bars per metric with a delta chip.
 * Bars share one scale per row so the difference is visible, not just stated.
 */
export function ComparePanel({ rows, nowLabel, prevLabel = 'الفترة السابقة', title = 'مقارنة بالفترة السابقة' }: ComparePanelProps) {
  const visible = rows.filter((r) => r.now > 0 || r.prev > 0);
  return (
    <StatsPanel
      title={title}
      icon={<ArrowLeftRight size={16} />}
      action={
        <span className="flex items-center gap-2 text-[10px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal" /> {nowLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gold/60" /> {prevLabel}
          </span>
        </span>
      }
    >
      {visible.length === 0 ? (
        <p className="text-[12px] text-text-muted text-center py-4">لا بيانات كافية للمقارنة بعد.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => {
            const fmt = r.format ?? ((v: number) => toArabicDigits(Math.round(v)));
            const max = Math.max(1, r.now, r.prev);
            const d = periodDelta(r.now, r.prev);
            const good = r.inverse ? r.now <= r.prev : r.now >= r.prev;
            const same = r.now === r.prev;
            return (
              <div key={r.label} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-[12px] font-semibold text-text-secondary dark:text-text-on-dark/85 truncate">
                    {r.label}
                  </span>
                  <span className="text-[12px] font-counter font-bold text-text-primary dark:text-text-on-dark tabular-nums">
                    {fmt(r.now)}
                  </span>
                  <span
                    className={[
                      'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-12 justify-center',
                      same
                        ? 'bg-track text-text-muted'
                        : good
                          ? 'bg-teal/10 text-teal dark:text-teal-light'
                          : 'bg-danger/10 text-danger',
                    ].join(' ')}
                  >
                    {same ? <Minus size={10} /> : r.now > r.prev ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {same ? 'ثابت' : r.prev === 0 ? 'جديد' : `${toArabicDigits(Math.abs(d.pct))}٪`}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5" aria-hidden>
                  <span className="h-2 rounded-full bg-track overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(r.now / max) * 100}%`, background: CHART.teal }} />
                  </span>
                  <span className="h-1.5 rounded-full bg-track overflow-hidden">
                    <span
                      className="block h-full rounded-full opacity-60"
                      style={{ width: `${(r.prev / max) * 100}%`, background: CHART.gold }}
                    />
                  </span>
                </div>
                <span className="text-[10px] text-text-muted">
                  {prevLabel}: <span className="font-counter">{fmt(r.prev)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </StatsPanel>
  );
}
