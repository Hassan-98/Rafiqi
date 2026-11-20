import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

/**
 * «يحتاج انتباهك» on Home (services/dayAttention.ts): «ليس الآن» hides an item
 * for the day; «لا تقترحها» mutes a suggested sunnah on Home AND in the
 * notifications, until restored from Settings; «سأصومه» remembers tomorrow's
 * fast so «رفيقك اليومي» wakes its suhoor.
 */
interface AttentionState {
  /** item id → dateKey it was hidden on. */
  dismissed: Record<string, string>;
  /** Muted habit keys (HabitKey, 'house', 'seasons', or a source's own). */
  muted: string[];
  /** The day the user said they will fast. */
  fastIntent: string | null;
  dismiss: (id: string, dayKey: string) => void;
  mute: (habit: string) => void;
  unmuteAll: () => void;
  setFastIntent: (dayKey: string | null) => void;
}

export const useAttentionStore = create<AttentionState>()(
  persist(
    (set) => ({
      dismissed: {},
      muted: [],
      fastIntent: null,
      // Only today's entries matter — older ones are dropped on the next write.
      dismiss: (id, dayKey) =>
        set((s) => ({
          dismissed: { ...Object.fromEntries(Object.entries(s.dismissed).filter(([, d]) => d === dayKey)), [id]: dayKey },
        })),
      mute: (habit) => set((s) => (s.muted.includes(habit) ? s : { muted: [...s.muted, habit] })),
      unmuteAll: () => set({ muted: [] }),
      setFastIntent: (fastIntent) => set({ fastIntent }),
    }),
    { name: 'myzikr:attention', storage: safeStorage },
  ),
);
