import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logActivity } from '@/store/activityLogStore';

export interface TasbihCounter {
  id: string;
  name: string;
  target: number;
  sessionCount: number;
  totalLifetimeCount: number;
  createdAt: string;
}

interface TasbihState {
  counters: TasbihCounter[];
  activeId: string | null;
  /** Counters pinned to the top of the picker. Persisted — pins used to live
   *  in component state and evaporated on every navigation. */
  pinnedIds: string[];
  addCounter: (name: string, target: number) => TasbihCounter;
  removeCounter: (id: string) => void;
  setActive: (id: string) => void;
  togglePin: (id: string) => void;
  /** Change a counter's cycle target (33 / 99 / custom). */
  setTarget: (id: string, target: number) => void;
  increment: () => void;
  resetSession: (id?: string) => void;
  resetLifetime: (id?: string) => void;
}

const DEFAULTS: TasbihCounter[] = [
  {
    id: 'subhanallah',
    name: 'سبحان الله',
    target: 33,
    sessionCount: 0,
    totalLifetimeCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'alhamdulillah',
    name: 'الحمد لله',
    target: 33,
    sessionCount: 0,
    totalLifetimeCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'allahuakbar',
    name: 'الله أكبر',
    target: 34,
    sessionCount: 0,
    totalLifetimeCount: 0,
    createdAt: new Date().toISOString(),
  },
];

let counter = 0;

export const useTasbihStore = create<TasbihState>()(
  persist(
    (set, get) => ({
      counters: DEFAULTS,
      activeId: DEFAULTS[0].id,
      pinnedIds: [],

      addCounter: (name, target) => {
        const id = `c_${Date.now()}_${++counter}`;
        const entry: TasbihCounter = {
          id,
          name,
          target,
          sessionCount: 0,
          totalLifetimeCount: 0,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ counters: [...s.counters, entry], activeId: id }));
        return entry;
      },

      removeCounter: (id) =>
        set((s) => {
          const remaining = s.counters.filter((c) => c.id !== id);
          const nextActive = s.activeId === id ? remaining[0]?.id ?? null : s.activeId;
          return {
            counters: remaining,
            activeId: nextActive,
            pinnedIds: s.pinnedIds.filter((p) => p !== id),
          };
        }),

      setActive: (id) => set({ activeId: id }),

      togglePin: (id) =>
        set((s) => ({
          pinnedIds: s.pinnedIds.includes(id)
            ? s.pinnedIds.filter((p) => p !== id)
            : [...s.pinnedIds, id],
        })),

      setTarget: (id, target) =>
        set((s) => ({
          counters: s.counters.map((c) =>
            c.id === id ? { ...c, target: Math.max(1, Math.round(target) || 1) } : c,
          ),
        })),

      increment: () => {
        const { counters, activeId } = get();
        if (!activeId) return;
        const active = counters.find((c) => c.id === activeId);
        if (active) {
          logActivity({
            domain: 'tasbih',
            refId: active.id,
            title: active.name,
            amount: 1,
            unit: 'مرة',
            kind: 'session',
          });
        }
        set({
          counters: counters.map((c) =>
            c.id === activeId
              ? { ...c, sessionCount: c.sessionCount + 1, totalLifetimeCount: c.totalLifetimeCount + 1 }
              : c,
          ),
        });
      },

      resetSession: (id) =>
        set((s) => ({
          counters: s.counters.map((c) =>
            (id ? c.id === id : c.id === s.activeId) ? { ...c, sessionCount: 0 } : c,
          ),
        })),

      resetLifetime: (id) =>
        set((s) => ({
          counters: s.counters.map((c) =>
            (id ? c.id === id : c.id === s.activeId)
              ? { ...c, sessionCount: 0, totalLifetimeCount: 0 }
              : c,
          ),
        })),
    }),
    { name: 'myzikr:tasbih' },
  ),
);
