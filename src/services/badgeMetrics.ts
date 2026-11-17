/**
 * Badge metrics — PURE: a plain snapshot of the worship stores in, every
 * catalog metric out (plus today's «تحديات اليوم» and the gallery model).
 * BadgeEngine collects the snapshot; scripts/badges.test.ts feeds fakes.
 *
 * Conventions:
 *  - Day keys are local 'yyyy-MM-dd'. A qiyam night is keyed by its EVENING.
 *  - Streaks: today (still running) never breaks a chain; excused / frozen
 *    days bridge without counting. `best` = the longest run ever, so a past
 *    chain that reached a badge unlocks it.
 *  - Women's excused days satisfy the «five prayers» part of a combined day
 *    (nothing else is asked of them that day), never prayer counts.
 */
import { addDays, format, getDaysInMonth, startOfWeek } from 'date-fns';
import type { DailyProgress } from '@/types';
import {
  adhkarCountOf,
  fardCountOf,
  rawatibRakaatOf,
  duhaRakaatOf,
  PRAYERS_ORDER,
  rawatibFullOn,
  rawatibOn,
  type DuhaEntry,
  type PrayerDayLog,
} from '@/store/prayerLogStore';
import { toArabicDigits } from '@/services/statsService';
import { quranTypeStats, typesActiveOn, type MushafiKhatma, type MushafiMark, type RibbonTops } from '@/store/mushafiStore';
import { QURAN_TYPE_IDS, QURAN_TYPES, type QuranType } from '@/data/quranTypes';
import { fromHijri, hijriMonthLength, toHijri, type HijriDate } from '@/services/HijriService';
import {
  BADGES,
  BADGE_CATEGORIES,
  METRICS,
  RARITY_ORDER,
  RARITY_RANK,
  TRACKS,
  badgePoints,
  badgeVisible,
  levelFor,
  type BadgeCategory,
  type BadgeDefinition,
  type BadgeMetric,
  type BadgeRarity,
} from '@/data/badges';

const DAY_MS = 86_400_000;

export interface BadgeSnapshot {
  now: Date;
  gender: 'male' | 'female' | null;
  /** The user's Hijri sighting offset (calendar prefs). */
  hijriOffset: number;
  dailyProgress: Record<string, DailyProgress>;
  freezesUsed: Record<string, string[]>;
  prayerLog: Record<string, PrayerDayLog>;
  excused: Record<string, true>;
  duha: Record<string, DuhaEntry>;
  qiyam: Record<string, { rakaat: number; witr: boolean; loggedAt: number }>;
  /** Night keys logged inside the last third of the night (needs prayer times — precomputed). */
  lastThirdNights: string[];
  events: { ts: number; dateKey: string; domain: string; refId?: string; amount: number }[];
  tasbihLifetime: number;
  /** Wird pages per day (lifetime) and distinct reader pages per day (last ~120 days). */
  wirdPages: Record<string, number>;
  readingDays: Record<string, number>;
  /** Finished khatmas: the old reader's + مصحفي's (listening ones have their own track). */
  khatmasFinished: number;
  /** «مصحفي»: pages per day, khatmas (with their types) and ribbons — see mushafiStore. */
  mushafi: { days: Record<string, number[]>; khatmas: MushafiKhatma[]; marks: MushafiMark[]; tops?: RibbonTops };
  /** Days the whole Quran wird (every running khatma's portion) was done. */
  quranWirdDays: string[];
  hifzSessions: { mode: string; accuracy: number; correct: number }[];
  hifzItems: { lastAccuracy: number }[];
  awradHistory: { targetId: string; endedAt: number; completed: boolean; extra: number }[];
  targets: { recurrence?: string; streak?: number; extra?: number }[];
  /** This Hijri year's Ramadan log (the store resets yearly). */
  ramadan: { year: number | null; taraweeh: number[]; juz: number };
  sadaqah: { date: string; cause: string }[];
  circles: {
    format: string;
    status: string;
    subject: string;
    totalLessons?: number;
    platform?: string;
    durationMin?: number;
    slots?: { weekday: number; durationMin?: number }[];
    log: { date: number; status: string; durationMin?: number }[];
  }[];
  /** «مهام المنزل» (houseStore) — scored on the board only. */
  house?: { chore: string; kind?: string; day: string }[];
  tasks: { repeat: string; done: boolean; history?: Record<string, number> }[];
  asmaStudied: number;
  hadithFavorites: number;
}

export interface ComboPart {
  id: string;
  label: string;
  done: boolean;
  /** e.g. «٣/٥». */
  note?: string;
  to: string;
}

export interface TodayCombo {
  metric: BadgeMetric;
  title: string;
  parts: ComboPart[];
  doneCount: number;
  done: boolean;
}

export interface BadgeMetrics {
  value: Record<BadgeMetric, number>;
  best: Partial<Record<BadgeMetric, number>>;
  today: TodayCombo[];
  /** 0–1 per door: how active the last four weeks were (see ACTIVITY_DAYS). */
  activity?: Partial<Record<BadgeCategory, number>>;
}

/** «قوتك»: doors are judged on the last four weeks, not on badges won long ago. */
export const ACTIVITY_DAYS = 28;

// ── date helpers ───────────────────────────────────────────────────────────
const noon = (k: string) => new Date(`${k}T12:00:00`);
const keyOf = (d: Date) => format(d, 'yyyy-MM-dd');
/** Pure day-key maths, cached: the metrics walk the same few thousand keys many times. */
function memo(fn: (k: string) => string): (k: string) => string {
  const cache = new Map<string, string>();
  return (k) => {
    let v = cache.get(k);
    if (v === undefined) {
      if (cache.size > 20_000) cache.clear();
      cache.set(k, (v = fn(k)));
    }
    return v;
  };
}
const nextKey = memo((k) => keyOf(addDays(noon(k), 1)));
const prevKey = memo((k) => keyOf(addDays(noon(k), -1)));
const shift = (k: string, n: number) => {
  let x = k;
  for (let i = 0; i < Math.abs(n); i++) x = n > 0 ? nextKey(x) : prevKey(x);
  return x;
};
const weekOf = memo((k) => keyOf(startOfWeek(noon(k), { weekStartsOn: 6 })));
const prevWeek = (w: string) => weekOf(shift(w, -7));
const monthOf = (k: string) => k.slice(0, 7);
function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

