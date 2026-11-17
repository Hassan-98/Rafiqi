import type { ReactNode } from 'react';
import { motion } from '@/lib/motion';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { PeriodSelector } from './PeriodSelector';

interface StatsSubPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Hide the period selector for pages that are inherently lifetime-only. */
  showPeriod?: boolean;
  /**
   * Domain-specific TODAY snapshot, rendered ABOVE the period selector —
   * today's numbers always come first and never depend on the chosen range.
   */
  today?: ReactNode;
  /** Lifetime blocks (insights, streaks) shown between today and the period selector. */
  lead?: ReactNode;
}

/**
 * Standard shell for every stats deep-dive sub-page: back-enabled TopAppBar,
 * today's snapshot, the always-true "lead" (insights + streaks), then a sticky
 * PeriodSelector and the period-bound analytics.
 *
 * NOTE: the `StatsProvider` is supplied at the ROUTE level (App.tsx), not
 * here — each sub-page calls `useStatsRange()` in the component that renders
 * StatsSubPage, so the provider must sit above it.
 */
export function StatsSubPage({ title, subtitle, children, showPeriod = true, today, lead }: StatsSubPageProps) {
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <div className="lg:max-w-3xl lg:mx-auto">
        <TopAppBar title={title} subtitle={subtitle} showBack />
        <div className="px-4 pb-28">
          {today || lead ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="pt-3 pb-2 flex flex-col gap-5"
            >
              {today}
              {lead}
            </motion.div>
          ) : null}
          {showPeriod ? <PeriodSelector /> : null}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-5 pt-4"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
