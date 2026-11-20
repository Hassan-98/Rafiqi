/**
 * «قضاء ما فات» — PURE logic (no stores, no React): what is owed, what was
 * paid, the plan and its ETA, the Ramadan deadline, suggestions to confirm,
 * reminder and leaderboard helpers. Checked by scripts/qada.test.ts.
 *
 * Model: debts are what the user CONFIRMED is owed (never auto-counted);
 * payments are per-day counters (`paid[dayKey].fajr = 2`). Remaining =
 * owed − paid, per prayer; fasts settle the OLDEST Ramadan first.
 * Hijri via Umm al-Qura + the user's sighting offset; Ramadan = month 9.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { HIJRI_MONTHS_AR, hijriMonthStart, toHijri } from '@/services/HijriService';
import { arCount } from '@/services/insightsEngine';
import { ARABIC_MONTHS, WEEKDAY_LABELS_AR, formatNumberAr } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { AttentionItem } from '@/services/dayAttention';
import type { PrayerName } from '@/types';

// ── Types ───────────────────────────────────────────────────────────────────

export const QADA_PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_AR: Record<PrayerName, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
/** «قضيتُ فجراً». */
export const PRAYER_ACC: Record<PrayerName, string> = { fajr: 'فجراً', dhuhr: 'ظهراً', asr: 'عصراً', maghrib: 'مغرباً', isha: 'عشاءً' };

export type FastReason = 'travel' | 'illness' | 'haid' | 'nursing' | 'other';
export const FAST_REASONS: FastReason[] = ['travel', 'illness', 'haid', 'nursing', 'other'];
export const FAST_REASON_AR: Record<FastReason, string> = {
  travel: 'سفر',
  illness: 'مرض',
  haid: 'حيض/نفاس',
  nursing: 'رضاع/حمل',
  other: 'أخرى',
};

export type DebtSource = 'manual' | 'excused' | 'log' | 'estimate';
export type PrayerCounts = Partial<Record<PrayerName, number>>;

export interface PrayerDebt {
  id: string;
  kind: 'prayer';
  counts: PrayerCounts;
  source: DebtSource;
  note?: string;
  at: number;
}

export interface FastDebt {
  id: string;
  kind: 'fast';
  count: number;
  reason: FastReason;
  /** Hijri year of the Ramadan the days were missed in. */
  year: number;
  /** The exact days, when known (count = days.length). */
  days?: string[];
  source: DebtSource;
  at: number;
}

export type QadaDebt = PrayerDebt | FastDebt;
export type QadaKind = PrayerName | 'fast';
/** One day's payments: prayers made up (count each) and `fast: 1`. */
export type PaidDay = Partial<Record<QadaKind, number>>;

export interface QadaSettings {
  /** Prayers made up per day — «مع كل فرض فرضٌ مقضيّ» = 5. */
  perDay: number;
  /** Daily plan reminder (+ the eve of each planned fast). */
  daily: boolean;
  /** 'HH:mm'. */
  time: string;
  /** Pre-Ramadan alerts (30 then 7 days before) while fasts remain. */
  ramadan: boolean;
}

export interface QadaData {
  debts: QadaDebt[];
  paid: Record<string, PaidDay>;
  /** Suggestion keys the user answered: `ex:<day>` (excused day), `log:<day>` (prayer log). */
  dismissed: string[];
  settings: QadaSettings;
}

export const DEFAULT_SETTINGS: QadaSettings = { perDay: 5, daily: false, time: '09:00', ramadan: true };

// ── Small helpers ──────────────────────────────────────────────────────────

export const keyOf = (d: Date): string => format(d, 'yyyy-MM-dd');
/** Local noon of a day key (noon dodges DST edges). */
export const dateOf = (k: string): Date => new Date(`${k}T12:00:00`);
const pos = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const zeros = (): Record<PrayerName, number> => ({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });

