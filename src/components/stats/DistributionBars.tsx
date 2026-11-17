import { motion } from '@/lib/motion';
import { toArabicDigits } from '@/services/statsService';

export interface DistributionItem {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

interface DistributionBarsProps {
  items: DistributionItem[];
  formatValue?: (v: number) => string;
  sort?: boolean;
  emptyLabel?: string;
}

/**
 * Ranked horizontal progress bars (label · bar · value) for breakdowns like
 * most-bookmarked surahs, favourites by book, cause frequency, per-counter
 * target utilisation, module coverage.
 */
export function DistributionBars({
  items,
  formatValue = (v) => toArabicDigits(v),
  sort = true,
  emptyLabel = 'لا توجد بيانات بعد',
}: DistributionBarsProps) {
  const rows = sort ? [...items].sort((a, b) => b.value - a.value) : items;
  const globalMax = Math.max(1, ...rows.map((r) => r.max ?? r.value));

  if (rows.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => {
        const max = row.max ?? globalMax;
        const pct = max > 0 ? Math.min(100, (row.value / max) * 100) : 0;
        const color = row.color ?? 'var(--color-teal)';
        return (
          <div key={`${row.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary dark:text-text-on-dark truncate">{row.label}</span>
              <span className="font-counter font-semibold text-text-primary dark:text-text-on-dark shrink-0 ps-2">
                {formatValue(row.value)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-track overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.04 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
