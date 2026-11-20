import { useEffect, useMemo, useState } from 'react';
import { parseISO } from 'date-fns';
import { useSettingsStore } from '@/store/settingsStore';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { qiyamNightKey } from '@/store/qiyamStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { Coordinates as AppCoordinates, PrayerMethodId, MadhabSchool } from '@/types';

export interface NightWindow {
  maghrib: Date;
  isha: Date;
  /** Start of the last third of the night (Maghrib → Fajr). */
  lastThird: Date;
  fajr: Date;
}

export type NightPhase = 'before' | 'early' | 'lastThird' | 'after';

/** Maghrib/Isha of the night's evening → Fajr of the next morning. */
export function computeNightWindow(
  coords: AppCoordinates | null | undefined,
  method: PrayerMethodId,
  school: MadhabSchool,
  nightKey: string,
): NightWindow | null {
  if (!coords) return null;
  try {
    const evening = parseISO(`${nightKey}T12:00:00`);
    const morning = new Date(evening.getTime() + 24 * 3600 * 1000);
    const eve = prayerTimeService.getTimes(coords, evening, method, school);
    const fajr = prayerTimeService.getTimes(coords, morning, method, school).fajr;
    const lastThird = new Date(fajr.getTime() - (fajr.getTime() - eve.maghrib.getTime()) / 3);
    return { maghrib: eve.maghrib, isha: eve.isha, lastThird, fajr };
  } catch {
    return null;
  }
}

export function useNightWindow(nightKey: string): NightWindow | null {
  const coords = useSettingsStore((s) => s.coords);
  const method = useSettingsStore((s) => s.prayerMethod);
  const school = useSettingsStore((s) => s.madhabSchool);
  return useMemo(() => computeNightWindow(coords, method, school, nightKey), [coords, method, school, nightKey]);
}

export function nightPhase(w: NightWindow | null, now: number): NightPhase {
  if (!w) return 'early';
  if (now < w.maghrib.getTime()) return 'before';
  if (now < w.lastThird.getTime()) return 'early';
  if (now < w.fajr.getTime()) return 'lastThird';
  return 'after';
}

/** True between Isha and Fajr — the «عباداتي» tab opens on قيام then. */
export function isQiyamTime(now = new Date()): boolean {
  const s = useSettingsStore.getState();
  const w = computeNightWindow(s.coords, s.prayerMethod, s.madhabSchool, qiyamNightKey(now));
  if (!w) return now.getHours() >= 20 || now.getHours() < 5;
  return now >= w.isha && now < w.fajr;
}

/** Re-render every `ms` so countdowns stay live. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "٣ س ٢٠ د" / "٤٥ د". */
export function durationAr(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${toArabicDigits(m)} د`;
  return m === 0 ? `${toArabicDigits(h)} س` : `${toArabicDigits(h)} س ${toArabicDigits(m)} د`;
}

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Arabic reckoning: the evening of Thursday is «ليلة الجمعة». */
export function nightName(nightKey: string): string {
  const d = parseISO(`${nightKey}T12:00:00`);
  return `ليلة ${DAY_NAMES[(d.getDay() + 1) % 7]}`;
}
