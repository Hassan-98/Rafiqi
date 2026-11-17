/**
 * statsService — the pure-function engine behind the statistics section.
 *
 * Nothing here is a React hook and nothing is persisted. Every function takes
 * plain data (usually a store snapshot + a resolved {@link DateRange}) and
 * returns chart-ready output, so the stats components stay "dumb" and the
 * same primitives power the landing hub and all nine deep-dive sub-pages.
 *
 * The whole section is keyed on a single notion of a *period* (يومي / أسبوعي /
 * شهري / سنوي) anchored to a date. `resolvePeriodRange` turns that into an
 * inclusive array of `yyyy-MM-dd` dateKeys plus an Arabic label; everything
 * else maps store data onto those keys.
 */
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  addWeeks,
  addMonths,
  addYears,
  addDays,
  parseISO,
  differenceInCalendarDays,
  getDay,
  isAfter,
} from 'date-fns';
import type { TrendPoint } from '@/types';

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  period: StatsPeriod;
  anchor: Date;
  start: Date;
  end: Date;
  startKey: string;
  endKey: string;
  /** Inclusive list of `yyyy-MM-dd` keys from start→end. */
  dateKeys: string[];
  /** Human Arabic label, e.g. "مايو ٢٠٢٦" or "الأسبوع ٢٢". */
  label: string;
}

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Arabic weekday short labels indexed by JS getDay() (0=Sun .. 6=Sat). */
export const WEEKDAY_LABELS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAY_SHORT_AR = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

/** Islamic week starts on Saturday. */
const WEEK_STARTS_ON = 6 as const;

export function toArabicDigits(value: number | string): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(value)
    .split('')
    .map((c) => (c >= '0' && c <= '9' ? map[Number(c)] : c))
    .join('');
}

export function dateKeyOf(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Resolve a period + anchor into a concrete inclusive range + Arabic label. */
export function resolvePeriodRange(period: StatsPeriod, anchor: Date): DateRange {
  let start: Date;
  let end: Date;
  let label: string;

  switch (period) {
    case 'day': {
      start = anchor;
      end = anchor;
      label = `${toArabicDigits(anchor.getDate())} ${ARABIC_MONTHS[anchor.getMonth()]}`;
      break;
    }
    case 'week': {
      start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
      end = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
      label = `${toArabicDigits(start.getDate())} ${ARABIC_MONTHS[start.getMonth()]} — ${toArabicDigits(end.getDate())} ${ARABIC_MONTHS[end.getMonth()]}`;
      break;
    }
    case 'month': {
      start = startOfMonth(anchor);
      end = endOfMonth(anchor);
      label = `${ARABIC_MONTHS[anchor.getMonth()]} ${toArabicDigits(anchor.getFullYear())}`;
      break;
    }
    case 'year':
    default: {
      start = startOfYear(anchor);
      end = endOfYear(anchor);
      label = `${toArabicDigits(anchor.getFullYear())}`;
      break;
    }
  }

  // Clamp the visible range to "today" so averages, trends and weekday-pattern
  // panels are computed over ELAPSED days only. Without this, a partial current
  // month/week/year is diluted by future days that can never hold data (a
  // perfect user mid-month showed ~33% consistency, trends crashed to zero
  // across the remaining days, and the previous-period delta compared a partial
  // period to a full one). Past periods (end already < now) are untouched.
  const now = new Date();
  if (end > now && start <= now) end = now;

  const days = eachDayOfInterval({ start, end });
  return {
    period,
    anchor,
    start,
    end,
    startKey: dateKeyOf(start),
    endKey: dateKeyOf(end),
    dateKeys: days.map(dateKeyOf),
    label,
  };
}

/** Move the anchor one period backward (-1) or forward (+1). */
export function stepRange(range: DateRange, dir: -1 | 1): DateRange {
  const { period, anchor } = range;
  let nextAnchor: Date;
  switch (period) {
    case 'day':
      nextAnchor = addDays(anchor, dir);
      break;
    case 'week':
      nextAnchor = addWeeks(anchor, dir);
      break;
    case 'month':
      nextAnchor = addMonths(anchor, dir);
      break;
    case 'year':
    default:
      nextAnchor = addYears(anchor, dir);
      break;
  }
  return resolvePeriodRange(period, nextAnchor);
}

/** Whether stepping forward stays at-or-before today (never browse the future). */
export function canStepNext(range: DateRange): boolean {
  const next = stepRange(range, 1);
  return !isAfter(next.start, new Date());
}

/** The range immediately before this one (for period-over-period deltas). */
export function previousRange(range: DateRange): DateRange {
  const prev = stepRange(range, -1);
  // Like-for-like: when the current period is still running (clamped to
  // today), compare against the SAME number of elapsed days of the previous
  // one — 2 days of this week vs a full last week always read as a drop.
  if (range.period !== 'day' && prev.dateKeys.length > range.dateKeys.length) {
    const dateKeys = prev.dateKeys.slice(0, range.dateKeys.length);
    const endKey = dateKeys[dateKeys.length - 1];
    return { ...prev, dateKeys, endKey, end: parseISO(`${endKey}T23:59:59`) };
  }
  return prev;
}

/** Map a `dateKey → number` record onto a dense zero-filled series for the range. */
export function fillDailySeries(records: Record<string, number>, dateKeys: string[]): TrendPoint[] {
  return dateKeys.map((date) => ({ date, value: records[date] ?? 0 }));
}

/** Trailing moving average over a numeric series. */
export function movingAverage(points: TrendPoint[], window: number): TrendPoint[] {
  if (window <= 1) return points;
  return points.map((p, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = points.slice(from, i + 1);
    const avg = slice.reduce((s, x) => s + x.value, 0) / slice.length;
    return { date: p.date, value: avg };
  });
}

export interface Delta {
  pct: number;
  positive: boolean;
  /** true when there is no meaningful previous value to compare against. */
  neutral: boolean;
}

/** Period-over-period change as a percentage for the hero/delta badges. */
export function periodDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { pct: current > 0 ? 100 : 0, positive: current >= 0, neutral: current === 0 };
  }
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(pct), positive: pct >= 0, neutral: false };
}

