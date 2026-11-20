import { addDays, format, getDaysInMonth, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns';
import { ARABIC_MONTHS, WEEKDAY_LABELS_AR } from '@/services/statsService';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

/**
 * «سباقك مع نفسك» — PURE (tested: scripts/selfRace.test.ts). The opponent is
 * you: today against yesterday, this week against last week up to the same
 * weekday, this month against last month up to the same date — and the best
 * finished day / week / month as the record to beat. Works from one person,
 * so it means something before the board has a crowd. `totals` = points per
 * local day ('yyyy-MM-dd'), from leaderboard.localTotals.
 */

/** 'pastWeek' / 'pastMonth': a finished one browsed in «الترتيب» (`now` = any day in it) — whole, against the one before. */
export type RacePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'pastWeek' | 'pastMonth';
export type Totals = Readonly<Record<string, number>>;

const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const WEEK = { weekStartsOn: 6 } as const;
/** How many finished periods the record and the average look back over. */
const LOOKBACK = { day: 60, week: 12, month: 6 } as const;

function sum(t: Totals, from: Date, days: number): number {
  let s = 0;
  for (let i = 0; i < days; i++) s += t[dk(addDays(from, i))] ?? 0;
  return s;
}

export interface RaceDay {
  key: string;
  /** «السبت» … */
  label: string;
  /** null = still to come. */
  now: number | null;
  ghost: number;
}

export interface RaceRecord {
  points: number;
  /** «الخميس ١٣ نوفمبر» / «أسبوع ٢٦ أكتوبر» / «أكتوبر». */
  label: string;
}

export interface Race {
  period: RacePeriod;
  /** The period's points so far. */
  now: number;
  /** The same stretch of the period before. */
  ghost: number;
  /** «أمس» / «الأسبوع الماضي حتى الأربعاء» / «الشهر الماضي حتى يوم ١٨». */
  ghostLabel: string;
  /** The whole period before (week / month); null for a day, whose ghost is already whole. */
  prevTotal: number | null;
  /** The best finished period in the look-back, before this one — null below two finished periods with points. */
  record: RaceRecord | null;
  /** Mean of the finished periods with points in the look-back (null: none yet). */
  avg: number | null;
  /** The week, Saturday → Friday, against last week's same days. */
  days?: RaceDay[];
}

/** «١٤ – ٢٠ نوفمبر» / «٢٨ نوفمبر – ٤ ديسمبر». */
export function rangeLabel(start: Date, end: Date): string {
  return start.getMonth() === end.getMonth()
    ? `${ar(start.getDate())} – ${ar(end.getDate())} ${ARABIC_MONTHS[end.getMonth()]}`
    : `${ar(start.getDate())} ${ARABIC_MONTHS[start.getMonth()]} – ${ar(end.getDate())} ${ARABIC_MONTHS[end.getMonth()]}`;
}

const dayLabel = (d: Date) => `${WEEKDAY_LABELS_AR[d.getDay()]} ${ar(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]}`;

/** Best and mean of finished periods, newest first: [points, label][]. */
function history(list: [number, string][]): Pick<Race, 'record' | 'avg'> {
  const done = list.filter(([p]) => p > 0);
  if (!done.length) return { record: null, avg: null };
  const avg = Math.round(done.reduce((n, [p]) => n + p, 0) / done.length);
  if (done.length < 2) return { record: null, avg };
  const [points, label] = done.reduce((a, b) => (b[0] > a[0] ? b : a));
  return { record: { points, label }, avg };
}

export function raceOf(period: RacePeriod, t: Totals, now = new Date()): Race {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'today' || period === 'yesterday') {
    const day = period === 'today' ? today : subDays(today, 1);
    const past: [number, string][] = [];
    for (let i = 1; i <= LOOKBACK.day; i++) {
      const d = subDays(day, i);
      past.push([t[dk(d)] ?? 0, dayLabel(d)]);
    }
    return {
      period,
      now: t[dk(day)] ?? 0,
      ghost: t[dk(subDays(day, 1))] ?? 0,
      ghostLabel: period === 'today' ? 'أمس' : 'اليوم الذي قبله',
      prevTotal: null,
      ...history(past),
    };
  }

  if (period === 'week' || period === 'pastWeek') {
    const start = startOfWeek(today, WEEK);
    const prev = subDays(start, 7);
    const n = period === 'pastWeek' ? 7 : Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
    const past: [number, string][] = [];
    for (let i = 1; i <= LOOKBACK.week; i++) {
      const s = subDays(start, 7 * i);
      past.push([sum(t, s, 7), `أسبوع ${ar(s.getDate())} ${ARABIC_MONTHS[s.getMonth()]}`]);
    }
    const days: RaceDay[] = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { key: dk(d), label: WEEKDAY_LABELS_AR[d.getDay()], now: i < n ? (t[dk(d)] ?? 0) : null, ghost: t[dk(addDays(prev, i))] ?? 0 };
    });
    return {
      period,
      now: sum(t, start, n),
      ghost: sum(t, prev, n),
      ghostLabel: period === 'pastWeek' ? 'الأسبوع الذي قبله' : n === 7 ? 'الأسبوع الماضي' : `الأسبوع الماضي حتى ${WEEKDAY_LABELS_AR[today.getDay()]}`,
      prevTotal: sum(t, prev, 7),
      ...history(past),
      days,
    };
  }

  const start = startOfMonth(today);
  const prev = subMonths(start, 1);
  const n = period === 'pastMonth' ? getDaysInMonth(start) : today.getDate();
  const prevDays = getDaysInMonth(prev);
  const past: [number, string][] = [];
  for (let i = 1; i <= LOOKBACK.month; i++) {
    const s = subMonths(start, i);
    past.push([sum(t, s, getDaysInMonth(s)), ARABIC_MONTHS[s.getMonth()]]);
  }
  return {
    period,
    now: sum(t, start, n),
    ghost: sum(t, prev, Math.min(n, prevDays)),
    ghostLabel: period === 'pastMonth' ? 'الشهر الذي قبله' : n >= prevDays ? 'الشهر الماضي' : `الشهر الماضي حتى يوم ${ar(n)}`,
    prevTotal: sum(t, prev, prevDays),
    ...history(past),
  };
}

