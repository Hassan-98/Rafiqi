/**
 * Fatigue control for «رفيقك اليومي» — PURE (scripts/engagement.test.ts).
 *
 * Every companion nudge that gets armed is remembered on this device. Once its
 * time has passed it was delivered; a little later the data answers whether the
 * user ACTED: was the deed it asked for logged (adhkar said, wird read, الضحى
 * prayed…)? No click tracking — the stores and the activity log tell.
 *
 *  - Acted → the kind is kept as it is.
 *  - Ignored three times in a row → it eases off exponentially: every 2nd day,
 *    then every 4th, 8th, 16th — and yields its slot to others on the day it
 *    does come. One act, or «إعادته» in settings, restores it.
 *  - Fard prayer checks («هل صلّيت؟», «آخر الوقت») carry no topic: never eased.
 *  - A nudge delivered today is not sent again today (re-plans used to slide it
 *    to «half an hour from now» each time the app was opened).
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { InsightsSnapshot } from '@/services/insightsEngine';
import type { PrayerName } from '@/types';

export interface ArmedNudge {
  /** Dedupe key: the id without its day suffix (+ «:prayer» for post-prayer adhkar). */
  slot: string;
  /** Eased-off key: a kind, «suggest.<habit>» or «x.<source>.<key>». Absent = never eased. */
  topic?: string;
  /** Epoch ms it is (was) due. */
  at: number;
  /** yyyy-MM-dd of `at`. */
  day: string;
  /** Qur'an read that day before it rang — reading after it = acted. */
  base?: number;
  /** Its outcome was recorded. */
  settled?: boolean;
}

export interface Outcome {
  day: string;
  acted: boolean;
}

export interface Fatigue {
  /** 0 = as usual; n = once every 2^n days. */
  level: number;
  /** The last day one was delivered. */
  last?: string;
}

export const IGNORES_BEFORE_EASING = 3;
export const MAX_EASING = 4;
/** Outcomes kept per topic, and how long they are remembered. */
const KEEP = 12;
const FORGET_DAYS = 60;
const MIN = 60_000;
const H = 60 * MIN;
const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const dk = (d: Date) => format(d, 'yyyy-MM-dd');

/** How long after the nudge a deed still counts as its answer. */
const WINDOW: Record<string, number> = { after: 1.5 * H, quran: 4 * H, khatma: 4 * H, brief: 4 * H, wrapup: 4 * H };
const windowOf = (topic: string) => WINDOW[topic] ?? 3 * H;

/** The Qur'an read on a day (the base of the wird / khatma nudges). */
export const quranOn = (snap: InsightsSnapshot, day: string) => snap.wirdHistory?.[day]?.achieved ?? 0;

/**
 * Did the user do what this delivered nudge asked? true / false, or null when
 * it can't be told (yet, or ever — such a topic is simply not eased).
 */
export function nudgeActed(a: ArmedNudge, snap: InsightsSnapshot, now: Date, plugin?: (a: ArmedNudge) => boolean | null): boolean | null {
  const topic = a.topic;
  if (!topic) return null;
  const from = a.at - 2 * MIN;
  const to = a.at + windowOf(topic);
  const event = (f: (e: { domain: string; refId?: string }) => boolean) => (snap.activity ?? []).some((e) => e.ts > from && e.ts <= to && f(e));
  const day = snap.prayerLog?.[a.day];
  let acted: boolean | null;
  switch (topic) {
    case 'morning':
    case 'evening':
    case 'sleep':
      acted = event((e) => e.domain === 'dhikr' && e.refId === topic);
      break;
    case 'suggest.sleep':
      acted = event((e) => e.domain === 'dhikr' && e.refId === 'sleep');
      break;
    case 'after': {
      const p = a.slot.split(':')[1] as PrayerName | undefined;
      acted = event((e) => e.domain === 'dhikr' && e.refId === 'postPrayer') || (!!p && !!day?.[p]?.adhkar);
      break;
    }
    case 'awrad':
      acted = event((e) => e.domain === 'awrad');
      break;
    case 'quran':
    case 'khatma':
      acted = quranOn(snap, a.day) > (a.base ?? 0);
      break;
    case 'duha':
    case 'suggest.duha':
      acted = !!snap.duha?.[a.day];
      break;
    case 'suggest.mosque':
      acted = PRAYERS.some((p) => day?.[p]?.mosque);
      break;
    case 'suggest.sadaqah':
      acted = (snap.sadaqah ?? []).some((s) => s.date === a.day);
      break;
    case 'brief':
    case 'wrapup':
      acted = event(() => true);
      break;
    default:
      if (!topic.startsWith('x.') || !plugin) return null;
      return plugin(a);
  }
  if (acted) return true;
  return now.getTime() >= to ? false : null;
}

/**
 * Record the outcome of every delivered nudge that can now be told; forget
 * nudges older than yesterday (today's stay: they block a second send).
 */
