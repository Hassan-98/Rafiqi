import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, format, subDays } from 'date-fns';
import { safeStorage } from './safeStorage';
import { logActivity } from '@/store/activityLogStore';
import { useProgressStore } from '@/store/progressStore';
import { dateKeyOf } from '@/services/statsService';
import type { PrayerName } from '@/types';

/** Arabic prayer names for the activity timeline (stores can't use i18n hooks). */
const PRAYER_LABEL_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

/**
 * Detailed per-prayer log: tracks each fard prayer and its associated
 * sunnah rakaat / witr independently, for ANY day (past days can be filled
 * in). It is the source of truth for prayers; the aggregated "prayers" day
 * record in `progressStore` (streaks, badges, overall rate) is kept in step
 * HERE, for whatever day is edited — callers never sync it themselves.
 */

export type PrayerCheckType = 'fard' | 'sunnahBefore' | 'sunnahAfter' | 'witr' | 'mosque' | 'onTime' | 'adhkar';

/** Which sunnah rakaat are religiously valid for each prayer. Witr is
 *  logged with قيام الليل (qiyamStore); `PrayerEntry.witr` is legacy data. */
export const SUNNAH_RAKAAT: Record<PrayerName, { before: number; after: number }> = {
  fajr: { before: 2, after: 0 },
  dhuhr: { before: 4, after: 2 },
  asr: { before: 0, after: 0 },
  maghrib: { before: 0, after: 2 },
  isha: { before: 0, after: 2 },
};

export interface PrayerEntry {
  fard?: boolean;
  sunnahBefore?: boolean;
  sunnahAfter?: boolean;
  witr?: boolean;
  /** Prayed in the mosque / in congregation (men). Implies `fard`. */
  mosque?: boolean;
  /** Women: prayed at the start of its time — «الصلاة على وقتها», her counterpart
   *  of the mosque (her prayer at home is the better one). Implies `fard`. */
  onTime?: boolean;
  /** أذكار ما بعد هذه الصلاة were said. Implies `fard` (except on an excused day). */
  adhkar?: boolean;
}

export type PrayerDayLog = Partial<Record<PrayerName, PrayerEntry>>;

export const PRAYERS_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const fardCountOf = (day: PrayerDayLog | undefined): number => PRAYERS_ORDER.filter((p) => day?.[p]?.fard).length;

/** Prayers of the day followed by their أذكار (0–5). */
export const adhkarCountOf = (day: PrayerDayLog | undefined): number => PRAYERS_ORDER.filter((p) => day?.[p]?.adhkar).length;

/** One day of صلاة الضحى: its rakaat. Legacy logs (and older synced devices)
 *  stored `true` — read it through {@link duhaRakaatOf} (= 2, the minimum). */
export type DuhaEntry = true | number;

/** The rakaat offered when logging الضحى: 2 the minimum, 8 the Prophet's ﷺ on
 *  the day of the Conquest (متفق عليه), up to 12. */
export const DUHA_RAKAAT_OPTIONS = [2, 4, 6, 8, 12] as const;

export const duhaRakaatOf = (v: DuhaEntry | undefined): number => (v === true ? 2 : typeof v === 'number' ? v : 0);

/** The rakaat of the most recent logged الضحى (the default for the next one). */
export function lastDuhaRakaat(duha: Record<string, DuhaEntry>): number {
  const last = Object.keys(duha).sort().pop();
  return (last && duhaRakaatOf(duha[last])) || 2;
}

/**
 * Time of الضحى: from the sun a spear's length up (~15 min after sunrise) to
 * shortly before Dhuhr. Best when a quarter of the day has passed — «صلاة
 * الأوّابين حين ترمض الفِصال» (مسلم).
 */
export function duhaWindow(t: { sunrise: Date; dhuhr: Date; maghrib: Date }): { start: Date; best: Date; end: Date } {
  return {
    start: new Date(t.sunrise.getTime() + 15 * 60_000),
    best: new Date(t.sunrise.getTime() + (t.maghrib.getTime() - t.sunrise.getTime()) / 4),
    end: new Date(t.dhuhr.getTime() - 10 * 60_000),
  };
}

