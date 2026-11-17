import { useEffect, useState } from 'react';
import { hijriService } from '@/services/HijriService';
import { useRamadanStore } from '@/store/ramadanStore';
import { usePrayerTimes } from './usePrayerTimes';

export interface RamadanState {
  isActive: boolean;
  currentHijriDay: number; // 1..30 (only meaningful when isActive)
  hijriYear: number | null;
  suhoorEndsAt: Date | null; // = Fajr time
  iftarAt: Date | null; // = Maghrib time
  taraweehNights: number[];
  juzCompletedTotal: number;
}

/**
 * Detects whether the device is currently inside Hijri month 9 (Ramadan) by
 * asking AlAdhan. Exposes suhoor (Fajr) and iftar (Maghrib) times when so.
 */
export function useRamadanState(): RamadanState {
  const { times } = usePrayerTimes();
  const ramadanStore = useRamadanStore();
  const [hijriDay, setHijriDay] = useState<number>(0);
  const [hijriYear, setHijriYear] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hijriService
      .gregorianToHijri(new Date())
      .then((h) => {
        if (cancelled) return;
        setHijriDay(h.hijriDay);
        setHijriYear(h.hijriYear);
        const isRamadan = h.hijriMonth === 9;
        setActive(isRamadan);
        if (isRamadan) ramadanStore.setYear(h.hijriYear);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const juzTotal = Object.values(ramadanStore.juzCompletedByDate).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return {
    isActive: active,
    currentHijriDay: hijriDay,
    hijriYear,
    suhoorEndsAt: times?.fajr ?? null,
    iftarAt: times?.maghrib ?? null,
    taraweehNights: ramadanStore.taraweehNights,
    juzCompletedTotal: juzTotal,
  };
}