export function settle(
  armed: Readonly<Record<string, ArmedNudge>>,
  snap: InsightsSnapshot,
  now: Date,
  plugin?: (a: ArmedNudge) => boolean | null,
): { armed: Record<string, ArmedNudge>; outcomes: { topic: string; outcome: Outcome }[] } {
  const keepFrom = dk(addDays(now, -1));
  const next: Record<string, ArmedNudge> = {};
  const outcomes: { topic: string; outcome: Outcome }[] = [];
  for (const [k, a] of Object.entries(armed)) {
    if (a.day < keepFrom) continue;
    if (a.settled || !a.topic || a.at > now.getTime()) {
      next[k] = a;
      continue;
    }
    const r = nudgeActed(a, snap, now, plugin);
    if (r == null) next[k] = a;
    else {
      outcomes.push({ topic: a.topic, outcome: { day: a.day, acted: r } });
      next[k] = { ...a, settled: true };
    }
  }
  return { armed: next, outcomes };
}

/** What the planner needs of a nudge to remember it. */
export interface PlannedLike {
  id: string;
  at: Date;
  topic?: string;
  dedupe?: string;
}

/**
 * The ledger after arming `plan`: entries still pending that are no longer
 * planned were cancelled (dropped); delivered ones stay. Only nudges with a
 * `dedupe` key (the companion's) are remembered.
 */
export function arm(prev: Readonly<Record<string, ArmedNudge>>, plan: readonly PlannedLike[], now: Date, snap: InsightsSnapshot): Record<string, ArmedNudge> {
  const t = now.getTime();
  const next: Record<string, ArmedNudge> = {};
  for (const [k, a] of Object.entries(prev)) if (a.at <= t) next[k] = a;
  for (const n of plan) {
    if (!n.dedupe) continue;
    const day = dk(n.at);
    const key = `${n.dedupe}|${day}`;
    if (next[key]) continue;
    next[key] = {
      slot: n.dedupe,
      ...(n.topic ? { topic: n.topic } : {}),
      at: n.at.getTime(),
      day,
      ...(n.topic === 'quran' || n.topic === 'khatma' ? { base: quranOn(snap, day) } : {}),
    };
  }
  return next;
}

/** Dedupe keys of the nudges already delivered today. */
export function sentToday(armed: Readonly<Record<string, ArmedNudge>>, now: Date): string[] {
  const today = dk(now);
  return Object.values(armed)
    .filter((a) => a.day === today && a.at <= now.getTime())
    .map((a) => a.slot);
}

/** Append outcomes (newest last), keeping the last few of each topic and forgetting old ones. */
export function addOutcomes(prev: Readonly<Record<string, Outcome[]>>, add: readonly { topic: string; outcome: Outcome }[], now: Date): Record<string, Outcome[]> {
  const from = dk(addDays(now, -FORGET_DAYS));
  const next: Record<string, Outcome[]> = {};
  for (const [t, list] of Object.entries(prev)) next[t] = list.filter((o) => o.day >= from);
  for (const { topic, outcome } of add) next[topic] = [...(next[topic] ?? []), outcome].slice(-KEEP);
  for (const t of Object.keys(next)) if (!next[t].length) delete next[t];
  return next;
}

/** Easing level from the trailing run of ignored nudges. */
export function easing(list: readonly Outcome[] | undefined): number {
  let ignored = 0;
  for (let i = (list?.length ?? 0) - 1; i >= 0 && !list![i].acted; i--) ignored++;
  return ignored < IGNORES_BEFORE_EASING ? 0 : Math.min(MAX_EASING, ignored - IGNORES_BEFORE_EASING + 1);
}

/** topic → easing level and the last day one was delivered (outcomes or the ledger). */
export function fatigueOf(outcomes: Readonly<Record<string, Outcome[]>>, armed: Readonly<Record<string, ArmedNudge>>, now: Date): Record<string, Fatigue> {
  const out: Record<string, Fatigue> = {};
  for (const [topic, list] of Object.entries(outcomes)) {
    const level = easing(list);
    if (!level) continue;
    let last = list[list.length - 1]?.day;
    for (const a of Object.values(armed)) if (a.topic === topic && a.at <= now.getTime() && (!last || a.day > last)) last = a.day;
    out[topic] = { level, last };
  }
  return out;
}

/** May an eased topic come on `day`? (every 2^level days since the last one). */
export function easedAllows(f: Fatigue | undefined, day: string): boolean {
  if (!f || f.level <= 0 || !f.last) return true;
  return differenceInCalendarDays(new Date(`${day}T12:00:00`), new Date(`${f.last}T12:00:00`)) >= 2 ** f.level;
}

const LABEL: Record<string, string> = {
  morning: 'أذكار الصباح',
  evening: 'أذكار المساء',
  sleep: 'أذكار النوم',
  after: 'أذكار ما بعد الصلاة',
  awrad: 'الأوراد',
  quran: 'وِرد القرآن',
  khatma: 'الختمة المتوقفة',
  brief: 'موجز الصباح',
  wrapup: 'ختام اليوم',
  duha: 'الضحى',
  'suggest.duha': 'الضحى',
  'suggest.sleep': 'أذكار النوم',
  'suggest.mosque': 'الصلاة في المسجد',
  'suggest.sadaqah': 'الصدقة',
};

/** «خفّفتُ تذكير <label>». */
export const topicLabel = (topic: string, labels: Readonly<Record<string, string>> = {}) => labels[topic] ?? LABEL[topic] ?? topic;
