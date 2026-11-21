/**
 * «صلة الرحم وبرّ الوالدين» — PURE model: types and the math the page, the
 * reminders, the board and Home's «يحتاج انتباهك» share. No store imports,
 * so scripts/silat.test.ts runs it under plain node.
 *
 * Day math is on local 'yyyy-MM-dd' keys built from y/m/d (studyModel helpers),
 * never `+ 86_400_000`, so DST can't slide a due day.
 *
 * The rhythm: a person is reached by the contacts that COUNT for them (a call,
 * a message, a visit, a gift, a help — du'a is a deed, not contact; for one who
 * has died, du'a, sadaqah and «صلة أهل ودّه» are what count). Their due day is
 * the last counting day + everyDays (moved on to their preferred weekday, for a
 * plan of a week or longer); past it, they are LATE. Before the first logged
 * contact the cycle runs from the «متى وصلته آخر مرة؟» baseline (never due
 * before the day they were added), or — without one — from the day added: a
 * new person is not due on day one.
 */
import { differenceInCalendarDays } from 'date-fns';
import { WEEKDAY_AR, atTime, dayKey, durationAr, parseKey, shiftKey, type PlannedNotif } from '@/store/studyModel';
import { toArabicDigits } from '@/utils/arabicFormat';
import {
  CONTACT, DECEASED_TYPES, MESSAGE_TEMPLATES, RECONCILE_POINTS, REPAIR_STEPS, SILAT_DAY_MAX,
  categoryOfRelation, closenessOf, isContact, isFemaleRelation, pointsFor, relationLabel, withPronoun,
  type ContactType, type MessageTemplate, type SilatCategory,
} from '@/data/silatContent';
import { silatNotifMeta } from '@/store/silatPhoneModel';

type Gender = 'male' | 'female' | null | undefined;

export interface Occasion {
  id: string;
  label: string;
  /** 'yyyy-MM-dd' (for a yearly one only the month and day matter). */
  date: string;
  yearly: boolean;
}

export interface Repair {
  /** When «إصلاح قطيعة» began: the first contact after it earns the bonus. */
  since: number;
  endedAt?: number;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  /** Desired rhythm in days (1 = daily). */
  everyDays: number;
  /** Preferred weekday (0 Sun … 6 Sat) for a plan of a week or longer: the due day moves on to it. */
  weekday?: number;
  /**
   * «متى وصلته آخر مرة؟» when added ('yyyy-MM-dd', see baselineFor): the cycle
   * starts here until a logged contact. Not a contact: no points, no history,
   * never «وصلته اليوم».
   */
  baseline?: string;
  channels?: ContactType[];
  phone?: string;
  /** 'yyyy-MM-dd' — only month and day are used. */
  birthday?: string;
  occasions?: Occasion[];
  notes?: string;
  /** Avatar colour index. */
  tone?: number;
  deceased?: boolean;
  /** «مريض» → «عيادة المريض». */
  ill?: boolean;
  repair?: Repair;
  /** A reminder of their own on their due day. */
  remind?: boolean;
  remindTime?: string;
  createdAt: number;
  /** Tombstone (a plain delete would come back from another device's sync). */
  deletedAt?: number;
}

export interface SilatEntry {
  id: string;
  personId: string;
  type: ContactType;
  at: number;
  /** Local day it happened ('yyyy-MM-dd'). */
  day: string;
  note?: string;
  durationMin?: number;
  /** Logged from the call log (silatPhoneModel.planCallImport): the call's start, its dedupe key. */
  auto?: number;
}

export interface SilatPrefs {
  /** The daily «من تصلهم اليوم» digest. */
  digest: boolean;
  digestTime: string;
  /** Birthdays and occasions. */
  occasions: boolean;
}

export const DEFAULT_PREFS: SilatPrefs = { digest: true, digestTime: '18:00', occasions: true };

// ── basics ───────────────────────────────────────────────────────────────────

export const isLive = (p: Person): boolean => !p.deletedAt;
export const repairing = (p: Person): boolean => !!p.repair && !p.repair.endedAt;
/** On the rhythm board: living, not deleted, not in «إصلاح قطيعة» (that has its own plan). */
export const trackable = (p: Person): boolean => !p.deletedAt && !p.deceased && !repairing(p);
export const categoryOf = (p: Pick<Person, 'relation'>): SilatCategory => categoryOfRelation(p.relation);
export const displayName = (p: Pick<Person, 'name' | 'relation'>, gender?: Gender): string =>
  p.name.trim() || relationLabel(p.relation, gender);

export const isFemale = (p: Pick<Person, 'relation'>, gender?: Gender): boolean => isFemaleRelation(p.relation, gender);

/** Does this contact keep this person's rhythm? (Living: contact, not «بظهر الغيب»; one who has died: the deeds that reach them.) */
export function countsFor(p: Pick<Person, 'deceased'>, type: ContactType): boolean {
  return p.deceased ? DECEASED_TYPES.includes(type) : isContact(type);
}

