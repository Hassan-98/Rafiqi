import { CalendarDays } from 'lucide-react';
import { StatsPanel } from './StatsPanel';
import { BarChart } from './BarChart';
import { WEEKDAY_LABELS_AR, WEEKDAY_SHORT_AR, WEEK_ORDER_SAT_FIRST, toArabicDigits, CHART } from '@/services/statsService';

interface WeekdayPanelProps {
  /** Seven values indexed by JS getDay() (0 = Sunday). */
  values: number[];
  title?: string;
  subtitle?: string;
  formatValue?: (v: number) => string;
  /** Qiyam: a night keyed Thursday is «ليلة الجمعة» — label by the following day. */
  nights?: boolean;
  /** Minimum total before a "best day" sentence is shown. */
  minTotal?: number;
}

/**
 * Weekday pattern: Saturday→Friday bars with the strongest day in gold and a
 * plain-language read ("أقوى أيامك: الجمعة · أضعفها: الثلاثاء").
 */
export function WeekdayPanel({
  values,
  title = 'نمط أيام الأسبوع',
  subtitle,
  formatValue = (v) => toArabicDigits(Math.round(v)),
  nights = false,
  minTotal = 3,
}: WeekdayPanelProps) {
  const name = (wd: number) => (nights ? `ليلة ${WEEKDAY_LABELS_AR[(wd + 1) % 7]}` : WEEKDAY_LABELS_AR[wd]);
  const short = (wd: number) => (nights ? WEEKDAY_SHORT_AR[(wd + 1) % 7] : WEEKDAY_SHORT_AR[wd]);
  const total = values.reduce((s, v) => s + v, 0);
  const max = Math.max(...values);
  const best = values.indexOf(max);
  const positive = values.map((v, i) => [v, i] as const).filter(([v]) => v >= 0);
  const worst = positive.reduce((m, x) => (x[0] < m[0] ? x : m), positive[0])[1];

  return (
    <StatsPanel title={title} subtitle={subtitle} icon={<CalendarDays size={16} />}>
      <BarChart
        data={WEEK_ORDER_SAT_FIRST.map((wd) => ({
          label: short(wd),
          value: values[wd],
          color: CHART.teal,
          highlight: total > 0 && wd === best,
        }))}
        height={120}
        formatValue={formatValue}
      />
      {total >= minTotal && max > 0 ? (
        <p className="text-[12px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
          أقوى أيامك: <span className="font-bold text-gold-dark dark:text-gold-light">{name(best)}</span>
          {values[worst] < max ? (
            <>
              {' '}· أضعفها: <span className="font-semibold">{name(worst)}</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-[11px] text-text-muted">تظهر أنماطك بعد أيام قليلة من التسجيل.</p>
      )}
    </StatsPanel>
  );
}