// ── the verdict ────────────────────────────────────────────────────────────
export type VerdictKind = 'record' | 'ahead' | 'behind' | 'even' | 'start';
export interface Verdict {
  kind: VerdictKind;
  /** Points ahead of / behind the ghost (0 for even / start). */
  gap: number;
  text: string;
}

const AGAINST: Record<RacePeriod, string> = { today: 'أمسك', yesterday: 'اليوم الذي قبله', week: 'أسبوعك الماضي', month: 'شهرك الماضي', pastWeek: 'الأسبوع الذي قبله', pastMonth: 'الشهر الذي قبله' };
const BEST: Record<RacePeriod, string> = { today: 'أفضل يوم لك', yesterday: 'أفضل يوم لك', week: 'أفضل أسبوع لك', month: 'أفضل شهر لك', pastWeek: 'أفضل أسبوع قبله', pastMonth: 'أفضل شهر قبله' };
const pts = (n: number) => `${ar(n)} ${n === 1 ? 'نقطة' : n === 2 ? 'نقطتان' : n <= 10 ? 'نقاط' : 'نقطة'}`;

/** The one line under the race — gendered where Arabic must be. */
export function verdictOf(r: Race, female = false): Verdict {
  const g = (m: string, f: string) => (female ? f : m);
  // A finished week / month: told in the past, nothing left to catch up.
  const done = r.period === 'pastWeek' || r.period === 'pastMonth';
  if (r.record && r.now > r.record.points) {
    const best = `${BEST[r.period]} (${ar(r.record.points)})`;
    return { kind: 'record', gap: r.now - r.record.points, text: done ? `كان رقماً قياسياً: تجاوز ${best}` : `رقم قياسي جديد: تجاوزت ${best}` };
  }
  if (!r.ghost && !r.now) {
    const text = done ? `لا نقاط مسجّلة لك في هذا ${r.period === 'pastWeek' ? 'الأسبوع' : 'الشهر'}` : g('ابدأ، فكل ما تسجّله اليوم يصير خصمك غداً', 'ابدئي، فكل ما تسجّلينه اليوم يصير خصمك غداً');
    return { kind: 'start', gap: 0, text };
  }
  if (!r.ghost) return { kind: 'start', gap: 0, text: done ? `لا شيء في ${AGAINST[r.period]} للمقارنة` : `لا شيء في ${AGAINST[r.period]} لتسابقه — هذه البداية` };
  if (r.now > r.ghost) {
    const text = done ? `زاد على ${AGAINST[r.period]} بـ${pts(r.now - r.ghost)}` : `${g('متقدّم', 'متقدّمة')} على ${AGAINST[r.period]} بـ${pts(r.now - r.ghost)}`;
    return { kind: 'ahead', gap: r.now - r.ghost, text };
  }
  if (r.now === r.ghost) return { kind: 'even', gap: 0, text: `على قدم المساواة مع ${AGAINST[r.period]}` };
  const gap = r.ghost - r.now;
  return {
    kind: 'behind',
    gap,
    text: r.period === 'yesterday' || done ? `أقل من ${AGAINST[r.period]} بـ${pts(gap)}` : `باقٍ ${pts(gap)} ${g('لتلحق', 'لتلحقي')} ب${AGAINST[r.period]}`,
  };
}

