/**
 * «محاسبة الجمعة» — PURE (no stores, no React): week ranges, this week vs last
 * per domain, the best / weakest door, the weekly score and its trend, the
 * question rotation, the review streak, the reminder time and the leaderboard
 * bonus. fridayReviewLive.ts feeds it from the stores.
 * Checked by scripts/fridayReview.test.ts.
 *
 * Weeks run Saturday → Friday (the app's week); a week's id is its Friday.
 * The review opens Thursday evening and stays open through Saturday for the
 * week ending that Friday; any other day the page shows the week so far.
 * A week still running is compared with the SAME days of the week before.
 */
import { addDays, format, startOfWeek } from 'date-fns';
import {
  PRAYERS_ORDER,
  duhaRakaatOf,
  fardCountOf,
  rawatibFullOn,
  rawatibRakaatOf,
  type DuhaEntry,
  type PrayerDayLog,
} from '@/store/prayerLogStore';
import { completionOn, type Task } from '@/store/studyModel';
import { arCount } from '@/services/insightsEngine';
import { toArabicDigits } from '@/utils/arabicFormat';
import { CORE_QUESTIONS, QUESTION_BANK, type MuhasabaQuestion } from '@/services/fridayReviewContent';
import type { AttentionItem } from '@/services/dayAttention';

// ── weeks ──────────────────────────────────────────────────────────────────
export interface Week {
  /** The week's Friday (yyyy-MM-dd). */
  id: string;
  from: string;
  to: string;
  days: string[];
}

export const dk = (d: Date) => format(d, 'yyyy-MM-dd');
export const noon = (k: string) => new Date(`${k}T12:00:00`);

export function weekOf(d: Date): Week {
  const start = startOfWeek(d, { weekStartsOn: 6 });
  const days = Array.from({ length: 7 }, (_, i) => dk(addDays(start, i)));
  return { id: days[6], from: days[0], to: days[6], days };
}
export const weekById = (id: string): Week => weekOf(noon(id));
export const shiftWeek = (w: Week, n: number): Week => weekOf(addDays(noon(w.from), 7 * n));

/** From this hour on Thursday the review is open. */
export const REVIEW_OPENS_HOUR = 18;

/** The week the review is about: on Saturday the one that ended yesterday, otherwise the running one. */
export const reviewWeek = (now: Date): Week => (now.getDay() === 6 ? shiftWeek(weekOf(now), -1) : weekOf(now));

/** Thursday evening → end of Saturday. */
export function inReviewWindow(now: Date): boolean {
  const d = now.getDay();
  return d === 5 || d === 6 || (d === 4 && now.getHours() >= REVIEW_OPENS_HOUR);
}

/** Days of `w` already begun (1–7). */
export const elapsedDays = (w: Week, now: Date): number => Math.max(1, w.days.filter((k) => k <= dk(now)).length);

/** «السبت ٨ – الجمعة ١٤/١١» */
export function weekLabel(w: Week): string {
  const a = noon(w.from);
  const b = noon(w.to);
  return `${toArabicDigits(a.getDate())}/${toArabicDigits(a.getMonth() + 1)} – ${toArabicDigits(b.getDate())}/${toArabicDigits(b.getMonth() + 1)}`;
}

// ── input ──────────────────────────────────────────────────────────────────
export interface ReviewInput {
  gender: 'male' | 'female' | null;
  prayerLog: Record<string, PrayerDayLog>;
  excused: Record<string, true>;
  duha: Record<string, DuhaEntry>;
  /** قيام الليل, keyed by the night's EVENING. */
  qiyam: Record<string, unknown>;
  events: { dateKey: string; domain: string; refId?: string }[];
  dailyProgress: Record<string, { modules?: { moduleId: string; completed: boolean }[] } | undefined>;
  /** مصحفي: pages read per day. */
  mushafiDays: Record<string, number[]>;
  /** Closed periods of the awrad. */
  awradHistory: { endedAt: number; completed: boolean }[];
  /** Running awrad (their current period isn't in the history yet). */
  targets: { recurrence?: string; deadline: number; current: number; total: number; rescue?: { surcharge?: number } }[];
  sadaqah: { date: string }[];
  tasks: Task[];
}