/** "يوم" / "يومين" / "٣ أيام" / "١٢ يوماً". */
export const daysAr = (n: number): string => durationAr(Math.max(1, n) * 1440);

export const diffDays = (a: string, b: string): number => differenceInCalendarDays(parseKey(a), parseKey(b));

/** Index entries by person, newest first (one pass for a whole list). */
export function byPerson(entries: readonly SilatEntry[]): Map<string, SilatEntry[]> {
  const m = new Map<string, SilatEntry[]>();
  for (const e of entries) {
    const l = m.get(e.personId);
    if (l) l.push(e);
    else m.set(e.personId, [e]);
  }
  for (const l of m.values()) l.sort((a, b) => b.at - a.at);
  return m;
}

/** Ascending, unique days of the contacts that count for `p`. */
function countingDays(p: Person, own: readonly SilatEntry[]): string[] {
  return [...new Set(own.filter((e) => countsFor(p, e.type)).map((e) => e.day))].sort();
}

// ── status ───────────────────────────────────────────────────────────────────

export type DueState = 'done' | 'ok' | 'due' | 'late';

export interface PersonStatus {
  /** Last counting day on or before today (or the baseline before any); null = never reached. */
  lastDay: string | null;
  /** lastDay is the baseline the user estimated, not a logged contact. */
  estimated: boolean;
  /** The preferred weekday the due day sits on (planWeekday), or null. */
  weekday: number | null;
  dueDay: string;
  /** > 0 due in N days, 0 due today, < 0 late by −N. */
  daysLeft: number;
  state: DueState;
  /** 0–1 share of the interval still ahead (1 = just reached, 0 = due or late). */
  left: number;
}

const everyOf = (p: Pick<Person, 'everyDays'>): number => Math.max(1, Math.round(p.everyDays) || 1);

/** The preferred weekday when it applies (a plan of a week or longer), else null. */
export const planWeekday = (p: Pick<Person, 'everyDays' | 'weekday'>): number | null =>
  p.weekday != null && p.weekday >= 0 && p.weekday <= 6 && everyOf(p) >= 7 ? p.weekday : null;

/** `day`, or the first day after it on the person's preferred weekday. */
function onPlanDay(p: Pick<Person, 'everyDays' | 'weekday'>, day: string): string {
  const wd = planWeekday(p);
  return wd === null ? day : shiftKey(day, (wd - parseKey(day).getDay() + 7) % 7);
}

/** Reached on `last` → due on last + the plan (monthly: + 30), on their weekday when they have one. */
export const nextDue = (p: Pick<Person, 'everyDays' | 'weekday'>, last: string): string => onPlanDay(p, shiftKey(last, everyOf(p)));

/** Before any logged contact: from the baseline but never before the day added; without one, a full plan after it. */
function firstDue(p: Person): string {
  const created = dayKey(p.createdAt);
  if (!p.baseline) return nextDue(p, created);
  const d = nextDue(p, p.baseline);
  return d >= created ? d : onPlanDay(p, created);
}

export type SinceChoice = 'soon' | 'month' | 'long';

/** «متى وصلته آخر مرة؟» → the baseline day: about 2 days ago, about 20, or one whole plan back (due now). */
export const baselineFor = (c: SinceChoice, today: string, everyDays: number): string =>
  shiftKey(today, c === 'soon' ? -2 : c === 'month' ? -20 : -everyOf({ everyDays }));

export function statusOf(p: Person, entries: readonly SilatEntry[], today: string): PersonStatus {
  const every = everyOf(p);
  let real: string | null = null;
  for (const e of entries) {
    if (e.personId !== p.id || e.day > today || !countsFor(p, e.type)) continue;
    if (!real || e.day > real) real = e.day;
  }
  const estimated = !!p.baseline && p.baseline <= today && (!real || p.baseline > real);
  const lastDay = estimated ? p.baseline! : real;
  const dueDay = real && !estimated ? nextDue(p, real) : firstDue(p);
  const daysLeft = diffDays(dueDay, today);
  const state: DueState = real === today ? 'done' : daysLeft > 0 ? 'ok' : daysLeft === 0 ? 'due' : 'late';
  const left = state === 'done' ? 1 : Math.min(1, Math.max(0, daysLeft / every));
  return { lastDay, estimated, weekday: planWeekday(p), dueDay, daysLeft, state, left };
}

/**
 * «وصلته اليوم» / «موعد صلته اليوم» / «بعد ٣ أيام» / «تأخّرت صلته يومين» / «لم تصله بعد»
 * — on a preferred weekday «موعده الجمعة» — «ها» for a woman.
 */
export function dueText(s: PersonStatus, female = false): string {
  const t =
    s.state === 'done'
      ? 'وصلت{ه} اليوم'
      : s.state === 'late'
        ? `تأخّرت صلت{ه} ${daysAr(-s.daysLeft)}`
        : s.state === 'due'
          ? s.lastDay
            ? 'موعد صلت{ه} اليوم'
            : 'لم تصل{ه} بعد'
          : s.weekday !== null
            ? `موعد{ه} ${s.daysLeft === 1 ? 'غداً، ' : ''}${WEEKDAY_AR[s.weekday]}${s.daysLeft > 6 ? ` بعد ${daysAr(s.daysLeft)}` : ''}`
            : s.daysLeft === 1
              ? 'موعد صلت{ه} غداً'
              : `بعد ${daysAr(s.daysLeft)}`;
  return withPronoun(t, female);
}