export const nPrayers = (n: number) => arCount(n, 'صلاة واحدة', 'صلاتان', 'صلوات', 'صلاة');
/** Nominative («عليك يومان», «بقي ٣٠ يوماً»). */
export const nDays = (n: number) => arCount(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');
export const numAr = (n: number) => formatNumberAr(n);

/** «الخميس ١٩ نوفمبر». */
export function dayLabelAr(d: Date): string {
  return `${WEEKDAY_LABELS_AR[d.getDay()]} ${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]}`;
}

/** «١٩ نوفمبر ٢٠٢٧». */
export function dateLabelAr(d: Date): string {
  return `${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicDigits(d.getFullYear())}`;
}

export function hijriLabelAr(d: Date, offset = 0): string {
  const h = toHijri(d, offset);
  return `${toArabicDigits(h.day)} ${HIJRI_MONTHS_AR[h.month - 1]} ${toArabicDigits(h.year)}`;
}

// ── Totals ─────────────────────────────────────────────────────────────────

export interface PrayerTotals {
  owed: Record<PrayerName, number>;
  paid: Record<PrayerName, number>;
  remaining: Record<PrayerName, number>;
  owedTotal: number;
  /** Paid toward the debt (never above what is owed, per prayer). */
  paidTotal: number;
  remainingTotal: number;
}

export function prayerTotals(s: Pick<QadaData, 'debts' | 'paid'>): PrayerTotals {
  const owed = zeros();
  const paid = zeros();
  for (const d of s.debts) if (d.kind === 'prayer') for (const p of QADA_PRAYERS) owed[p] += pos(d.counts[p]);
  for (const day of Object.values(s.paid)) for (const p of QADA_PRAYERS) paid[p] += pos(day?.[p]);
  const remaining = zeros();
  let owedTotal = 0;
  let paidTotal = 0;
  for (const p of QADA_PRAYERS) {
    remaining[p] = Math.max(0, owed[p] - paid[p]);
    owedTotal += owed[p];
    paidTotal += Math.min(owed[p], paid[p]);
  }
  return { owed, paid, remaining, owedTotal, paidTotal, remainingTotal: owedTotal - paidTotal };
}

export const fastPaidDays = (paid: QadaData['paid']): string[] =>
  Object.keys(paid)
    .filter((k) => pos(paid[k]?.fast) > 0)
    .sort();

// ── Ramadan deadline ───────────────────────────────────────────────────────

/** 1 Ramadan of the next Ramadan that has not begun by `today` (local noon). */
export function nextRamadanStart(today: Date, offset = 0): Date {
  const h = toHijri(today, offset);
  return hijriMonthStart(h.month < 9 ? h.year : h.year + 1, 9, offset);
}

/** Hijri year of the latest Ramadan that has begun (in Ramadan → this one). */
export function lastRamadanYear(today: Date, offset = 0): number {
  const h = toHijri(today, offset);
  return h.month >= 9 ? h.year : h.year - 1;
}

/** A fast missed in Ramadan `year` is due before the next Ramadan begins. */
export const dueDateOf = (year: number, offset = 0): Date => hijriMonthStart(year + 1, 9, offset);

export interface FastStatus {
  owed: number;
  paid: number;
  remaining: number;
  /** Remaining per Ramadan year, oldest first (payments settle the oldest first). */
  byYear: { year: number; remaining: number; due: Date; overdue: boolean }[];
  /** Days still owed whose deadline (the next Ramadan) has already come. */
  overdue: number;
  nextRamadan: Date;
  daysToRamadan: number;
}

export function fastStatus(s: Pick<QadaData, 'debts' | 'paid'>, today: Date, offset = 0): FastStatus {
  const perYear = new Map<number, number>();
  for (const d of s.debts) if (d.kind === 'fast') perYear.set(d.year, (perYear.get(d.year) ?? 0) + pos(d.count));
  const owed = [...perYear.values()].reduce((a, b) => a + b, 0);
  const paidCount = fastPaidDays(s.paid).length;
  let left = paidCount;
  const todayK = keyOf(today);
  const byYear = [...perYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, n]) => {
      const settled = Math.min(n, left);
      left -= settled;
      const due = dueDateOf(year, offset);
      return { year, remaining: n - settled, due, overdue: keyOf(due) <= todayK };
    })
    .filter((y) => y.remaining > 0);
  const nextRamadan = nextRamadanStart(today, offset);
  return {
    owed,
    paid: Math.min(owed, paidCount),
    remaining: byYear.reduce((a, y) => a + y.remaining, 0),
    byYear,
    overdue: byYear.filter((y) => y.overdue).reduce((a, y) => a + y.remaining, 0),
    nextRamadan,
    daysToRamadan: differenceInCalendarDays(nextRamadan, today),
  };
}