/** The five السنن الرواتب slots — 12 rakaat a day (حديث أم حبيبة، مسلم). */
export const RAWATIB: { prayer: PrayerName; type: 'sunnahBefore' | 'sunnahAfter'; rakaat: number; label: string }[] =
  PRAYERS_ORDER.flatMap((p) => [
    ...(SUNNAH_RAKAAT[p].before
      ? [{ prayer: p, type: 'sunnahBefore' as const, rakaat: SUNNAH_RAKAAT[p].before, label: p === 'fajr' ? 'سنة الفجر' : `قبلية ${PRAYER_LABEL_AR[p]}` }]
      : []),
    ...(SUNNAH_RAKAAT[p].after
      ? [{ prayer: p, type: 'sunnahAfter' as const, rakaat: SUNNAH_RAKAAT[p].after, label: `بعدية ${PRAYER_LABEL_AR[p]}` }]
      : []),
  ]);

/**
 * Friday, for men: الجمعة takes the place of الظهر — no qabliyya, and FOUR
 * after it («إذا صلّى أحدكم الجمعة فليصلّ بعدها أربعاً»، مسلم). Women pray the
 * Dhuhr with its usual sunnah.
 */
export const isJumuah = (dateKey: string, male: boolean): boolean => male && new Date(`${dateKey}T12:00:00`).getDay() === 5;

/** A prayer's sunnah on a given day (Friday's Jumu'ah for men). */
export const sunnahRakaatOn = (p: PrayerName, dateKey: string, male: boolean): { before: number; after: number } =>
  p === 'dhuhr' && isJumuah(dateKey, male) ? { before: 0, after: 4 } : SUNNAH_RAKAAT[p];

/** The rawatib slots of a day: the five, or on a man's Friday بعدية الجمعة (four) and no قبلية. */
export function rawatibOn(dateKey: string, male: boolean): typeof RAWATIB {
  if (!isJumuah(dateKey, male)) return RAWATIB;
  return RAWATIB.flatMap((r) =>
    r.prayer !== 'dhuhr' ? [r] : r.type === 'sunnahBefore' ? [] : [{ ...r, rakaat: 4, label: 'بعدية الجمعة' }],
  );
}

/** The day's full rawatib: 12, or 10 on a man's Friday. */
export const rawatibFullOn = (dateKey: string, male: boolean): number => rawatibOn(dateKey, male).reduce((n, r) => n + r.rakaat, 0);

/** Rawatib rakaat prayed that day. */
export const rawatibRakaatOf = (day: PrayerDayLog | undefined, dateKey: string, male: boolean): number =>
  rawatibOn(dateKey, male).reduce((n, r) => n + (day?.[r.prayer]?.[r.type] ? r.rakaat : 0), 0);

interface PrayerLogState {
  /** dateKey (yyyy-MM-dd) → per-prayer details. */
  log: Record<string, PrayerDayLog>;
  /** Days a woman is excused from prayer (حيض / نفاس): out of stats, streaks bridged. */
  excused: Record<string, true>;
  /** Days صلاة الضحى (a daily nafl) was prayed → its rakaat. Kept apart from
   *  the five so fard counts, progressStore and the widgets never see it. */
  duha: Record<string, DuhaEntry>;

  setPrayer: (dateKey: string, prayer: PrayerName, type: PrayerCheckType, done: boolean) => void;
  togglePrayer: (dateKey: string, prayer: PrayerName, type: PrayerCheckType) => void;
  /** Mark (or clear) all five fard of a day at once. */
  setAllFard: (dateKey: string, done: boolean) => void;
  setExcused: (dateKey: string, on: boolean) => void;
  /** Log (with `rakaat`, default: the last logged count) or clear الضحى. */
  setDuha: (dateKey: string, on: boolean, rakaat?: number) => void;
  getDayLog: (dateKey: string) => PrayerDayLog;
  getFardCount: (dateKey: string) => number;
  getSunnahCount: (dateKey: string) => number;
  isPrayerDone: (dateKey: string, prayer: PrayerName, type: PrayerCheckType) => boolean;
  isFardComplete: (dateKey: string) => boolean;
  clearDay: (dateKey: string) => void;
}