/** «منذ ٣ أيام» / «اليوم» / «أمس» since the last contact. */
export function sinceText(lastDay: string | null, today: string): string {
  if (!lastDay) return 'لا صلة مسجّلة';
  const n = diffDays(today, lastDay);
  return n <= 0 ? 'اليوم' : n === 1 ? 'أمس' : `منذ ${daysAr(n)}`;
}

// ── «الأولى بالصلة الآن» ─────────────────────────────────────────────────────

const TIER: Record<SilatCategory, number> = { parents: 0, kin: 1, neighbors: 2, friends: 3 };
const bucketOf = (s: PersonStatus) => (s.state === 'late' || s.state === 'due' ? 0 : s.state === 'ok' ? 1 : 2);

export interface Ranked {
  person: Person;
  status: PersonStatus;
}

/**
 * Due or late first — the parents, then the kin, neighbours, friends; inside a
 * circle the longest overdue for their rhythm, then the closest relation.
 * Then the coming ones (soonest first), then those reached today.
 */
export function compareRanked(a: Ranked, b: Ranked): number {
  const ba = bucketOf(a.status);
  const bb = bucketOf(b.status);
  if (ba !== bb) return ba - bb;
  const ta = TIER[categoryOf(a.person)];
  const tb = TIER[categoryOf(b.person)];
  if (ba === 0) {
    if (ta !== tb) return ta - tb;
    const la = -a.status.daysLeft / Math.max(1, a.person.everyDays);
    const lb = -b.status.daysLeft / Math.max(1, b.person.everyDays);
    if (la !== lb) return lb - la;
  } else if (ba === 1) {
    if (a.status.daysLeft !== b.status.daysLeft) return a.status.daysLeft - b.status.daysLeft;
    if (ta !== tb) return ta - tb;
  } else if (ta !== tb) return ta - tb;
  const ca = closenessOf(a.person.relation);
  const cb = closenessOf(b.person.relation);
  return ca !== cb ? ca - cb : a.person.name.localeCompare(b.person.name, 'ar');
}

/** Every trackable person with their status, «الأولى بالصلة الآن» first. */
export function rankPeople(people: readonly Person[], entries: readonly SilatEntry[], today: string): Ranked[] {
  const idx = byPerson(entries);
  return people
    .filter(trackable)
    .map((person) => ({ person, status: statusOf(person, idx.get(person.id) ?? [], today) }))
    .sort(compareRanked);
}

export const isDueNow = (r: Ranked): boolean => r.status.state === 'due' || r.status.state === 'late';

