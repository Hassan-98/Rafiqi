import type { PrayerName } from '@/types';

/**
 * «وضع الصلاة» — pure planning (no stores, no Capacitor; checked by
 * scripts/prayerMode.test.ts). Turns a run of days' prayer times + the user's
 * settings into the silence windows the native side arms.
 */

export type PrayerModeStart = 'iqama' | 'adhan' | 'after';
/** silent → INTERRUPTION_FILTER_ALARMS (calls + notifications muted, the alarm clock still rings); priority → PRIORITY. */
export type PrayerModeSilence = 'silent' | 'priority';

export interface PrayerModeConfig {
  enabled: boolean;
  /** Where each window starts: at the iqama (adhan + that prayer's iqama minutes), the adhan, or `afterMinutes` after it. */
  start: PrayerModeStart;
  afterMinutes: number;
  prayers: Record<PrayerName, { on: boolean; minutes: number }>;
  /** Men, Friday: replaces Dhuhr — starts `before` minutes BEFORE the Dhuhr adhan (khutbah) and lasts `minutes`. */
  jumuah: { on: boolean; before: number; minutes: number };
  silence: PrayerModeSilence;
  /** After the window: «هل صلّيت …؟» with «صلّيت» / «في المسجد». */
  ask: boolean;
}

export const PRAYER_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

export const DEFAULT_PRAYER_MODE: PrayerModeConfig = {
  enabled: false,
  start: 'iqama',
  afterMinutes: 10,
  prayers: {
    fajr: { on: true, minutes: 20 },
    dhuhr: { on: true, minutes: 20 },
    asr: { on: true, minutes: 20 },
    maghrib: { on: true, minutes: 15 },
    isha: { on: true, minutes: 20 },
  },
  jumuah: { on: true, before: 10, minutes: 60 },
  silence: 'silent',
  ask: true,
};

export interface DayTimes {
  /** 'yyyy-MM-dd' (local). */
  dateKey: string;
  friday: boolean;
  /** Adhan times, epoch ms. */
  times: Record<PrayerName, number>;
}

export interface WindowPrayer {
  prayer: PrayerName;
  dateKey: string;
  /** «الظهر» or «الجمعة». */
  name: string;
}

export interface PrayerWindow {
  start: number;
  end: number;
  /** «الظهر», «الجمعة», or «المغرب والعشاء» after a merge. */
  label: string;
  prayers: WindowPrayer[];
}

const MIN = 60_000;

/** One day's windows, in prayer order (not merged). */
export function dayWindows(day: DayTimes, cfg: PrayerModeConfig, iqamaMin: (p: PrayerName) => number, male: boolean): PrayerWindow[] {
  const out: PrayerWindow[] = [];
  for (const p of PRAYER_ORDER) {
    const adhan = day.times[p];
    if (!Number.isFinite(adhan)) continue;
    if (p === 'dhuhr' && day.friday && male) {
      const j = cfg.jumuah;
      if (!j.on || !(j.minutes > 0)) continue;
      const start = adhan - Math.max(0, j.before) * MIN;
      out.push({ start, end: start + j.minutes * MIN, label: 'الجمعة', prayers: [{ prayer: p, dateKey: day.dateKey, name: 'الجمعة' }] });
      continue;
    }
    const c = cfg.prayers[p];
    if (!c?.on || !(c.minutes > 0)) continue;
    const offset = cfg.start === 'iqama' ? iqamaMin(p) : cfg.start === 'after' ? cfg.afterMinutes : 0;
    const start = adhan + Math.max(0, offset) * MIN;
    out.push({ start, end: start + c.minutes * MIN, label: PRAYER_AR[p], prayers: [{ prayer: p, dateKey: day.dateKey, name: PRAYER_AR[p] }] });
  }
  return out;
}

/** Sort + merge overlapping (or touching) windows, so a START never lands inside another window. */
export function mergeWindows(ws: PrayerWindow[]): PrayerWindow[] {
  const sorted = [...ws].sort((a, b) => a.start - b.start);
  const out: PrayerWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
      last.prayers = [...last.prayers, ...w.prayers];
      last.label = last.prayers.map((x) => x.name).join(' و');
    } else {
      out.push({ ...w, prayers: [...w.prayers] });
    }
  }
  return out;
}

/** Every window of these days, merged; those already over at `now` dropped. */
export function planWindows(
  days: DayTimes[],
  cfg: PrayerModeConfig,
  iqamaMin: (p: PrayerName) => number,
  male: boolean,
  now: number,
): PrayerWindow[] {
  if (!cfg.enabled) return [];
  return mergeWindows(days.flatMap((d) => dayWindows(d, cfg, iqamaMin, male))).filter((w) => w.end > now);
}
