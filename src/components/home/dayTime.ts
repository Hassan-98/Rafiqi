/**
 * Time-of-day model for the Home tab. Pure (no hooks) so the ordering rules
 * are easy to reason about and to check.
 *
 *  night    Isha → Fajr     قيام الليل leads, sleep adhkar
 *  morning  Fajr → Dhuhr    morning adhkar leads, then صلاة الضحى
 *  midday   Dhuhr → Asr     Quran leads
 *  evening  Asr → Isha      evening adhkar leads
 */
export type DaySlot = 'night' | 'morning' | 'midday' | 'evening';
export type HomeFeature = 'adhkar' | 'duha' | 'qiyam' | 'awrad' | 'quran';

interface SlotTimes {
  fajr: Date;
  dhuhr: Date;
  asr: Date;
  isha: Date;
}

export function daySlot(now: Date, times: SlotTimes | null): DaySlot {
  if (!times) {
    const h = now.getHours();
    if (h < 4 || h >= 20) return 'night';
    if (h < 12) return 'morning';
    if (h < 15) return 'midday';
    return 'evening';
  }
  const t = now.getTime();
  if (t < times.fajr.getTime() || t >= times.isha.getTime()) return 'night';
  if (t < times.dhuhr.getTime()) return 'morning';
  if (t < times.asr.getTime()) return 'midday';
  return 'evening';
}

const SLOT_ORDER: Record<DaySlot, HomeFeature[]> = {
  night: ['qiyam', 'adhkar', 'quran', 'awrad', 'duha'],
  morning: ['adhkar', 'duha', 'quran', 'awrad', 'qiyam'],
  midday: ['quran', 'awrad', 'adhkar', 'qiyam', 'duha'],
  evening: ['adhkar', 'quran', 'awrad', 'qiyam', 'duha'],
};

/**
 * The slot's preferred order with finished features sunk to the end, so the
 * first entry — the one Home spotlights — is always something still to do.
 */
export function orderFeatures(slot: DaySlot, done: Record<HomeFeature, boolean>): HomeFeature[] {
  const order = SLOT_ORDER[slot];
  return [...order.filter((f) => !done[f]), ...order.filter((f) => done[f])];
}