/** A gentle load: the first `max` of a ranked list (the parents lead — compareRanked) and how many wait behind. */
export function capRanked(list: readonly Ranked[], max = 4): { shown: Ranked[]; more: number } {
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

/** «وآخر» / «وآخران» / «و٣ آخرون». */
export const othersText = (n: number): string => (n === 1 ? 'وآخر' : n === 2 ? 'وآخران' : `و${toArabicDigits(n)} آخرون`);

// ── coverage & streak ────────────────────────────────────────────────────────

/** The Saturday on or before `key` (the app's week runs Saturday → Friday). */
export function weekStartKey(key: string): string {
  const wd = parseKey(key).getDay(); // 0 Sun … 6 Sat
  return shiftKey(key, -((wd + 1) % 7));
}

interface Track {
  p: Person;
  created: string;
  /** Contacts from this day on drive the cycle; before any, `first`. */
  from: string;
  first: string;
  days: string[];
}

function tracks(people: readonly Person[], entries: readonly SilatEntry[]): Track[] {
  const idx = byPerson(entries);
  return people.filter(trackable).map((p) => {
    const created = dayKey(p.createdAt);
    return { p, created, from: p.baseline ?? created, first: firstDue(p), days: countingDays(p, idx.get(p.id) ?? []) };
  });
}

/**
 * Missed on day D: by the END of a past day D its due day had come and gone
 * with no contact; for today, only once the due day is already behind. Before
 * a first contact the cycle runs as in statusOf (a new person gets a full
 * rhythm of grace).
 */
function missedOn(t: Track, d: string, today: string): boolean {
  if (d < t.created) return false;
  let due = t.first;
  for (let i = t.days.length - 1; i >= 0; i--) {
    if (t.days[i] <= d) {
      if (t.days[i] >= t.from) due = nextDue(t.p, t.days[i]);
      break;
    }
  }
  return d < today ? d >= due : d > due;
}

/** Nobody active in [from, to] missed their rhythm on any of its days (null when nobody was active). */
function keptBetween(ts: Track[], from: string, to: string, today: string): boolean | null {
  const active = ts.filter((t) => t.created <= to);
  if (!active.length) return null;
  for (let d = from; d <= to; d = shiftKey(d, 1)) {
    if (active.some((t) => missedOn(t, d, today))) return false;
  }
  return true;
}

export interface Coverage {
  kept: number;
  total: number;
  /** 0–100, null with nobody to keep. */
  pct: number | null;
}

/** This week (Saturday → today): the share of people whose rhythm was kept on every day of it. */
export function weekCoverage(people: readonly Person[], entries: readonly SilatEntry[], today: string): Coverage {
  const ws = weekStartKey(today);
  const ts = tracks(people, entries).filter((t) => t.created <= today);
  let kept = 0;
  for (const t of ts) {
    let ok = true;
    for (let d = ws < t.created ? t.created : ws; d <= today; d = shiftKey(d, 1)) {
      if (missedOn(t, d, today)) {
        ok = false;
        break;
      }
    }
    if (ok) kept++;
  }
  return { kept, total: ts.length, pct: ts.length ? Math.round((kept / ts.length) * 100) : null };
}

/** Consecutive weeks (this one so far included) in which everyone was reached on time. */
export function coverageStreak(people: readonly Person[], entries: readonly SilatEntry[], today: string): number {
  const ts = tracks(people, entries);
  const ws = weekStartKey(today);
  if (!keptBetween(ts, ws, today, today)) return 0;
  let n = 1;
  for (let s = shiftKey(ws, -7); n < 520; s = shiftKey(s, -7)) {
    if (keptBetween(ts, s, shiftKey(s, 6), today) !== true) break;
    n++;
  }
  return n;
}

// ── insights ─────────────────────────────────────────────────────────────────

export type TypeCounts = Record<ContactType, number>;
export const emptyCounts = (): TypeCounts => Object.fromEntries(Object.keys(CONTACT).map((t) => [t, 0])) as TypeCounts;

const liveIds = (people: readonly Person[]) => new Set(people.filter(isLive).map((p) => p.id));

/** Contacts by type in [from, to] (inclusive day keys). A type this version doesn't know (synced from a newer one) is skipped. */
export function countsBetween(entries: readonly SilatEntry[], people: readonly Person[], from: string, to: string): TypeCounts {
  const ids = liveIds(people);
  const c = emptyCounts();
  for (const e of entries) if (ids.has(e.personId) && e.day >= from && e.day <= to && e.type in c) c[e.type]++;
  return c;
}

export const sumCounts = (c: TypeCounts): number => Object.values(c).reduce((n, x) => n + x, 0);

/** The last `weeks` Saturday-weeks, oldest first, with their contacts by type. */
export function weeklyByType(entries: readonly SilatEntry[], people: readonly Person[], today: string, weeks = 8) {
  const ws = weekStartKey(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = shiftKey(ws, -7 * (weeks - 1 - i));
    return { start, counts: countsBetween(entries, people, start, shiftKey(start, 6)) };
  });
}

/** How often each living person was reached in [from, to], most first. */
export function reachRanking(people: readonly Person[], entries: readonly SilatEntry[], from: string, to: string) {
  const idx = byPerson(entries);
  return people
    .filter((p) => isLive(p) && !p.deceased)
    .map((person) => {
      const own = (idx.get(person.id) ?? []).filter((e) => countsFor(person, e.type));
      return {
        person,
        n: own.filter((e) => e.day >= from && e.day <= to).length,
        last: own[0]?.day ?? null,
      };
    })
    .sort((a, b) => b.n - a.n || (b.last ?? '').localeCompare(a.last ?? ''));
}

/** A person's heat calendar: from the Saturday `weeks` back to today, 0–1 by the day's effort (a visit fills it). */
export function personHeat(personId: string, entries: readonly SilatEntry[], today: string, weeks = 26) {
  const pts = new Map<string, number>();
  for (const e of entries) if (e.personId === personId) pts.set(e.day, (pts.get(e.day) ?? 0) + (CONTACT[e.type]?.points ?? 0));
  const cells: { date: string; value: number; label?: string }[] = [];
  for (let d = shiftKey(weekStartKey(today), -7 * (weeks - 1)); d <= today; d = shiftKey(d, 1)) {
    const v = pts.get(d) ?? 0;
    cells.push({ date: d, value: Math.min(1, v / 8) });
  }
  return cells;
}

// ── occasions & the sick ─────────────────────────────────────────────────────

/** The next 'yyyy-MM-dd' on or after `today` with the month and day of `date`. */
export function nextAnniversary(date: string, today: string): string {
  const [, m, d] = date.split('-').map(Number);
  const y = parseKey(today).getFullYear();
  const at = (yy: number) => dayKey(new Date(yy, (m || 1) - 1, d || 1));
  const thisYear = at(y);
  return thisYear >= today ? thisYear : at(y + 1);
}

export interface Upcoming {
  id: string;
  person: Person;
  kind: 'birthday' | 'occasion';
  label: string;
  day: string;
  daysLeft: number;
}