// ── domains ────────────────────────────────────────────────────────────────
export type DomainId =
  | 'fard'
  | 'jamaah'
  | 'rawatib'
  | 'duha'
  | 'adhkar'
  | 'quran'
  | 'qiyam'
  | 'fasting'
  | 'awrad'
  | 'tasks'
  | 'sadaqah';

export interface Measure {
  value: number;
  /** The most the window allows (0 = nothing to do there). */
  max: number;
  /** 0–1, null when the window has nothing to measure. */
  score: number | null;
  text: string;
}

const n = (v: number) => toArabicDigits(v);
const of = (v: number, max: number) => `${n(v)} من ${n(max)}`;
const count = (v: number, forms: [string, string, string, string]) => (v ? arCount(v, ...forms) : n(0));
const DAYS: [string, string, string, string] = ['يوم واحد', 'يومان', 'أيام', 'يوماً'];

export interface ReviewIndex {
  male: boolean;
  dhikr: Map<string, Set<string>>;
  fastDays: Set<string>;
  sadaqahDays: Set<string>;
  awrad: Map<string, { done: number; total: number }>;
}

export function indexOf(s: ReviewInput): ReviewIndex {
  const dhikr = new Map<string, Set<string>>();
  for (const e of s.events) {
    if (e.domain !== 'dhikr' || !e.refId) continue;
    let set = dhikr.get(e.refId);
    if (!set) dhikr.set(e.refId, (set = new Set()));
    set.add(e.dateKey);
  }
  const fastDays = new Set(
    Object.keys(s.dailyProgress).filter((k) => s.dailyProgress[k]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed)),
  );
  const awrad = new Map<string, { done: number; total: number }>();
  const bump = (k: string, done: boolean) => {
    const a = awrad.get(k) ?? { done: 0, total: 0 };
    a.total++;
    if (done) a.done++;
    awrad.set(k, a);
  };
  for (const h of s.awradHistory) bump(dk(new Date(h.endedAt)), h.completed);
  // A running period counts once it is complete — an open one can't be "missed" yet.
  for (const t of s.targets) {
    if (!t.recurrence || t.recurrence === 'none') continue;
    if (t.current >= t.total - (t.rescue?.surcharge ?? 0)) bump(dk(new Date(t.deadline)), true);
  }
  return {
    male: s.gender === 'male',
    dhikr,
    fastDays,
    sadaqahDays: new Set(s.sadaqah.map((e) => e.date.slice(0, 10))),
    awrad,
  };
}

interface DomainDef {
  id: DomainId;
  label: (male: boolean) => string;
  /** Compare by score (the denominator moves week to week), not by value. */
  ratio?: boolean;
  /** No natural ceiling (pages, rakaat beyond the minimum) — never «تامّة». */
  open?: boolean;
  measure: (s: ReviewInput, ix: ReviewIndex, days: string[]) => Omit<Measure, 'score'> & { score?: number | null };
}

const ratio = (v: number, max: number) => (max > 0 ? Math.min(1, v / max) : null);