/** progressStore's "prayers" record for one day follows the five fard. */
function syncProgress(dateKey: string, n: number) {
  const progress = useProgressStore.getState();
  if (n >= 5) progress.markModuleComplete('prayers', 1, dateKey);
  else if (n === 0) progress.unmarkModuleComplete('prayers', dateKey);
  else progress.setModuleRate('prayers', n / 5, dateKey);
}

export const usePrayerLogStore = create<PrayerLogState>()(
  persist(
    (set, get) => ({
      log: {},
      excused: {},
      duha: {},

      setPrayer: (dateKey, prayer, type, done) => {
        // Log a timed event only when marking a fard prayer done TODAY — the
        // clock time is only meaningful for "now" (back-filling a past day
        // shouldn't stamp it with the current time).
        const before = get().log[dateKey]?.[prayer];
        const excusedDay = !!get().excused[dateKey];
        if (done && (type === 'fard' || type === 'mosque' || type === 'onTime' || (type === 'adhkar' && !excusedDay)) && !before?.fard && dateKey === dateKeyOf(new Date())) {
          logActivity({
            domain: 'prayer',
            refId: prayer,
            title: `صلاة ${PRAYER_LABEL_AR[prayer]}`,
            amount: 1,
            kind: 'complete',
          });
        }
        set((s) => {
          const day = { ...(s.log[dateKey] ?? {}) };
          const entry = { ...(day[prayer] ?? {}) };
          if (done) entry[type] = true;
          else delete entry[type];
          // In the mosque / its adhkar said ⇒ prayed; not prayed ⇒ neither.
          if ((type === 'mosque' || type === 'onTime') && done) entry.fard = true;
          if (type === 'adhkar' && done && !excusedDay) entry.fard = true;
          if (type === 'fard' && !done) {
            delete entry.mosque;
            delete entry.onTime;
            delete entry.adhkar;
          }
          if (Object.keys(entry).length === 0) {
            delete day[prayer];
          } else {
            day[prayer] = entry;
          }
          return { log: { ...s.log, [dateKey]: day } };
        });
        if (!!before?.fard !== !!get().log[dateKey]?.[prayer]?.fard) syncProgress(dateKey, get().getFardCount(dateKey));
      },

      togglePrayer: (dateKey, prayer, type) => {
        const current = get().isPrayerDone(dateKey, prayer, type);
        get().setPrayer(dateKey, prayer, type, !current);
      },

      setAllFard: (dateKey, done) => {
        set((s) => {
          const day = { ...(s.log[dateKey] ?? {}) };
          for (const p of PRAYERS_ORDER) {
            const entry = { ...(day[p] ?? {}) };
            if (done) entry.fard = true;
            else {
              delete entry.fard;
              delete entry.mosque;
              delete entry.adhkar;
            }
            if (Object.keys(entry).length) day[p] = entry;
            else delete day[p];
          }
          return { log: { ...s.log, [dateKey]: day } };
        });
        syncProgress(dateKey, done ? 5 : 0);
      },

      setExcused: (dateKey, on) => {
        set((s) => {
          const excused = { ...s.excused };
          if (on) excused[dateKey] = true;
          else delete excused[dateKey];
          return { excused };
        });
        useProgressStore.getState().setFrozen('prayers', dateKey, on);
      },

      setDuha: (dateKey, on, rakaat) => {
        if (on && !get().duha[dateKey] && dateKey === dateKeyOf(new Date())) {
          logActivity({ domain: 'prayer', refId: 'duha', title: 'صلاة الضحى', amount: 1, kind: 'complete' });
        }
        set((s) => {
          const duha = { ...s.duha };
          if (on) duha[dateKey] = Math.max(2, Math.round(rakaat ?? lastDuhaRakaat(s.duha)));
          else delete duha[dateKey];
          return { duha };
        });
      },

      getDayLog: (dateKey) => get().log[dateKey] ?? {},

      getFardCount: (dateKey) => fardCountOf(get().log[dateKey]),

      getSunnahCount: (dateKey) => {
        const day = get().log[dateKey] ?? {};
        return PRAYERS_ORDER.reduce((acc, p) => {
          const e = day[p];
          if (!e) return acc;
          let count = 0;
          if (e.sunnahBefore) count += 1;
          if (e.sunnahAfter) count += 1;
          if (e.witr) count += 1;
          return acc + count;
        }, 0);
      },

      isPrayerDone: (dateKey, prayer, type) => {
        return get().log[dateKey]?.[prayer]?.[type] ?? false;
      },

      isFardComplete: (dateKey) => get().getFardCount(dateKey) >= 5,

      clearDay: (dateKey) => {
        set((s) => {
          const next = { ...s.log };
          delete next[dateKey];
          return { log: next };
        });
        syncProgress(dateKey, 0);
      },
    }),
    { name: 'myzikr:prayer-log', storage: safeStorage },
  ),
);