export interface StreakResult {
  current: number;
  longest: number;
  lastActive: string | null;
}

/**
 * Generic streak engine. Pass every `yyyy-MM-dd` key on which the activity
 * happened; returns the current run (ending today or yesterday so an
 * in-progress today doesn't reset it) plus the all-time longest run and the
 * most recent active date. Reused for prayers 5/5, wird>0, dhikr, hadith
 * views, bookmarking, donations, taraweeh and badge-unlock days.
 */
export function computeStreakFromActiveDates(
  activeDateKeys: string[],
  now: Date = new Date(),
  /** Days that keep a chain alive without adding to it (a recovered streak's missed days). */
  bridged?: ReadonlySet<string>,
): StreakResult {
  if (activeDateKeys.length === 0) return { current: 0, longest: 0, lastActive: null };
  const set = new Set(activeDateKeys);
  const sorted = [...set].sort();
  const lastActive = sorted[sorted.length - 1];
  const isBridged = (d: Date) => !!bridged?.has(dateKeyOf(d));

  // Longest run of consecutive calendar days anywhere in history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInCalendarDays(parseISO(sorted[i]), parseISO(sorted[i - 1]));
    let joined = gap === 1;
    if (gap > 1 && bridged?.size) {
      joined = true;
      for (let d = 1; d < gap && joined; d++) joined = isBridged(addDays(parseISO(sorted[i]), -d));
    }
    if (joined) {
      run += 1;
    } else if (gap > 1) {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  // Current run: walk back from today; tolerate today not yet done.
  let current = 0;
  let cursor = now;
  if (!set.has(dateKeyOf(cursor))) {
    cursor = addDays(cursor, -1); // allow today-in-progress
  }
  for (let guard = 0; guard < 3660; guard++) {
    if (set.has(dateKeyOf(cursor))) current += 1;
    else if (!isBridged(cursor)) break;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, lastActive };
}

/** Bucket a timestamped array into per-day groups keyed by `yyyy-MM-dd`. */
export function bucketByDateKey<T>(items: T[], getDate: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    // Normalise ISO timestamps / dates to a yyyy-MM-dd key.
    const key = raw.length >= 10 ? raw.slice(0, 10) : raw;
    (out[key] ??= []).push(item);
  }
  return out;
}

export interface WeekdayAverage {
  index: number; // 0=Sun..6=Sat
  label: string;
  short: string;
  avg: number;
  count: number;
}

/** Average a per-day value across the range, grouped by weekday. */
export function weekdayAverages(
  dateKeys: string[],
  valueFor: (dateKey: string) => number,
): WeekdayAverage[] {
  const sums = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const key of dateKeys) {
    const wd = getDay(parseISO(key));
    sums[wd].sum += valueFor(key);
    sums[wd].count += 1;
  }
  return sums.map((s, index) => ({
    index,
    label: WEEKDAY_LABELS_AR[index],
    short: WEEKDAY_SHORT_AR[index],
    avg: s.count > 0 ? s.sum / s.count : 0,
    count: s.count,
  }));
}

/** Gaps > 1 day followed by a resumption — "reactivation" events. */
export function detectReactivations(
  activeDateKeys: string[],
): { gapDays: number; resumedOn: string }[] {
  const sorted = [...new Set(activeDateKeys)].sort();
  const out: { gapDays: number; resumedOn: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInCalendarDays(parseISO(sorted[i]), parseISO(sorted[i - 1]));
    if (gap > 1) out.push({ gapDays: gap - 1, resumedOn: sorted[i] });
  }
  return out;
}

