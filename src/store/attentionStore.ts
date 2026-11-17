import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

/**
 * «يحتاج انتباهك» on Home (services/dayAttention.ts): «ليس الآن» hides an item
 * for the day; «لا تقترحها» mutes a suggested sunnah on Home AND in the
 * notifications, until restored from Settings.
 */
interface AttentionState {
  /** item id → dateKey it was hidden on. */
  dismissed: Record<string, string>;
  /** Muted habit keys (HabitKey). */
  muted: string[];
  dismiss: (id: string, dayKey: string) => void;
  mute: (habit: string) => void;
  unmuteAll: () => void;
}

export const useAttentionStore = create<AttentionState>()(
  persist(
    (set) => ({
      dismissed: {},
      muted: [],
      // Only today's entries matter — older ones are dropped on the next write.
      dismiss: (id, dayKey) =>
        set((s) => ({
          dismissed: { ...Object.fromEntries(Object.entries(s.dismissed).filter(([, d]) => d === dayKey)), [id]: dayKey },
        })),
      mute: (habit) => set((s) => (s.muted.includes(habit) ? s : { muted: [...s.muted, habit] })),
      unmuteAll: () => set({ muted: [] }),
    }),
    { name: 'myzikr:attention', storage: safeStorage },
  ),
);