/**
 * Consecutive `done` days walking back from today, and the longest such run.
 * Today (still running) and excused days neither break nor extend a chain.
 */
export function dayStreak(done: Iterable<string>, excused: Record<string, true>, now = new Date()): { current: number; longest: number } {
  const set = new Set(done);
  let current = 0;
  for (let back = 0; back < 3660; back++) {
    const key = format(subDays(now, back), 'yyyy-MM-dd');
    if (set.has(key)) current++;
    else if (back === 0 || excused[key]) continue;
    else break;
  }
  const keys = [...set].sort();
  let longest = current;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    if (prev) {
      // Walk the gap: only excused days may sit between two done days.
      let d = subDays(new Date(`${k}T12:00:00`), 1);
      let bridged = true;
      while (format(d, 'yyyy-MM-dd') > prev) {
        if (!excused[format(d, 'yyyy-MM-dd')]) {
          bridged = false;
          break;
        }
        d = subDays(d, 1);
      }
      run = bridged ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current, longest };
}

/** Days with all five fard → {@link dayStreak}. */
export function prayerStreak(log: Record<string, PrayerDayLog>, excused: Record<string, true>, now = new Date()): { current: number; longest: number } {
  return dayStreak(Object.keys(log).filter((k) => fardCountOf(log[k]) === 5), excused, now);
}

/**
 * Each sunnah of the rawatib on its own — «سنة الفجر»، «قبلية الظهر»… (owner:
 * one missed sunnah must not break the others, like the fard chains).
 */
export function eachRawatibStreak(
  log: Record<string, PrayerDayLog>,
  excused: Record<string, true>,
  male: boolean,
  now = new Date(),
): ((typeof RAWATIB)[number] & { current: number; longest: number })[] {
  const keys = Object.keys(log).sort();
  // A man's Friday has no قبلية الظهر: it neither counts nor breaks that chain.
  const noQabliyya: Record<string, true> = { ...excused };
  if (male && keys.length) {
    for (let d = new Date(`${keys[0]}T12:00:00`); d <= now; d = addDays(d, 1)) if (d.getDay() === 5) noQabliyya[format(d, 'yyyy-MM-dd')] = true;
  }
  return RAWATIB.map((r) => ({
    ...r,
    ...dayStreak(
      keys.filter((k) => log[k]?.[r.prayer]?.[r.type] && rawatibOn(k, male).some((x) => x.prayer === r.prayer && x.type === r.type)),
      r.prayer === 'dhuhr' && r.type === 'sunnahBefore' ? noQabliyya : excused,
      now,
    ),
  }));
}

/** The streak of each fard on its own, and of الضحى — «سلسلة كل صلاة». */
export function eachPrayerStreak(
  log: Record<string, PrayerDayLog>,
  excused: Record<string, true>,
  duha: Record<string, DuhaEntry>,
  now = new Date(),
): Record<PrayerName | 'duha', { current: number; longest: number }> {
  const keys = Object.keys(log);
  const of = (p: PrayerName) => dayStreak(keys.filter((k) => log[k]?.[p]?.fard), excused, now);
  return {
    fajr: of('fajr'),
    dhuhr: of('dhuhr'),
    asr: of('asr'),
    maghrib: of('maghrib'),
    isha: of('isha'),
    duha: dayStreak(Object.keys(duha), excused, now),
  };
}
