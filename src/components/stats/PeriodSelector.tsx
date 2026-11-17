import { ChevronRight, ChevronLeft, RotateCcw } from 'lucide-react';
import { useStatsRange } from '@/stats/StatsContext';
import type { StatsPeriod } from '@/services/statsService';

const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: 'day', label: 'يومي' },
  { id: 'week', label: 'أسبوعي' },
  { id: 'month', label: 'شهري' },
  { id: 'year', label: 'سنوي' },
];

/**
 * Sticky RTL period control: a segmented switch (يومي/أسبوعي/شهري/سنوي) plus a
 * prev/next range stepper with the resolved Arabic range label. Self-contained
 * — reads and writes the shared {@link useStatsRange} context.
 *
 * RTL note: stepping "back in time" advances to the RIGHT, "forward" to the
 * LEFT, so the right chevron goes to the previous (older) period.
 */
export function PeriodSelector({
  sticky = true,
  top = 'calc(var(--safe-top) + 3.5rem)',
}: {
  sticky?: boolean;
  /** Sticky offset — defaults to just under the TopAppBar. */
  top?: string;
} = {}) {
  const { period, range, setPeriod, step, canStepNext, reset } = useStatsRange();

  return (
    <div
      className={[
        sticky ? 'sticky top-0 z-20 -mx-4 px-4 bg-cream/90 dark:bg-dark-bg/90 backdrop-blur-md' : '',
        'py-2.5 flex flex-col gap-2',
      ].join(' ')}
      style={sticky ? { top } : undefined}
    >
      {/* Segmented period switch */}
      <div className="flex gap-1 p-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface" role="radiogroup" aria-label="الفترة">
        {PERIODS.map((p) => {
          const on = period === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPeriod(p.id)}
              className={[
                'flex-1 min-h-9 rounded-xl text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200',
                on
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-secondary dark:text-text-on-dark/70 hover:text-teal',
              ].join(' ')}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Range stepper */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="الفترة السابقة"
          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl text-teal dark:text-teal-light hover:bg-teal/10"
        >
          <ChevronRight size={20} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary dark:text-text-on-dark font-display">
            {range.label}
          </span>
          <button
            type="button"
            onClick={reset}
            aria-label="العودة إلى اليوم"
            className="min-w-8 min-h-8 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-teal transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canStepNext}
          aria-label="الفترة التالية"
          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl text-teal dark:text-teal-light hover:bg-teal/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={20} />
        </button>
      </div>
    </div>
  );
}