// ── Days a fast may not be made up ─────────────────────────────────────────

export type Blocked = 'ramadan' | 'eidFitr' | 'eidAdha' | 'tashreeq';
export const BLOCKED_AR: Record<Blocked, string> = {
  ramadan: 'يوم من رمضان، يُصام فيه رمضان نفسه',
  eidFitr: 'يوم عيد الفطر، لا يُصام',
  eidAdha: 'يوم عيد الأضحى، لا يُصام',
  tashreeq: 'من أيام التشريق، لا تُصام',
};

/** Why a qada fast cannot fall on this day (null = allowed). */
export function blockedReason(d: Date, offset = 0): Blocked | null {
  const h = toHijri(d, offset);
  if (h.month === 9) return 'ramadan';
  if (h.month === 10 && h.day === 1) return 'eidFitr';
  if (h.month === 12 && h.day === 10) return 'eidAdha';
  if (h.month === 12 && h.day >= 11 && h.day <= 13) return 'tashreeq';
  return null;
}

// ── Fast plan ──────────────────────────────────────────────────────────────

export type FastDayKind = 'monThu' | 'white' | 'other';
export const FAST_DAY_KIND_AR: Record<FastDayKind, string> = { monThu: 'إثنين/خميس', white: 'من الأيام البيض', other: '' };

export interface PlannedFast {
  key: string;
  kind: FastDayKind;
}

export interface FastPlan {
  days: PlannedFast[];
  /** Owed days that no longer fit before the deadline. */
  shortfall: number;
  /** Eid / Tashreeq days inside the window (shown as «لا يُصام»). */
  blocked: { key: string; reason: Blocked }[];
}

/**
 * Proposed qada days in [from, until): the earliest Mondays/Thursdays and white
 * days (13–15) first — hastening a debt is better — then the earliest other
 * days if those are not enough. Never Ramadan, the two Eids or Tashreeq.
 */
export function planFasts(count: number, from: Date, until: Date, offset = 0): FastPlan {
  const preferred: PlannedFast[] = [];
  const other: PlannedFast[] = [];
  const blocked: FastPlan['blocked'] = [];
  const end = keyOf(until);
  for (let d = dateOf(keyOf(from)); keyOf(d) < end; d = addDays(d, 1)) {
    const key = keyOf(d);
    const why = blockedReason(d, offset);
    if (why) {
      if (why !== 'ramadan') blocked.push({ key, reason: why });
      continue;
    }
    const wd = d.getDay();
    const hd = toHijri(d, offset).day;
    if (wd === 1 || wd === 4) preferred.push({ key, kind: 'monThu' });
    else if (hd >= 13 && hd <= 15) preferred.push({ key, kind: 'white' });
    else other.push({ key, kind: 'other' });
  }
  const want = Math.max(0, Math.floor(count));
  const picked = [...preferred.slice(0, want), ...other.slice(0, Math.max(0, want - preferred.length))].sort((a, b) =>
    a.key < b.key ? -1 : 1,
  );
  return { days: picked, shortfall: want - picked.length, blocked };
}

