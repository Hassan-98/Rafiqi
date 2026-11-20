import { addDays, format } from 'date-fns';
import { blockedReason, type Blocked } from '@/services/qadaPlan';
import { fastReason, type FastReason } from '@/services/attention/occasions';
import { toHijri, type HijriDate } from '@/services/calendarEvents';

/**
 * «الصيام» in «عباداتي» — PURE (tested: scripts/fastingPlan.test.ts). A fast is
 * still logged where it always was (progressStore: module 'fasting' completed
 * on that day); this reads it: what a day is (Ramadan, an Eid, a sunnah fast
 * and why), the sunnah fasts ahead, and the counts.
 */

type Progress = Readonly<Record<string, { modules?: readonly { moduleId: string; completed: boolean }[] } | undefined>>;
const dk = (d: Date) => format(d, 'yyyy-MM-dd');

/** Every day with a logged fast. */
export function fastedKeys(p: Progress): Set<string> {
  const out = new Set<string>();
  for (const [k, day] of Object.entries(p)) if (day?.modules?.some((m) => m.moduleId === 'fasting' && m.completed)) out.add(k);
  return out;
}

export interface DayInfo {
  key: string;
  hijri: HijriDate;
  /** An Eid or a day of Tashreeq — never fasted ('ramadan' is reported as `ramadan`, not blocked). */
  blocked: Exclude<Blocked, 'ramadan'> | null;
  ramadan: boolean;
  /** Why it is a day to fast voluntarily (occasions.fastReason), or null. */
  reason: FastReason | null;
}

export function dayInfo(d: Date, offset = 0, sixDone = false): DayInfo {
  const b = blockedReason(d, offset);
  return {
    key: dk(d),
    hijri: toHijri(d, offset),
    blocked: b && b !== 'ramadan' ? b : null,
    ramadan: b === 'ramadan',
    reason: b ? null : fastReason(d, offset, sixDone),
  };
}

export const BLOCKED_AR: Record<Exclude<Blocked, 'ramadan'>, string> = {
  eidFitr: 'يوم عيد الفطر — لا يُصام',
  eidAdha: 'يوم عيد الأضحى — لا يُصام',
  tashreeq: 'من أيام التشريق — «أيام أكل وشرب وذكر لله»',
};

/** The six of Shawwal (from its 2nd) already fasted in `now`'s Hijri year. */
export function sixOfShawwalDone(fasted: ReadonlySet<string>, now: Date, offset = 0): boolean {
  const year = toHijri(now, offset).year;
  let n = 0;
  for (const k of fasted) {
    const h = toHijri(new Date(`${k}T12:00:00`), offset);
    if (h.year === year && h.month === 10 && h.day >= 2) n++;
  }
  return n >= 6;
}

export interface UpcomingFast {
  key: string;
  date: Date;
  /** 1 = tomorrow. */
  daysUntil: number;
  reason: FastReason;
}

/** The sunnah fasts of the next `horizon` days, from tomorrow. */
export function upcomingFasts(now: Date, offset = 0, sixDone = false, horizon = 14): UpcomingFast[] {
  const out: UpcomingFast[] = [];
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(base, i);
    const r = blockedReason(date, offset) ? null : fastReason(date, offset, sixDone);
    if (r) out.push({ key: dk(date), date, daysUntil: i, reason: r });
  }
  return out;
}

export interface FastingStats {
  /** This Gregorian month. */
  month: number;
  /** This Hijri year. */
  year: number;
  total: number;
  /** While Ramadan runs: its days fasted vs its days so far. */
  ramadan: { fasted: number; sofar: number } | null;
}

export function fastingStats(fasted: ReadonlySet<string>, now: Date, offset = 0): FastingStats {
  const monthPrefix = dk(now).slice(0, 7);
  const today = toHijri(now, offset);
  let month = 0;
  let year = 0;
  let ramadanFasted = 0;
  for (const k of fasted) {
    if (k > dk(now)) continue;
    if (k.startsWith(monthPrefix)) month++;
    const h = toHijri(new Date(`${k}T12:00:00`), offset);
    if (h.year === today.year) {
      year++;
      if (h.month === 9) ramadanFasted++;
    }
  }
  return {
    month,
    year,
    total: [...fasted].filter((k) => k <= dk(now)).length,
    ramadan: today.month === 9 ? { fasted: ramadanFasted, sofar: today.day } : null,
  };
}
