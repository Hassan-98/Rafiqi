import { useMemo, type ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { StatsPanel } from './StatsPanel';
import { BarChart, type BarDatum } from './BarChart';
import { LineChart } from './LineChart';
import {
  ARABIC_MONTHS,
  WEEKDAY_SHORT_AR,
  CHART,
  dateKeyOf,
  movingAverage,
  shortDateAr,
  toArabicDigits,
  type DateRange,
} from '@/services/statsService';

interface PeriodTrendProps {
  range: DateRange;
  valueFor: (dateKey: string) => number;
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  formatValue?: (v: number) => string;
  /** Y ceiling (e.g. 100 for %, 5 for prayers). */
  max?: number;
  /** How a year's days roll up into its 12 month bars. */
  yearAggregate?: 'sum' | 'avg';
  /** Month view: a smooth line (continuous data) or scrollable day bars (sparse data). */
  monthStyle?: 'line' | 'bars';
  color?: string;
  onSelectDay?: (dateKey: string) => void;
  /** Content under the chart (legend, a sentence…). */
  footer?: ReactNode;
}

/**
 * The period's trend in the right shape: daily bars for a day/week (tap a
 * bar → that day), a smooth line + 7-day average for a month, and twelve
 * month bars for a year.
 */
export function PeriodTrend({
  range,
  valueFor,
  title,
  subtitle,
  icon = <Activity size={16} />,
  formatValue = (v) => toArabicDigits(Math.round(v)),
  max,
  yearAggregate = 'sum',
  monthStyle = 'line',
  color = CHART.teal,
  onSelectDay,
  footer,
}: PeriodTrendProps) {
  const todayKey = dateKeyOf(new Date());
  const { period, dateKeys } = range;

  const body = useMemo(() => {
    if (period === 'year') {
      const sums = new Array<number>(12).fill(0);
      const counts = new Array<number>(12).fill(0);
      for (const k of dateKeys) {
        const m = Number(k.slice(5, 7)) - 1;
        sums[m] += valueFor(k);
        counts[m] += 1;
      }
      const data: BarDatum[] = sums
        .map((s, m) => ({
          label: ARABIC_MONTHS[m].slice(0, 3),
          value: yearAggregate === 'avg' ? (counts[m] ? s / counts[m] : 0) : s,
          color,
          highlight: m === new Date().getMonth() && dateKeys.includes(todayKey),
        }))
        .filter((_, m) => counts[m] > 0);
      return { kind: 'bars' as const, data, scrollable: false };
    }
    if (period === 'month' && monthStyle === 'line') {
      const points = dateKeys.map((k) => ({ date: k, value: valueFor(k) }));
      return { kind: 'line' as const, points, ma: movingAverage(points, 7) };
    }
    const data: BarDatum[] = dateKeys.map((k) => ({
      label: WEEKDAY_SHORT_AR[new Date(`${k}T12:00:00`).getDay()],
      sublabel: toArabicDigits(Number(k.slice(8, 10))),
      value: valueFor(k),
      color,
      highlight: k === todayKey,
    }));
    return { kind: 'bars' as const, data, scrollable: period === 'month' };
  }, [period, dateKeys, valueFor, yearAggregate, color, todayKey, monthStyle]);

  return (
    <StatsPanel
      title={title}
      subtitle={subtitle}
      icon={icon}
      action={onSelectDay && body.kind === 'bars' && period !== 'year' ? <span className="text-[10px] text-text-muted">اضغط على يوم</span> : null}
    >
      {body.kind === 'bars' ? (
        <BarChart
          data={body.data}
          height={period === 'year' ? 150 : 140}
          scrollable={body.scrollable}
          barMinWidth={30}
          max={max}
          formatValue={formatValue}
          onSelectBar={onSelectDay && period !== 'year' ? (i) => onSelectDay(dateKeys[i]) : undefined}
        />
      ) : (
        <LineChart
          height={150}
          yMax={max}
          formatY={formatValue}
          startLabel={dateKeys[0] ? shortDateAr(dateKeys[0]) : undefined}
          endLabel={dateKeys.length ? shortDateAr(dateKeys[dateKeys.length - 1]) : undefined}
          series={[
            { points: body.points, color, area: true, label: 'يومياً' },
            { points: body.ma, color: CHART.gold, dashed: true, label: 'متوسط ٧ أيام' },
          ]}
        />
      )}
      {footer}
    </StatsPanel>
  );
}
