import { format, subDays } from 'date-fns';
import type { DhikrItem, PrayerName } from '@/types';

/**
 * أذكار ما بعد الصلاة belong to EACH fard, not to the day: five readings, one
 * after every prayer, each logged on that prayer (`PrayerEntry.adhkar`). The
 * reader opens them as sets `postPrayer-<prayer>`; the plain `postPrayer` id
 * means «the prayer that just passed».
 */

export const POST_PRAYER_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const POST_PRAYER_NAME: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

const PREFIX = 'postPrayer-';

export const postPrayerSetId = (p: PrayerName) => `${PREFIX}${p}`;

export function prayerOfSet(id: string | null | undefined): PrayerName | null {
  if (!id?.startsWith(PREFIX)) return null;
  const p = id.slice(PREFIX.length) as PrayerName;
  return POST_PRAYER_ORDER.includes(p) ? p : null;
}

/** Only after الفجر (islambook: «بعد السلام من صلاة الفجر»). */
const FAJR_ONLY = new Set(['postPrayer-ib83']);
/** After الفجر and المغرب only (عشر التهليلات، «اللهم أجرني من النار» سبعاً). */
const FAJR_MAGHRIB = new Set(['postPrayer-ib82', 'postPrayer-ib84']);
/** The three قل: thrice after الفجر and المغرب, once after the others. */
const MUAWWIDHAT = 'postPrayer-ib80';

/** The adhkar said after this prayer, with this prayer's counts. */
export function postPrayerItems(p: PrayerName, items: DhikrItem[]): DhikrItem[] {
  const fm = p === 'fajr' || p === 'maghrib';
  return items
    .filter((it) => (FAJR_ONLY.has(it.id) ? p === 'fajr' : FAJR_MAGHRIB.has(it.id) ? fm : true))
    .map((it) => (it.id === MUAWWIDHAT ? { ...it, count: fm ? 3 : 1 } : it));
}

export interface PrayerTimesLike {
  fajr: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

/**
 * The prayer whose adhkar fit now: the last one whose adhan has passed. Before
 * today's Fajr it is last night's العشاء, logged on yesterday's date.
 */
export function prayerForAdhkar(now: Date, t: PrayerTimesLike): { prayer: PrayerName; dateKey: string } {
  const n = now.getTime();
  const passed = [...POST_PRAYER_ORDER].reverse().find((p) => t[p].getTime() <= n);
  if (passed) return { prayer: passed, dateKey: format(now, 'yyyy-MM-dd') };
  return { prayer: 'isha', dateKey: format(subDays(now, 1), 'yyyy-MM-dd') };
}