type Run = { current: number; longest: number };

/** 'yyyy-MM-dd' → a day number (calendar arithmetic, no time zone involved). */
const dayNum = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / DAY_MS;

/**
 * Current and longest chain of day keys — the semantics of statsService's
 * computeStreakFromActiveDates (today may still be open; `bridged` days keep a
 * chain without counting), on integer days: the metrics run ~30 chains over
 * years of keys, and date-fns parsing made that the whole cost.
 */
function run(keys: Iterable<string>, now: Date, bridged?: ReadonlySet<string>): Run {
  const set = new Set<number>();
  for (const k of keys) set.add(dayNum(k));
  if (!set.size) return { current: 0, longest: 0 };
  const br = new Set<number>();
  if (bridged) for (const k of bridged) br.add(dayNum(k));
  const today = dayNum(keyOf(now));
  let current = 0;
  for (let d = set.has(today) ? today : today - 1, g = 0; g < 3660; g++, d--) {
    if (set.has(d)) current++;
    else if (!br.has(d)) break;
  }
  const sorted = [...set].sort((a, c) => a - c);
  let longest = 1;
  let r = 1;
  for (let i = 1; i < sorted.length; i++) {
    let joined = sorted[i] - sorted[i - 1] === 1;
    if (!joined && br.size) {
      joined = true;
      for (let x = sorted[i - 1] + 1; x < sorted[i] && joined; x++) joined = br.has(x);
    }
    r = joined ? r + 1 : 1;
    longest = Math.max(longest, r);
  }
  return { current, longest: Math.max(longest, current) };
}

/** Consecutive weeks / months holding something; the current one may still be filling. */
function periodRun(periods: Set<string>, current: string, prev: (p: string) => string): Run {
  let cur = 0;
  let p = periods.has(current) ? current : prev(current);
  for (let guard = 0; guard < 1200 && periods.has(p); guard++) {
    cur++;
    p = prev(p);
  }
  const sorted = [...periods].sort();
  let longest = cur;
  let r = 0;
  sorted.forEach((x, i) => {
    r = i > 0 && prev(x) === sorted[i - 1] ? r + 1 : 1;
    longest = Math.max(longest, r);
  });
  return { current: cur, longest };
}

const maxOf = (xs: Iterable<number>) => {
  let m = 0;
  for (const x of xs) if (x > m) m = x;
  return m;
};

