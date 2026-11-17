import { format, subDays, addDays, parseISO, getDay, differenceInCalendarDays, startOfWeek } from 'date-fns';
import {
  computeStreakFromActiveDates,
  toArabicDigits,
  formatNumberAr,
  WEEKDAY_LABELS_AR,
  ARABIC_MONTHS,
} from '@/services/statsService';
import type { DailyProgress, PrayerName } from '@/types';

/**
 * PURE insights engine (no stores, no React) — see insightsService.ts for the
 * contract. Kept store-free so it can be unit-checked in node
 * (scripts/insights.test.ts) and called from schedulers without side effects.
 */

export type InsightDomain =
  | 'overall'
  | 'prayers'
  | 'dhikr'
  | 'quran'
  | 'awrad'
  | 'qiyam'
  | 'habits'
  | 'fasting'
  | 'sadaqah';

export type InsightKind = 'streak' | 'record' | 'milestone' | 'trend' | 'comparison' | 'nudge';
export type InsightTone = 'celebrate' | 'encourage' | 'info';

export interface Insight {
  id: string;
  domain: InsightDomain;
  kind: InsightKind;
  tone: InsightTone;
  /** Short headline, e.g. "سلسلة قيام". */
  title: string;
  /** One sentence, e.g. "قمت ٦ ليالٍ متتالية — أطول سلسلة لك". */
  body: string;
  /** Formatted headline number/value, e.g. "٦ ليالٍ". */
  value?: string;
  /** 0–100; higher shows first. */
  priority: number;
  /** Route to open when tapped. */
  to?: string;
  /** Raw number behind the fact (streak length, total, %) — for thresholds. */
  metric?: number;
  /** 0–1 progress toward a goal/milestone (UI may draw a bar). */
  progress?: number;
}

export interface QiyamNightLike {
  nightKey: string;
  rakaat: number;
  witr: boolean;
  loggedAt: number;
  minutes?: number;
}

export interface SnapshotPrayerEntry {
  fard?: boolean;
  sunnahBefore?: boolean;
  sunnahAfter?: boolean;
  witr?: boolean;
  mosque?: boolean;
  /** أذكار ما بعد this prayer were said. */
  adhkar?: boolean;
}

export interface SnapshotEvent {
  ts: number;
  dateKey: string;
  domain: string;
  refId?: string;
  subId?: string;
  title: string;
  detail?: string;
  amount: number;
}

export interface SnapshotTarget {
  id: string;
  title: string;
  current: number;
  total: number;
  streak?: number;
  recurrence?: string;
  completedAt?: number;
  extra?: number;
  /** The wird has its own reminder (the smart companion leaves it alone). */
  reminderEnabled?: boolean;
}

export interface SnapshotTargetRecord {
  targetId: string;
  title: string;
  endedAt: number;
  goal: number;
  done: number;
  extra: number;
  completed: boolean;
}

export interface InsightsSnapshot {
  dailyProgress: Record<string, DailyProgress>;
  /** progressStore.freezesUsed — frozen / recovered days bridge streaks. */
  freezesUsed?: Record<string, string[]>;
  prayerFardDays: Record<string, number>; // dateKey → fard prayers done (0–5)
  qiyamNights: Record<string, QiyamNightLike>;
  // ── Optional richer sources (older callers may omit them) ──
  prayerLog?: Record<string, Partial<Record<PrayerName, SnapshotPrayerEntry>>>;
  /** Timed activity log (newest first or any order). */
  activity?: SnapshotEvent[];
  tasbih?: { id: string; name: string; total: number }[];
  wirdHistory?: Record<string, { unit: string; amount: number; achieved: number }>;
  /** The featured named khatma (active, else most recent): pages covered in order since its start. */
  khatma?: { name: string; read: number } | null;
  targets?: SnapshotTarget[];
  targetHistory?: SnapshotTargetRecord[];
  habits?: { id: string; nameAr: string }[];
  sadaqah?: { date: string; amount: number; currency: string }[];
  /** صلاة الضحى days (prayerLogStore.duha). */
  duha?: Record<string, unknown>;
  /** A woman's excused days (prayerLogStore.excused). */
  excused?: Record<string, true>;
}

// ── small helpers ──────────────────────────────────────────────────────────
const key = (d: Date) => format(d, 'yyyy-MM-dd');
export const parseDateKey = (k: string) => parseISO(`${k}T12:00:00`);
/** Same rule as qiyamStore.qiyamNightKey (duplicated to stay store-free). */
const nightKeyOf = (d: Date) => key(d.getHours() < 12 ? subDays(d, 1) : d);
const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

function countInWindow(keys: Set<string>, end: Date, days: number): number {
  let n = 0;
  for (let i = 0; i < days; i++) if (keys.has(key(subDays(end, i)))) n++;
  return n;
}
function sumInWindow(byDay: Map<string, number> | undefined, end: Date, days: number): number {
  if (!byDay) return 0;
  let n = 0;
  for (let i = 0; i < days; i++) n += byDay.get(key(subDays(end, i))) ?? 0;
  return n;
}