/** Birthdays and occasions of living people in the next `horizon` days, soonest first. */
export function upcomingOccasions(people: readonly Person[], today: string, horizon = 30): Upcoming[] {
  const out: Upcoming[] = [];
  for (const p of people) {
    if (!isLive(p) || p.deceased) continue;
    if (p.birthday) {
      const day = nextAnniversary(p.birthday, today);
      out.push({ id: `${p.id}_bd`, person: p, kind: 'birthday', label: 'يوم ميلاده', day, daysLeft: diffDays(day, today) });
    }
    for (const o of p.occasions ?? []) {
      const day = o.yearly ? nextAnniversary(o.date, today) : o.date;
      if (day < today) continue;
      out.push({ id: `${p.id}_${o.id}`, person: p, kind: 'occasion', label: o.label, day, daysLeft: diffDays(day, today) });
    }
  }
  return out.filter((u) => u.daysLeft <= horizon).sort((a, b) => a.daysLeft - b.daysLeft);
}

/** What looks in on someone sick. */
const SICK_CARE: ContactType[] = ['iyada', 'visit', 'call', 'video'];

/** Someone marked «مريض» and not visited (or called) in the last 3 days. */
export function needsVisit(p: Person, entries: readonly SilatEntry[], today: string): boolean {
  if (!p.ill || p.deceased || !isLive(p)) return false;
  const from = shiftKey(today, -2);
  return !entries.some((e) => e.personId === p.id && SICK_CARE.includes(e.type) && e.day >= from && e.day <= today);
}

// ── «إصلاح قطيعة» ────────────────────────────────────────────────────────────

/** Which plan steps (du'a → greeting → call → visit) were done since the repair began. */
export function repairSteps(p: Person, entries: readonly SilatEntry[]): boolean[] {
  const since = p.repair?.since ?? Infinity;
  return REPAIR_STEPS.map((s) => entries.some((e) => e.personId === p.id && e.type === s.type && e.at >= since));
}

/** The first real contact (not du'a) after the estrangement — it carries the bonus. */
export function reconcileEntry(p: Person, entries: readonly SilatEntry[]): SilatEntry | undefined {
  if (!p.repair || p.deceased) return undefined;
  const since = p.repair.since;
  let first: SilatEntry | undefined;
  for (const e of entries) {
    if (e.personId !== p.id || e.at < since || !countsFor(p, e.type)) continue;
    if (!first || e.at < first.at) first = e;
  }
  return first;
}

// ── «صِلة اليوم», «دائرة الصلة», milestones, ready messages ──────────────────

/**
 * The easiest fitting way to reach `p` today: du'a for one who has died, a
 * sick visit for someone sick and not visited, congratulations on their day,
 * else the lightest of their preferred ways that counts (a message before a
 * call before a visit), else a call.
 */
export function easiestAction(p: Person, own: readonly SilatEntry[], today: string): ContactType {
  if (p.deceased) return 'dua';
  if (needsVisit(p, own, today)) return 'iyada';
  if (upcomingOccasions([p], today, 0).length) return 'congrats';
  const ways = (p.channels ?? []).filter(isContact).sort((a, b) => CONTACT[a].points - CONTACT[b].points);
  return ways[0] ?? 'call';
}

export interface SilahPick extends Ranked {
  action: ContactType;
  /** 'due': their day has come · 'ill': sick and not visited · 'occasion': their birthday or occasion is today. */
  why: 'due' | 'ill' | 'occasion';
}

/** «صِلة اليوم»: the first one due («الأولى بالصلة»), else someone sick to visit, else an occasion today — with its easiest action. */
export function silahOfDay(people: readonly Person[], entries: readonly SilatEntry[], today: string): SilahPick | null {
  const idx = byPerson(entries);
  const ranked = rankPeople(people, entries, today);
  const pick = (r: Ranked, why: SilahPick['why']): SilahPick => ({ ...r, why, action: easiestAction(r.person, idx.get(r.person.id) ?? [], today) });
  const due = ranked.find(isDueNow);
  if (due) return pick(due, 'due');
  const ill = ranked.find((r) => needsVisit(r.person, idx.get(r.person.id) ?? [], today));
  if (ill) return pick(ill, 'ill');
  const occ = ranked.find((r) => upcomingOccasions([r.person], today, 0).length);
  return occ ? pick(occ, 'occasion') : null;
}

export interface WeekCircle {
  /** Reached this week (a contact that counts, Saturday → today). */
  reached: Person[];
  /** Due by Friday and not reached yet, «الأولى بالصلة» first. */
  waiting: Ranked[];
}

/**
 * «دائرة الصلة»: who this week is about — everyone due by its end (Friday),
 * and whoever was reached in it. Reaching someone late still closes their
 * place in the circle (unlike weekCoverage, which asks «on time?»).
 */
