import { useMemo } from 'react';
import { dateKeyOf, toArabicDigits, WEEKDAY_SHORT_AR } from '@/services/statsService';

export interface MonthCalendarCell {
  /** yyyy-MM-dd */
  date: string;
  /** The day's aggregate value (count, %, etc). 0 = nothing recorded. */
  value: number;
  /** true when the day's goal was fully met (renders a gold "done" ring). */
  complete?: boolean;
}

interface MonthCalendarProps {
  cells: MonthCalendarCell[]; // ordered ascending, all within one month
  onSelectDay?: (dateKey: string) => void;
  /** Scale ceiling for colour intensity (defaults to the max value present). */
  max?: number;
  /** Formats the small count printed under active days. */
  formatValue?: (v: number) => string;
  /** Hide the tiny per-day count (e.g. when value is a %). */
  showCounts?: boolean;
}

/** Islamic week runs Saturday → Friday. Column index for a JS weekday. */
const colOf = (weekday: number) => (weekday + 1) % 7; // Sat→0 … Fri→6
const HEADER_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Sat … Fri, indexes into WEEKDAY_SHORT_AR

function weekdayOf(dateKey: string): number {
  // Parse at noon to dodge timezone drift on the yyyy-MM-dd key.
  return new Date(`${dateKey}T12:00:00`).getDay();
}

/**
 * A full month grid (7 columns, Saturday→Friday) where every day shows its
 * number and — when there's activity — a teal intensity wash plus the day's
 * count. Today is ringed; days that hit their goal get a gold ring; future
 * days are dimmed. Tap a day to drill into its detail sheet.
 *
 * Unlike the tiny GitHub-style {@link CalendarHeatmap} (better for a whole
 * year), this is the readable, number-bearing calendar the month view wants.
 */
export function MonthCalendar({
  cells,
  onSelectDay,
  max,
  formatValue = (v) => toArabicDigits(Math.round(v)),
  showCounts = true,
}: MonthCalendarProps) {
  const todayKey = dateKeyOf(new Date());
  const ceil = max ?? Math.max(1, ...cells.map((c) => c.value));

  const grid = useMemo(() => {
    if (cells.length === 0) return [] as (MonthCalendarCell | null)[];
    const pad = colOf(weekdayOf(cells[0].date));
    const out: (MonthCalendarCell | null)[] = Array.from({ length: pad }, () => null);
    out.push(...cells);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cells]);

  if (cells.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">لا توجد بيانات</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1">
        {HEADER_ORDER.map((wd) => (
          <span key={wd} className="text-[10px] text-text-muted text-center font-semibold">
            {WEEKDAY_SHORT_AR[wd]}
          </span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} className="aspect-square" />;

          const dayNum = Number(cell.date.slice(8, 10));
          const isToday = cell.date === todayKey;
          const isFuture = cell.date > todayKey;
          const active = cell.value > 0;
          const intensity = active ? 0.16 + 0.6 * Math.min(1, cell.value / ceil) : 0;

          const interactive = !!onSelectDay && !isFuture;
          const Tag = interactive ? 'button' : 'div';

          return (
            <Tag
              key={cell.date}
              {...(interactive
                ? { type: 'button' as const, onClick: () => onSelectDay!(cell.date) }
                : {})}
              className={[
                'aspect-square rounded-xl flex flex-col items-center justify-center gap-0 relative transition-transform bg-cream-dark/35 dark:bg-dark-surface',
                interactive ? 'active:scale-95 cursor-pointer' : '',
                isFuture ? 'opacity-35' : '',
                cell.complete
                  ? 'ring-2 ring-gold/70'
                  : isToday
                    ? 'ring-2 ring-teal'
                    : 'ring-1 ring-black/[0.05] dark:ring-white/[0.06]',
              ].join(' ')}
              style={{
                background: active
                  ? `color-mix(in srgb, var(--color-teal) ${Math.round(intensity * 100)}%, transparent)`
                  : undefined,
              }}
            >
              <span
                className={[
                  'text-[11px] font-counter leading-none tabular-nums',
                  active
                    ? 'font-bold text-text-primary dark:text-text-on-dark'
                    : 'text-text-muted',
                ].join(' ')}
              >
                {toArabicDigits(dayNum)}
              </span>
              {showCounts && active ? (
                <span className="text-[8px] font-counter leading-none mt-0.5 text-teal-dark dark:text-teal-light font-semibold">
                  {formatValue(cell.value)}
                </span>
              ) : null}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