/** Plural-aware Arabic count. */
export function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${toArabicDigits(n)} ${few}`;
  return `${formatNumberAr(n)} ${many}`;
}
export const nights = (n: number) => arCount(n, 'ليلة واحدة', 'ليلتين', 'ليالٍ', 'ليلة');
export const days = (n: number) => arCount(n, 'يوم واحد', 'يومين', 'أيام', 'يوماً');
export const times = (n: number) => arCount(n, 'مرة واحدة', 'مرتين', 'مرات', 'مرة');
export const pages = (n: number) => arCount(n, 'صفحة واحدة', 'صفحتين', 'صفحات', 'صفحة');
export const rakaat = (n: number) => arCount(n, 'ركعة واحدة', 'ركعتين', 'ركعات', 'ركعة');
export const weeks = (n: number) => arCount(n, 'أسبوع واحد', 'أسبوعين', 'أسابيع', 'أسبوعاً');
export const periods = (n: number) => arCount(n, 'فترة واحدة', 'فترتين', 'فترات', 'فترة');
const plain = (n: number) => formatNumberAr(n);

const STREAK_LADDER = [3, 7, 14, 21, 30, 40, 60, 100, 150, 200, 365];

interface StreakOpts {
  domain: InsightDomain;
  keys: string[];
  /** Days that keep the chain alive without counting (a recovered streak). */
  bridged?: ReadonlySet<string>;
  label: string;
  unit: (n: number) => string;
  to: string;
  now: Date;
  /** Day the streak is measured against (qiyam: tonight's night key). */
  anchorKey?: string;
  /** Emit the "don't break it" nudge (off for non-daily worship like fasting). */
  atRisk?: boolean;
  riskWhen?: string;
  idBase?: string;
}

/** Days frozen for a module (or the whole day) in the snapshot. */
function bridgedFor(snap: InsightsSnapshot, moduleId: string): Set<string> {
  const f = snap.freezesUsed ?? {};
  return new Set(Object.keys(f).filter((k) => f[k].includes('*') || f[k].includes(moduleId)));
}

function streakInsights(o: StreakOpts): Insight[] {
  const out: Insight[] = [];
  if (o.keys.length === 0) return out;
  const id = o.idBase ?? o.domain;
  const anchorKey = o.anchorKey ?? key(o.now);
  const s = computeStreakFromActiveDates(o.keys, parseDateKey(anchorKey), o.bridged);
  const doneToday = o.keys.includes(anchorKey);
  if (s.current >= 2) {
    const isBest = s.current >= s.longest;
    out.push({
      id: `${id}.streak`,
      domain: o.domain,
      kind: 'streak',
      tone: 'celebrate',
      title: `سلسلة ${o.label}`,
      body: isBest
        ? `${o.unit(s.current)} متتالية — أطول سلسلة لك حتى الآن`
        : `${o.unit(s.current)} متتالية، وأطول سلسلة لك ${o.unit(s.longest)}`,
      value: o.unit(s.current),
      priority: isBest ? 90 : 70,
      to: o.to,
      metric: s.current,
      progress: s.longest > 0 ? Math.min(1, s.current / s.longest) : undefined,
    });
  }
  if ((o.atRisk ?? true) && !doneToday && s.current >= 2) {
    out.push({
      id: `${id}.streak-at-risk`,
      domain: o.domain,
      kind: 'nudge',
      tone: 'encourage',
      title: 'حافظ على سلسلتك',
      body: `لا تقطع ${o.unit(s.current)} من ${o.label} — ما زال أمامك وقت ${o.riskWhen ?? 'اليوم'}`,
      priority: 80,
      to: o.to,
      metric: s.current,
    });
  }
  const next = STREAK_LADDER.find((m) => m > s.current);
  if (next && s.current > 0 && next - s.current <= 3) {
    out.push({
      id: `${id}.milestone-near`,
      domain: o.domain,
      kind: 'milestone',
      tone: 'encourage',
      title: 'اقتربت من إنجاز',
      body: `باقي ${o.unit(next - s.current)} لتبلغ ${o.unit(next)} من ${o.label}`,
      priority: 65,
      to: o.to,
      metric: next,
      progress: s.current / next,
    });
  }
  return out;
}

function weekComparison(
  id: string,
  domain: InsightDomain,
  thisWeek: number,
  lastWeek: number,
  label: string,
  unit: (n: number) => string,
  to: string,
  valueMax?: number,
): Insight | null {
  if (thisWeek === 0 && lastWeek === 0) return null;
  const diff = thisWeek - lastWeek;
  if (diff === 0) return null;
  return {
    id,
    domain,
    kind: 'comparison',
    tone: diff > 0 ? 'celebrate' : 'encourage',
    title: diff > 0 ? 'أسبوع أفضل' : 'عودة أقوى',
    body:
      diff > 0
        ? `${label} في آخر ٧ أيام: ${unit(thisWeek)} مقابل ${unit(lastWeek)} في الأسبوع الذي قبله`
        : `${label} في آخر ٧ أيام: ${unit(thisWeek)} مقابل ${unit(lastWeek)} قبلها — الأيام القادمة فرصتك`,
    value: valueMax ? `${toArabicDigits(thisWeek)}/${toArabicDigits(valueMax)}` : plain(thisWeek),
    priority: diff > 0 ? 60 : 45,
    to,
    metric: diff,
  };
}

/**
 * Round-number milestone facts for a cumulative count. `before` = the value
 * one week ago, so a milestone crossed in the last 7 days celebrates once
 * (id carries the milestone → callers can remember it was announced).
 */
function countLadder(
  idBase: string,
  domain: InsightDomain,
  now: number,
  before: number,
  ladder: number[],
  unit: (n: number) => string,
  label: string,
  to: string,
): Insight[] {
  const out: Insight[] = [];
  const crossed = [...ladder].reverse().find((m) => before < m && now >= m);
  if (crossed) {
    out.push({
      id: `${idBase}.reached-${crossed}`,
      domain,
      kind: 'milestone',
      tone: 'celebrate',
      title: 'إنجاز جديد',
      body: `بلغت ${unit(crossed)} من ${label} — بارك الله فيك`,
      value: unit(crossed),
      priority: 88,
      to,
      metric: crossed,
    });
  }
  const next = ladder.find((m) => m > now);
  if (next && now > 0 && now >= next * 0.85) {
    out.push({
      id: `${idBase}.near-${next}`,
      domain,
      kind: 'milestone',
      tone: 'encourage',
      title: 'قريباً من علامة جديدة',
      body: `باقي ${unit(next - now)} لتبلغ ${unit(next)} من ${label}`,
      priority: 64,
      to,
      metric: next,
      progress: now / next,
    });
  }
  return out;
}

function moduleKeys(dp: Record<string, DailyProgress>, moduleId: string): string[] {
  const out: string[] = [];
  for (const d of Object.values(dp)) {
    if (d.modules.some((m) => m.moduleId === moduleId && m.completed)) out.push(d.dateKey);
  }
  return out;
}

export function hijriDay(d: Date): number | null {
  try {
    const part = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric' })
      .formatToParts(d)
      .find((p) => p.type === 'day');
    const n = part ? Number(part.value) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ── derived context (computed once per run) ────────────────────────────────
interface Ctx {
  snap: InsightsSnapshot;
  now: Date;
  todayKey: string;
  hour: number;
  monthPrefix: string;
  /** domain → dateKey → summed amount */
  actDay: Map<string, Map<string, number>>;
  /** dhikr set id (refId) → active dateKeys */
  dhikrSetDays: Map<string, Set<string>>;
}

function buildCtx(snap: InsightsSnapshot, now: Date): Ctx {
  const actDay = new Map<string, Map<string, number>>();
  const dhikrSetDays = new Map<string, Set<string>>();
  for (const e of snap.activity ?? []) {
    let m = actDay.get(e.domain);
    if (!m) actDay.set(e.domain, (m = new Map()));
    m.set(e.dateKey, (m.get(e.dateKey) ?? 0) + e.amount);
    if (e.domain === 'dhikr' && e.refId) {
      let s = dhikrSetDays.get(e.refId);
      if (!s) dhikrSetDays.set(e.refId, (s = new Set()));
      s.add(e.dateKey);
    }
  }
  return {
    snap,
    now,
    todayKey: key(now),
    hour: now.getHours(),
    monthPrefix: key(now).slice(0, 7),
    actDay,
    dhikrSetDays,
  };
}

// ── domains ────────────────────────────────────────────────────────────────
function overallInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const keys = Object.values(c.snap.dailyProgress)
    .filter((d) => d.modules.some((m) => m.completed))
    .map((d) => d.dateKey);
  out.push(...streakInsights({ domain: 'overall', keys, label: 'العبادة', unit: days, to: '/stats', now: c.now }));
  const set = new Set(keys);
  const w = weekComparison(
    'overall.week-vs-last',
    'overall',
    countInWindow(set, c.now, 7),
    countInWindow(set, subDays(c.now, 7), 7),
    'أيام عبادتك',
    days,
    '/stats',
    7,
  );
  if (w) out.push(w);

  const weekAgo = key(subDays(c.now, 7));
  out.push(
    ...countLadder(
      'overall.days',
      'overall',
      keys.length,
      keys.filter((k) => k <= weekAgo).length,
      [7, 30, 50, 100, 200, 365, 500, 1000],
      days,
      'أيام العبادة',
      '/stats',
    ),
  );

  // Most active month ever.
  const byMonth = new Map<string, number>();
  for (const k of keys) byMonth.set(k.slice(0, 7), (byMonth.get(k.slice(0, 7)) ?? 0) + 1);
  const cur = byMonth.get(c.monthPrefix) ?? 0;
  const prevBest = Math.max(0, ...[...byMonth].filter(([m]) => m !== c.monthPrefix).map(([, n]) => n));
  if (byMonth.size >= 2 && cur >= 5 && cur > prevBest) {
    out.push({
      id: 'overall.month-record',
      domain: 'overall',
      kind: 'record',
      tone: 'celebrate',
      title: 'أنشط شهر لك',
      body: `${ARABIC_MONTHS[c.now.getMonth()]} أنشط شهر لك حتى الآن: ${days(cur)} من العبادة`,
      value: days(cur),
      priority: 84,
      to: '/stats',
      metric: cur,
    });
  }

  if (keys.length === 0) {
    out.push({
      id: 'overall.welcome',
      domain: 'overall',
      kind: 'nudge',
      tone: 'encourage',
      title: 'ابدأ يومك الأول',
      body: 'سجّل صلاتك أو أذكارك اليوم لتبدأ سلسلتك الأولى',
      priority: 50,
      to: '/',
    });
  }
  return out;
}

function prayerInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/prayers';
  const fard = c.snap.prayerFardDays;
  const fullKeys = Object.entries(fard)
    .filter(([, n]) => n >= 5)
    .map(([k]) => k);
  out.push(
    ...streakInsights({ domain: 'prayers', keys: fullKeys, label: 'الصلوات الخمس', unit: days, to, now: c.now }),
  );

  const today = fard[c.todayKey] ?? 0;
  if (today >= 5) {
    out.push({
      id: 'prayers.today-complete',
      domain: 'prayers',
      kind: 'record',
      tone: 'celebrate',
      title: 'يوم مكتمل',
      body: 'أتممت الصلوات الخمس اليوم — تقبّل الله منك',
      value: '٥/٥',
      priority: 58,
      to,
      metric: 5,
      progress: 1,
    });
  } else if (today > 0) {
    out.push({
      id: 'prayers.today-remaining',
      domain: 'prayers',
      kind: 'nudge',
      tone: 'encourage',
      title: 'صلوات اليوم',
      body: `أدّيت ${toArabicDigits(today)} من ٥ فروض — بقي ${arCount(5 - today, 'فرض واحد', 'فرضين', 'فروض', 'فرضاً')}`,
      value: `${toArabicDigits(today)}/٥`,
      priority: 72,
      to,
      metric: today,
      progress: today / 5,
    });
  }

  const set = new Set(fullKeys);
  const w = weekComparison(
    'prayers.week-vs-last',
    'prayers',
    countInWindow(set, c.now, 7),
    countInWindow(set, subDays(c.now, 7), 7),
    'أيامك المكتملة الفروض',
    days,
    to,
    7,
  );
  if (w) out.push(w);

  const log = c.snap.prayerLog;
  if (log) {
    // Weakest prayer over the last 14 finished days.
    const per: Record<PrayerName, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
    let logged = 0;
    let sunnahNow = 0;
    let sunnahPrev = 0;
    let witr30 = 0;
    for (let i = 1; i <= 14; i++) {
      const day = log[key(subDays(c.now, i))];
      if (!day) continue;
      if (PRAYERS.some((p) => day[p]?.fard)) logged++;
      for (const p of PRAYERS) if (day[p]?.fard) per[p]++;
    }
    for (let i = 0; i < 30; i++) {
      const day = log[key(subDays(c.now, i))];
      if (!day) continue;
      const sunnah = PRAYERS.reduce(
        (n, p) => n + (day[p]?.sunnahBefore ? 1 : 0) + (day[p]?.sunnahAfter ? 1 : 0) + (day[p]?.witr ? 1 : 0),
        0,
      );
      if (i < 7) sunnahNow += sunnah;
      else if (i < 14) sunnahPrev += sunnah;
      if (PRAYERS.some((p) => day[p]?.witr)) witr30++;
    }
    if (logged >= 7) {
      const weakest = [...PRAYERS].sort((a, b) => per[a] - per[b])[0];
      const strongest = [...PRAYERS].sort((a, b) => per[b] - per[a])[0];
      if (per[weakest] < 12 && per[strongest] - per[weakest] >= 2) {
        out.push({
          id: 'prayers.weakest',
          domain: 'prayers',
          kind: 'trend',
          tone: 'encourage',
          title: 'محور تركيزك',
          body: `صلاة ${PRAYER_AR[weakest]} الأقل تسجيلاً في آخر أسبوعين (${toArabicDigits(per[weakest])} من ١٤) — اجعلها هدفك القادم`,
          value: `${toArabicDigits(per[weakest])}/١٤`,
          priority: 52,
          to,
          metric: per[weakest],
          progress: per[weakest] / 14,
        });
      }
    }
    const fajrKeys = Object.entries(log)
      .filter(([, d]) => d?.fajr?.fard)
      .map(([k]) => k);
    const fajr = computeStreakFromActiveDates(fajrKeys, c.now);
    if (fajr.current >= 3) {
      out.push({
        id: 'prayers.fajr-streak',
        domain: 'prayers',
        kind: 'streak',
        tone: 'celebrate',
        title: 'مواظبة على الفجر',
        body: `صلّيت الفجر ${days(fajr.current)} متتالية${fajr.current >= fajr.longest ? ' — أطول سلسلة فجر لك' : ''}`,
        value: days(fajr.current),
        priority: 74,
        to,
        metric: fajr.current,
      });
    }
    if (sunnahNow > 0) {
      const d = sunnahNow - sunnahPrev;
      out.push({
        id: 'prayers.sunnah-week',
        domain: 'prayers',
        kind: 'comparison',
        tone: d >= 0 ? 'celebrate' : 'info',
        title: 'السنن والنوافل',
        body:
          d > 0
            ? `صلّيت ${plain(sunnahNow)} سنة ونافلة في آخر ٧ أيام، بزيادة ${plain(d)} عن الأسبوع الذي قبله`
            : `صلّيت ${plain(sunnahNow)} سنة ونافلة في آخر ٧ أيام`,
        value: plain(sunnahNow),
        priority: d > 0 ? 55 : 36,
        to,
        metric: sunnahNow,
      });
    }
    if (witr30 >= 3) {
      out.push({
        id: 'prayers.witr',
        domain: 'prayers',
        kind: 'record',
        tone: 'info',
        title: 'الوتر',
        body: `أوترت ${days(witr30)} من آخر ٣٠ يوماً`,
        value: `${toArabicDigits(witr30)}/٣٠`,
        priority: 38,
        to,
        metric: witr30,
        progress: witr30 / 30,
      });
    }
  }

  // Early fajr (logged before 6am) — needs the timed log.
  let early = 0;
  const cutoff = key(subDays(c.now, 13));
  for (const e of c.snap.activity ?? []) {
    if (e.domain === 'prayer' && e.refId === 'fajr' && e.dateKey >= cutoff && new Date(e.ts).getHours() < 6) early++;
  }
  if (early >= 3) {
    out.push({
      id: 'prayers.fajr-early',
      domain: 'prayers',
      kind: 'trend',
      tone: 'celebrate',
      title: 'فجر مبكر',
      body: `سجّلت الفجر قبل السادسة صباحاً ${times(early)} في آخر أسبوعين`,
      value: toArabicDigits(early),
      priority: 57,
      to,
      metric: early,
    });
  }
  return out;
}

const SET_META: Record<string, { label: string; from: number; to: number }> = {
  morning: { label: 'أذكار الصباح', from: 5, to: 11 },
  evening: { label: 'أذكار المساء', from: 15, to: 21 },
  sleep: { label: 'أذكار النوم', from: 21, to: 23 },
};

function dhikrInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/dhikr';
  const keys = moduleKeys(c.snap.dailyProgress, 'dhikr');
  out.push(...streakInsights({ domain: 'dhikr', keys, bridged: bridgedFor(c.snap, 'dhikr'), label: 'الأذكار', unit: days, to, now: c.now }));

  for (const [setId, meta] of Object.entries(SET_META)) {
    const setKeys = [...(c.dhikrSetDays.get(setId) ?? [])];
    if (setKeys.length === 0) continue;
    const s = computeStreakFromActiveDates(setKeys, c.now);
    if (s.current >= 2) {
      out.push({
        id: `dhikr.${setId}-streak`,
        domain: 'dhikr',
        kind: 'streak',
        tone: 'celebrate',
        title: `سلسلة ${meta.label}`,
        body: `${days(s.current)} متتالية${s.current >= s.longest ? ' — أطول سلسلة لك' : `، وأطول سلسلة ${days(s.longest)}`}`,
        value: days(s.current),
        priority: s.current >= s.longest ? 78 : 66,
        to,
        metric: s.current,
      });
    }
    const doneToday = setKeys.includes(c.todayKey);
    if (!doneToday && s.current >= 2 && c.hour >= meta.from && c.hour <= meta.to) {
      out.push({
        id: `dhikr.${setId}-pending`,
        domain: 'dhikr',
        kind: 'nudge',
        tone: 'encourage',
        title: `${meta.label} بانتظارك`,
        body: `لم تقرأ ${meta.label} بعد — حافظ على سلسلة ${days(s.current)}`,
        priority: 82,
        to: '/adhkar',
        metric: s.current,
      });
    }
  }

  // Reps this week vs last (dhikr sets + tasbih).
  const repsDay = new Map<string, number>();
  for (const d of ['dhikr', 'tasbih']) {
    for (const [k, v] of c.actDay.get(d) ?? []) repsDay.set(k, (repsDay.get(k) ?? 0) + v);
  }
  const repsNow = sumInWindow(repsDay, c.now, 7);
  const repsPrev = sumInWindow(repsDay, subDays(c.now, 7), 7);
  if (repsNow > 0) {
    const pct = repsPrev > 0 ? Math.round(((repsNow - repsPrev) / repsPrev) * 100) : null;
    out.push({
      id: 'dhikr.reps-week',
      domain: 'dhikr',
      kind: 'comparison',
      tone: pct == null || pct >= 0 ? 'celebrate' : 'encourage',
      title: 'ذكرك هذا الأسبوع',
      body:
        pct == null
          ? `رددت ${plain(repsNow)} ذكراً في آخر ٧ أيام`
          : pct >= 0
            ? `رددت ${plain(repsNow)} ذكراً في آخر ٧ أيام — أكثر من الأسبوع الذي قبله بـ${toArabicDigits(pct)}٪`
            : `رددت ${plain(repsNow)} ذكراً في آخر ٧ أيام، أقل من الأسبوع الذي قبله بـ${toArabicDigits(-pct)}٪`,
      value: plain(repsNow),
      priority: pct != null && pct > 0 ? 58 : 42,
      to,
      metric: repsNow,
    });
    // Best day ever — today.
    const todayReps = repsDay.get(c.todayKey) ?? 0;
    const bestOther = Math.max(0, ...[...repsDay].filter(([k]) => k !== c.todayKey).map(([, v]) => v));
    if (repsDay.size >= 5 && todayReps >= 100 && todayReps > bestOther) {
      out.push({
        id: 'dhikr.record-day',
        domain: 'dhikr',
        kind: 'record',
        tone: 'celebrate',
        title: 'أكثر يوم ذكراً',
        body: `رددت اليوم ${plain(todayReps)} ذكراً — أكثر يوم لك منذ بدأت`,
        value: plain(todayReps),
        priority: 86,
        to,
        metric: todayReps,
      });
    }
  }

  // Most recited phrase over the last 30 days.
  const cutoff = key(subDays(c.now, 29));
  const phrase = new Map<string, number>();
  for (const e of c.snap.activity ?? []) {
    if (e.dateKey < cutoff) continue;
    if (e.domain === 'dhikr' || e.domain === 'tasbih') {
      const label = (e.domain === 'dhikr' ? e.detail : e.title) ?? e.title;
      phrase.set(label, (phrase.get(label) ?? 0) + e.amount);
    }
  }
  const top = [...phrase].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 20) {
    const short = top[0].length > 38 ? `${top[0].slice(0, 36)}…` : top[0];
    out.push({
      id: 'dhikr.most-recited',
      domain: 'dhikr',
      kind: 'trend',
      tone: 'info',
      title: 'أكثر ما تردده',
      body: `«${short}» — ${times(top[1])} في آخر ٣٠ يوماً`,
      value: plain(top[1]),
      priority: 35,
      to,
      metric: top[1],
    });
  }

  // Tasbih lifetime milestones.
  const tasbihTotal = (c.snap.tasbih ?? []).reduce((s, t) => s + t.total, 0);
  if (tasbihTotal > 0) {
    const lastWeek = sumInWindow(c.actDay.get('tasbih'), c.now, 7);
    out.push(
      ...countLadder(
        'tasbih.lifetime',
        'dhikr',
        tasbihTotal,
        Math.max(0, tasbihTotal - lastWeek),
        [100, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
        (n) => `${plain(n)} تسبيحة`,
        'التسبيح',
        to,
      ),
    );
    out.push({
      id: 'tasbih.total',
      domain: 'dhikr',
      kind: 'record',
      tone: 'info',
      title: 'رصيد التسبيح',
      body: `سبّحت ${plain(tasbihTotal)} تسبيحة منذ بدأت في السبحة`,
      value: plain(tasbihTotal),
      priority: 30,
      to,
      metric: tasbihTotal,
    });
  }
  return out;
}

const UNIT_AR: Record<string, (n: number) => string> = {
  page: pages,
  ayat: (n) => arCount(n, 'آية واحدة', 'آيتين', 'آيات', 'آية'),
  juz: (n) => arCount(n, 'جزء واحد', 'جزأين', 'أجزاء', 'جزءاً'),
  hizb: (n) => arCount(n, 'حزب واحد', 'حزبين', 'أحزاب', 'حزباً'),
  surah: (n) => arCount(n, 'سورة واحدة', 'سورتين', 'سور', 'سورة'),
};

function quranInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/quran';
  const wh = c.snap.wirdHistory ?? {};
  const readKeys = Object.entries(wh)
    .filter(([, e]) => e.achieved > 0)
    .map(([k]) => k);
  out.push(...streakInsights({ domain: 'quran', keys: readKeys, label: 'الورد', unit: days, to, now: c.now }));

  const t = wh[c.todayKey];
  if (t && t.amount > 0) {
    const u = UNIT_AR[t.unit] ?? plain;
    if (t.achieved >= t.amount) {
      out.push({
        id: 'quran.wird-done',
        domain: 'quran',
        kind: 'record',
        tone: 'celebrate',
        title: 'أتممت وردك',
        body: `قرأت ${u(t.achieved)} اليوم — تقبّل الله`,
        value: u(t.achieved),
        priority: 60,
        to,
        progress: 1,
      });
    } else if (t.achieved > 0) {
      out.push({
        id: 'quran.wird-remaining',
        domain: 'quran',
        kind: 'nudge',
        tone: 'encourage',
        title: 'وردك قريب',
        body: `بقي ${u(t.amount - t.achieved)} لتتم ورد اليوم`,
        value: `${toArabicDigits(t.achieved)}/${toArabicDigits(t.amount)}`,
        priority: 74,
        to: '/quran',
        progress: t.achieved / t.amount,
      });
    }
  }

  const set = new Set(readKeys);
  const w = weekComparison(
    'quran.week-vs-last',
    'quran',
    countInWindow(set, c.now, 7),
    countInWindow(set, subDays(c.now, 7), 7),
    'أيام قراءتك',
    days,
    to,
    7,
  );
  if (w) out.push(w);

  // Pages (page-unit wird only — honest counts).
  let pagesMonth = 0;
  let pagesTotal = 0;
  let pagesWeek = 0;
  let pages14 = 0;
  const weekAgo = key(subDays(c.now, 6));
  const twoWeeks = key(subDays(c.now, 13));
  for (const [k, e] of Object.entries(wh)) {
    if (e.unit !== 'page') continue;
    pagesTotal += e.achieved;
    if (k.startsWith(c.monthPrefix)) pagesMonth += e.achieved;
    if (k >= weekAgo) pagesWeek += e.achieved;
    if (k >= twoWeeks) pages14 += e.achieved;
  }
  if (pagesMonth > 0) {
    out.push({
      id: 'quran.pages-month',
      domain: 'quran',
      kind: 'record',
      tone: 'info',
      title: 'قراءة الشهر',
      body: `قرأت ${pages(pagesMonth)} هذا الشهر`,
      value: plain(pagesMonth),
      priority: 40,
      to,
      metric: pagesMonth,
    });
  }
  if (pagesTotal > 0) {
    out.push(
      ...countLadder(
        'quran.pages',
        'quran',
        pagesTotal,
        pagesTotal - pagesWeek,
        [50, 100, 300, 604, 1000, 1812, 3020, 6040],
        pages,
        'القراءة',
        to,
      ),
    );
  }
  // Named khatma: pages covered since ITS start (never "page / 604" — a
  // khatma begun mid-mushaf is not half done).
  const kh = c.snap.khatma;
  if (kh && kh.read > 0) {
    const pct = Math.round((Math.min(kh.read, 604) / 604) * 100);
    const pace = pages14 / 14;
    const left = 604 - kh.read;
    const eta = pace > 0 && left > 0 ? Math.ceil(left / pace) : null;
    out.push({
      id: 'quran.khatma',
      domain: 'quran',
      kind: 'trend',
      tone: left <= 0 ? 'celebrate' : 'info',
      title: 'طريقك إلى الختمة',
      body:
        left <= 0
          ? `أتممت «${kh.name}» — تقبّل الله`
          : eta != null
            ? `«${kh.name}»: قرأت ${pages(kh.read)} من ٦٠٤ (${toArabicDigits(pct)}٪) — بمعدلك الحالي تختم خلال ${days(eta)}`
            : `«${kh.name}»: قرأت ${pages(kh.read)} من ٦٠٤ (${toArabicDigits(pct)}٪)`,
      value: `${toArabicDigits(pct)}٪`,
      priority: 46,
      to,
      metric: kh.read,
      progress: Math.min(1, kh.read / 604),
    });
  }
  return out;
}

function awradInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/awrad';
  const targets = (c.snap.targets ?? []).filter((t) => !t.completedAt);
  const history = c.snap.targetHistory ?? [];

  const best = targets.reduce<SnapshotTarget | null>((m, t) => ((t.streak ?? 0) > (m?.streak ?? 0) ? t : m), null);
  if (best && (best.streak ?? 0) >= 2) {
    out.push({
      id: 'awrad.target-streak',
      domain: 'awrad',
      kind: 'streak',
      tone: 'celebrate',
      title: 'وِرد ثابت',
      body: `وِرد «${best.title}» مكتمل ${periods(best.streak ?? 0)} متتالية`,
      value: toArabicDigits(best.streak ?? 0),
      priority: 76,
      to,
      metric: best.streak,
    });
  }

  const daily = targets.filter((t) => t.recurrence === 'daily');
  const pending = daily.filter((t) => t.current < t.total);
  if (daily.length > 0 && pending.length === 0) {
    out.push({
      id: 'awrad.all-done',
      domain: 'awrad',
      kind: 'record',
      tone: 'celebrate',
      title: 'أورادك مكتملة',
      body: `أتممت ${arCount(daily.length, 'وِردك اليومي', 'وِرديك اليوميين', 'أوراد يومية', 'وِرداً يومياً')} — تقبّل الله`,
      value: `${toArabicDigits(daily.length)}/${toArabicDigits(daily.length)}`,
      priority: 62,
      to,
      progress: 1,
    });
  } else if (pending.length > 0 && c.hour >= 12) {
    const doneN = daily.length - pending.length;
    out.push({
      id: 'awrad.pending',
      domain: 'awrad',
      kind: 'nudge',
      tone: 'encourage',
      title: 'أوراد اليوم',
      body:
        pending.length === 1
          ? `بقي وِرد «${pending[0].title}» لم يكتمل بعد`
          : `بقي ${arCount(pending.length, 'وِرد', 'وِردان', 'أوراد', 'وِرداً')} من أورادك اليومية لم تكتمل بعد`,
      value: `${toArabicDigits(doneN)}/${toArabicDigits(daily.length)}`,
      priority: 70,
      to: '/targets',
      progress: daily.length ? doneN / daily.length : 0,
    });
  }

  const since = subDays(c.now, 30).getTime();
  const recent = history.filter((r) => r.endedAt >= since);
  if (recent.length >= 5) {
    const done = recent.filter((r) => r.completed).length;
    const pct = Math.round((done / recent.length) * 100);
    out.push({
      id: 'awrad.rate',
      domain: 'awrad',
      kind: 'trend',
      tone: pct >= 80 ? 'celebrate' : 'info',
      title: 'نسبة الإتمام',
      body: `أتممت ${toArabicDigits(pct)}٪ من فترات أورادك في آخر ٣٠ يوماً (${toArabicDigits(done)} من ${toArabicDigits(recent.length)})`,
      value: `${toArabicDigits(pct)}٪`,
      priority: pct >= 80 ? 56 : 40,
      to,
      metric: pct,
      progress: pct / 100,
    });
  }

  // Day-level streak: any wird completed that day.
  const doneDays = new Set(history.filter((r) => r.completed).map((r) => key(new Date(r.endedAt))));
  if (targets.some((t) => t.current >= t.total && t.total > 0)) doneDays.add(c.todayKey);
  out.push(
    ...streakInsights({ domain: 'awrad', keys: [...doneDays], label: 'الأوراد', unit: days, to, now: c.now }),
  );

  const weekCut = subDays(c.now, 7).getTime();
  const extra =
    history.filter((r) => r.endedAt >= weekCut).reduce((s, r) => s + r.extra, 0) +
    targets.reduce((s, t) => s + (t.extra ?? 0), 0);
  if (extra > 0) {
    out.push({
      id: 'awrad.extra',
      domain: 'awrad',
      kind: 'record',
      tone: 'celebrate',
      title: 'نوافل فوق الوِرد',
      body: `زدت ${plain(extra)} نافلة فوق أورادك في آخر ٧ أيام`,
      value: `+${plain(extra)}`,
      priority: 50,
      to,
      metric: extra,
    });
  }
  return out;
}

function qiyamInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/qiyam';
  const qn = Object.values(c.snap.qiyamNights);
  const tonight = nightKeyOf(c.now);
  const keys = qn.map((n) => n.nightKey);
  out.push(
    ...streakInsights({
      domain: 'qiyam',
      keys,
      bridged: bridgedFor(c.snap, 'qiyam'),
      label: 'قيام الليل',
      unit: nights,
      to,
      now: c.now,
      anchorKey: tonight,
      riskWhen: 'الليلة',
    }),
  );
  if (qn.length === 0) return out;

  const month = tonight.slice(0, 7);
  const inMonth = qn.filter((n) => n.nightKey.startsWith(month));
  const totalRakaat = qn.reduce((s, n) => s + n.rakaat + (n.witr ? 1 : 0), 0);
  out.push({
    id: 'qiyam.month',
    domain: 'qiyam',
    kind: 'record',
    tone: 'info',
    title: 'قيام هذا الشهر',
    body: `قمت ${nights(inMonth.length)} هذا الشهر${totalRakaat > 0 ? `، و${formatNumberAr(totalRakaat)} ركعة منذ بدأت` : ''}`,
    value: nights(inMonth.length),
    priority: 40,
    to,
    metric: inMonth.length,
  });

  const best = qn.reduce((m, n) => (n.rakaat > m.rakaat ? n : m), qn[0]);
  const bestOther = Math.max(0, ...qn.filter((n) => n.nightKey !== tonight).map((n) => n.rakaat));
  if (best.rakaat >= 8 && best.nightKey === tonight && best.rakaat > bestOther) {
    out.push({
      id: 'qiyam.record-rakaat',
      domain: 'qiyam',
      kind: 'record',
      tone: 'celebrate',
      title: 'ليلة مميزة',
      body: `صلّيت الليلة ${rakaat(best.rakaat)} — أكثر ليلة قيام لك`,
      value: rakaat(best.rakaat),
      priority: 85,
      to,
      metric: best.rakaat,
    });
  }

  // Month record (more nights than any previous month).
  const byMonth = new Map<string, number>();
  for (const n of qn) byMonth.set(n.nightKey.slice(0, 7), (byMonth.get(n.nightKey.slice(0, 7)) ?? 0) + 1);
  const prevBest = Math.max(0, ...[...byMonth].filter(([m]) => m !== month).map(([, v]) => v));
  if (byMonth.size >= 2 && inMonth.length >= 4 && inMonth.length > prevBest) {
    out.push({
      id: 'qiyam.month-record',
      domain: 'qiyam',
      kind: 'record',
      tone: 'celebrate',
      title: 'أفضل شهر قيام',
      body: `هذا الشهر أكثر شهر قمت فيه: ${nights(inMonth.length)} حتى الآن`,
      value: nights(inMonth.length),
      priority: 83,
      to,
      metric: inMonth.length,
    });
  }

  // Witr rate over the last 30 nights logged.
  const cutoff = key(subDays(c.now, 30));
  const last30 = qn.filter((n) => n.nightKey >= cutoff && n.rakaat > 0);
  if (last30.length >= 3) {
    const witr = last30.filter((n) => n.witr).length;
    const pct = Math.round((witr / last30.length) * 100);
    out.push({
      id: 'qiyam.witr-rate',
      domain: 'qiyam',
      kind: 'trend',
      tone: pct >= 70 ? 'celebrate' : 'info',
      title: 'الوتر في قيامك',
      body: `أوترت في ${toArabicDigits(pct)}٪ من لياليك خلال آخر ٣٠ يوماً`,
      value: `${toArabicDigits(pct)}٪`,
      priority: 44,
      to,
      metric: pct,
      progress: pct / 100,
    });
  }

  // Favourite night of the week.
  if (qn.length >= 6) {
    const wd = new Array<number>(7).fill(0);
    for (const n of qn) wd[getDay(parseDateKey(n.nightKey))]++;
    const topIdx = wd.indexOf(Math.max(...wd));
    // A night keyed Thursday is ليلة الجمعة (the night BEFORE Friday).
    const nightName = `ليلة ${WEEKDAY_LABELS_AR[(topIdx + 1) % 7]}`;
    out.push({
      id: 'qiyam.weekday',
      domain: 'qiyam',
      kind: 'trend',
      tone: 'info',
      title: 'ليلتك المفضلة',
      body: `أكثر ليلة تقوم فيها: ${nightName} (${nights(wd[topIdx])})`,
      value: nightName,
      priority: 32,
      to,
      metric: wd[topIdx],
    });
  }

  const set = new Set(keys);
  const anchor = parseDateKey(tonight);
  const w = weekComparison(
    'qiyam.week-vs-last',
    'qiyam',
    countInWindow(set, anchor, 7),
    countInWindow(set, subDays(anchor, 7), 7),
    'ليالي قيامك',
    nights,
    to,
    7,
  );
  if (w) out.push(w);

  if (totalRakaat > 0) {
    const weekAgo = key(subDays(anchor, 7));
    const before = qn.filter((n) => n.nightKey <= weekAgo).reduce((s, n) => s + n.rakaat + (n.witr ? 1 : 0), 0);
    out.push(
      ...countLadder('qiyam.rakaat', 'qiyam', totalRakaat, before, [50, 100, 250, 500, 1000, 2000, 5000], rakaat, 'قيام الليل', to),
    );
  }
  return out;
}

function habitInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/habits';
  const habits = c.snap.habits ?? [];
  if (habits.length === 0) return out;
  let best: { name: string; s: number; longest: number } | null = null;
  let doneToday = 0;
  const rate: { name: string; n: number }[] = [];
  const cutoff = key(subDays(c.now, 29));
  for (const h of habits) {
    const keys = moduleKeys(c.snap.dailyProgress, h.id);
    const s = computeStreakFromActiveDates(keys, c.now);
    if (!best || s.current > best.s) best = { name: h.nameAr, s: s.current, longest: s.longest };
    if (keys.includes(c.todayKey)) doneToday++;
    rate.push({ name: h.nameAr, n: keys.filter((k) => k >= cutoff).length });
  }
  if (best && best.s >= 2) {
    out.push({
      id: 'habits.streak',
      domain: 'habits',
      kind: 'streak',
      tone: 'celebrate',
      title: 'عادة راسخة',
      body: `عادة «${best.name}» ${days(best.s)} متتالية${best.s >= best.longest ? ' — أطول سلسلة لها' : ''}`,
      value: days(best.s),
      priority: 72,
      to,
      metric: best.s,
    });
  }
  if (doneToday === habits.length) {
    out.push({
      id: 'habits.all-done',
      domain: 'habits',
      kind: 'record',
      tone: 'celebrate',
      title: 'عاداتك اليوم',
      body: `أتممت عاداتك كلها اليوم (${toArabicDigits(doneToday)} من ${toArabicDigits(habits.length)})`,
      value: `${toArabicDigits(doneToday)}/${toArabicDigits(habits.length)}`,
      priority: 60,
      to,
      progress: 1,
    });
  } else if (c.hour >= 17) {
    out.push({
      id: 'habits.pending',
      domain: 'habits',
      kind: 'nudge',
      tone: 'encourage',
      title: 'عادات اليوم',
      body: `أتممت ${toArabicDigits(doneToday)} من ${toArabicDigits(habits.length)} عادات اليوم — ما زال في اليوم متسع`,
      value: `${toArabicDigits(doneToday)}/${toArabicDigits(habits.length)}`,
      priority: 54,
      to: '/habits',
      progress: doneToday / habits.length,
    });
  }
  const top = [...rate].sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 5) {
    out.push({
      id: 'habits.best',
      domain: 'habits',
      kind: 'trend',
      tone: 'info',
      title: 'أقوى عاداتك',
      body: `«${top.name}» أنجزتها ${days(top.n)} من آخر ٣٠ يوماً`,
      value: `${toArabicDigits(top.n)}/٣٠`,
      priority: 36,
      to,
      metric: top.n,
      progress: top.n / 30,
    });
  }
  return out;
}

function fastingInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/fasting';
  const keys = moduleKeys(c.snap.dailyProgress, 'fasting');
  out.push(
    ...streakInsights({ domain: 'fasting', keys, label: 'الصيام', unit: days, to, now: c.now, atRisk: false }),
  );
  const month = keys.filter((k) => k.startsWith(c.monthPrefix)).length;
  if (month > 0) {
    out.push({
      id: 'fasting.month',
      domain: 'fasting',
      kind: 'record',
      tone: 'info',
      title: 'صيام الشهر',
      body: `صمت ${days(month)} هذا الشهر — تقبّل الله`,
      value: days(month),
      priority: 42,
      to,
      metric: month,
    });
  }
  if (keys.length > 0) {
    const weekAgo = key(subDays(c.now, 7));
    out.push(
      ...countLadder('fasting.days', 'fasting', keys.length, keys.filter((k) => k <= weekAgo).length, [1, 7, 10, 30, 50, 100, 200], days, 'صيام التطوع', to),
    );
  }
  if (c.hour >= 12) {
    const tomorrow = addDays(c.now, 1);
    const wd = tomorrow.getDay();
    const hd = hijriDay(tomorrow);
    if (hd != null && hd >= 13 && hd <= 15) {
      out.push({
        id: 'fasting.white-days',
        domain: 'fasting',
        kind: 'nudge',
        tone: 'encourage',
        title: 'الأيام البيض',
        body: `غداً ${toArabicDigits(hd)} من الشهر الهجري — من الأيام البيض المستحب صيامها`,
        priority: 59,
        to: '/module/fasting',
      });
    } else if (wd === 1 || wd === 4) {
      out.push({
        id: 'fasting.sunnah-tomorrow',
        domain: 'fasting',
        kind: 'nudge',
        tone: 'encourage',
        title: 'صيام مستحب',
        body: `غداً ${WEEKDAY_LABELS_AR[wd]} — يوم يُستحب صيامه، فانوِ الصيام إن استطعت`,
        priority: 55,
        to: '/module/fasting',
      });
    }
  }
  return out;
}

function sadaqahInsights(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const to = '/stats/sadaqah';
  const entries = c.snap.sadaqah ?? [];
  if (entries.length === 0) return out;
  const monthN = entries.filter((e) => e.date.startsWith(c.monthPrefix)).length;
  if (monthN > 0) {
    out.push({
      id: 'sadaqah.month',
      domain: 'sadaqah',
      kind: 'record',
      tone: 'celebrate',
      title: 'صدقات الشهر',
      body: `تصدّقت ${times(monthN)} هذا الشهر — «ما نقص مال من صدقة»`,
      value: toArabicDigits(monthN),
      priority: 45,
      to,
      metric: monthN,
    });
  }
  const last = entries.map((e) => e.date.slice(0, 10)).sort().pop()!;
  const gap = differenceInCalendarDays(c.now, parseDateKey(last));
  if (gap >= 14) {
    out.push({
      id: 'sadaqah.gap',
      domain: 'sadaqah',
      kind: 'nudge',
      tone: 'encourage',
      title: 'صدقة ولو قليلة',
      body: `مضى ${days(gap)} على آخر صدقة — «أحبّ الأعمال إلى الله أدومها وإن قلّ»`,
      priority: 43,
      to: '/sadaqah',
      metric: gap,
    });
  }
  // Consecutive weeks (Saturday-start) with at least one donation.
  const weekKey = (d: Date) => key(startOfWeek(d, { weekStartsOn: 6 }));
  const weeksSet = new Set(entries.map((e) => weekKey(parseDateKey(e.date.slice(0, 10)))));
  let cursor = startOfWeek(c.now, { weekStartsOn: 6 });
  if (!weeksSet.has(key(cursor))) cursor = subDays(cursor, 7);
  let run = 0;
  while (weeksSet.has(key(cursor))) {
    run++;
    cursor = subDays(cursor, 7);
  }
  if (run >= 2) {
    out.push({
      id: 'sadaqah.weeks',
      domain: 'sadaqah',
      kind: 'streak',
      tone: 'celebrate',
      title: 'صدقة كل أسبوع',
      body: `تصدّقت ${weeks(run)} متتالية دون انقطاع`,
      value: weeks(run),
      priority: 64,
      to,
      metric: run,
    });
  }
  return out;
}

// ── public engine ──────────────────────────────────────────────────────────
export function computeInsights(snap: InsightsSnapshot, now: Date = new Date()): Insight[] {
  const c = buildCtx(snap, now);
  const all = [
    ...overallInsights(c),
    ...prayerInsights(c),
    ...dhikrInsights(c),
    ...quranInsights(c),
    ...awradInsights(c),
    ...qiyamInsights(c),
    ...habitInsights(c),
    ...fastingInsights(c),
    ...sadaqahInsights(c),
  ];
  const seen = new Set<string>();
  return all
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => b.priority - a.priority);
}

// ── personal records (records wall) ────────────────────────────────────────
export interface PersonalRecord {
  id: string;
  domain: InsightDomain;
  label: string;
  /** Formatted value, e.g. "١٢ يوماً". */
  value: string;
  metric: number;
  /** When it happened (formatted), if known. */
  when?: string;
  to: string;
}

function whenAr(k: string): string {
  const d = parseDateKey(k);
  return `${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicDigits(d.getFullYear())}`;
}

/** All-time bests across every section (only records with a real value). */
export function computeRecords(snap: InsightsSnapshot, now: Date = new Date()): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  const push = (r: PersonalRecord) => {
    if (r.metric > 0) out.push(r);
  };
  const dp = snap.dailyProgress;

  const overallKeys = Object.values(dp)
    .filter((d) => d.modules.some((m) => m.completed))
    .map((d) => d.dateKey);
  const os = computeStreakFromActiveDates(overallKeys, now);
  push({ id: 'overall.longest', domain: 'overall', label: 'أطول سلسلة عبادة', value: days(os.longest), metric: os.longest, to: '/stats' });
  const byMonth = new Map<string, number>();
  for (const k of overallKeys) byMonth.set(k.slice(0, 7), (byMonth.get(k.slice(0, 7)) ?? 0) + 1);
  const bm = [...byMonth].sort((a, b) => b[1] - a[1])[0];
  if (bm) {
    const [y, m] = bm[0].split('-').map(Number);
    push({ id: 'overall.best-month', domain: 'overall', label: 'أنشط شهر', value: days(bm[1]), metric: bm[1], when: `${ARABIC_MONTHS[m - 1]} ${toArabicDigits(y)}`, to: '/stats' });
  }

  const full = Object.entries(snap.prayerFardDays).filter(([, n]) => n >= 5).map(([k]) => k);
  const ps = computeStreakFromActiveDates(full, now);
  push({ id: 'prayers.longest', domain: 'prayers', label: 'أطول سلسلة للصلوات الخمس', value: days(ps.longest), metric: ps.longest, to: '/stats/prayers' });
  push({ id: 'prayers.perfect-days', domain: 'prayers', label: 'أيام مكتملة الفروض', value: days(full.length), metric: full.length, to: '/stats/prayers' });

  const ds = computeStreakFromActiveDates(moduleKeys(dp, 'dhikr'), now, bridgedFor(snap, 'dhikr'));
  push({ id: 'dhikr.longest', domain: 'dhikr', label: 'أطول سلسلة أذكار', value: days(ds.longest), metric: ds.longest, to: '/stats/dhikr' });
  const reps = new Map<string, number>();
  for (const e of snap.activity ?? []) {
    if (e.domain === 'dhikr' || e.domain === 'tasbih') reps.set(e.dateKey, (reps.get(e.dateKey) ?? 0) + e.amount);
  }
  const br = [...reps].sort((a, b) => b[1] - a[1])[0];
  if (br) push({ id: 'dhikr.best-day', domain: 'dhikr', label: 'أكثر يوم ذكراً', value: `${formatNumberAr(br[1])} ذكراً`, metric: br[1], when: whenAr(br[0]), to: '/stats/dhikr' });
  const tt = (snap.tasbih ?? []).reduce((s, t) => s + t.total, 0);
  push({ id: 'tasbih.total', domain: 'dhikr', label: 'رصيد التسبيح', value: formatNumberAr(tt), metric: tt, to: '/stats/dhikr' });

  const wh = snap.wirdHistory ?? {};
  const qs = computeStreakFromActiveDates(Object.entries(wh).filter(([, e]) => e.achieved > 0).map(([k]) => k), now);
  push({ id: 'quran.longest', domain: 'quran', label: 'أطول سلسلة ورد', value: days(qs.longest), metric: qs.longest, to: '/stats/quran' });
  const bq = Object.entries(wh).filter(([, e]) => e.unit === 'page').sort((a, b) => b[1].achieved - a[1].achieved)[0];
  if (bq) push({ id: 'quran.best-day', domain: 'quran', label: 'أكثر يوم قراءة', value: pages(bq[1].achieved), metric: bq[1].achieved, when: whenAr(bq[0]), to: '/stats/quran' });

  const qn = Object.values(snap.qiyamNights);
  const qms = computeStreakFromActiveDates(qn.map((n) => n.nightKey), parseDateKey(nightKeyOf(now)), bridgedFor(snap, 'qiyam'));
  push({ id: 'qiyam.longest', domain: 'qiyam', label: 'أطول سلسلة قيام', value: nights(qms.longest), metric: qms.longest, to: '/stats/qiyam' });
  const bn = qn.reduce<QiyamNightLike | null>((m, n) => (n.rakaat > (m?.rakaat ?? 0) ? n : m), null);
  if (bn) push({ id: 'qiyam.best-night', domain: 'qiyam', label: 'أكثر ليلة ركعات', value: rakaat(bn.rakaat), metric: bn.rakaat, when: whenAr(bn.nightKey), to: '/stats/qiyam' });

  const bt = (snap.targets ?? []).reduce((m, t) => Math.max(m, t.streak ?? 0), 0);
  push({ id: 'awrad.best-streak', domain: 'awrad', label: 'أطول سلسلة وِرد', value: periods(bt), metric: bt, to: '/stats/awrad' });

  const fk = moduleKeys(dp, 'fasting');
  push({ id: 'fasting.total', domain: 'fasting', label: 'أيام صيام التطوع', value: days(fk.length), metric: fk.length, to: '/stats/fasting' });

  const sq = snap.sadaqah ?? [];
  push({ id: 'sadaqah.count', domain: 'sadaqah', label: 'صدقات مسجّلة', value: times(sq.length), metric: sq.length, to: '/stats/sadaqah' });
  return out;
}
