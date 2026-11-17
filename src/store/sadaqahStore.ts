import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SadaqahEntry {
  id: string;
  amount: number;
  currency: string;
  cause: string;
  date: string; // ISO yyyy-mm-dd
  notes?: string;
  createdAt: string;
}

export interface SadaqahGoal {
  amount: number;
  /** Goals are single-currency: progress only counts entries in this currency. */
  currency: string;
}

interface SadaqahState {
  entries: SadaqahEntry[];
  /** Monthly giving goal. Lives IN the store so file backup/restore carries it
   *  (it used to sit in a loose localStorage key and was lost on migration). */
  monthlyGoal: SadaqahGoal | null;
  add: (entry: Omit<SadaqahEntry, 'id' | 'createdAt'>) => SadaqahEntry;
  update: (id: string, patch: Partial<Omit<SadaqahEntry, 'id'>>) => void;
  remove: (id: string) => void;
  setMonthlyGoal: (goal: SadaqahGoal | null) => void;
  /** Totals are per-currency — amounts in different currencies must never be
   *  blindly summed (a goal in ر.س used to count USD entries toward itself). */
  totalForMonth: (year: number, month: number, currency?: string) => number;
  totalForYear: (year: number, currency?: string) => number;
}

let counter = 0;

export const useSadaqahStore = create<SadaqahState>()(
  persist(
    (set, get) => ({
      entries: [],
      monthlyGoal: null,

      add: (entry) => {
        const e: SadaqahEntry = {
          id: `sd_${Date.now()}_${++counter}`,
          createdAt: new Date().toISOString(),
          ...entry,
        };
        set((s) => ({ entries: [e, ...s.entries] }));
        return e;
      },

      update: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      setMonthlyGoal: (goal) => set({ monthlyGoal: goal }),

      totalForMonth: (year, month, currency) => {
        return get().entries.reduce((sum, e) => {
          if (currency && e.currency !== currency) return sum;
          const d = new Date(e.date);
          return d.getFullYear() === year && d.getMonth() + 1 === month ? sum + e.amount : sum;
        }, 0);
      },

      totalForYear: (year, currency) => {
        return get().entries.reduce((sum, e) => {
          if (currency && e.currency !== currency) return sum;
          const d = new Date(e.date);
          return d.getFullYear() === year ? sum + e.amount : sum;
        }, 0);
      },
    }),
    { name: 'myzikr:sadaqah' },
  ),
);