export const DOMAINS: DomainDef[] = [
  {
    id: 'fard',
    label: () => 'الصلوات المفروضة',
    measure: (s, _ix, days) => {
      const open = days.filter((k) => !s.excused[k]);
      const v = open.reduce((t, k) => t + fardCountOf(s.prayerLog[k]), 0);
      return { value: v, max: open.length * 5, text: of(v, open.length * 5) };
    },
  },
  {
    id: 'jamaah',
    label: (male) => (male ? 'الجماعة في المسجد' : 'الصلاة على وقتها'),
    measure: (s, ix, days) => {
      const open = days.filter((k) => !s.excused[k]);
      const v = open.reduce((t, k) => t + PRAYERS_ORDER.filter((p) => (ix.male ? s.prayerLog[k]?.[p]?.mosque : s.prayerLog[k]?.[p]?.onTime)).length, 0);
      return { value: v, max: open.length * 5, text: of(v, open.length * 5) };
    },
  },
  {
    id: 'rawatib',
    label: () => 'السنن الرواتب',
    measure: (s, ix, days) => {
      const open = days.filter((k) => !s.excused[k]);
      const v = open.reduce((t, k) => t + rawatibRakaatOf(s.prayerLog[k], k, ix.male), 0);
      const max = open.reduce((t, k) => t + rawatibFullOn(k, ix.male), 0);
      return { value: v, max, text: count(v, ['ركعة واحدة', 'ركعتان', 'ركعات', 'ركعة']) };
    },
  },
  {
    id: 'duha',
    label: () => 'صلاة الضحى',
    measure: (s, _ix, days) => {
      const open = days.filter((k) => !s.excused[k]);
      const v = open.filter((k) => duhaRakaatOf(s.duha[k]) > 0).length;
      return { value: v, max: open.length, text: count(v, DAYS) };
    },
  },
  {
    id: 'adhkar',
    label: () => 'أذكار الصباح والمساء',
    measure: (_s, ix, days) => {
      const m = days.filter((k) => ix.dhikr.get('morning')?.has(k)).length;
      const e = days.filter((k) => ix.dhikr.get('evening')?.has(k)).length;
      return { value: m + e, max: days.length * 2, text: `صباحاً ${n(m)} · مساءً ${n(e)}` };
    },
  },
  {
    id: 'quran',
    label: () => 'القرآن في مصحفي',
    open: true,
    measure: (s, _ix, days) => {
      const v = days.reduce((t, k) => t + (s.mushafiDays[k]?.length ?? 0), 0);
      const read = days.filter((k) => s.mushafiDays[k]?.length).length;
      // Scored by the days read (a page a day is the habit), shown in pages.
      return { value: v, max: days.length, score: ratio(read, days.length), text: count(v, ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة']) };
    },
  },
  {
    id: 'qiyam',
    label: () => 'قيام الليل',
    measure: (s, _ix, days) => {
      const open = days.filter((k) => !s.excused[k]);
      const v = open.filter((k) => !!s.qiyam[k]).length;
      return { value: v, max: open.length, text: count(v, ['ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة']) };
    },
  },
  {
    id: 'fasting',
    label: () => 'الصيام',
    open: true,
    measure: (_s, ix, days) => {
      const v = days.filter((k) => ix.fastDays.has(k)).length;
      // The sunnah's measure: Monday and Thursday — two a week.
      const max = days.filter((k) => [1, 4].includes(noon(k).getDay())).length;
      return { value: v, max, score: max ? Math.min(1, v / max) : v ? 1 : null, text: count(v, DAYS) };
    },
  },
  {
    id: 'awrad',
    label: () => 'الأوراد',
    ratio: true,
    measure: (_s, ix, days) => {
      let done = 0;
      let total = 0;
      for (const k of days) {
        const a = ix.awrad.get(k);
        if (a) {
          done += a.done;
          total += a.total;
        }
      }
      return { value: done, max: total, text: total ? of(done, total) : n(0) };
    },
  },
  {
    id: 'tasks',
    label: () => 'المهام',
    ratio: true,
    measure: (s, _ix, days) => {
      let done = 0;
      let total = 0;
      for (const k of days) {
        const c = completionOn(s.tasks, k);
        done += c.done;
        total += c.total;
      }
      return { value: done, max: total, text: total ? of(done, total) : n(0) };
    },
  },
  {
    id: 'sadaqah',
    label: () => 'الصدقة',
    open: true,
    measure: (_s, ix, days) => {
      const v = days.filter((k) => ix.sadaqahDays.has(k)).length;
      // Once a week is the measure (≈ the badges' share).
      return { value: v, max: 1, text: count(v, DAYS) };
    },
  },
];

function measure(def: DomainDef, s: ReviewInput, ix: ReviewIndex, days: string[]): Measure {
  const m = def.measure(s, ix, days);
  return { ...m, score: m.score !== undefined ? m.score : ratio(m.value, m.max) };
}

export type Trend = 'up' | 'down' | 'same';

export interface DomainRow {
  id: DomainId;
  label: string;
  now: Measure;
  prev: Measure;
  trend: Trend;
  /** now − prev, in the row's own unit. */
  diff: number;
  /** The user does this at all (anything in the last four weeks, or something due). */
  tracked: boolean;
  phrase: string;
}

export const trendOf = (now: number, prev: number, eps = 0): Trend => (now - prev > eps ? 'up' : prev - now > eps ? 'down' : 'same');

function phraseOf(def: DomainDef, now: Measure, prev: Measure, trend: Trend, tracked: boolean): string {
  if (!tracked) return 'لم يُسجَّل شيء بعد';
  if (!def.open && now.score === 1) return 'تامّة، تقبّل الله';
  if (now.value > 0 && prev.value === 0) return 'بداية طيبة هذا الأسبوع';
  if (now.value === 0 && prev.value > 0) return 'غاب هذا الأسبوع';
  if (trend === 'up') return 'أحسن من الأسبوع الماضي';
  if (trend === 'down') return 'أقل من الأسبوع الماضي';
  return now.value ? 'كالأسبوع الماضي' : 'لم يُسجَّل هذا الأسبوع';
}

/** Lookback for «does the user do this at all». */
const TRACK_DAYS = 28;

/** Every domain over `days` against `prevDays` (same length). */
export function compareDomains(s: ReviewInput, days: string[], prevDays: string[], ix: ReviewIndex = indexOf(s)): DomainRow[] {
  const last = days[days.length - 1];
  const back = Array.from({ length: TRACK_DAYS }, (_, i) => dk(addDays(noon(last), -i)));
  return DOMAINS.map((def) => {
    const now = measure(def, s, ix, days);
    const prev = measure(def, s, ix, prevDays);
    const tracked = def.ratio ? now.max > 0 || prev.max > 0 : measure(def, s, ix, back).value > 0;
    const trend = def.ratio ? trendOf(now.score ?? 0, prev.score ?? 0, 0.001) : trendOf(now.value, prev.value);
    return {
      id: def.id,
      label: def.label(ix.male),
      now,
      prev,
      trend,
      diff: now.value - prev.value,
      tracked,
      phrase: phraseOf(def, now, prev, trend, tracked),
    };
  });
}

/** The week's score (0–100): the mean of the tracked doors' scores. */
export function weekScore(rows: { tracked?: boolean; now: { score: number | null } }[]): number | null {
  const xs = rows.filter((r) => r.tracked !== false && r.now.score != null).map((r) => r.now.score as number);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) : null;
}

export interface Pickable {
  id: string;
  label: string;
  score: number;
  prevScore: number;
}

/** «ما أحمد الله عليه» = the strongest door (ties → the most improved); «ما أستدركه» = the weakest of the rest (ties → the biggest drop). */
export function pickBestWeak(items: Pickable[]): { best: Pickable | null; weak: Pickable | null } {
  const lift = (p: Pickable) => p.score - p.prevScore;
  const best = [...items].sort((a, b) => b.score - a.score || lift(b) - lift(a))[0];
  const bestOk = best && best.score > 0 ? best : null;
  const weak = items.filter((p) => p !== bestOk).sort((a, b) => a.score - b.score || lift(a) - lift(b))[0] ?? null;
  // Every door full → nothing to make up.
  return { best: bestOk, weak: weak && weak.score < 1 ? weak : null };
}

export const pickableOf = (r: DomainRow): Pickable | null =>
  r.tracked && r.now.score != null ? { id: r.id, label: r.label, score: r.now.score, prevScore: r.prev.score ?? 0 } : null;

export interface WeekCompare {
  week: Week;
  prevWeek: Week;
  /** The week still runs: only its first `elapsed` days are compared. */
  partial: boolean;
  elapsed: number;
  days: string[];
  prevDays: string[];
  rows: DomainRow[];
  score: number | null;
  prevScore: number | null;
}

export function compareWeek(s: ReviewInput, week: Week, now: Date): WeekCompare {
  const prevWeek = shiftWeek(week, -1);
  const elapsed = elapsedDays(week, now);
  const days = week.days.slice(0, elapsed);
  const prevDays = prevWeek.days.slice(0, elapsed);
  const ix = indexOf(s);
  const rows = compareDomains(s, days, prevDays, ix);
  return {
    week,
    prevWeek,
    partial: elapsed < 7 || dk(now) <= week.to,
    elapsed,
    days,
    prevDays,
    rows,
    score: weekScore(rows),
    prevScore: weekScore(rows.map((r) => ({ tracked: r.tracked, now: r.prev }))),
  };
}

/** The weekly score of the last `count` weeks, oldest first (the running week so far). */
export function weeklyTrend(s: ReviewInput, now: Date, weeks = 12): { week: Week; score: number | null }[] {
  const ix = indexOf(s);
  const cur = weekOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    const w = shiftWeek(cur, i - weeks + 1);
    const days = w.days.slice(0, elapsedDays(w, now));
    const rows = compareDomains(s, days, days, ix);
    return { week: w, score: weekScore(rows) };
  });
}

