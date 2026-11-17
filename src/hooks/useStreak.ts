import { useMemo } from 'react';
import { useProgressStore } from '@/store/progressStore';
import type { ModuleId, StreakData } from '@/types';

export interface UseStreakResult {
  currentStreak: number;
  longestStreak: number;
  completionRate: number; // last 30 days average
  lastCompletedDate: string | null;
  streak: StreakData;
}

export function useStreak(moduleId: ModuleId | string): UseStreakResult {
  const computeStreak = useProgressStore((s) => s.computeStreak);
  const getLast30Days = useProgressStore((s) => s.getLast30Days);

  const streak = useMemo(() => computeStreak(moduleId), [computeStreak, moduleId]);

  const completionRate = useMemo(() => {
    const days = getLast30Days();
    if (days.length === 0) return 0;
    const total = days.reduce((sum, d) => {
      const mod = d.modules.find((m) => m.moduleId === moduleId);
      return sum + (mod?.completionRate ?? 0);
    }, 0);
    return total / days.length;
  }, [getLast30Days, moduleId]);

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    completionRate,
    lastCompletedDate: streak.lastCompletedDate,
    streak,
  };
}

/** Overall streak across ALL modules */
export function useOverallStreak(): { consistencyScore: number; message: string } {
  const getLast30Days = useProgressStore((s) => s.getLast30Days);

  const consistencyScore = useMemo(() => {
    const days = getLast30Days();
    if (days.length === 0) return 0;
    const total = days.reduce((sum, d) => sum + d.overallRate, 0);
    return Math.round((total / days.length) * 100);
  }, [getLast30Days]);

  const message = useMemo(() => {
    if (consistencyScore >= 100) return 'stats_motivational_100';
    if (consistencyScore >= 80) return 'stats_motivational_80';
    if (consistencyScore >= 60) return 'stats_motivational_60';
    if (consistencyScore >= 40) return 'stats_motivational_40';
    return 'stats_motivational_0';
  }, [consistencyScore]);

  return { consistencyScore, message };
}
