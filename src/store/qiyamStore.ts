import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format, subDays } from 'date-fns';
import { safeStorage } from './safeStorage';
import { useProgressStore } from './progressStore';
import { logActivity } from './activityLogStore';

/**
 * قيام الليل — one record per NIGHT, not per calendar day. A night belongs to
 * the evening it started: anything logged before noon counts for the previous
 * evening. Keying by calendar day made a قيام logged at 23:30 vanish at 00:01
 * and pushed a 02:00 قيام into "tomorrow".
 */
export function qiyamNightKey(d: Date = new Date()): string {
  return format(d.getHours() < 12 ? subDays(d, 1) : d, 'yyyy-MM-dd');
}

export interface QiyamNight {
  nightKey: string;
  /** Rakaat prayed, witr excluded. */
  rakaat: number;
  witr: boolean;
  /** Epoch ms of the (latest) log. */
  loggedAt: number;
  /** Optional minutes stood. */
  minutes?: number;
}

interface QiyamState {
  nights: Record<string, QiyamNight>;
  /** Log (or update) a night. Defaults to the current night. */
  logNight: (entry: Pick<QiyamNight, 'rakaat' | 'witr'> & { minutes?: number; nightKey?: string }) => void;
  removeNight: (nightKey?: string) => void;
}

export const useQiyamStore = create<QiyamState>()(
  persist(
    (set, get) => ({
      nights: {},

      logNight: ({ nightKey = qiyamNightKey(), ...entry }) => {
        // Timed event for the stats (time-of-night, day sheet). Log only the
        // INCREASE over what this night already had, so editing a night (8 → 10)
        // doesn't double-count when the activity log coalesces the two writes.
        const prev = get().nights[nightKey];
        const units = (n?: { rakaat: number; witr: boolean }) => (n ? n.rakaat + (n.witr ? 1 : 0) : 0);
        const delta = units(entry) - units(prev);
        if (delta > 0 || !prev) {
          logActivity({
            domain: 'qiyam',
            refId: nightKey,
            title: 'قيام الليل',
            amount: Math.max(1, delta),
            unit: 'ركعة',
            kind: 'session',
          });
        }
        set((s) => ({
          nights: { ...s.nights, [nightKey]: { ...entry, nightKey, loggedAt: Date.now() } },
        }));
        // Keep the shared day record (streaks, badges, overall rate) in step,
        // on the SAME night key.
        useProgressStore.getState().markModuleComplete('qiyam', 1, nightKey);
      },

      removeNight: (nightKey = qiyamNightKey()) => {
        set((s) => {
          const nights = { ...s.nights };
          delete nights[nightKey];
          return { nights };
        });
        useProgressStore.getState().unmarkModuleComplete('qiyam', nightKey);
      },
    }),
    { name: 'myzikr:qiyam', storage: safeStorage, version: 1 },
  ),
);

// One-time backfill: nights logged before this store existed live only as a
// completed 'qiyam' module in progressStore (rakaat unknown → 0). Both stores
// hydrate synchronously from localStorage, so this runs on first import.
if (Object.keys(useQiyamStore.getState().nights).length === 0) {
  const legacy: Record<string, QiyamNight> = {};
  for (const [key, day] of Object.entries(useProgressStore.getState().dailyProgress)) {
    const m = day.modules.find((x) => x.moduleId === 'qiyam' && x.completed);
    if (m) {
      legacy[key] = {
        nightKey: key,
        rakaat: 0,
        witr: false,
        loggedAt: m.completedAt ? new Date(m.completedAt).getTime() : new Date(`${key}T23:00:00`).getTime(),
      };
    }
  }
  if (Object.keys(legacy).length > 0) useQiyamStore.setState({ nights: legacy });
}

/** "٨ ركعات + الوتر" — or just "سُجّل" for backfilled nights with no count. */
export function qiyamLabel(n: QiyamNight, digits: (v: number) => string): string {
  if (n.rakaat <= 0) return 'سُجّل';
  return `${digits(n.rakaat)} ركعات${n.witr ? ' + الوتر' : ''}`;
}
