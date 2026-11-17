import {
  PrayerTimes,
  Coordinates,
  CalculationMethod,
  CalculationParameters,
  Madhab,
} from 'adhan';
import { format } from 'date-fns';
import type { Coordinates as AppCoordinates, PrayerMethodId, PrayerTimesResult, MadhabSchool } from '@/types';

const ALADHAN_BASE = import.meta.env.VITE_ALADHAN_API_BASE ?? 'https://api.aladhan.com/v1';

/**
 * Map app prayer method IDs to adhan-js CalculationParameters factories.
 * Methods not directly supported by adhan-js fall back to MWL.
 */
function getAdhanMethod(methodId: PrayerMethodId): CalculationParameters {
  switch (methodId) {
    case 1: return CalculationMethod.MuslimWorldLeague();
    case 2: return CalculationMethod.NorthAmerica();
    case 3: return CalculationMethod.Egyptian();
    case 4: return CalculationMethod.UmmAlQura();
    case 5: return CalculationMethod.Karachi();
    case 7: return CalculationMethod.Tehran();
    case 15: return CalculationMethod.Dubai();
    case 16: return CalculationMethod.MoonsightingCommittee();
    default: return CalculationMethod.MuslimWorldLeague();
  }
}

export interface IPrayerTimeService {
  getTimes(coords: AppCoordinates, date: Date, methodId: PrayerMethodId, school: MadhabSchool): PrayerTimesResult;
  getTimesFromApi(coords: AppCoordinates, date: Date, methodId: PrayerMethodId): Promise<PrayerTimesResult>;
}

export class PrayerTimeService implements IPrayerTimeService {
  /**
   * Calculate prayer times offline using adhan-js (primary method).
   */
  getTimes(
    coords: AppCoordinates,
    date: Date,
    methodId: PrayerMethodId,
    school: MadhabSchool,
  ): PrayerTimesResult {
    const adhanCoords = new Coordinates(coords.latitude, coords.longitude);
    const params = getAdhanMethod(methodId);
    params.madhab = school === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;

    const times = new PrayerTimes(adhanCoords, date, params);

    return {
      fajr: times.fajr,
      sunrise: times.sunrise,
      dhuhr: times.dhuhr,
      asr: times.asr,
      maghrib: times.maghrib,
      isha: times.isha,
      date,
    };
  }

  /**
   * Fetch prayer times from AlAdhan REST API (fallback/online enrichment).
   * Returns times as Date objects normalized to the local timezone.
   */
  async getTimesFromApi(
    coords: AppCoordinates,
    date: Date,
    methodId: PrayerMethodId,
  ): Promise<PrayerTimesResult> {
    const dateStr = format(date, 'dd-MM-yyyy');
    const url = `${ALADHAN_BASE}/timings/${dateStr}?latitude=${coords.latitude}&longitude=${coords.longitude}&method=${methodId}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AlAdhan API error: ${response.status}`);
    }

    const json = (await response.json()) as {
      data: {
        timings: Record<string, string>;
      };
    };

    const timings = json.data.timings;

    function parseTime(timeStr: string): Date {
      const [h, m] = timeStr.replace(' (GST)', '').replace(' (+03)', '').split(':').map(Number);
      const d = new Date(date);
      d.setHours(h, m, 0, 0);
      return d;
    }

    return {
      fajr: parseTime(timings['Fajr']),
      sunrise: parseTime(timings['Sunrise']),
      dhuhr: parseTime(timings['Dhuhr']),
      asr: parseTime(timings['Asr']),
      maghrib: parseTime(timings['Maghrib']),
      isha: parseTime(timings['Isha']),
      date,
    };
  }

  /**
   * Get Hijri date string from AlAdhan API for a given Gregorian date.
   */
  async getHijriDate(date: Date): Promise<{ day: string; month: string; monthAr: string; year: string } | null> {
    try {
      const dateStr = format(date, 'dd-MM-yyyy');
      const url = `${ALADHAN_BASE}/gToH?date=${dateStr}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const json = await response.json() as {
        data: { hijri: { day: string; month: { en: string; ar: string }; year: string } };
      };
      const { hijri } = json.data;
      return {
        day: hijri.day,
        month: hijri.month.en,
        monthAr: hijri.month.ar,
        year: hijri.year,
      };
    } catch {
      return null;
    }
  }
}

export const prayerTimeService = new PrayerTimeService();
