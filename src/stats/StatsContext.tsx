import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  resolvePeriodRange,
  stepRange,
  canStepNext,
  type DateRange,
  type StatsPeriod,
} from '@/services/statsService';

interface StatsRangeContextValue {
  period: StatsPeriod;
  range: DateRange;
  setPeriod: (p: StatsPeriod) => void;
  step: (dir: -1 | 1) => void;
  canStepNext: boolean;
  /** Reset the anchor back to today. */
  reset: () => void;
}

const StatsRangeContext = createContext<StatsRangeContextValue | null>(null);

/**
 * Shared period + date-range state for the entire statistics section. The
 * landing's `PeriodSelector` writes to it and every card + sub-page reads it,
 * so changing "month" → "week" or stepping to last month updates everything
 * at once without prop drilling.
 *
 * Stepping the anchor preserves the chosen period; switching the period keeps
 * the current anchor (so "this month" → "this week" stays in the same month).
 */
export function StatsProvider({ children }: { children: ReactNode }) {
  // Short-term first: the week view answers "كيف كان أداؤك مؤخراً؟" — month
  // and year stay one tap away. Today's snapshot lives ABOVE the selector on
  // every sub-page (StatsSubPage `today` slot), independent of the period.
  const [period, setPeriodState] = useState<StatsPeriod>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const range = useMemo(() => resolvePeriodRange(period, anchor), [period, anchor]);

  const value = useMemo<StatsRangeContextValue>(
    () => ({
      period,
      range,
      setPeriod: (p) => setPeriodState(p),
      step: (dir) => setAnchor((a) => stepRange(resolvePeriodRange(period, a), dir).anchor),
      canStepNext: canStepNext(range),
      reset: () => setAnchor(new Date()),
    }),
    [period, range],
  );

  return <StatsRangeContext.Provider value={value}>{children}</StatsRangeContext.Provider>;
}

/**
 * A static, read-only month range used when `useStatsRange` is called with no
 * provider ancestor. This guarantees the hook NEVER throws (a missing
 * provider would otherwise white-screen the whole route). The setters are
 * no-ops; in practice every stats route is wrapped by `StatsProvider`.
 */
const FALLBACK: StatsRangeContextValue = {
  period: 'month',
  range: resolvePeriodRange('month', new Date()),
  setPeriod: () => undefined,
  step: () => undefined,
  canStepNext: false,
  reset: () => undefined,
};

/**
 * Access the shared stats range. Returns a safe fallback (rather than
 * throwing) when used outside a provider, so a mis-wired tree degrades
 * gracefully instead of crashing the route.
 */
export function useStatsRange(): StatsRangeContextValue {
  return useContext(StatsRangeContext) ?? FALLBACK;
}
