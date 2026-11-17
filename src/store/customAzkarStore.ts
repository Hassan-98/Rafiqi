import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DhikrItem } from '@/types';

/** A user-defined azkar set — a named collection of dhikr items, each either
 *  copied from the built-in pools or authored by the user. */
export interface CustomAzkarSet {
  id: string;
  name: string;
  items: DhikrItem[];
  createdAt: string;
}

interface CustomAzkarState {
  sets: CustomAzkarSet[];
  addSet: (name: string, items: DhikrItem[]) => CustomAzkarSet;
  updateSet: (id: string, patch: Partial<Omit<CustomAzkarSet, 'id' | 'createdAt'>>) => void;
  removeSet: (id: string) => void;
  getSet: (id: string) => CustomAzkarSet | undefined;
}

let counter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export const useCustomAzkarStore = create<CustomAzkarState>()(
  persist(
    (set, get) => ({
      sets: [],

      addSet: (name, items) => {
        const entry: CustomAzkarSet = {
          id: genId('caz'),
          name: name.trim() || 'مجموعة مخصّصة',
          items,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ sets: [...s.sets, entry] }));
        return entry;
      },

      updateSet: (id, patch) =>
        set((s) => ({ sets: s.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

      removeSet: (id) => set((s) => ({ sets: s.sets.filter((x) => x.id !== id) })),

      getSet: (id) => get().sets.find((x) => x.id === id),
    }),
    { name: 'myzikr:custom-azkar' },
  ),
);

/** Build a fresh custom dhikr item from user input. */
export function makeCustomDhikr(arabic: string, count: number): DhikrItem {
  return {
    id: genId('cdh'),
    category: 'general',
    arabic: arabic.trim(),
    transliteration: '',
    translation: '',
    count: Math.max(1, count),
  };
}