export { pts as pointsText };

// ── «حصاد الأسبوع» ─────────────────────────────────────────────────────────
export interface Harvest {
  /** Saturday of the harvested week. */
  start: string;
  end: string;
  /** «١٥ – ٢١ نوفمبر». */
  range: string;
  /** Friday: the week is still running (today can still grow). */
  live: boolean;
  total: number;
  prevTotal: number;
  /** Percent change against the week before (null when it had nothing). */
  delta: number | null;
  activeDays: number;
  days: { key: string; label: string; points: number; best: boolean; future: boolean }[];
  best: { key: string; label: string; points: number } | null;
  /** The best of the twelve weeks before it (null: too little history). */
  record: RaceRecord | null;
  /** Higher than every week in the look-back. */
  newRecord: boolean;
  /** Next week's mark to pass: a little more than this one. */
  nextGoal: number;
}

/** Friday harvests the running week; Saturday → Thursday the week that ended. */
export function harvestStart(now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const s = startOfWeek(today, WEEK);
  return today.getDay() === 5 ? s : subDays(s, 7);
}

export function harvestOf(t: Totals, now = new Date()): Harvest {
  const start = harvestStart(now);
  const end = addDays(start, 6);
  const todayKey = dk(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const key = dk(d);
    return { key, label: WEEKDAY_LABELS_AR[d.getDay()], points: t[key] ?? 0, best: false, future: key > todayKey };
  });
  const total = days.reduce((n, d) => n + d.points, 0);
  const prevTotal = sum(t, subDays(start, 7), 7);
  const top = days.reduce<(typeof days)[number] | null>((a, d) => (d.points > 0 && (!a || d.points > a.points) ? d : a), null);
  if (top) top.best = true;
  const past: [number, string][] = [];
  for (let i = 1; i <= LOOKBACK.week; i++) {
    const s = subDays(start, 7 * i);
    past.push([sum(t, s, 7), `أسبوع ${ar(s.getDate())} ${ARABIC_MONTHS[s.getMonth()]}`]);
  }
  const { record } = history(past);
  return {
    start: dk(start),
    end: dk(end),
    range: rangeLabel(start, end),
    live: dk(now) <= dk(end),
    total,
    prevTotal,
    delta: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    activeDays: days.filter((d) => d.points > 0).length,
    days,
    best: top ? { key: top.key, label: top.label, points: top.points } : null,
    record,
    newRecord: !!record && total > record.points,
    // A tenth more, rounded up to a ten.
    nextGoal: total > 0 ? Math.ceil((total * 1.1) / 10) * 10 : 0,
  };
}
