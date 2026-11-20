import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { useProgressStore } from '@/store/progressStore';
import {
  DEFAULT_SETTINGS,
  keyOf,
  type FastDebt,
  type PrayerDebt,
  type QadaData,
  type QadaKind,
  type QadaSettings,
} from '@/services/qadaPlan';

export type NewDebt = Omit<PrayerDebt, 'id' | 'at'> | Omit<FastDebt, 'id' | 'at'>;

const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

interface QadaState extends QadaData {
  addDebt: (d: NewDebt) => string;
  removeDebt: (id: string) => void;
  /** +1 (or −1) of a prayer or the fast on a day (default today). Never below 0. */
  bump: (kind: QadaKind, delta: 1 | -1, dayKey?: string) => void;
  /** Answer suggestions (`ex:<day>` / `log:<day>`) so they stop showing. */
  dismiss: (keys: string[]) => void;
  setSettings: (patch: Partial<QadaSettings>) => void;
}

/**
 * «قضاء ما فات» (synced; private). Arrays are id-unioned and `paid` is a
 * dateKey map, so a sync conflict merges both devices; preferences live
 * under `settings`, which the merge keeps per-device.
 */
export const useQadaStore = create<QadaState>()(
  persist(
    (set) => ({
      debts: [],
      paid: {},
      dismissed: [],
      settings: DEFAULT_SETTINGS,

      addDebt: (d) => {
        const id = makeId();
        set((s) => ({ debts: [{ ...d, id, at: Date.now() } as PrayerDebt | FastDebt, ...s.debts] }));
        return id;
      },

      removeDebt: (id) => set((s) => ({ debts: s.debts.filter((d) => d.id !== id) })),

      bump: (kind, delta, dayKey = keyOf(new Date())) =>
        set((s) => {
          const day = { ...s.paid[dayKey] };
          const n = Math.max(0, (day[kind] ?? 0) + delta);
          if (kind === 'fast' && n > 1) return s; // one fast a day
          if (n) day[kind] = n;
          else delete day[kind];
          const paid = { ...s.paid };
          if (Object.keys(day).length) paid[dayKey] = day;
          else delete paid[dayKey];
          return { paid };
        }),

      dismiss: (keys) => set((s) => ({ dismissed: [...new Set([...s.dismissed, ...keys])] })),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'myzikr:qada',
      storage: safeStorage,
      partialize: (s) => ({ debts: s.debts, paid: s.paid, dismissed: s.dismissed, settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<QadaData>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

export const isQadaFast = (dayKey: string): boolean => (useQadaStore.getState().paid[dayKey]?.fast ?? 0) > 0;

/**
 * Mark a day's fast as qada (or clear it). `logFast` also records/unrecords
 * the fast itself in the fasting module (the qada page); the module's own
 * «قضاء» chip passes false — the fast is already logged there.
 */
export function setQadaFast(dayKey: string, on: boolean, logFast: boolean): void {
  if (on !== isQadaFast(dayKey)) useQadaStore.getState().bump('fast', on ? 1 : -1, dayKey);
  if (!logFast) return;
  const progress = useProgressStore.getState();
  if (on) progress.markModuleComplete('fasting', 1, dayKey);
  else progress.unmarkModuleComplete('fasting', dayKey);
}
