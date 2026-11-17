import { addDays, format, parseISO } from 'date-fns';
import { computeStreakFromActiveDates } from '@/services/statsService';

/** Days a broken streak stays recoverable (see services/streakRescue). */
export const RESCUE_WINDOW = 7;

/** Today's amount needed after `step` missed days: +50% per day. */
export const rescueMultiplier = (step: number) => 1 + step / 2;

const shift = (key: string, days: number) => format(addDays(parseISO(key), days), 'yyyy-MM-dd');

/** The run of missed days right behind `today` (oldest first) and the chain it
 *  broke; null when nothing broke, the chain was trivial, or the week is up. */
export function findBreak(active: Set<string>, frozen: Set<string>, today: string) {
  const missed: string[] = [];
  for (let back = 1; back <= RESCUE_WINDOW + 1; back++) {
    const k = shift(today, -back);
    if (active.has(k) || frozen.has(k)) {
      if (!missed.length) return null;
      const lost = computeStreakFromActiveDates([...active], parseISO(`${k}T12:00:00`), frozen).current;
      return lost >= 2 ? { missed: missed.reverse(), lost, chainEnd: k } : null;
    }
    missed.push(k);
  }
  return null;
}

/** The usual daily amount: mean over the chain's last (up to) 7 active days. */
export function usualAmount(amount: (k: string) => number, active: Set<string>, chainEnd: string): number {
  const vals: number[] = [];
  for (let back = 0; back < 60 && vals.length < 7; back++) {
    const k = shift(chainEnd, -back);
    if (active.has(k)) vals.push(amount(k));
  }
  const counted = vals.filter((v) => v > 0);
  return counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : 0;
}