export function computeBadgeMetrics(s: BadgeSnapshot): BadgeMetrics {
  const { now, prayerLog: log, excused, duha, qiyam, dailyProgress: dp } = s;
  const today = keyOf(now);
  const male = s.gender === 'male';

  // ── Hijri, memoised ──
  const hijriMemo = new Map<string, HijriDate>();
  const hijriOf = (k: string) => {
    let h = hijriMemo.get(k);
    if (!h) hijriMemo.set(k, (h = toHijri(noon(k), s.hijriOffset)));
    return h;
  };
  const lenMemo = new Map<string, number>();
  const monthLen = (y: number, m: number) => {
    const id = `${y}-${m}`;
    let n = lenMemo.get(id);
    if (n === undefined) lenMemo.set(id, (n = hijriMonthLength(y, m, s.hijriOffset)));
    return n;
  };
  const hijriKey = (y: number, m: number, d: number) => keyOf(fromHijri({ year: y, month: m, day: d }, s.hijriOffset));

  // ── module days (progressStore) ──
  const moduleDays = (m: string) =>
    new Set(Object.keys(dp).filter((k) => dp[k]?.modules?.some((x) => x.moduleId === m && x.completed)));
  const active = Object.keys(dp)
    .filter((k) => dp[k]?.modules?.some((x) => x.completed))
    .sort();
  const activeSet = new Set(active);
  const frozenFor = (m: string) =>
    new Set(Object.keys(s.freezesUsed).filter((k) => s.freezesUsed[k]?.includes('*') || s.freezesUsed[k]?.includes(m)));
  const anyFrozen = new Set(Object.keys(s.freezesUsed).filter((k) => s.freezesUsed[k]?.length));
  const excusedSet = new Set(Object.keys(excused));
  const fastDays = moduleDays('fasting');

  // ── activity events ──
  const setDays = new Map<string, Set<string>>();
  const repsByDay = new Map<string, number>();
  const tasbihByDay = new Map<string, number>();
  let dhikrEventReps = 0;
  const early = new Set<string>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const e of s.events) {
    const h = new Date(e.ts).getHours();
    if (h >= 3 && h < 7) early.add(e.dateKey);
    if (e.domain === 'dhikr') {
      dhikrEventReps += e.amount;
      add(repsByDay, e.dateKey, e.amount);
      if (e.refId) {
        let set = setDays.get(e.refId);
        if (!set) setDays.set(e.refId, (set = new Set()));
        set.add(e.dateKey);
      }
    } else if (e.domain === 'tasbih') {
      add(repsByDay, e.dateKey, e.amount);
      add(tasbihByDay, e.dateKey, e.amount);
    }
  }
  for (const n of Object.values(qiyam)) {
    const h = new Date(n.loggedAt).getHours();
    if (h >= 3 && h < 7) early.add(keyOf(new Date(n.loggedAt)));
  }
  const setOf = (id: string) => setDays.get(id) ?? new Set<string>();
  const morning = setOf('morning');
  const evening = setOf('evening');
  const postPrayer = setOf('postPrayer');
  const sleep = setOf('sleep');

  // ── per-day facts ──
  const fard = (k: string) => fardCountOf(log[k]);
  const full = (k: string) => fard(k) >= 5;
  const fardOk = (k: string) => full(k) || !!excused[k];
  const rawatib = (k: string) => rawatibRakaatOf(log[k], k, male);
  const rawatibFull = (k: string) => rawatib(k) >= rawatibFullOn(k, male);
  const duhaOn = (k: string) => duhaRakaatOf(duha[k]) > 0;
  const nightOn = (k: string) => !!qiyam[k];
  const mosqueOn = (k: string, p: (typeof PRAYERS_ORDER)[number]) => !!log[k]?.[p]?.mosque;
  const quranModule = moduleDays('quran');
  const pagesOn = (k: string) => Math.max(s.wirdPages[k] ?? 0, s.readingDays[k] ?? 0);
  const quranOn = (k: string) => pagesOn(k) > 0 || quranModule.has(k);
  const sadaqahDays = new Set(s.sadaqah.map((e) => e.date.slice(0, 10)));
  const fajrForIshraq = (k: string) => (male ? mosqueOn(k, 'fajr') : !!log[k]?.fajr?.fard);

  // أذكار ما بعد الصلاة are logged per prayer (PrayerEntry.adhkar). Before the
  // first such tick (older data), a day with any post-prayer reading stands
  // for all five.
  const afterOf = (k: string) => adhkarCountOf(log[k]);
  let firstAfter: string | null = null;
  for (const k of Object.keys(log)) if (afterOf(k) > 0 && (!firstAfter || k < firstAfter)) firstAfter = k;
  const legacyPost = (k: string) => (!firstAfter || k < firstAfter) && postPrayer.has(k);
  const postFull = (k: string) => afterOf(k) >= 5 || legacyPost(k);

  const completeDay = (k: string) => full(k) && rawatibFull(k) && duhaOn(k) && nightOn(k);
  const guarded = (k: string) => fardOk(k) && morning.has(k) && evening.has(k);
  const golden = (k: string) => completeDay(k) && morning.has(k) && evening.has(k) && postFull(k) && quranOn(k);
  const qiyamAround = (k: string) => nightOn(k) || nightOn(shift(k, -1));
  const fastQiyam = (k: string) => fastDays.has(k) && full(k) && qiyamAround(k);
  // An excused day has no prayers to follow — the other three suffice.
  const dhikrAll = (k: string) => morning.has(k) && evening.has(k) && (postFull(k) || !!excused[k]) && sleep.has(k);
  const mosqueFullOn = (k: string) => PRAYERS_ORDER.every((p) => mosqueOn(k, p));
  const ishraq = (k: string) => fajrForIshraq(k) && morning.has(k) && duhaOn(k);

  const allKeys = new Set<string>([
    ...Object.keys(log),
    ...Object.keys(duha),
    ...Object.keys(qiyam),
    ...Object.keys(dp),
    ...Object.keys(s.wirdPages),
    ...Object.keys(s.readingDays),
    ...sadaqahDays,
  ]);
  for (const set of setDays.values()) for (const k of set) allKeys.add(k);
  const keysArr = [...allKeys];
  const daysWhere = (pred: (k: string) => boolean) => keysArr.filter(pred);
  const countWhere = (pred: (k: string) => boolean) => keysArr.reduce((n, k) => n + (pred(k) ? 1 : 0), 0);

  /** Saturday–Friday weeks whose 7 days all pass `pred` (and one passes `need`). */
  const fullWeeks = (pred: (k: string) => boolean, need: (k: string) => boolean = () => true) => {
    let n = 0;
    for (const w of new Set(keysArr.map(weekOf))) {
      let ok = true;
      let any = false;
      for (let i = 0; i < 7 && ok; i++) {
        const k = shift(w, i);
        ok = pred(k);
        any ||= need(k);
      }
      if (ok && any) n++;
    }
    return n;
  };
  /** Calendar months whose every day passes `pred` (and one passes `need`). */
  const fullMonths = (pred: (k: string) => boolean, need: (k: string) => boolean = () => true) => {
    let n = 0;
    for (const m of new Set(keysArr.map(monthOf))) {
      const [y, mo] = m.split('-').map(Number);
      const len = getDaysInMonth(new Date(y, mo - 1, 1));
      let ok = true;
      let any = false;
      for (let d = 1; d <= len && ok; d++) {
        const k = `${m}-${String(d).padStart(2, '0')}`;
        ok = pred(k);
        any ||= need(k);
      }
      if (ok && any) n++;
    }
    return n;
  };

  // ── الثبات ──
  const overall = run(active, now, anyFrozen);
  const perWeek = new Map<string, number>();
  for (const k of active) perWeek.set(weekOf(k), (perWeek.get(weekOf(k)) ?? 0) + 1);
  let comeback = 0;
  for (let i = 1; i + 2 < active.length; i++) {
    const gap = dayNum(active[i]) - dayNum(active[i - 1]);
    if (gap >= 8 && shift(active[i], 1) === active[i + 1] && shift(active[i], 2) === active[i + 2]) comeback++;
  }

  // ── الفرائض ──
  const logKeys = Object.keys(log);
  const fullKeys = logKeys.filter(full);
  const prayerRun = (p: (typeof PRAYERS_ORDER)[number]) => run(logKeys.filter((k) => log[k]?.[p]?.fard), now, excusedSet);
  const each = {
    fajr: prayerRun('fajr'),
    dhuhr: prayerRun('dhuhr'),
    asr: prayerRun('asr'),
    maghrib: prayerRun('maghrib'),
    isha: prayerRun('isha'),
    duha: run(Object.keys(duha), now, excusedSet),
  };
  const prayersRun = run(fullKeys, now, new Set([...excusedSet, ...frozenFor('prayers')]));

  // ── السنن ──
  const rawatibFullKeys = logKeys.filter(rawatibFull);
  const rawatibRun = run(rawatibFullKeys, now, excusedSet);
  const fajrSunnahRun = run(logKeys.filter((k) => log[k]?.fajr?.sunnahBefore), now, excusedSet);
  const sunnahChecks = logKeys.reduce((n, k) => n + rawatibOn(k, male).filter((r) => log[k]?.[r.prayer]?.[r.type]).length, 0);
  const duhaKeys = Object.keys(duha);
  const duhaRak = duhaKeys.map((k) => duhaRakaatOf(duha[k]));
  const nightKeys = Object.keys(qiyam);
  const qiyamUnits = (k: string) => qiyam[k].rakaat + (qiyam[k].witr ? 1 : 0);

  // ── المسجد ──
  const mosqueFull = logKeys.filter(mosqueFullOn);
  const mosqueFajr = logKeys.filter((k) => mosqueOn(k, 'fajr'));
  const mosqueFullRun = run(mosqueFull, now, excusedSet);
  const mosqueFajrRun = run(mosqueFajr, now, excusedSet);

  // ── القيام: a night is still "tonight" until noon, so judge it 12h back ──
  const nightNow = new Date(now.getTime() - DAY_MS / 2);
  const qiyamFrozen = frozenFor('qiyam');
  const qiyamRun = run(new Set([...nightKeys, ...moduleDays('qiyam')]), nightNow, qiyamFrozen);
  const witrRun = run(
    nightKeys.filter((k) => qiyam[k].witr),
    nightNow,
    qiyamFrozen,
  );

  // ── الأذكار ──
  const dhikrModule = moduleDays('dhikr');
  const dhikrFrozen = frozenFor('dhikr');
  const dhikrRun = run(dhikrModule, now, dhikrFrozen);
  const morningRun = run(morning, now, dhikrFrozen);
  const eveningRun = run(evening, now, dhikrFrozen);
  const sleepRun = run(sleep, nightNow, dhikrFrozen);
  const postFullKeys = daysWhere(postFull);
  // Excused days (no prayers) and dhikr freezes bridge the chain.
  const postRun = run(postFullKeys, now, new Set([...dhikrFrozen, ...excusedSet]));

  // ── القرآن ──
  const pageKeys = new Set([...Object.keys(s.wirdPages), ...Object.keys(s.readingDays)]);
  // Pages actually read (the reading log), not just the wird's share of them.
  const pages = [...pageKeys].reduce((a, k) => a + pagesOn(k), 0);
  const quranRun = run(quranModule, now, frozenFor('quran'));
  // Khatma types each at their own pace — never summed across types.
  const qt = quranTypeStats(s.mushafi.days, s.mushafi.khatmas, s.mushafi.marks, today, s.mushafi.tops);
  const typeRun = (ty: QuranType) => run(Object.keys(qt[ty].days), now, frozenFor('quran'));
  const listenRun = typeRun('listen');
  const tafsirRun = typeRun('tafsir');
  const reviewRun = typeRun('hifz');
  const quranWirdRun = run(s.quranWirdDays, now, frozenFor('quran'));
  /** Progress in every type that had a khatma open that day — at least two of them. */
  const shareOn = (k: string) => {
    const open = typesActiveOn(s.mushafi.khatmas, k);
    return open.size >= 2 && [...open].every((ty) => (qt[ty].days[k] ?? 0) > 0);
  };
  const shareDays = new Set<string>();
  for (const ty of QURAN_TYPE_IDS) for (const k of Object.keys(qt[ty].days)) if (shareOn(k)) shareDays.add(k);

  // ── الأوراد: the longest run of consecutive completed DAILY periods ──
  const byTarget = new Map<string, typeof s.awradHistory>();
  for (const h of s.awradHistory) byTarget.set(h.targetId, [...(byTarget.get(h.targetId) ?? []), h]);
  let wirdLongest = 0;
  for (const recs of byTarget.values()) {
    let r = 0;
    let prev = -Infinity;
    for (const h of [...recs].sort((x, y) => x.endedAt - y.endedAt)) {
      r = h.completed ? (h.endedAt - prev <= 1.5 * DAY_MS ? r + 1 : 1) : 0;
      prev = h.endedAt;
      wirdLongest = Math.max(wirdLongest, r);
    }
  }
  const wirdCurrent = maxOf(s.targets.filter((t) => t.recurrence === 'daily').map((t) => t.streak ?? 0));

  // ── الصيام والمواسم (Hijri) ──
  const fastsHijri = [...fastDays].map((k) => ({ k, h: hijriOf(k) }));
  const perYear = (pred: (h: HijriDate) => boolean) => {
    const m = new Map<number, number>();
    for (const { h } of fastsHijri) if (pred(h)) m.set(h.year, (m.get(h.year) ?? 0) + 1);
    return m;
  };
  const whiteMonths = new Map<string, number>();
  for (const { h } of fastsHijri) {
    if (h.day >= 13 && h.day <= 15) whiteMonths.set(`${h.year}-${h.month}`, (whiteMonths.get(`${h.year}-${h.month}`) ?? 0) + 1);
  }
  const ramadanYears = new Set(fastsHijri.filter(({ h }) => h.month === 9).map(({ h }) => h.year));
  let ramadanFasted = 0;
  for (const y of ramadanYears) {
    const len = monthLen(y, 9);
    let ok = true;
    for (let d = 1; d <= len && ok; d++) {
      const k = hijriKey(y, 9, d);
      ok = fastDays.has(k) || !!excused[k];
    }
    if (ok) ramadanFasted++;
  }
  // Night of the Nth = the evening before Hijri day N.
  const ramadanNights = new Map<number, Set<number>>();
  for (const k of nightKeys) {
    const h = hijriOf(shift(k, 1));
    if (h.month !== 9) continue;
    let set = ramadanNights.get(h.year);
    if (!set) ramadanNights.set(h.year, (set = new Set()));
    set.add(h.day);
  }
  let lastTen = 0;
  let oddNights = 0;
  for (const [y, set] of ramadanNights) {
    const len = monthLen(y, 9);
    let all = true;
    for (let d = 21; d <= len && all; d++) all = set.has(d);
    if (all) lastTen++;
    if ([21, 23, 25, 27, 29].filter((d) => d <= len).every((d) => set.has(d))) oddNights++;
  }
  const tasua = perYear((h) => h.month === 1 && h.day === 9);
  const ashuraY = perYear((h) => h.month === 1 && h.day === 10);
  const taraweehLen = s.ramadan.year ? monthLen(s.ramadan.year, 9) : 30;
  const taraweehNights = new Set(s.ramadan.taraweeh).size;

  // ── الصدقة ──
  const sDays = s.sadaqah.map((e) => e.date.slice(0, 10)).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const sadaqahWeeks = periodRun(new Set(sDays.map(weekOf)), weekOf(today), prevWeek);
  const sadaqahMonths = periodRun(new Set(sDays.map(monthOf)), monthOf(today), prevMonth);

  // ── العلم ──
  const lessons = s.circles.flatMap((c) => c.log.filter((l) => l.status !== 'missed'));
  const lessonsOf = (c: (typeof s.circles)[number]) => c.log.filter((l) => l.status !== 'missed').length;
  const studyWeeks = periodRun(new Set(lessons.map((l) => weekOf(keyOf(new Date(l.date))))), weekOf(today), prevWeek);

  // ── العادات ──
  const habitsModule = moduleDays('habits');
  const habitsRun = run(habitsModule, now, frozenFor('habits'));

  // ── الأيام الجامعة ──
  const completeKeys = daysWhere(completeDay);
  const completeRun = run(completeKeys, now, excusedSet);

  const value: Record<BadgeMetric, number> = {
    overall_streak: overall.current,
    active_days: active.length,
    consistent_weeks: [...perWeek.values()].filter((n) => n >= 5).length,
    active_full_months: fullMonths((k) => activeSet.has(k) || anyFrozen.has(k), (k) => activeSet.has(k)),
    early_days: early.size,
    comeback,

    prayers_streak: prayersRun.current,
    prayer_days: fullKeys.length,
    fard_total: logKeys.reduce((n, k) => n + fard(k), 0),
    prayer_full_weeks: fullWeeks(fardOk, full),
    prayer_months: fullMonths(fardOk, full),
    fajr_streak: each.fajr.current,
    dhuhr_streak: each.dhuhr.current,
    asr_streak: each.asr.current,
    maghrib_streak: each.maghrib.current,
    isha_streak: each.isha.current,
    bardain_days: logKeys.filter((k) => log[k]?.fajr?.fard && log[k]?.asr?.fard).length,

    rawatib_full_days: rawatibFullKeys.length,
    rawatib_streak: rawatibRun.current,
    fajr_sunnah_streak: fajrSunnahRun.current,
    sunnah_total: sunnahChecks + duhaKeys.length,
    nawafil_rakaat:
      logKeys.reduce((n, k) => n + rawatib(k), 0) + duhaRak.reduce((a, x) => a + x, 0) + nightKeys.reduce((n, k) => n + qiyamUnits(k), 0),
    duha_days: duhaKeys.length,
    duha_streak: each.duha.current,
    duha_rakaat: duhaRak.reduce((a, x) => a + x, 0),
    duha_eight_days: duhaRak.filter((n) => n >= 8).length,
    sunnah_duha_days: rawatibFullKeys.filter(duhaOn).length,

    mosque_prayers: logKeys.reduce((n, k) => n + PRAYERS_ORDER.filter((p) => mosqueOn(k, p)).length, 0),
    mosque_full_days: mosqueFull.length,
    mosque_full_streak: mosqueFullRun.current,
    mosque_fajr: mosqueFajr.length,
    mosque_fajr_streak: mosqueFajrRun.current,
    mosque_fajr_isha_days: logKeys.filter((k) => mosqueOn(k, 'fajr') && mosqueOn(k, 'isha')).length,
    jumuah: logKeys.filter((k) => noon(k).getDay() === 5 && mosqueOn(k, 'dhuhr')).length,

    qiyam_streak: qiyamRun.current,
    qiyam_nights: nightKeys.length,
    qiyam_rakaat: nightKeys.reduce((n, k) => n + qiyamUnits(k), 0),
    qiyam_witr: nightKeys.filter((k) => qiyam[k].witr).length,
    qiyam_witr_streak: witrRun.current,
    qiyam_eleven: nightKeys.filter((k) => qiyamUnits(k) >= 11).length,
    qiyam_last_third: new Set(s.lastThirdNights).size,

    dhikr_streak: dhikrRun.current,
    dhikr_days: dhikrModule.size,
    dhikr_reps: s.tasbihLifetime + dhikrEventReps,
    dhikr_morning_streak: morningRun.current,
    dhikr_evening_streak: eveningRun.current,
    dhikr_both_days: [...morning].filter((k) => evening.has(k)).length,
    dhikr_post_prayer_days: postFullKeys.length,
    post_prayer_adhkar: keysArr.reduce((n, k) => n + (afterOf(k) || (legacyPost(k) ? 5 : 0)), 0),
    post_prayer_streak: postRun.current,
    dhikr_sleep_streak: sleepRun.current,
    tasbih_100_days: [...tasbihByDay.values()].filter((n) => n >= 100).length,
    dhikr_day_max: maxOf(repsByDay.values()),
    dhikr_sets: setDays.size,

    quran_streak: quranRun.current,
    quran_pages: Math.floor(pages),
    quran_khatmat: s.khatmasFinished,
    quran_wird_days: s.quranWirdDays.length,
    quran_wird_streak: quranWirdRun.current,
    listen_pages: qt.listen.pages,
    listen_streak: listenRun.current,
    listen_khatmat: qt.listen.finished,
    tafsir_pages: qt.tafsir.pages,
    tafsir_streak: tafsirRun.current,
    tafsir_khatmat: qt.tafsir.finished,
    review_pages: qt.hifz.pages,
    review_streak: reviewRun.current,
    review_khatmat: qt.hifz.finished,
    quran_types_open: QURAN_TYPE_IDS.filter((ty) => qt[ty].running.some((x) => x.live)).length,
    quran_types_done: QURAN_TYPE_IDS.filter((ty) => qt[ty].finished > 0).length,
    day_quran_share: shareDays.size,
    quran_juz_days: [...pageKeys].filter((k) => pagesOn(k) >= 20).length,
    quran_day_max: Math.floor(maxOf([...pageKeys].map(pagesOn))),
    hifz_sessions: s.hifzSessions.length,
    hifz_perfect: s.hifzSessions.filter((x) => x.mode === 'test' && x.accuracy >= 0.999 && x.correct >= 20).length,
    hifz_surahs: s.hifzItems.filter((x) => x.lastAccuracy >= 0.85).length,

    awrad_done: s.awradHistory.filter((r) => r.completed).length,
    wird_streak: wirdCurrent,
    awrad_extra:
      s.awradHistory.reduce((n, r) => n + (r.extra || 0), 0) + s.targets.reduce((n, t) => n + (t.extra ?? 0), 0),

    fasting_days: fastDays.size,
    fasting_mon_thu: [...fastDays].filter((k) => [1, 4].includes(noon(k).getDay())).length,
    fasting_white_months: [...whiteMonths.values()].filter((n) => n >= 3).length,

    // A Ramadan of 29 nights still reads 30/30 once every night is in.
    taraweeh_full: taraweehNights >= taraweehLen ? 30 : Math.min(taraweehNights, 29),
    ramadan_fasted: ramadanFasted,
    ramadan_last_ten: lastTen,
    ramadan_odd_nights: oddNights,
    ramadan_juz: s.ramadan.juz,
    arafah: fastsHijri.filter(({ h }) => h.month === 12 && h.day === 9).length,
    ashura: [...ashuraY.values()].reduce((a, n) => a + n, 0),
    tasua_ashura: [...ashuraY.keys()].filter((y) => tasua.has(y)).length,
    muharram_fasts: maxOf(perYear((h) => h.month === 1).values()),
    shaban_fasts: maxOf(perYear((h) => h.month === 8).values()),
    shawwal_fasts: maxOf(perYear((h) => h.month === 10 && h.day >= 2).values()),
    dhulhijjah_fasts: maxOf(perYear((h) => h.month === 12 && h.day <= 9).values()),
    friday_full: countWhere((k) => noon(k).getDay() === 5 && guarded(k)),

    sadaqah_count: s.sadaqah.length,
    sadaqah_week_streak: sadaqahWeeks.current,
    sadaqah_month_streak: sadaqahMonths.current,
    sadaqah_ramadan: sDays.filter((k) => hijriOf(k).month === 9).length,
    sadaqah_causes: new Set(s.sadaqah.map((e) => e.cause.trim()).filter(Boolean)).size,

    study_lessons: lessons.length,
    study_series: s.circles.filter(
      (c) => c.format === 'series' && (c.status === 'done' || (!!c.totalLessons && lessonsOf(c) >= c.totalLessons)),
    ).length,
    study_subjects: new Set(s.circles.filter((c) => lessonsOf(c) > 0).map((c) => c.subject)).size,
    study_week_streak: studyWeeks.current,
    asma_studied: s.asmaStudied,
    hadith_favorites: s.hadithFavorites,

    habits_days: habitsModule.size,
    habits_streak: habitsRun.current,
    tasks_done: s.tasks.reduce((n, t) => n + (t.repeat === 'none' ? (t.done ? 1 : 0) : Object.keys(t.history ?? {}).length), 0),

    day_prayer_complete: completeKeys.length,
    day_prayer_complete_streak: completeRun.current,
    day_guarded: countWhere(guarded),
    day_guarded_weeks: fullWeeks(guarded, full),
    day_golden: countWhere(golden),
    ishraq_days: countWhere(ishraq),
    day_fast_qiyam: countWhere(fastQiyam),
    day_dhikr_all: countWhere(dhikrAll),
    day_mosque_sunnah: countWhere((k) => mosqueFullOn(k) && rawatibFull(k)),
    day_khayr: countWhere((k) => fastDays.has(k) && sadaqahDays.has(k) && qiyamAround(k)),
    day_ihsan: countWhere((k) => golden(k) && fastDays.has(k) && sadaqahDays.has(k)),
  };

  const best: Partial<Record<BadgeMetric, number>> = {
    overall_streak: overall.longest,
    prayers_streak: prayersRun.longest,
    fajr_streak: each.fajr.longest,
    dhuhr_streak: each.dhuhr.longest,
    asr_streak: each.asr.longest,
    maghrib_streak: each.maghrib.longest,
    isha_streak: each.isha.longest,
    rawatib_streak: rawatibRun.longest,
    fajr_sunnah_streak: fajrSunnahRun.longest,
    duha_streak: each.duha.longest,
    mosque_full_streak: mosqueFullRun.longest,
    mosque_fajr_streak: mosqueFajrRun.longest,
    qiyam_streak: qiyamRun.longest,
    qiyam_witr_streak: witrRun.longest,
    dhikr_streak: dhikrRun.longest,
    dhikr_morning_streak: morningRun.longest,
    dhikr_evening_streak: eveningRun.longest,
    dhikr_sleep_streak: sleepRun.longest,
    post_prayer_streak: postRun.longest,
    quran_streak: quranRun.longest,
    quran_wird_streak: quranWirdRun.longest,
    listen_streak: listenRun.longest,
    tafsir_streak: tafsirRun.longest,
    review_streak: reviewRun.longest,
    wird_streak: Math.max(wirdLongest, wirdCurrent),
    sadaqah_week_streak: sadaqahWeeks.longest,
    sadaqah_month_streak: sadaqahMonths.longest,
    study_week_streak: studyWeeks.longest,
    habits_streak: habitsRun.longest,
    day_prayer_complete_streak: completeRun.longest,
  };

  // ── «تحديات اليوم» ──
  const t = today;
  const ar = toArabicDigits;
  const excusedToday = !!excused[t];
  const part = (id: string, label: string, done: boolean, to: string, note?: string): ComboPart => ({ id, label, done, to, note });
  // Today's Quran: each running khatma's portion, and a share in each running type.
  const runningKh = QURAN_TYPE_IDS.flatMap((ty) => qt[ty].running).filter((x) => x.live && x.day >= 0 && x.day < x.days);
  const khParts = runningKh.map((x) =>
    part(`kh_${x.id}`, x.name, x.owe === 0, '/quran', x.owe > 0 ? `${QURAN_TYPES[x.type].label}، بقي ${ar(x.owe)}` : QURAN_TYPES[x.type].label),
  );
  const runningTypes = QURAN_TYPE_IDS.filter((ty) => runningKh.some((x) => x.type === ty));
  const typeParts = runningTypes.map((ty) => {
    const n = qt[ty].days[t] ?? 0;
    return part(`ty_${ty}`, QURAN_TYPES[ty].label, n > 0, '/quran', n > 0 ? `${ar(n)} ص` : undefined);
  });
  const P = {
    fard: part('fard', 'الصلوات الخمس', fardOk(t), '/module/prayers', excusedToday ? 'معذورة' : `${ar(fard(t))}/${ar(5)}`),
    rawatib: part('rawatib', 'الرواتب', rawatibFull(t), '/module/prayers', `${ar(rawatib(t))}/${ar(rawatibFullOn(t, male))}`),
    duha: part('duha', 'الضحى', duhaOn(t), '/module/prayers'),
    witr: part('witr', 'الوتر الليلة', nightOn(t), '/targets?tab=qiyam'),
    morning: part('morning', 'أذكار الصباح', morning.has(t), '/adhkar?set=morning'),
    evening: part('evening', 'أذكار المساء', evening.has(t), '/adhkar?set=evening'),
    post: part('post', 'أذكار الصلوات', postFull(t), '/adhkar?set=postPrayer', `${ar(afterOf(t))}/${ar(5)}`),
    sleep: part('sleep', 'أذكار النوم', sleep.has(t), '/adhkar?set=sleep'),
    quran: part('quran', 'وِرد القرآن', quranOn(t), '/quran'),
    fajr: part('fajr', male ? 'الفجر في المسجد' : 'صلاة الفجر', fajrForIshraq(t), '/module/prayers'),
    mosque: part('mosque', 'الخمس في المسجد', mosqueFullOn(t), '/module/prayers', `${ar(PRAYERS_ORDER.filter((p) => mosqueOn(t, p)).length)}/${ar(5)}`),
    fast: part('fast', 'الصيام', fastDays.has(t), '/module/fasting'),
    qiyam: part('qiyam', 'قيام الليل', qiyamAround(t), '/targets?tab=qiyam'),
  };
  const combo = (metric: BadgeMetric, parts: ComboPart[]): TodayCombo => {
    const doneCount = parts.filter((p) => p.done).length;
    return { metric, title: METRICS[metric].label, parts, doneCount, done: doneCount === parts.length };
  };
  const todayCombos: TodayCombo[] = excusedToday
    ? [combo('day_guarded', [P.fard, P.morning, P.evening]), combo('day_dhikr_all', [P.morning, P.evening, P.sleep])]
    : [
        combo('day_guarded', [P.fard, P.morning, P.evening]),
        combo('day_prayer_complete', [P.fard, P.rawatib, P.duha, P.witr]),
        combo('day_dhikr_all', [P.morning, P.evening, P.post, P.sleep]),
        combo('ishraq_days', [P.fajr, P.morning, P.duha]),
        ...(male ? [combo('day_mosque_sunnah', [P.mosque, P.rawatib])] : []),
        ...(fastDays.has(t) ? [combo('day_fast_qiyam', [P.fast, P.fard, P.qiyam])] : []),
        combo('day_golden', [P.fard, P.rawatib, P.duha, P.witr, P.morning, P.evening, P.post, P.quran]),
        ...(khParts.length ? [combo('quran_wird_days', khParts)] : []),
        ...(typeParts.length >= 2 ? [combo('day_quran_share', typeParts)] : []),
      ];

  // ── four weeks of activity per door (strengths) — each against what a steady user does ──
  const win: string[] = [];
  for (let k = today; win.length < ACTIVITY_DAYS; k = prevKey(k)) win.push(k);
  const open = win.filter((k) => !excused[k]);
  const share = (pred: (k: string) => boolean, per = win.length) => Math.min(1, win.filter(pred).length / per);
  const openShare = (pred: (k: string) => boolean) => (open.length ? open.filter(pred).length / open.length : 0);
  const qiyamModule = moduleDays('qiyam');
  const lessonDays = new Set(lessons.map((l) => keyOf(new Date(l.date))));
  const awradDays = new Set(s.awradHistory.filter((r) => r.completed).map((r) => keyOf(new Date(r.endedAt))));
  const taskDays = new Set(s.tasks.flatMap((t) => Object.keys(t.history ?? {})));
  const activity: Partial<Record<BadgeCategory, number>> = {
    prayer: open.length ? open.reduce((n, k) => n + Math.min(5, fard(k)), 0) / (5 * open.length) : 0,
    sunnah: openShare((k) => rawatib(k) > 0 || duhaOn(k)),
    mosque: male ? openShare((k) => PRAYERS_ORDER.some((pr) => mosqueOn(k, pr))) : 0,
    qiyam: share((k) => nightOn(k) || qiyamModule.has(k)),
    dhikr: share((k) => morning.has(k) || evening.has(k) || sleep.has(k) || postFull(k) || dhikrModule.has(k)),
    quran: share((k) => quranOn(k) || (s.mushafi.days[k]?.length ?? 0) > 0),
    awrad: share((k) => awradDays.has(k)),
    fasting: share((k) => fastDays.has(k), 8), // ≈ Mondays and Thursdays
    sadaqah: share((k) => sadaqahDays.has(k), 4), // ≈ once a week
    knowledge: share((k) => lessonDays.has(k), 4), // ≈ a lesson a week
    habits: share((k) => habitsModule.has(k) || taskDays.has(k)),
    days: share((k) => guarded(k) || completeDay(k) || ishraq(k) || dhikrAll(k)),
    steadfast: share((k) => activeSet.has(k)),
    seasons: 0, // waits for its season, not for effort
  };

  return { value, best, today: todayCombos, activity };
}

