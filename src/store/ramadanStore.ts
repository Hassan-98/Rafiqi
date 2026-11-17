import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RamadanState {
  /** Hijri year this state applies to. Resets when the year changes. */
  hijriYear: number | null;
  /** 1..30, set of nights where the user marked taraweeh complete. */
  taraweehNights: number[];
  /** date keys → list of juz numbers completed that day. */
  juzCompletedByDate: Record<string, number[]>;

  setYear: (year: number) => void;
  toggleTaraweeh: (night: number) => void;
  markJuzComplete: (dateKey: string, juz: number) => void;
  reset: () => void;
}

export const useRamadanStore = create<RamadanState>()(
  persist(
    (set) => ({
      hijriYear: null,
      taraweehNights: [],
      juzCompletedByDate: {},

      setYear: (year) =>
        set((s) => {
          if (s.hijriYear === year) return s;
          return { hijriYear: year, taraweehNights: [], juzCompletedByDate: {} };
        }),

      toggleTaraweeh: (night) =>
        set((s) => ({
          taraweehNights: s.taraweehNights.includes(night)
            ? s.taraweehNights.filter((n) => n !== night)
            : [...s.taraweehNights, night],
        })),

      markJuzComplete: (dateKey, juz) =>
        set((s) => {
          const existing = s.juzCompletedByDate[dateKey] ?? [];
          if (existing.includes(juz)) return s;
          return {
            juzCompletedByDate: {
              ...s.juzCompletedByDate,
              [dateKey]: [...existing, juz],
            },
          };
        }),

      reset: () => set({ hijriYear: null, taraweehNights: [], juzCompletedByDate: {} }),
    }),
    { name: 'myzikr:ramadan' },
  ),
);