export function weekCircle(people: readonly Person[], entries: readonly SilatEntry[], today: string): WeekCircle {
  const ws = weekStartKey(today);
  const we = shiftKey(ws, 6);
  const idx = byPerson(entries);
  const reached: Person[] = [];
  const waiting: Ranked[] = [];
  for (const r of rankPeople(people, entries, today)) {
    const own = idx.get(r.person.id) ?? [];
    if (own.some((e) => e.day >= ws && e.day <= today && countsFor(r.person, e.type))) reached.push(r.person);
    else if (r.status.dueDay <= we) waiting.push(r);
  }
  return { reached, waiting };
}

const ORDINAL: Record<number, string> = { 10: 'العاشرة', 25: 'الخامسة والعشرون', 50: 'الخمسون', 100: 'المئة' };

/** A person's n-th contact worth a word («هذه صلتك العاشرة له»): the 10th, 25th, 50th, 100th, then every hundredth. */
export const milestoneOf = (n: number): string | null => ORDINAL[n] ?? (n > 100 && n % 100 === 0 ? `رقم ${toArabicDigits(n)}` : null);

/**
 * The ready messages for `p` on `now`: «دعاء لمريض» first for the sick, the
 * congratulations on their birthday or occasion, «تذكير يوم الجمعة» only on a
 * Friday (and early).
 */
export function templatesFor(p: Person, now: Date): MessageTemplate[] {
  const occasion = upcomingOccasions([p], dayKey(now.getTime()), 0).length > 0;
  const rank = (t: MessageTemplate) => (p.ill && t.id === 'sick' ? 0 : occasion && t.type === 'congrats' ? 1 : t.id === 'jumuah' ? 2 : 3);
  return MESSAGE_TEMPLATES.filter((t) => t.id !== 'jumuah' || now.getDay() === 5).sort((a, b) => rank(a) - rank(b));
}

// ── «الترتيب» ────────────────────────────────────────────────────────────────

export interface SilatPoints {
  points: number;
  lines: { label: string; points: number }[];
}

/**
 * A day's points for «الترتيب», by effort (CONTACT: a sick visit 10, a visit 8,
 * a call 4, a message 2, du'a 1…; «اجتماع عائلي» by relation, gatheringPoints). Each type counts once per person per day;
 * the first contact after a broken tie adds RECONCILE_POINTS. Capped at
 * SILAT_DAY_MAX.
 */