/** Progress toward one badge: a past best run unlocks a chain; locked shows the live run. */
export function progressOf(x: BadgeDefinition, m: BadgeMetrics): { current: number; target: number } {
  const best = m.best[x.metric] ?? 0;
  return { current: best >= x.target ? best : (m.value[x.metric] ?? 0), target: x.target };
}

// ── The gallery model ──────────────────────────────────────────────────────
export interface BadgeItem {
  badge: BadgeDefinition;
  unlocked: boolean;
  unlockedAt?: string;
  current: number;
  target: number;
  /** 0–100 (99 at most while locked). */
  pct: number;
}

export interface TrackItem {
  metric: BadgeMetric;
  label: string;
  category: BadgeCategory;
  tiers: BadgeItem[];
  got: number;
  /** The lowest locked tier (null when the track is complete). */
  next: BadgeItem | null;
  /** The highest unlocked tier. */
  top: BadgeItem | null;
  /** A secret track: every tier hidden and none found yet. */
  secret: boolean;
}

export interface BadgeModel {
  items: BadgeItem[];
  byId: Map<string, BadgeItem>;
  tracks: TrackItem[];
  total: number;
  got: number;
  thisMonth: number;
  points: number;
  level: ReturnType<typeof levelFor>;
  rarity: Record<BadgeRarity, { got: number; total: number }>;
  categories: { id: BadgeCategory; label: string; got: number; total: number }[];
  /** Next tiers closest to unlocking (not secrets). */
  nearest: BadgeItem[];
  /** Latest unlocks, newest first. */
  recent: BadgeItem[];
  /** Four weeks of activity per door (BadgeMetrics.activity). */
  activity: Partial<Record<BadgeCategory, number>>;
}

