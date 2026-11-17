import { useMemo } from 'react';
import { useProgressStore } from '@/store/progressStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useQuranStore } from '@/store/quranStore';
import { featuredKhatma } from '@/store/khatmaModel';
import { useTargetsStore } from '@/store/targetsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import {
  computeInsights,
  computeRecords,
  type Insight,
  type InsightDomain,
  type InsightsSnapshot,
  type PersonalRecord,
} from '@/services/insightsEngine';

/**
 * INSIGHTS ENGINE — the one place that turns raw worship records into
 * human, motivating facts ("أطول سلسلة قيام: ١٢ ليلة", "هذا الأسبوع أفضل من
 * الماضي بـ٣ أيام", "باقي يومان على وسام ٧ ليالٍ").
 *
 * Consumers (all read the SAME output, so the app speaks with one voice):
 *  - stats pages          → <SectionInsights domain=…/> + landing highlights
 *  - Home «إنجازاتك»      → useInsights() top items
 *  - smart notifications  → computeInsights(collectSnapshot()) at schedule time
 *  - badges / celebrations → milestone insights
 *
 * CONTRACT (stable — extend, don't break):
 *  - computeInsights(snapshot, now) is PURE (no hooks, no storage). It lives
 *    in insightsEngine.ts (store-free, unit-checked by scripts/insights.test.ts)
 *    and is re-exported here.
 *  - collectSnapshot() reads every store via getState() (non-React callers).
 *  - useInsights(domain?) is the React hook (re-computes on store change).
 *  - Insight.id is STABLE per fact (e.g. 'qiyam.streak'); milestone ids carry
 *    the milestone ('tasbih.lifetime.reached-10000') so callers can remember
 *    what was already celebrated / notified.
 *  - All numbers in title/body/value are Arabic-Indic.
 *
 * Insight catalogue (id → fact):
 *  overall.* streak/streak-at-risk/milestone-near/week-vs-last/days.reached-N|near-N/month-record/welcome
 *  prayers.* streak…/today-complete/today-remaining/week-vs-last/weakest/fajr-streak/sunnah-week/witr/fajr-early
 *  dhikr.*   streak…/morning-streak/evening-streak/morning-pending/evening-pending/reps-week/record-day/most-recited
 *  tasbih.*  lifetime.reached-N|near-N/total (domain 'dhikr')
 *  quran.*   streak…/wird-done/wird-remaining/week-vs-last/pages-month/pages.reached-N|near-N/khatma
 *  awrad.*   target-streak/all-done/pending/rate/streak…/extra
 *  qiyam.*   streak…/month/record-rakaat/month-record/witr-rate/weekday/week-vs-last/rakaat.reached-N|near-N
 *  habits.*  streak/all-done/pending/best
 *  fasting.* streak/milestone-near/month/days.reached-N|near-N/white-days/sunnah-tomorrow
 *  sadaqah.* month/gap/weeks
 */

export type {
  Insight,
  InsightDomain,
  InsightKind,
  InsightTone,
  InsightsSnapshot,
  PersonalRecord,
} from '@/services/insightsEngine';
export { computeInsights, computeRecords, arCount, parseDateKey } from '@/services/insightsEngine';

export function collectSnapshot(): InsightsSnapshot {
  const log = usePrayerLogStore.getState().log;
  const prayerFardDays: Record<string, number> = {};
  for (const [k, day] of Object.entries(log)) {
    prayerFardDays[k] = Object.values(day ?? {}).filter((p) => p?.fard).length;
  }
  const quran = useQuranStore.getState();
  const targets = useTargetsStore.getState();
  return {
    dailyProgress: useProgressStore.getState().dailyProgress,
    freezesUsed: useProgressStore.getState().freezesUsed,
    prayerFardDays,
    qiyamNights: useQiyamStore.getState().nights,
    prayerLog: log,
    activity: useActivityLogStore.getState().events,
    tasbih: useTasbihStore.getState().counters.map((c) => ({ id: c.id, name: c.name, total: c.totalLifetimeCount })),
    wirdHistory: quran.wirdHistory,
    khatma: featuredKhatma(quran.khatmas ?? [], quran.activeKhatmaId),
    targets: targets.targets,
    targetHistory: targets.history,
    habits: useSettingsStore.getState().customHabits.map((h) => ({ id: h.id, nameAr: h.nameAr })),
    sadaqah: useSadaqahStore.getState().entries,
    duha: usePrayerLogStore.getState().duha,
    excused: usePrayerLogStore.getState().excused,
  };
}

/**
 * Memo for the React hooks: many components (strip + list + landing) mount at
 * once and every store write (a tasbih tap) re-renders them; the engine only
 * re-runs when a source slice or the clock hour actually changed.
 */
let cache: { deps: unknown[]; insights: Insight[]; records: PersonalRecord[] } | null = null;
function cached(deps: unknown[]): { insights: Insight[]; records: PersonalRecord[] } {
  if (cache && cache.deps.length === deps.length && cache.deps.every((d, i) => d === deps[i])) return cache;
  const snap = collectSnapshot();
  const now = new Date();
  cache = { deps, insights: computeInsights(snap, now), records: computeRecords(snap, now) };
  return cache;
}

function useEngineDeps(): unknown[] {
  const deps: unknown[] = [
    useProgressStore((s) => s.dailyProgress),
    usePrayerLogStore((s) => s.log),
    useQiyamStore((s) => s.nights),
    useActivityLogStore((s) => s.events),
    useTasbihStore((s) => s.counters),
    useQuranStore((s) => s.wirdHistory),
    useQuranStore((s) => s.khatmas),
    useQuranStore((s) => s.activeKhatmaId),
    useTargetsStore((s) => s.targets),
    useTargetsStore((s) => s.history),
    useSettingsStore((s) => s.customHabits),
    useSadaqahStore((s) => s.entries),
  ];
  // Hour bucket: time-of-day nudges (أذكار الصباح بانتظارك…) change hourly.
  const d = new Date();
  deps.push(`${d.toDateString()}-${d.getHours()}`);
  return deps;
}

/** React hook: insights for a domain (or all), recomputed on store changes. */
export function useInsights(domain?: InsightDomain, limit = 6): Insight[] {
  const deps = useEngineDeps();
  const { insights } = cached(deps);
  return useMemo(
    () => (domain ? insights.filter((i) => i.domain === domain) : insights).slice(0, limit),
    [insights, domain, limit],
  );
}

/** React hook: all-time personal records (optionally one domain). */
export function useRecords(domain?: InsightDomain): PersonalRecord[] {
  const deps = useEngineDeps();
  const { records } = cached(deps);
  return useMemo(() => (domain ? records.filter((r) => r.domain === domain) : records), [records, domain]);
}
