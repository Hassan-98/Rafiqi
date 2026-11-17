import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { format, subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import type { ModuleId, ModuleCompletion, DailyProgress, StreakData } from '@/types';

function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

interface ProgressState {
  dailyProgress: Record<string, DailyProgress>;
  streaks: Record<string, StreakData>;
  freezeTokens: number;
  /** dateKey → moduleIds frozen on that day. `'*'` = the whole day is frozen. */
  freezesUsed: Record<string, string[]>;
  /** How many week-milestone freeze awards have been granted for the current
   *  activity streak (resets down when the streak resets). */
  freezeAwardsGiven: number;

  // Actions
  /** `dateKey` defaults to today (قيام passes its night key). */
  markModuleComplete: (moduleId: ModuleId | string, rate?: number, dateKey?: string) => void;
  unmarkModuleComplete: (moduleId: ModuleId | string, dateKey?: string) => void;
  setModuleRate: (moduleId: ModuleId | string, rate: number, dateKey?: string) => void;
  /** A free (token-less) freeze, e.g. an excused prayer day: bridges streaks, counts as nothing. */
  setFrozen: (moduleId: ModuleId | string, dateKey: string, on: boolean) => void;
  getDayProgress: (dateKey: string) => DailyProgress | null;
  getTodayProgress: () => DailyProgress | null;
  computeStreak: (moduleId: ModuleId | string) => StreakData;
  /** Consecutive days with ANY completed module (freezes bridge gaps). */
  computeOverallStreak: () => number;
  getOverallRate: (dateKey?: string) => number;
  getLast30Days: () => DailyProgress[];
  // Streak freezes
  awardFreeze: () => void;
  useFreeze: (moduleId: ModuleId | string, dateKey: string) => boolean;
  isFrozen: (moduleId: ModuleId | string, dateKey: string) => boolean;
  /**
   * Boot-time freeze upkeep (mercy over guilt):
   *  - CONSUME: a missed day just behind us is auto-covered by a token
   *    (`'*'` = whole-day freeze) so one bad day doesn't torch the streak.
   *  - AWARD: every 7 consecutive active days earns a token (max 3 held).
   *  Returns the dateKeys it froze (caller may toast). The whole freeze
   *  feature previously existed but was never called from anywhere.
   */
  maintainFreezes: () => string[];
}

function computeOverallRate(modules: ModuleCompletion[]): number {
  if (modules.length === 0) return 0;
  const sum = modules.reduce((acc, m) => acc + m.completionRate, 0);
  return sum / modules.length;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      dailyProgress: {},
      streaks: {},
      freezeTokens: 0,
      freezesUsed: {},
      freezeAwardsGiven: 0,

      markModuleComplete: (moduleId, rate = 1, dateKey = todayKey()) => {
        set((s) => {
          const existing = s.dailyProgress[dateKey];
          const modules: ModuleCompletion[] = existing?.modules ?? [];
          const idx = modules.findIndex((m) => m.moduleId === moduleId);
          const entry: ModuleCompletion = {
            moduleId,
            completed: true,
            completionRate: rate,
            completedAt: new Date().toISOString(),
          };

          const updated = idx >= 0
            ? modules.map((m, i) => (i === idx ? entry : m))
            : [...modules, entry];

          const newDay: DailyProgress = {
            dateKey,
            modules: updated,
            overallRate: computeOverallRate(updated),
          };

          return { dailyProgress: { ...s.dailyProgress, [dateKey]: newDay } };
        });
      },

      unmarkModuleComplete: (moduleId, dateKey = todayKey()) => {
        set((s) => {
          const existing = s.dailyProgress[dateKey];
          if (!existing) return s;

          const updated = existing.modules.map((m) =>
            m.moduleId === moduleId
              ? { ...m, completed: false, completionRate: 0, completedAt: undefined }
              : m,
          );

          return {
            dailyProgress: {
              ...s.dailyProgress,
              [dateKey]: { ...existing, modules: updated, overallRate: computeOverallRate(updated) },
            },
          };
        });
      },

      setModuleRate: (moduleId, rate, dateKey = todayKey()) => {
        set((s) => {
          const existing = s.dailyProgress[dateKey];
          const modules: ModuleCompletion[] = existing?.modules ?? [];
          const idx = modules.findIndex((m) => m.moduleId === moduleId);

          const entry: ModuleCompletion = {
            moduleId,
            completed: rate >= 1,
            completionRate: Math.min(1, Math.max(0, rate)),
          };

          const updated = idx >= 0
            ? modules.map((m, i) => (i === idx ? entry : m))
            : [...modules, entry];

          const newDay: DailyProgress = {
            dateKey,
            modules: updated,
            overallRate: computeOverallRate(updated),
          };

          return { dailyProgress: { ...s.dailyProgress, [dateKey]: newDay } };
        });
      },

      getDayProgress: (dateKey) => {
        return get().dailyProgress[dateKey] ?? null;
      },

      getTodayProgress: () => {
        return get().dailyProgress[todayKey()] ?? null;
      },

      computeStreak: (moduleId) => {
        const { dailyProgress, freezesUsed } = get();
        const isDayFrozen = (key: string) => {
          const f = freezesUsed[key];
          return !!f && (f.includes('*') || f.includes(String(moduleId)));
        };
        const completedOn = (key: string) =>
          !!dailyProgress[key]?.modules.find((m) => m.moduleId === moduleId)?.completed;

        // CURRENT: single backward walk from today. An incomplete *today* is
        // "in progress" (doesn't break the chain); frozen days preserve the
        // chain without adding to it. The old 365-iteration cap silently
        // truncated year-plus streaks — the walk now ends at the data, with a
        // ten-year safety bound.
        let current = 0;
        let lastCompleted: string | null = null;
        for (let back = 0; back < 3660; back++) {
          const key = format(subDays(new Date(), back), 'yyyy-MM-dd');
          if (completedOn(key)) {
            current++;
            if (!lastCompleted) lastCompleted = key;
          } else if (back === 0 || isDayFrozen(key)) {
            continue;
          } else {
            break;
          }
        }

        // LONGEST: one pass over completed days; a gap counts as bridged only
        // if every intermediate day was frozen.
        const doneKeys = Object.keys(dailyProgress).filter(completedOn).sort();
        let longest = current;
        let run = 0;
        for (let i = 0; i < doneKeys.length; i++) {
          if (i === 0) {
            run = 1;
          } else {
            const gap = differenceInCalendarDays(parseISO(doneKeys[i]), parseISO(doneKeys[i - 1]));
            let bridged = gap === 1;
            if (gap > 1 && gap <= 30) {
              bridged = true;
              for (let d = 1; d < gap; d++) {
                const mid = format(subDays(parseISO(doneKeys[i]), d), 'yyyy-MM-dd');
                if (!isDayFrozen(mid)) {
                  bridged = false;
                  break;
                }
              }
            } else if (gap > 30) {
              bridged = false;
            }
            run = bridged ? run + 1 : 1;
          }
          longest = Math.max(longest, run);
        }

        const streak: StreakData = { moduleId, currentStreak: current, longestStreak: longest, lastCompletedDate: lastCompleted };
        set((s) => ({ streaks: { ...s.streaks, [String(moduleId)]: streak } }));
        return streak;
      },

      computeOverallStreak: () => {
        // Consecutive days where ANYTHING was completed (frozen days bridge).
        // This is what "حافظت على عبادتك" actually means — the badge engine
        // used to take max() across modules, unlocking "overall" badges off a
        // single module's streak, contradicting every badge title.
        const { dailyProgress, freezesUsed } = get();
        let chain = 0;
        for (let back = 0; back < 3660; back++) {
          const key = format(subDays(new Date(), back), 'yyyy-MM-dd');
          if (dailyProgress[key]?.modules.some((m) => m.completed)) chain++;
          else if (back === 0 || freezesUsed[key]?.length) continue;
          else break;
        }
        return chain;
      },

      getOverallRate: (dateKey) => {
        const key = dateKey ?? todayKey();
        const day = get().dailyProgress[key];
        return day?.overallRate ?? 0;
      },

      getLast30Days: () => {
        const { dailyProgress } = get();
        return Array.from({ length: 30 }, (_, i) => {
          const key = format(subDays(new Date(), 29 - i), 'yyyy-MM-dd');
          return dailyProgress[key] ?? { dateKey: key, modules: [], overallRate: 0 };
        });
      },

      awardFreeze: () =>
        set((s) => ({ freezeTokens: Math.min(3, s.freezeTokens + 1) })),

      useFreeze: (moduleId, dateKey) => {
        const state = get();
        if (state.freezeTokens <= 0) return false;
        if (state.freezesUsed[dateKey]?.includes(String(moduleId))) return true;
        set((s) => ({
          freezeTokens: s.freezeTokens - 1,
          freezesUsed: {
            ...s.freezesUsed,
            [dateKey]: [...(s.freezesUsed[dateKey] ?? []), String(moduleId)],
          },
        }));
        return true;
      },

      setFrozen: (moduleId, dateKey, on) =>
        set((s) => {
          const id = String(moduleId);
          const rest = (s.freezesUsed[dateKey] ?? []).filter((m) => m !== id);
          const freezesUsed = { ...s.freezesUsed, [dateKey]: on ? [...rest, id] : rest };
          if (!freezesUsed[dateKey].length) delete freezesUsed[dateKey];
          return { freezesUsed };
        }),

      isFrozen: (moduleId, dateKey) => {
        const f = get().freezesUsed[dateKey];
        return !!f && (f.includes('*') || f.includes(String(moduleId)));
      },

      maintainFreezes: () => {
        const state = get();
        const activeOn = (key: string) =>
          (state.dailyProgress[key]?.modules.some((m) => m.completed) ?? false) ||
          !!state.freezesUsed[key]?.length;

        // 1) CONSUME — cover recent missed days (walk back from yesterday,
        //    max a week: past that the streak is gone and burning tokens on
        //    ancient history would feel arbitrary).
        const frozenNow: string[] = [];
        let tokens = state.freezeTokens;
        for (let back = 1; back <= 7 && tokens > 0; back++) {
          const key = format(subDays(new Date(), back), 'yyyy-MM-dd');
          if (activeOn(key)) {
            if (state.dailyProgress[key]?.modules.some((m) => m.completed)) break;
            continue; // already frozen — keep walking to the last active day
          }
          // A missed, unprotected day directly behind an otherwise-live chain:
          // only spend a token if there IS a chain behind it worth saving.
          const dayBefore = format(subDays(new Date(), back + 1), 'yyyy-MM-dd');
          if (!activeOn(dayBefore)) break;
          tokens -= 1;
          frozenNow.push(key);
        }
        if (frozenNow.length > 0) {
          set((s) => {
            const freezesUsed = { ...s.freezesUsed };
            for (const key of frozenNow) {
              freezesUsed[key] = [...(freezesUsed[key] ?? []), '*'];
            }
            return { freezeTokens: tokens, freezesUsed };
          });
        }

        // 2) AWARD — every 7 consecutive active days earns a token (hold max
        //    3). `freezeAwardsGiven` tracks how many week-milestones of the
        //    CURRENT chain were already paid out, and steps back down when the
        //    chain resets so future weeks earn again.
        const after = get();
        let chain = 0;
        for (let back = 0; back < 3660; back++) {
          const key = format(subDays(new Date(), back), 'yyyy-MM-dd');
          if (after.dailyProgress[key]?.modules.some((m) => m.completed)) chain++;
          else if (back === 0 || after.freezesUsed[key]?.length) continue;
          else break;
        }
        const milestones = Math.floor(chain / 7);
        if (milestones > after.freezeAwardsGiven) {
          const grant = milestones - after.freezeAwardsGiven;
          set((s) => ({
            freezeTokens: Math.min(3, s.freezeTokens + grant),
            freezeAwardsGiven: milestones,
          }));
        } else if (milestones < after.freezeAwardsGiven) {
          set({ freezeAwardsGiven: milestones });
        }

        return frozenNow;
      },
    }),
    {
      name: 'myzikr:progress',
      storage: safeStorage,
    },
  ),
);

/** Days frozen for `moduleId` (its own freezes and whole-day `'*'` ones) — pass
 *  to computeStreakFromActiveDates so a recovered streak shows everywhere. */
export function frozenDays(
  moduleId: ModuleId | string,
  freezesUsed: Record<string, string[]> = useProgressStore.getState().freezesUsed,
): Set<string> {
  const id = String(moduleId);
  return new Set(Object.keys(freezesUsed).filter((k) => freezesUsed[k].includes('*') || freezesUsed[k].includes(id)));
}