export function buildBadgeModel(
  m: BadgeMetrics,
  unlocked: readonly string[],
  unlockedAt: Record<string, string>,
  gender: 'male' | 'female' | null,
  now = new Date(),
): BadgeModel {
  const have = new Set(unlocked);
  const items: BadgeItem[] = [];
  const byId = new Map<string, BadgeItem>();
  for (const x of BADGES) {
    if (!badgeVisible(x, gender)) continue;
    const p = progressOf(x, m);
    const isOn = have.has(x.id);
    const pct = isOn ? 100 : p.target > 0 ? Math.min(99, Math.floor((p.current / p.target) * 100)) : 0;
    const it: BadgeItem = { badge: x, unlocked: isOn, unlockedAt: unlockedAt[x.id], current: p.current, target: p.target, pct };
    items.push(it);
    byId.set(x.id, it);
  }
  const tracks: TrackItem[] = [];
  for (const t of TRACKS) {
    const tiers = t.tiers.map((x) => byId.get(x.id)).filter((x): x is BadgeItem => !!x);
    if (!tiers.length) continue;
    const got = tiers.filter((x) => x.unlocked).length;
    tracks.push({
      metric: t.metric,
      label: t.label,
      category: t.category,
      tiers,
      got,
      next: tiers.find((x) => !x.unlocked) ?? null,
      top: [...tiers].reverse().find((x) => x.unlocked) ?? null,
      secret: got === 0 && tiers.every((x) => x.badge.hidden),
    });
  }
  const gotItems = items.filter((x) => x.unlocked);
  const month = format(now, 'yyyy-MM');
  const rarity = Object.fromEntries(RARITY_ORDER.map((r) => [r, { got: 0, total: 0 }])) as BadgeModel['rarity'];
  for (const x of items) {
    rarity[x.badge.rarity].total++;
    if (x.unlocked) rarity[x.badge.rarity].got++;
  }
  const categories = BADGE_CATEGORIES.map((c) => {
    const inCat = items.filter((x) => METRICS[x.badge.metric].cat === c.id);
    return { id: c.id, label: c.label, got: inCat.filter((x) => x.unlocked).length, total: inCat.length };
  }).filter((c) => c.total > 0);
  const points = badgePoints(unlocked, gender);
  return {
    items,
    byId,
    tracks,
    total: items.length,
    got: gotItems.length,
    thisMonth: gotItems.filter((x) => x.unlockedAt && format(new Date(x.unlockedAt), 'yyyy-MM') === month).length,
    points,
    level: levelFor(points),
    rarity,
    categories,
    // At most two per door, so «القادم» isn't five streaks of the same prayers.
    nearest: tracks
      .map((t) => t.next)
      .filter((x): x is BadgeItem => !!x && x.pct > 0 && !x.badge.hidden)
      .sort((a, c) => c.pct - a.pct || RARITY_RANK[a.badge.rarity] - RARITY_RANK[c.badge.rarity])
      .filter((x, _, all) => {
        const cat = METRICS[x.badge.metric].cat;
        return all.filter((y) => METRICS[y.badge.metric].cat === cat).indexOf(x) < 2;
      })
      .slice(0, 6),
    recent: gotItems
      .filter((x) => x.unlockedAt)
      .sort((a, c) => (c.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      .slice(0, 8),
    activity: m.activity ?? {},
  };
}

// ── Strengths and the doors that wait ──────────────────────────────────────
export interface DoorStanding {
  id: BadgeCategory;
  label: string;
  got: number;
  total: number;
  /** 0–1: badges won in the door, plus the way into each track's next tier. */
  score: number;
  /** 0–1: the last four weeks in this door — what «strong» and «weak» are judged on. */
  activity: number;
  /** Ever touched (any of its counts above zero). */
  used: boolean;
  /** The easiest next badge of the door (the nudge), never a secret. */
  step: BadgeItem | null;
}

/** Doors only some users have (owner): never «waiting» for someone who never opened them. */
const OPTIONAL_DOORS = new Set<BadgeCategory>(['habits', 'knowledge']);

/**
 * Where the user is strong and which doors wait, judged on the LAST FOUR WEEKS
 * (owner: a door left long ago is no longer a strength): strong = the three most
 * active doors (≥ 10%); weak = the least active of the rest that have a next
 * step — never «المواسم» (waits for its season), nor العادات/العلم for someone who
 * never used them. Badge progress breaks ties.
 */
export function doorStandings(model: BadgeModel): { doors: DoorStanding[]; strong: DoorStanding[]; weak: DoorStanding[] } {
  const doors = model.categories
    .map((c): DoorStanding => {
      const tracks = model.tracks.filter((t) => t.category === c.id && !t.tiers.every((x) => x.badge.hidden));
      const partial = tracks.reduce((n, t) => n + (t.next ? t.next.pct / 100 : 0), 0);
      const steps = tracks
        .map((t) => t.next)
        .filter((x): x is BadgeItem => !!x && !x.badge.hidden)
        .sort(
          (a, b) =>
            b.pct - a.pct || RARITY_RANK[a.badge.rarity] - RARITY_RANK[b.badge.rarity] || a.target - a.current - (b.target - b.current),
        );
      return {
        ...c,
        score: c.total ? Math.min(1, (c.got + partial) / c.total) : 0,
        activity: model.activity[c.id] ?? 0,
        used: tracks.some((t) => t.tiers.some((x) => x.current > 0)),
        step: steps[0] ?? null,
      };
    })
    .sort((a, b) => b.activity - a.activity || b.score - a.score);
  const strong = doors.filter((d) => d.id !== 'seasons' && d.activity >= 0.1).slice(0, 3);
  const weak = doors
    .filter((d) => d.id !== 'seasons' && d.step && !strong.includes(d) && (d.used || !OPTIONAL_DOORS.has(d.id)))
    .sort((a, b) => a.activity - b.activity || a.score - b.score || (b.step?.pct ?? 0) - (a.step?.pct ?? 0))
    .slice(0, 3);
  return { doors, strong, weak };
}