// ── the user's own sections (صلة الرحم، برامج التدرّج، القضاء…) ────────────
export interface SectionWindow {
  /** This week's compared days (inclusive) and the same days a week before. */
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

export interface SectionResult {
  /** «٣ زيارات»… */
  summary: string;
  /** Last week's same days, shown as «الماضي …» like the built-in rows. */
  prev?: string;
  /** now − prev in the row's own unit (the trend chip's number). */
  diff?: number;
  trend?: Trend;
  /** Short phrase under the summary. */
  phrase?: string;
  /** 0–1 — when given (with prevScore), the section joins the best / weakest pick and the week's score. */
  score?: number | null;
  prevScore?: number | null;
  /** Focus suggestions when it is the weakest. */
  focus?: string[];
  to?: string;
}

export interface ReviewSection {
  id: string;
  title: string;
  /** Return null to hide the section this week (nothing tracked). */
  compute: (w: SectionWindow) => SectionResult | null;
}

const SECTIONS: ReviewSection[] = [];

/** Plug a feature into the review (call once at module load; re-registering an id replaces it). */
export function registerReviewSection(section: ReviewSection): void {
  const i = SECTIONS.findIndex((x) => x.id === section.id);
  if (i >= 0) SECTIONS[i] = section;
  else SECTIONS.push(section);
}

export const reviewSections = (): readonly ReviewSection[] => SECTIONS;

// ── questions ──────────────────────────────────────────────────────────────
/** Weeks since a fixed Friday (rounded: a DST week is 7 days ± 1h). */
export const weekIndex = (weekId: string) => Math.round((noon(weekId).getTime() - noon('2026-01-02').getTime()) / (7 * 86_400_000));

/**
 * The week's questions: the user's own pick (bank ids + their own questions),
 * or the five core ones plus one more that rotates every week.
 */
export function questionsFor(weekId: string, chosen: string[] | null, custom: { id: string; text: string }[]): MuhasabaQuestion[] {
  const mine: MuhasabaQuestion[] = custom.map((c) => ({ id: c.id, text: c.text, kind: 'scale' }));
  if (chosen) return [...QUESTION_BANK.filter((q) => chosen.includes(q.id)), ...mine];
  const rest = QUESTION_BANK.filter((q) => !CORE_QUESTIONS.includes(q.id));
  const i = ((weekIndex(weekId) % rest.length) + rest.length) % rest.length;
  return [...QUESTION_BANK.filter((q) => CORE_QUESTIONS.includes(q.id)), rest[i], ...mine];
}

// ── streak ─────────────────────────────────────────────────────────────────
type Reviews = Record<string, { doneAt?: number } | undefined>;

/**
 * Consecutive reviewed weeks. A week whose window is still open doesn't break
 * the chain — it starts from the last reviewed one.
 */
export function reviewStreak(reviews: Reviews, now: Date): { current: number; longest: number; total: number } {
  const done = (w: Week) => !!reviews[w.id]?.doneAt;
  let w = reviewWeek(now);
  if (!done(w)) w = shiftWeek(w, -1);
  let current = 0;
  while (done(w) && current < 1000) {
    current++;
    w = shiftWeek(w, -1);
  }
  const ids = Object.keys(reviews).filter((k) => reviews[k]?.doneAt).sort();
  let longest = 0;
  let run = 0;
  ids.forEach((id, i) => {
    run = i && shiftWeek(weekById(ids[i - 1]), 1).id === id ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return { current, longest, total: ids.length };
}

// ── focus ──────────────────────────────────────────────────────────────────
export interface Focus {
  text: string;
  domain?: string;
}

/** The focus chosen in the review of the week before `now`'s week — the goal of this week. */
export function focusOfWeek(reviews: Record<string, { focus?: Focus } | undefined>, now: Date): Focus | null {
  return reviews[shiftWeek(weekOf(now), -1).id]?.focus ?? null;
}

// ── reminder ───────────────────────────────────────────────────────────────
export interface ReminderPrefs {
  on: boolean;
  /** 4 Thursday, 5 Friday, 6 Saturday. */
  day: number;
  /** 'asr' = half an hour after Asr that day; otherwise 'HH:mm'. */
  at: string;
}

export const REMINDER_DEFAULT: ReminderPrefs = { on: true, day: 5, at: 'asr' };
export const AFTER_ASR_MIN = 30;

/** The next fire of the weekly reminder (asr = null without a location → 16:30). */
export function nextReminderAt(r: ReminderPrefs, now: Date, asrOn: (day: Date) => Date | null): Date {
  for (let i = 0; i <= 7; i++) {
    const day = addDays(noon(dk(now)), i);
    if (day.getDay() !== r.day) continue;
    let t: Date;
    if (r.at === 'asr') {
      const asr = asrOn(day);
      t = asr ? new Date(asr.getTime() + AFTER_ASR_MIN * 60_000) : new Date(day);
      if (!asr) t.setHours(16, 30, 0, 0);
      t.setSeconds(0, 0);
    } else {
      const [h, m] = r.at.split(':').map(Number);
      t = new Date(day);
      t.setHours(h || 0, m || 0, 0, 0);
    }
    if (t > now) return t;
  }
  // unreachable for a valid weekday (i = 7 is the same weekday next week)
  return addDays(now, 7);
}

// ── Home / leaderboard helpers ─────────────────────────────────────────────
/** Points for completing the week's review — the only part of it the board sees. */
export const REVIEW_POINTS = 10;

export function fridayReviewPointsOn(state: { reviews: Reviews }, dayKey: string): number {
  return Object.values(state.reviews).some((r) => r?.doneAt && dk(new Date(r.doneAt)) === dayKey) ? REVIEW_POINTS : 0;
}

/** Home «يحتاج انتباهك»: the review is open and not done (Saturday = its last day). */
export function fridayReviewAttention(state: { reviews: Reviews }, now: Date): AttentionItem | null {
  if (!inReviewWindow(now)) return null;
  const w = reviewWeek(now);
  if (state.reviews[w.id]?.doneAt) return null;
  const last = now.getDay() === 6;
  const end = addDays(noon(dk(now)), 1);
  end.setHours(0, 0, 0, 0);
  return {
    id: `friday.review.${w.id}`,
    level: last ? 'closing' : 'suggest',
    icon: 'friday',
    kicker: 'محاسبة الجمعة',
    title: last ? 'اليوم آخر يوم لمحاسبة أسبوعك' : 'محاسبة الجمعة جاهزة',
    body: '«وَلْتَنظُرْ نَفْسٌ مَّا قَدَّمَتْ لِغَدٍ» — دقائق مع نفسك قبل أن يمضي الأسبوع',
    to: '/friday-review',
    ...(last ? { deadline: new Date(end.getTime() - 1) } : {}),
  };
}

/** Home card visibility: the review window, or a focus to keep during the week. */
export function homeCardState(
  state: { reviews: Record<string, { doneAt?: number; focus?: Focus } | undefined> },
  now: Date,
): { kind: 'ready' | 'done'; week: Week } | { kind: 'focus'; focus: Focus } | null {
  if (inReviewWindow(now)) {
    const w = reviewWeek(now);
    return { kind: state.reviews[w.id]?.doneAt ? 'done' : 'ready', week: w };
  }
  const f = focusOfWeek(state.reviews, now);
  return f ? { kind: 'focus', focus: f } : null;
}
