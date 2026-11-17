import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

/**
 * «ليس اليوم» on a streak-rescue offer hides it for that day only — it comes
 * back tomorrow, 50% steeper, until the week-long window closes.
 */
interface StreakRescueState {
  /** offer key ('dhikr' | 'qiyam' | 'awrad:<id>') → dateKey it was dismissed. */
  dismissed: Record<string, string>;
  dismiss: (key: string, dayKey: string) => void;
}

export const useStreakRescueStore = create<StreakRescueState>()(
  persist(
    (set) => ({
      dismissed: {},
      dismiss: (key, dayKey) => set((s) => ({ dismissed: { ...s.dismissed, [key]: dayKey } })),
    }),
    { name: 'myzikr:streak-rescue', storage: safeStorage },
  ),
);
