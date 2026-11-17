import { useEffect, useMemo, useRef } from 'react';
import type { HeatmapCell } from '@/types';
import { WEEKDAY_SHORT_AR, toArabicDigits } from '@/services/statsService';
import { parseISO, getDay } from 'date-fns';

interface ScaleStop {
  stop: number; // value >= stop → className (evaluate high→low)
  className: string;
}

interface CalendarHeatmapProps {
  cells: HeatmapCell[]; // ordered by date asc
  mode?: 'gradient' | 'discrete';
  scale?: ScaleStop[];
  onSelectDay?: (dateKey: string) => void;
  legendLabels?: [string, string];
}

const ARABIC_MONTHS_SHORT = [
  'ينا', 'فبر', 'مار', 'أبر', 'مايو', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
];

function gradientClass(value: number): string {
  if (value <= 0) return 'bg-track';
  if (value < 0.25) return 'bg-teal/25';
  if (value < 0.5) return 'bg-teal/45';
  if (value < 0.75) return 'bg-teal/70';
  if (value < 1) return 'bg-teal';
  return 'bg-teal ring-1 ring-gold/70';
}

/**
 * GitHub-style contribution calendar. Columns are weeks (Saturday→Friday
 * top-to-bottom), with month labels above and a weekday rail. Supports a
 * continuous gradient or a discrete colour scale (e.g. prayers 5/5 vs partial
 * vs none). Tap a day to drill in via `onSelectDay`.
 */
export function CalendarHeatmap({
  cells,
  mode = 'gradient',
  scale,
  onSelectDay,
  legendLabels = ['أقل', 'أكثر'],
}: CalendarHeatmapProps) {
  const { weeks, monthSpans } = useMemo(() => {
    if (cells.length === 0) return { weeks: [] as HeatmapCell[][], monthSpans: [] as { label: string; span: number }[] };
    // Pad the front so the first cell lands on its correct weekday row.
    const firstDay = getDay(parseISO(cells[0].date)); // 0=Sun..6=Sat
    // Our column runs Sat(6)→Fri(5): map weekday to row index where Sat=0.
    const rowOf = (wd: number) => (wd + 1) % 7; // Sat→0, Sun→1, ... Fri→6
    const padded: (HeatmapCell | null)[] = [];
    for (let i = 0; i < rowOf(firstDay); i++) padded.push(null);
    padded.push(...cells);
    while (padded.length % 7 !== 0) padded.push(null);

    const wk: (HeatmapCell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) wk.push(padded.slice(i, i + 7));

    // Month labels per week column (based on the first real cell in the week).
    const spans: { label: string; span: number }[] = [];
    let lastMonth = -1;
    for (const week of wk) {
      const firstReal = week.find((c) => c);
      const m = firstReal ? parseISO(firstReal.date).getMonth() : lastMonth;
      if (m !== lastMonth) {
        spans.push({ label: ARABIC_MONTHS_SHORT[m] ?? '', span: 1 });
        lastMonth = m;
      } else if (spans.length) {
        spans[spans.length - 1].span += 1;
      }
    }
    return { weeks: wk as HeatmapCell[][], monthSpans: spans };
  }, [cells]);

  // Open on the most recent weeks (the far, inline-end side in RTL).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = getComputedStyle(el).direction === "rtl" ? -el.scrollWidth : el.scrollWidth;
  }, [cells]);

  const classFor = (value: number): string => {
    if (mode === 'discrete' && scale) {
      const sorted = [...scale].sort((a, b) => b.stop - a.stop);
      return sorted.find((s) => value >= s.stop)?.className ?? 'bg-track';
    }
    return gradientClass(value);
  };

  if (cells.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">لا توجد بيانات</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={scroller} className="flex flex-col gap-1.5 overflow-x-auto no-scrollbar">
      {/* Month labels */}
      <div className="flex gap-1 ps-5">
        {monthSpans.map((m, i) => (
          <span
            key={i}
            className="text-[9px] text-text-muted"
            style={{ width: `calc(${m.span} * (0.75rem + 0.25rem))`, minWidth: `calc(${m.span} * 1rem)` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex gap-1">
        {/* Weekday rail (Sat→Fri) */}
        <div className="flex flex-col gap-1 me-1">
          {[6, 0, 1, 2, 3, 4, 5].map((wd, i) => (
            <span key={i} className="w-3 h-3 text-[8px] text-text-muted flex items-center justify-center">
              {WEEKDAY_SHORT_AR[wd]}
            </span>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((cell, di) => {
                if (!cell) return <div key={di} className="w-3 h-3" />;
                const interactive = !!onSelectDay;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!interactive}
                    onClick={interactive ? () => onSelectDay!(cell.date) : undefined}
                    title={`${cell.date}${cell.label ? ` · ${cell.label}` : ''}`}
                    className={[
                      'w-3 h-3 rounded-[3px] transition-transform',
                      classFor(cell.value),
                      interactive ? 'hover:scale-125 cursor-pointer' : '',
                    ].join(' ')}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      </div>
      {/* Legend */}
      <div className="flex items-center gap-1 text-[9px] text-text-muted ps-5">
        <span>{legendLabels[0]}</span>
        {(mode === 'discrete' && scale
          ? scale.map((s) => s.className)
          : [0, 0.25, 0.5, 0.75, 1].map((v) => gradientClass(v))
        ).map((cls, i) => (
          <div key={i} className={`w-2.5 h-2.5 rounded-[3px] ${cls}`} />
        ))}
        <span>{legendLabels[1]}</span>
        <span className="ms-auto font-counter">{toArabicDigits(cells.filter((c) => c.value > 0).length)} يوم نشط</span>
      </div>
    </div>
  );
}
