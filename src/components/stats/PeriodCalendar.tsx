import { CalendarRange } from 'lucide-react';
import type { StatsPeriod } from '@/services/statsService';
import { toArabicDigits } from '@/services/statsService';
import { StatsPanel } from './StatsPanel';
import { MonthCalendar, type MonthCalendarCell } from './MonthCalendar';
import { CalendarHeatmap } from './CalendarHeatmap';

interface PeriodCalendarProps {
  period: StatsPeriod;
  /** One cell per day of the range; `value` raw, `ratio` 0–1 for the year map. */
  cells: (MonthCalendarCell & { ratio?: number; label?: string })[];
  onSelectDay?: (dateKey: string) => void;
  max?: number;
  formatValue?: (v: number) => string;
  title?: string;
  legend?: [string, string];
}

/**
 * The right calendar for the period: a readable number-bearing month grid
 * for «شهري», a contribution map for «سنوي», nothing for day/week (the
 * trend chart already shows every day).
 */
export function PeriodCalendar({
  period,
  cells,
  onSelectDay,
  max,
  formatValue = (v) => toArabicDigits(Math.round(v)),
  title,
  legend = ['أقل', 'أكثر'],
}: PeriodCalendarProps) {
  if (period === 'day' || period === 'week') return null;
  const action = onSelectDay ? <span className="text-[10px] text-text-muted">اضغط على يوم</span> : null;
  if (period === 'month') {
    return (
      <StatsPanel title={title ?? 'تقويم الشهر'} icon={<CalendarRange size={16} />} action={action}>
        <MonthCalendar cells={cells} onSelectDay={onSelectDay} max={max} formatValue={formatValue} />
      </StatsPanel>
    );
  }
  const ceil = max ?? Math.max(1, ...cells.map((c) => c.value));
  return (
    <StatsPanel title={title ?? 'خريطة السنة'} icon={<CalendarRange size={16} />} action={action}>
      <CalendarHeatmap
        cells={cells.map((c) => ({ date: c.date, value: c.ratio ?? Math.min(1, c.value / ceil), label: c.label }))}
        onSelectDay={onSelectDay}
        legendLabels={legend}
      />
    </StatsPanel>
  );
}
