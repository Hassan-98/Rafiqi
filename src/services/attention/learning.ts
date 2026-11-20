/**
 * How the companion learns WHEN — PURE (scripts/learning.test.ts).
 *
 *  usualMinute     a habit's usual minute: the median of each day's FIRST event
 *                  over the last three weeks (≥3 days).
 *  expectedMinute  the same, read for ONE day: the weekday's own rhythm when it
 *                  has one (Friday mornings run late), else the recent minute
 *                  when the habit has drifted, else the usual one.
 *  weakWeekdays    weekdays on which a prayer the user logs is usually missed
 *                  («العصر يفوته أيام الثلاثاء») — the check comes earlier then.
 */
import { addDays, format } from 'date-fns';
import type { SnapshotEvent, SnapshotPrayerEntry } from '@/services/insightsEngine';
import type { PrayerName } from '@/types';

const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const weekdayOf = (key: string) => new Date(`${key}T12:00:00`).getDay();
/** The upper median (the companion's historical choice). */
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** dateKey → minute of that day's first matching event, over the `window` days before today. */
function firstMinutes(events: readonly SnapshotEvent[], match: (e: SnapshotEvent) => boolean, now: Date, night: boolean, window: number): Map<string, number> {
  const from = dk(addDays(now, -window));
  const today = dk(now);
  const first = new Map<string, number>();
  for (const e of events) {
    if (!match(e) || e.dateKey < from || e.dateKey >= today) continue;
    const d = new Date(e.ts);
    let m = d.getHours() * 60 + d.getMinutes();
    // Sleep adhkar at 00:30 belong to the evening before.
    if (night && m < 12 * 60) m += 24 * 60;
    const cur = first.get(e.dateKey);
    if (cur === undefined || m < cur) first.set(e.dateKey, m);
  }
  return first;
}

/**
 * The user's usual minute of the day for events matching `match` — the median
 * of each day's FIRST such event over the last `window` days (≥3 days needed).
 * `night`: minutes after midnight count as late evening (sleep adhkar at 00:30).
 */
export function usualMinute(events: readonly SnapshotEvent[], match: (e: SnapshotEvent) => boolean, now: Date, night = false, window = 21): number | null {
  const xs = [...firstMinutes(events, match, now, night, window).values()];
  return xs.length < 3 ? null : median(xs);
}

export type MinuteBasis = 'weekday' | 'drift' | 'usual';

/** A weekday this far from the usual minute has a rhythm of its own. */
export const WEEKDAY_GAP = 30;
/** The last week this far from the two before it: the habit has moved. */
export const DRIFT_GAP = 20;

/**
 * The minute to expect on `day`:
 *  - weekday: ≥3 of the last eight such weekdays, ≥30 min off the usual;
 *  - drift:   the last 7 days (≥3) moved ≥20 min from the 14 before (≥3);
 *  - usual:   the three-week median.
 * Null until the habit has three days in three weeks.
 */
export function expectedMinute(
  events: readonly SnapshotEvent[],
  match: (e: SnapshotEvent) => boolean,
  now: Date,
  day: Date,
  night = false,
): { minute: number; basis: MinuteBasis } | null {
  const firsts = firstMinutes(events, match, now, night, 56);
  const since = (n: number) => dk(addDays(now, -n));
  const pick = (from: string, to = dk(now)) => [...firsts].filter(([k]) => k >= from && k < to).map(([, m]) => m);
  const recent3w = pick(since(21));
  if (recent3w.length < 3) return null;
  const usual = median(recent3w);

  const wd = [...firsts].filter(([k]) => weekdayOf(k) === day.getDay()).map(([, m]) => m);
  if (wd.length >= 3) {
    const m = median(wd);
    if (Math.abs(m - usual) >= WEEKDAY_GAP) return { minute: m, basis: 'weekday' };
  }
  const lastWeek = pick(since(7));
  const before = pick(since(21), since(7));
  if (lastWeek.length >= 3 && before.length >= 3) {
    const m = median(lastWeek);
    if (Math.abs(m - median(before)) >= DRIFT_GAP) return { minute: m, basis: 'drift' };
  }
  return { minute: usual, basis: 'usual' };
}

/**
 * Weekdays on which `p` is usually missed: over the last eight weeks, on days
 * the user logged at least one prayer (so a day off the app doesn't count),
 * that weekday misses it at least half the time (≥3 such days) while the other
 * weekdays miss it at most a fifth of the time — a pattern, not a general lapse.
 */
export function weakWeekdays(
  log: Record<string, Partial<Record<PrayerName, SnapshotPrayerEntry>> | undefined>,
  excused: Record<string, true | undefined>,
  now: Date,
  p: PrayerName,
): Set<number> {
  const seen = Array(7).fill(0);
  const missed = Array(7).fill(0);
  for (let i = 1; i <= 56; i++) {
    const k = dk(addDays(now, -i));
    const day = log[k];
    if (excused[k] || !day || !Object.values(day).some((e) => e?.fard)) continue;
    const w = weekdayOf(k);
    seen[w]++;
    if (!day[p]?.fard) missed[w]++;
  }
  const allSeen = seen.reduce((a, b) => a + b, 0);
  const allMissed = missed.reduce((a, b) => a + b, 0);
  const out = new Set<number>();
  for (let w = 0; w < 7; w++) {
    if (seen[w] < 3 || missed[w] / seen[w] < 0.5) continue;
    const otherSeen = allSeen - seen[w];
    if (otherSeen > 0 && (allMissed - missed[w]) / otherSeen <= 0.2) out.add(w);
  }
  return out;
}
