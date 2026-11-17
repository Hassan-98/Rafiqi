import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { dayKey } from '@/store/studyModel';
import type { HouseEntry, HouseMeal } from '@/data/houseChores';

/** ≈ a few months of chores; the board reads the last week, nothing reads further back. */
const MAX_ENTRIES = 1500;
const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

interface HouseState {
  /** Newest first. */
  entries: HouseEntry[];
  log: (chore: string, kind?: string, meal?: HouseMeal) => string;
  remove: (id: string) => void;
}

/** «مهام المنزل» log (synced: a history store, entries unioned by id). */
export const useHouseStore = create<HouseState>()(
  persist(
    (set) => ({
      entries: [],
      log: (chore, kind, meal) => {
        const at = Date.now();
        const e: HouseEntry = { id: makeId(), chore, kind, meal, day: dayKey(at), at };
        set((s) => ({ entries: [e, ...s.entries].slice(0, MAX_ENTRIES) }));
        return e.id;
      },
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
    }),
    { name: 'myzikr:house', storage: safeStorage },
  ),
);
