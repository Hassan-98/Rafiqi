import { Flame, Trophy } from 'lucide-react';
import { Medallion } from '@/components/ui/Ornament';
import { toArabicDigits } from '@/services/statsService';

const LADDER = [3, 7, 14, 21, 30, 40, 60, 100, 150, 200, 365];

interface StreakPanelProps {
  current: number;
  best: number;
  /** Plural-aware unit, e.g. days(n) → "٥ أيام". */
  unit: (n: number) => string;
  /** What the streak counts, e.g. "الصلوات الخمس". */
  label: string;
  /** Whether today (or tonight) already counts. */
  activeToday?: boolean;
  /** Extra line (e.g. total active days). */
  hint?: string;
}

/**
 * Current vs best streak with the next round-number milestone — the gold
 * seal holds the live run, the bar shows how close it is to the record.
 */
export function StreakPanel({ current, best, unit, label, activeToday, hint }: StreakPanelProps) {
  const next = LADDER.find((m) => m > current) ?? current + 30;
  const isBest = current > 0 && current >= best;
  const toBest = best > 0 ? Math.min(1, current / best) : 0;

  return (
    <div className="rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4 flex items-center gap-4">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <Medallion size={78} tone="gold" className="text-gold-dark dark:text-gold-light">
          <span className="text-[26px]">{toArabicDigits(current)}</span>
        </Medallion>
        <span className="text-[10px] font-semibold text-text-muted inline-flex items-center gap-0.5">
          <Flame size={10} className="text-gold" /> السلسلة الحالية
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[13px] font-bold text-text-primary dark:text-text-on-dark text-pretty">
          {current === 0
            ? `ابدأ سلسلة جديدة في ${label}`
            : isBest
              ? `${unit(current)} — أطول سلسلة لك`
              : `${unit(current)} من ${label}`}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <Trophy size={12} className="text-gold shrink-0" />
          <span>
            الأطول: <span className="font-counter font-semibold text-text-secondary dark:text-text-on-dark/85">{unit(best)}</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-track overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-[image:var(--gradient-gold)] transition-[width] duration-500"
            style={{ width: `${Math.round(toBest * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-text-muted text-pretty">
          {activeToday === false && current > 0 ? 'لم يُحتسب اليوم بعد — ' : ''}
          العلامة القادمة: <span className="font-counter">{unit(next)}</span>
          {current > 0 ? ` (باقي ${unit(next - current)})` : ''}
          {hint ? ` · ${hint}` : ''}
        </p>
      </div>
    </div>
  );
}
