import { storageService } from './StorageService';

const ALADHAN_BASE = 'https://api.aladhan.com/v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — calendar is deterministic enough

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface HijriDay {
  gregorianDate: string; // 'YYYY-MM-DD'
  gregorianDay: number;
  gregorianMonth: number;
  gregorianYear: number;
  hijriDay: number;
  hijriMonth: number;
  hijriMonthAr: string;
  hijriMonthEn: string;
  hijriYear: number;
  weekdayAr: string;
}

interface AlAdhanDateBlock {
  gregorian: { date: string; day: string; month: { number: number }; year: string; weekday: { en: string } };
  hijri: {
    date: string;
    day: string;
    month: { number: number; ar: string; en: string };
    year: string;
    weekday: { ar: string };
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function mapDay(b: AlAdhanDateBlock): HijriDay {
  return {
    gregorianDate: b.gregorian.date.split('-').reverse().join('-'), // 'DD-MM-YYYY' → 'YYYY-MM-DD' (AlAdhan returns DD-MM-YYYY)
    gregorianDay: Number(b.gregorian.day),
    gregorianMonth: b.gregorian.month.number,
    gregorianYear: Number(b.gregorian.year),
    hijriDay: Number(b.hijri.day),
    hijriMonth: b.hijri.month.number,
    hijriMonthAr: b.hijri.month.ar,
    hijriMonthEn: b.hijri.month.en,
    hijriYear: Number(b.hijri.year),
    weekdayAr: b.hijri.weekday.ar,
  };
}

class HijriService {
  /** Convert a Gregorian date to its Hijri equivalent. */
  async gregorianToHijri(date: Date): Promise<HijriDay> {
    const dateStr = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
    const key = `hijri_g2h_${dateStr}`;
    const cached = storageService.get<CacheEntry<HijriDay>>(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

    const url = `${ALADHAN_BASE}/gToH/${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hijri ${res.status}`);
    const json = (await res.json()) as { data: AlAdhanDateBlock };
    const day = mapDay(json.data);
    storageService.set<CacheEntry<HijriDay>>(key, { data: day, timestamp: Date.now() });
    return day;
  }

  /**
   * Fetch a full Gregorian month worth of Hijri/Gregorian day pairings.
   * Useful for the calendar grid.
   */
  async getMonth(year: number, month: number /* 1..12 */): Promise<HijriDay[]> {
    const key = `hijri_grid_${year}_${pad(month)}`;
    const cached = storageService.get<CacheEntry<HijriDay[]>>(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

    const url = `${ALADHAN_BASE}/gToHCalendar/${month}/${year}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hijri month ${res.status}`);
    const json = (await res.json()) as { data: AlAdhanDateBlock[] };
    const days = json.data.map(mapDay);
    storageService.set<CacheEntry<HijriDay[]>>(key, { data: days, timestamp: Date.now() });
    return days;
  }

  /** Convert a Hijri month to its starting Gregorian date for a Hijri year. */
  async hijriToGregorian(hijriYear: number, hijriMonth: number, hijriDay = 1): Promise<HijriDay> {
    const dateStr = `${pad(hijriDay)}-${pad(hijriMonth)}-${hijriYear}`;
    const key = `hijri_h2g_${dateStr}`;
    const cached = storageService.get<CacheEntry<HijriDay>>(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

    const url = `${ALADHAN_BASE}/hToG/${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hijri h2g ${res.status}`);
    const json = (await res.json()) as { data: AlAdhanDateBlock };
    const day = mapDay(json.data);
    storageService.set<CacheEntry<HijriDay>>(key, { data: day, timestamp: Date.now() });
    return day;
  }
}

export const hijriService = new HijriService();

// ── Offline, synchronous Umm al-Qura conversion (Intl 'islamic-umalqura') ──
// Used by the calendar grid/events. The async AlAdhan methods above stay for
// existing callers. `offset` is the user's local sighting adjustment in days
// (−2…+2): +1 means "our Hijri date is one day ahead of Umm al-Qura".

export interface HijriDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..30
}

export const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

let umalqura: Intl.DateTimeFormat | null = null;

/** Local-noon Date for y/m/d shifted by `add` days (noon dodges DST edges). */
function noon(d: Date, add = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 12);
}

/** Hijri (Umm al-Qura) date of a Gregorian day, with the user's day offset. */
export function toHijri(date: Date, offset = 0): HijriDate {
  umalqura ??= new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = umalqura.formatToParts(noon(date, offset));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Gregorian date (local noon) of 1 <month> <year> AH. */
export function hijriMonthStart(year: number, month: number, offset = 0): Date {
  // Estimate from a known anchor (1 Muharram 1448 = 2026-06-16), then walk.
  let g = new Date(2026, 5, 16 + Math.round(((year - 1448) * 12 + (month - 1)) * 29.530589), 12);
  for (let i = 0; i < 24; i += 1) {
    const h = toHijri(g, offset);
    const monthGap = year * 12 + month - (h.year * 12 + h.month);
    if (monthGap === 0 && h.day === 1) return g;
    g = noon(g, monthGap === 0 ? 1 - h.day : Math.round(monthGap * 29.53 - (h.day - 1)) || Math.sign(monthGap));
  }
  return g;
}

/** Number of days (29/30) in a Hijri month. */
export function hijriMonthLength(year: number, month: number, offset = 0): number {
  const next = month === 12 ? hijriMonthStart(year + 1, 1, offset) : hijriMonthStart(year, month + 1, offset);
  return Math.round((next.getTime() - hijriMonthStart(year, month, offset).getTime()) / 86_400_000);
}

/** Gregorian date (local noon) of a Hijri date. */
export function fromHijri(h: HijriDate, offset = 0): Date {
  return noon(hijriMonthStart(h.year, h.month, offset), h.day - 1);
}