/** The plan for the remaining fasts, from tomorrow to the next Ramadan. */
export function currentFastPlan(s: Pick<QadaData, 'debts' | 'paid'>, today: Date, offset = 0): FastPlan & { status: FastStatus } {
  const status = fastStatus(s, today, offset);
  return { ...planFasts(status.remaining, addDays(dateOf(keyOf(today)), 1), status.nextRamadan, offset), status };
}

// ── Prayer plan ────────────────────────────────────────────────────────────

/**
 * Today's share of the plan: `perDay` prayers spread round-robin (فجر، ظهر…)
 * over the prayers still owed at the START of today, minus what was paid today.
 */
export function prayerPlanToday(
  remaining: Record<PrayerName, number>,
  paidToday: PaidDay | undefined,
  perDay: number,
): { target: Record<PrayerName, number>; done: Record<PrayerName, number>; left: number } {
  const done = zeros();
  const startRem = zeros();
  for (const p of QADA_PRAYERS) {
    done[p] = pos(paidToday?.[p]);
    startRem[p] = remaining[p] + done[p];
  }
  const target = zeros();
  let budget = Math.max(0, Math.floor(perDay));
  while (budget > 0) {
    let moved = false;
    for (const p of QADA_PRAYERS) {
      if (budget > 0 && target[p] < startRem[p]) {
        target[p] += 1;
        budget -= 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const doneTotal = QADA_PRAYERS.reduce((a, p) => a + done[p], 0);
  const targetTotal = QADA_PRAYERS.reduce((a, p) => a + target[p], 0);
  return { target, done, left: Math.max(0, targetTotal - doneTotal) };
}

/** Day the prayers are all made up at `perDay` a day (null when nothing is owed or no pace). */
export function prayerEta(remainingTotal: number, leftToday: number, perDay: number, today: Date): Date | null {
  if (remainingTotal <= 0) return null;
  if (remainingTotal <= leftToday) return dateOf(keyOf(today));
  if (perDay <= 0) return null;
  return addDays(dateOf(keyOf(today)), Math.ceil((remainingTotal - leftToday) / perDay));
}

// ── Suggestions (always confirmed by the user) ─────────────────────────────

export interface ExcusedSuggestion {
  year: number;
  days: string[];
}

/**
 * Excused days (حيض/نفاس) that fell in a past Ramadan: those fasts are owed.
 * Skips today and later, days already in a debt, answered days, and years
 * already entered by count (a `haid` debt without days — counted by hand).
 */
export function excusedRamadanSuggestions(
  excused: Record<string, unknown>,
  s: Pick<QadaData, 'debts' | 'dismissed'>,
  todayKey: string,
  offset = 0,
): ExcusedSuggestion[] {
  const taken = new Set<string>();
  const byHand = new Set<number>();
  for (const d of s.debts) {
    if (d.kind !== 'fast') continue;
    for (const k of d.days ?? []) taken.add(k);
    if (d.reason === 'haid' && !d.days?.length) byHand.add(d.year);
  }
  const answered = new Set(s.dismissed);
  const byYear = new Map<number, string[]>();
  for (const k of Object.keys(excused).sort()) {
    if (!excused[k] || k >= todayKey || taken.has(k) || answered.has(`ex:${k}`)) continue;
    const h = toHijri(dateOf(k), offset);
    if (h.month !== 9 || byHand.has(h.year)) continue;
    byYear.set(h.year, [...(byYear.get(h.year) ?? []), k]);
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, days]) => ({ year, days }));
}

export interface LogSuggestion {
  day: string;
  prayers: PrayerName[];
}

/**
 * Days of the prayer log where MOST fard were logged (3–4) but some were not:
 * maybe missed, maybe only unlogged — the user decides. Last `windowDays`
 * before today, excused days and answered days skipped. Newest first.
 */
export function unloggedFardSuggestions(
  log: Record<string, Partial<Record<PrayerName, { fard?: boolean } | undefined>> | undefined>,
  excused: Record<string, unknown>,
  dismissed: string[],
  today: Date,
  windowDays = 14,
): LogSuggestion[] {
  const answered = new Set(dismissed);
  const out: LogSuggestion[] = [];
  for (let i = 1; i <= windowDays; i += 1) {
    const day = keyOf(addDays(dateOf(keyOf(today)), -i));
    if (excused[day] || answered.has(`log:${day}`)) continue;
    const entry = log[day];
    const missing = QADA_PRAYERS.filter((p) => !entry?.[p]?.fard);
    if (missing.length >= 1 && missing.length <= 2) out.push({ day, prayers: missing });
  }
  return out;
}

// ── Estimator (returning to prayer) ────────────────────────────────────────

/** Days of prayers missed over a span, minus a woman's excused days a month. */
export function estimateMissedDays(years: number, months: number, excusedPerMonth = 0): number {
  const y = Math.max(0, years || 0);
  const m = Math.max(0, months || 0);
  const total = Math.round(y * 365.25 + m * 30.44);
  const excused = Math.round((y * 12 + m) * Math.max(0, excusedPerMonth || 0));
  return Math.max(0, total - excused);
}

// ── Leaderboard ────────────────────────────────────────────────────────────

/** A made-up prayer weighs like a fard, a made-up fast like a fast. */
/** A made-up prayer weighs like a fard (LB.fard), a made-up fast like a fast. */
export const QADA_POINTS = { prayer: 15, fast: 30, /** prayers credited a day */ prayerMax: 10 } as const;

/**
 * Points of a day's qada. `fastCredited`: the fasting module already scored
 * this day's fast (a qada fast is also logged there) — don't count it twice.
 */
export function qadaPointsOn(s: Pick<QadaData, 'paid'>, dayKey: string, opts: { fastCredited?: boolean } = {}): number {
  const day = s.paid[dayKey];
  if (!day) return 0;
  const prayers = Math.min(
    QADA_POINTS.prayerMax,
    QADA_PRAYERS.reduce((a, p) => a + pos(day[p]), 0),
  );
  const fast = pos(day.fast) > 0 && !opts.fastCredited ? QADA_POINTS.fast : 0;
  return prayers * QADA_POINTS.prayer + fast;
}

// ── Reminders ──────────────────────────────────────────────────────────────

export interface QadaNotif {
  id: string;
  title: string;
  body: string;
  at: number;
  repeat: 'none' | 'daily';
}

/** Every id this feature may arm — all stable (no dates; see the stable-id rule). */
export const QADA_NOTIF_IDS = ['myzikr_qada_daily', 'myzikr_qada_fast', 'myzikr_qada_ram30', 'myzikr_qada_ram7'] as const;
export const QADA_NOTIF_PREFIX = 'myzikr_qada_';
const TITLE = 'قضاء ما فات';
const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();

/**
 * What should be armed now. Copy stays discreet on a lock screen: the plan,
 * never the size of the debt.
 */
export function planQadaReminders(s: QadaData, now: Date, offset = 0): QadaNotif[] {
  const out: QadaNotif[] = [];
  const nowMs = now.getTime();
  const pt = prayerTotals(s);
  const { status, days } = currentFastPlan(s, now, offset);

  if (s.settings.daily && pt.remainingTotal > 0 && s.settings.perDay > 0) {
    const [h, m] = (s.settings.time || DEFAULT_SETTINGS.time).split(':').map(Number);
    let first = at(now, h || 0, m || 0);
    if (first <= nowMs) first = at(addDays(now, 1), h || 0, m || 0);
    out.push({
      id: 'myzikr_qada_daily',
      title: TITLE,
      body: `مع كل فرض فرضٌ مقضيّ، خطتك اليوم ${nPrayers(Math.min(s.settings.perDay, pt.remainingTotal))}`,
      at: first,
      repeat: 'daily',
    });
  }

  if (s.settings.daily && status.remaining > 0) {
    const next = days.find((d) => at(addDays(dateOf(d.key), -1), 21) > nowMs);
    if (next) {
      const day = dateOf(next.key);
      out.push({
        id: 'myzikr_qada_fast',
        title: TITLE,
        body: `غداً ${WEEKDAY_LABELS_AR[day.getDay()]} يوم قضاء في خطتك، بيّت النية من الليل`,
        at: at(addDays(day, -1), 21),
        repeat: 'none',
      });
    }
  }

  if (s.settings.ramadan && status.remaining > 0) {
    for (const [id, before] of [['myzikr_qada_ram30', 30], ['myzikr_qada_ram7', 7]] as const) {
      const t = at(addDays(status.nextRamadan, -before), 10);
      if (t > nowMs) {
        out.push({
          id,
          title: TITLE,
          body: `بقي ${nDays(before)} على رمضان، أكمل ما عليك من صيام قبل دخوله`,
          at: t,
          repeat: 'none',
        });
      }
    }
  }
  return out;
}

// ── Home «يحتاج انتباهك» ───────────────────────────────────────────────────

/** «لا تقترحها» key of every qada item on Home. */
export const QADA_MUTE_KEY = 'qada';

/**
 * Items for Home («يحتاج انتباهك», a registered source): owed fasts — «استعدّ
 * للغد» when a planned fast is tomorrow, else a nudge once Ramadan is ≤ 60 days
 * away (closing in its last week) — and today's prayer plan from noon while
 * some of it is left. Weighted 'sunnah': a debt with a wide time never takes
 * «الآن» from a prayer whose time is running out.
 */
export function qadaAttention(s: QadaData, now: Date, offset = 0): AttentionItem[] {
  const out: AttentionItem[] = [];
  const todayK = keyOf(now);
  const { status, days } = currentFastPlan(s, now, offset);
  if (status.remaining > 0) {
    const next = days[0] ? dateOf(days[0].key) : null;
    const tomorrow = !!next && differenceInCalendarDays(next, now) === 1;
    if (status.daysToRamadan <= 60 || tomorrow) {
      const when = next ? (tomorrow ? `صُم غداً ${WEEKDAY_LABELS_AR[next.getDay()]}` : `صُم ${dayLabelAr(next)}`) : '';
      out.push({
        id: tomorrow ? `qada-fast-eve-${keyOf(next!)}` : `qada-fast-${keyOf(status.nextRamadan)}`,
        level: tomorrow ? 'prep' : status.daysToRamadan <= 7 ? 'closing' : 'suggest',
        weight: 'sunnah',
        icon: 'fasting',
        kicker: 'قضاء الصيام',
        title: `عليك ${nDays(status.remaining)} قضاء`,
        body: [`بقي ${nDays(status.daysToRamadan)} على رمضان`, when].filter(Boolean).join('، '),
        to: '/qada?tab=fasts',
        habit: QADA_MUTE_KEY,
        why: tomorrow ? 'لأنه اليوم المقترح في خطة قضائك، فبيّت النية من الليل' : 'لأن وقت القضاء ينتهي بدخول رمضان',
      });
    }
  }
  const pt = prayerTotals(s);
  if (pt.remainingTotal > 0 && s.settings.perDay > 0 && now.getHours() >= 12) {
    const { left } = prayerPlanToday(pt.remaining, s.paid[todayK], s.settings.perDay);
    if (left > 0) {
      out.push({
        id: `qada-prayers-${todayK}`,
        level: 'suggest',
        weight: 'sunnah',
        icon: 'prayer',
        kicker: 'قضاء الصلوات',
        title: `بقي من خطة اليوم ${nPrayers(left)}`,
        body: 'مع كل فرض فرضٌ مقضيّ',
        to: '/qada',
        habit: QADA_MUTE_KEY,
        why: 'لأنها من خطتك اليومية للقضاء',
      });
    }
  }
  return out;
}