export function silatPointsOn(entries: readonly SilatEntry[], people: readonly Person[], key: string): SilatPoints {
  const live = new Map(people.filter(isLive).map((p) => [p.id, p]));
  const seen = new Set<string>();
  const per = new Map<ContactType, { n: number; pts: number }>();
  for (const e of entries) {
    if (e.day !== key || !live.has(e.personId) || !CONTACT[e.type]) continue;
    const k = `${e.personId}|${e.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const row = per.get(e.type) ?? { n: 0, pts: 0 };
    row.n++;
    row.pts += pointsFor(e.type, live.get(e.personId)!.relation);
    per.set(e.type, row);
  }
  const lines = [...per.entries()]
    .map(([t, r]) => ({ label: r.n > 1 ? `${CONTACT[t].label} ×${toArabicDigits(r.n)}` : CONTACT[t].label, points: r.pts }))
    .sort((a, b) => b.points - a.points);
  let reconciled = 0;
  for (const p of live.values()) if (reconcileEntry(p, entries)?.day === key) reconciled++;
  if (reconciled) lines.push({ label: 'إصلاح قطيعة', points: reconciled * RECONCILE_POINTS });
  const raw = lines.reduce((n, l) => n + l.points, 0);
  if (raw > SILAT_DAY_MAX) lines.push({ label: 'سقف اليوم', points: SILAT_DAY_MAX - raw });
  return { points: Math.min(raw, SILAT_DAY_MAX), lines };
}

// ── reminders (planned here, armed by services/silatReminders.ts) ────────────

export const SILAT_LINK = '/#/silat';
export const personLink = (id: string): string => `/#/silat?p=${id}`;
const OCCASION_TIME = '09:00';

/** The most names one reminder or Home line carries. */
const MAX_NAMES = 3;

function namesLine(names: string[], max = MAX_NAMES): string {
  const head = names.slice(0, max).join('، ');
  const rest = names.length - max;
  return rest > 0 ? `${head} و${rest === 1 ? 'واحد' : toArabicDigits(rest)} غيرهم` : head;
}

/** A planned reminder; `meta` gives it «اتصل» / «واتساب» (silatNotifMeta). */
export type SilatNotif = PlannedNotif & { meta?: Record<string, string> };

/**
 * Everything that should be armed. Ids carry no date (stable-id rule):
 *  myzikr_silat_digest            daily «من تصلهم اليوم» (a one-shot on the next day someone is due when none is)
 *  myzikr_silat_p_{personId}      one-shot on that person's due day (or the next fire while late)
 *  myzikr_silat_o_{personId}_{x}  a birthday ('bd') or occasion, at 09:00 on the day
 * Each one about a person with a number carries the call buttons — the digest
 * for the first one it names.
 */
export function planSilatReminders(
  people: readonly Person[],
  entries: readonly SilatEntry[],
  prefs: SilatPrefs,
  now: number,
  gender?: Gender,
): SilatNotif[] {
  const out: SilatNotif[] = [];
  const today = dayKey(now);
  const base = { moduleId: 'silat', soundKey: 'default' as const };
  const nextFire = (time: string, fromDay: string): number => {
    const t = atTime(parseKey(fromDay), time).getTime();
    if (t > now) return t;
    const todayT = atTime(parseKey(today), time).getTime();
    return todayT > now ? todayT : atTime(parseKey(shiftKey(today, 1)), time).getTime();
  };
  const idx = byPerson(entries);
  const live = people.filter(trackable);

  if (prefs.digest && live.length) {
    const fire = nextFire(prefs.digestTime, today);
    const fireDay = dayKey(fire);
    const dueOn = (d: string) =>
      live
        .map((person) => ({ person, status: statusOf(person, idx.get(person.id) ?? [], d) }))
        .filter(isDueNow)
        .sort(compareRanked);
    const sick = live.filter((p) => needsVisit(p, idx.get(p.id) ?? [], fireDay)).map((p) => displayName(p, gender));
    let due = dueOn(fireDay);
    let at = fire;
    let repeat: PlannedNotif['repeat'] = 'daily';
    if (!due.length && !sick.length) {
      // Nobody due at the next fire: arm once for the first day someone is (the next sync re-plans).
      const first = live.map((p) => statusOf(p, idx.get(p.id) ?? [], fireDay).dueDay).sort()[0];
      at = atTime(parseKey(first), prefs.digestTime).getTime();
      due = dueOn(first);
      repeat = 'none';
    }
    const names = due.map((r) => displayName(r.person, gender));
    // MAX_NAMES names in all: those due first, the sick in whatever room is left.
    const room = MAX_NAMES - Math.min(MAX_NAMES, names.length);
    const sickLine = !sick.length
      ? ''
      : room
        ? `عيادة المريض: ${namesLine(sick, room)}`
        : sick.length === 1
          ? 'ومريضٌ ينتظر عيادتك'
          : `و${toArabicDigits(sick.length)} مرضى ينتظرون عيادتك`;
    const lines = [names.length ? `ينتظرون صلتك: ${namesLine(names)}` : '', sickLine].filter(Boolean).join(' · ');
    const meta = due[0] ? silatNotifMeta(due[0].person) : undefined;
    out.push({ ...base, id: 'myzikr_silat_digest', title: 'صِلْ رحمك اليوم', body: lines, at, repeat, deepLinkPath: SILAT_LINK, meta });
  }

  for (const p of live) {
    if (!p.remind) continue;
    const st = statusOf(p, idx.get(p.id) ?? [], today);
    const at = nextFire(p.remindTime || prefs.digestTime, st.dueDay);
    const late = diffDays(dayKey(at), st.dueDay);
    const name = displayName(p, gender);
    out.push({
      ...base,
      id: `myzikr_silat_p_${p.id}`,
      title: `صلة ${name}`,
      body: late > 0 ? `تأخّرت صلة ${name} ${daysAr(late)} — اتصالٌ قصير يكفي` : `اليوم موعد صلة ${name}`,
      at,
      repeat: 'none',
      deepLinkPath: personLink(p.id),
      meta: silatNotifMeta(p),
    });
  }

  if (prefs.occasions) {
    for (const u of upcomingOccasions(people, today, 366)) {
      const at = atTime(parseKey(u.day), OCCASION_TIME).getTime();
      if (at <= now) continue;
      const name = displayName(u.person, gender);
      out.push({
        ...base,
        id: `myzikr_silat_o_${u.id}`,
        title: u.kind === 'birthday' ? `يوم ميلاد ${name}` : u.label,
        body: withPronoun(u.kind === 'birthday' ? `فرصة طيبة لصلة ${name} والدعاء ل{ه}` : `${name} — فرصة لصلت{ه} اليوم`, isFemale(u.person, gender)),
        at,
        repeat: 'none',
        deepLinkPath: personLink(u.person.id),
        meta: silatNotifMeta(u.person),
      });
    }
  }
  return out;
}

// ── Home «يحتاج انتباهك» ─────────────────────────────────────────────────────

/** A subset of dayAttention's AttentionItem (structurally assignable to it): spread it into the list. */
export interface SilatAttention {
  id: string;
  level: 'closing' | 'suggest';
  icon: 'people';
  kicker: string;
  title: string;
  body: string;
  to: string;
  /** «لا تقترحها» mutes the whole section. */
  habit: 'silat';
  /** برّ الوالدين is an obligation; the rest of the ties, a sunnah-level deed here. */
  weight: 'fard' | 'sunnah';
  why: string;
}

/**
 * At most two items: a living parent late (or due, from 4 pm) — then the
 * others due today, a sick relative to visit, or an occasion today.
 */
export function silatAttention(people: readonly Person[], entries: readonly SilatEntry[], now: Date, gender?: Gender): SilatAttention[] {
  const today = dayKey(now);
  const idx = byPerson(entries);
  const ranked = rankPeople(people, entries, today).filter(isDueNow);
  const out: SilatAttention[] = [];

  const parent = ranked.find((r) => categoryOf(r.person) === 'parents' && (r.status.state === 'late' || now.getHours() >= 16));
  if (parent) {
    const name = displayName(parent.person, gender);
    out.push({
      id: `silat.parent.${parent.person.id}`,
      level: 'closing',
      icon: 'people',
      habit: 'silat',
      weight: 'fard',
      why: withPronoun(`لأنك جعلت صلت{ه} كل ${daysAr(parent.person.everyDays)}`, isFemale(parent.person, gender)),
      kicker: 'بِرّ الوالدين',
      title: parent.status.state === 'late' ? `لم تصل ${name} منذ ${daysAr(diffDays(today, parent.status.lastDay ?? dayKey(parent.person.createdAt)))}` : `صِل ${name} قبل أن ينقضي اليوم`,
      body: '«رَغِمَ أنفُ… مَن أدرك أبويه عند الكِبَر فلم يدخل الجنة» — رواه مسلم',
      to: personLink(parent.person.id),
    });
  }

  const others = ranked.filter((r) => r !== parent);
  const sick = people.find((p) => trackable(p) && needsVisit(p, idx.get(p.id) ?? [], today));
  const occ = upcomingOccasions(people, today, 0)[0];
  if (others.length) {
    out.push({
      id: 'silat.due',
      level: 'suggest',
      icon: 'people',
      habit: 'silat',
      weight: 'sunnah',
      why: 'حان موعد صلتهم بحسب ما اخترت لكلٍّ منهم',
      kicker: 'صلة الرحم',
      title:
        others.length === 1
          ? `${displayName(others[0].person, gender)} ${isFemale(others[0].person, gender) ? 'تنتظر' : 'ينتظر'} صلتك`
          : `${toArabicDigits(others.length)} ينتظرون صلتك اليوم`,
      body: others.length === 1 ? 'اتصالٌ قصير أو رسالة دافئة تكفي' : namesLine(others.map((r) => displayName(r.person, gender))),
      to: SILAT_LINK,
    });
  } else if (sick) {
    out.push({
      id: `silat.ill.${sick.id}`,
      level: 'suggest',
      icon: 'people',
      habit: 'silat',
      weight: 'sunnah',
      why: withPronoun('لأنك علّمت{ه} «مريضاً» ولم تعد{ه} في الأيام الثلاثة الأخيرة', isFemale(sick, gender)),
      kicker: 'عيادة المريض',
      title: `عُد ${displayName(sick, gender)}`,
      body: '«إنّ المسلمَ إذا عاد أخاه المسلمَ لم يزل في خُرْفةِ الجنة حتى يرجع» — رواه مسلم',
      to: personLink(sick.id),
    });
  } else if (occ) {
    out.push({
      id: `silat.occ.${occ.id}`,
      level: 'suggest',
      icon: 'people',
      habit: 'silat',
      weight: 'sunnah',
      why: withPronoun('مناسبة سجّلتها ل{ه}', isFemale(occ.person, gender)),
      kicker: 'مناسبة اليوم',
      title: occ.kind === 'birthday' ? `يوم ميلاد ${displayName(occ.person, gender)}` : `${occ.label} — ${displayName(occ.person, gender)}`,
      body: 'فرصة طيبة للصلة والدعاء',
      to: personLink(occ.person.id),
    });
  }
  return out.slice(0, 2);
}

// ── badges ───────────────────────────────────────────────────────────────────

export interface SilatBadgeMetrics {
  /** Contacts (not du'a) with kin and parents, all time. */
  kinContacts: number;
  /** Visits, and visits to the sick. */
  visits: number;
  /** Days with du'a logged for a parent. */
  parentDuaDays: number;
  /** Repairs that reached a first contact. */
  reconciled: number;
  coverageWeeks: number;
  /** Distinct neighbours reached at least once. */
  neighborsReached: number;
}

export function silatBadgeMetrics(people: readonly Person[], entries: readonly SilatEntry[], today: string): SilatBadgeMetrics {
  const live = new Map(people.filter(isLive).map((p) => [p.id, p]));
  let kinContacts = 0;
  let visits = 0;
  const duaDays = new Set<string>();
  const neighbors = new Set<string>();
  for (const e of entries) {
    const p = live.get(e.personId);
    if (!p) continue;
    const cat = categoryOf(p);
    if ((cat === 'kin' || cat === 'parents') && e.type !== 'dua' && countsFor(p, e.type)) kinContacts++;
    if (e.type === 'visit' || e.type === 'iyada') visits++;
    if (cat === 'parents' && e.type === 'dua') duaDays.add(e.day);
    if (cat === 'neighbors' && countsFor(p, e.type)) neighbors.add(p.id);
  }
  return {
    kinContacts,
    visits,
    parentDuaDays: duaDays.size,
    reconciled: [...live.values()].filter((p) => reconcileEntry(p, entries)).length,
    coverageWeeks: coverageStreak(people, entries, today),
    neighborsReached: neighbors.size,
  };
}