export const CONSISTENCY_GRADES = [
  { min: 90, label: 'ممتاز', color: 'var(--color-teal)' },
  { min: 75, label: 'جيد جداً', color: 'var(--color-teal-light)' },
  { min: 60, label: 'جيد', color: 'var(--color-gold)' },
  { min: 40, label: 'مقبول', color: 'var(--color-gold-dark)' },
  { min: 0, label: 'يحتاج تحسين', color: 'var(--color-danger)' },
] as const;

export function gradeFor(score0to100: number): { label: string; color: string } {
  return CONSISTENCY_GRADES.find((g) => score0to100 >= g.min) ?? CONSISTENCY_GRADES[CONSISTENCY_GRADES.length - 1];
}

/** Sum the numeric values of a series. */
export function sumSeries(points: TrendPoint[]): number {
  return points.reduce((s, p) => s + p.value, 0);
}

/** Average of a numeric series (0 when empty). */
export function avgSeries(points: TrendPoint[]): number {
  if (points.length === 0) return 0;
  return sumSeries(points) / points.length;
}

/** Linear trend direction over a series. */
export function trendDirection(points: TrendPoint[]): 'rising' | 'flat' | 'falling' {
  if (points.length < 2) return 'flat';
  const firstHalf = points.slice(0, Math.floor(points.length / 2));
  const secondHalf = points.slice(Math.floor(points.length / 2));
  const a = avgSeries(firstHalf);
  const b = avgSeries(secondHalf);
  const diff = b - a;
  const threshold = Math.max(0.02, a * 0.05);
  if (diff > threshold) return 'rising';
  if (diff < -threshold) return 'falling';
  return 'flat';
}

/** Chart colours — tokens only, so every palette × mode re-skins charts. */
export const CHART = {
  teal: 'var(--color-teal)',
  tealLight: 'var(--color-teal-light)',
  tealDark: 'var(--color-teal-dark)',
  gold: 'var(--color-gold)',
  goldLight: 'var(--color-gold-light)',
  goldDark: 'var(--color-gold-dark)',
  warn: 'var(--color-danger)',
  track: 'var(--color-track)',
  muted: 'var(--color-text-muted)',
} as const;

/** 12345 → "١٢٬٣٤٥" (Arabic-Indic digits + Arabic thousands separator). */
export function formatNumberAr(value: number, fractionDigits = 0): string {
  const fixed =
    fractionDigits > 0 ? value.toFixed(fractionDigits).replace(/\.?0+$/, '') : String(Math.round(value));
  const [i, f] = fixed.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  // '.' decimal: the Arabic ٫ renders like a slash in the counter font (٣٫٥ ≈ ٣/٥).
  return toArabicDigits(f ? `${grouped}.${f}` : grouped);
}

/** "٧:٣٠ ص" — 12-hour Arabic clock for an epoch ms. */
export function arabicClock(ts: number): string {
  const d = new Date(ts);
  const ampm = d.getHours() < 12 ? 'ص' : 'م';
  const h = d.getHours() % 12 || 12;
  return `${toArabicDigits(h)}:${toArabicDigits(String(d.getMinutes()).padStart(2, '0'))} ${ampm}`;
}

/** Hour-of-day histogram (24 buckets) of timed items, weighted by `weight`. */
export function hourHistogram<T extends { ts: number }>(items: T[], weight: (t: T) => number = () => 1): number[] {
  const out = new Array<number>(24).fill(0);
  for (const it of items) out[new Date(it.ts).getHours()] += weight(it);
  return out;
}

/** Longest run of consecutive keys inside `dateKeys` (ordered) that satisfy `active`. */
export function longestRunIn(dateKeys: string[], active: (k: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const k of dateKeys) {
    run = active(k) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** "٢٥ سبتمبر" from a yyyy-MM-dd key (parsed at noon → no TZ drift). */
export function shortDateAr(dateKey: string): string {
  const d = parseISO(`${dateKey}T12:00:00`);
  return `${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]}`;
}

/** Weekday values (index = getDay) → Saturday-first display order. */
export const WEEK_ORDER_SAT_FIRST = [6, 0, 1, 2, 3, 4, 5] as const;

/**
 * Keys for PATTERN panels (weekday / time-of-day): a week has too few days to
 * show a pattern, so short periods fall back to the last 12 weeks.
 */
export function patternWindow(range: DateRange, minDays = 28): { keys: string[]; label: string } {
  if (range.dateKeys.length >= minDays) return { keys: range.dateKeys, label: range.label };
  const end = new Date();
  const keys = eachDayOfInterval({ start: addDays(end, -83), end }).map(dateKeyOf);
  return { keys, label: 'آخر ١٢ أسبوعاً' };
}
