import { useState, useEffect, useRef, useCallback } from 'react';
import { format, differenceInSeconds, startOfDay, addDays } from 'date-fns';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { useSettingsStore } from '@/store/settingsStore';
import type { PrayerTimesResult, PrayerName } from '@/types';

export interface NextPrayer {
  name: PrayerName;
  time: Date;
  countdown: string; // "HH:MM:SS"
}

export interface UsePrayerTimesResult {
  times: PrayerTimesResult | null;
  nextPrayer: NextPrayer | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function usePrayerTimes(): UsePrayerTimesResult {
  const coords = useSettingsStore((s) => s.coords);
  const prayerMethod = useSettingsStore((s) => s.prayerMethod);
  const madhabSchool = useSettingsStore((s) => s.madhabSchool);

  const [times, setTimes] = useState<PrayerTimesResult | null>(null);
  const [nextPrayer, setNextPrayer] = useState<NextPrayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTimes = useCallback((targetCoords = coords) => {
    if (!targetCoords) return;
    setLoading(true);
    setError(null);

    try {
      const result = prayerTimeService.getTimes(targetCoords, new Date(), prayerMethod, madhabSchool);
      setTimes(result);
    } catch (err) {
      setError('Failed to calculate prayer times.');
      console.error('[usePrayerTimes]', err);
    } finally {
      setLoading(false);
    }
  }, [coords, prayerMethod, madhabSchool]);

  // Compute and update next prayer + countdown every second
  useEffect(() => {
    if (!times) return;

    const PRAYERS: { name: PrayerName; time: Date }[] = [
      { name: 'fajr', time: times.fajr },
      { name: 'dhuhr', time: times.dhuhr },
      { name: 'asr', time: times.asr },
      { name: 'maghrib', time: times.maghrib },
      { name: 'isha', time: times.isha },
    ];

    // After Isha there is no "upcoming" prayer today — roll the countdown to
    // TOMORROW's Fajr instead of going dark until midnight (the home-screen
    // widget already does this; the in-app hero used to show a dead state).
    let tomorrowFajr: Date | null = null;
    if (coords) {
      try {
        tomorrowFajr = prayerTimeService.getTimes(
          coords,
          addDays(new Date(), 1),
          prayerMethod,
          madhabSchool,
        ).fajr;
      } catch {
        /* keep null — hero falls back to its generic state */
      }
    }

    const tick = () => {
      const now = new Date();
      const upcoming = PRAYERS.find((p) => p.time > now);
      const next =
        upcoming ?? (tomorrowFajr && tomorrowFajr > now ? { name: 'fajr' as const, time: tomorrowFajr } : null);

      if (next) {
        const diff = differenceInSeconds(next.time, now);
        setNextPrayer({
          name: next.name,
          time: next.time,
          countdown: formatCountdown(diff),
        });
      } else {
        setNextPrayer(null);
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [times, coords, prayerMethod, madhabSchool]);

  // Auto-refresh at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = startOfDay(addDays(now, 1));
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    refreshRef.current = setTimeout(() => {
      loadTimes();
    }, msUntilMidnight);

    return () => {
      if (refreshRef.current) clearTimeout(refreshRef.current);
    };
  }, [loadTimes]);

  // Initial load
  useEffect(() => {
    loadTimes();
  }, [loadTimes]);

  return {
    times,
    nextPrayer,
    loading,
    error,
    refresh: loadTimes,
  };
}

export function formatPrayerTime(date: Date | undefined): string {
  if (!date) return '--:--';
  // Arabic-Indic digits everywhere (design rule); idempotent under toArabicDigits.
  if (useSettingsStore.getState().timeFormat === '24h') return toArabicDigits(format(date, 'HH:mm'));
  // 12-hour with an Arabic meridiem (ص/م) instead of the English AM/PM.
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = ((h + 11) % 12) + 1;
  return toArabicDigits(`${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`);
}
