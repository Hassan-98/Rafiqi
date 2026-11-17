import { useMemo } from 'react';
import { create } from 'zustand';
import { BADGES, RARITY_RANK, badgePoints, badgeVisible, levelFor, type BadgeDefinition } from '@/data/badges';
import { useBadgeStore } from '@/store/badgeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { useRamadanStore } from '@/store/ramadanStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useQuranStore } from '@/store/quranStore';
import { useMushafiStore } from '@/store/mushafiStore';
import { quranTypeOf } from '@/data/quranTypes';
import { useMemorizationStore } from '@/store/memorizationStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import { useHouseStore } from '@/store/houseStore';
import { useAsmaProgressStore } from '@/store/asmaProgressStore';
import { useHadithStore } from '@/store/hadithStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { khatmaFinishedCount } from '@/store/khatmaModel';
import { toArabicDigits } from '@/services/statsService';
import { nightWindow, wirdPagesByDay, watchSlice } from '@/services/smartNotifications';
import {
  buildBadgeModel,
  computeBadgeMetrics,
  progressOf,
  type BadgeMetrics,
  type BadgeModel,
  type BadgeSnapshot,
} from '@/services/badgeMetrics';
import { toast } from '@/store/toastStore';
import { hapticsService } from './HapticsService';

export type { BadgeItem, BadgeModel, TrackItem, TodayCombo, ComboPart } from '@/services/badgeMetrics';

// ── snapshot ───────────────────────────────────────────────────────────────
/** nightKey|loggedAt → logged inside the night's last third? (prayer-time math, cached). */
const lastThirdCache = new Map<string, boolean>();

function inLastThird(nightKey: string, loggedAt: number): boolean {
  const id = `${nightKey}|${loggedAt}`;
  let hit = lastThirdCache.get(id);
  if (hit === undefined) {
    const w = nightWindow(nightKey);
    const h = new Date(loggedAt).getHours();
    // No location → the clock alone: 01:00–04:59.
    hit = w ? loggedAt >= w.lastThird.getTime() && h < 7 : h >= 1 && h < 5;
    lastThirdCache.set(id, hit);
  }
  return hit;
}

/** Everything the badge metrics read, as plain data. */
export function collectBadgeSnapshot(now = new Date()): BadgeSnapshot {
  const progress = useProgressStore.getState();
  const prayer = usePrayerLogStore.getState();
  const nights = useQiyamStore.getState().nights;
  const quran = useQuranStore.getState();
  const mushafi = useMushafiStore.getState();
  const listenIds = new Set(mushafi.khatmas.filter((k) => quranTypeOf(k.ty) === 'listen').map((k) => `m_${k.id}`));
  const hifz = useMemorizationStore.getState();
  const targets = useTargetsStore.getState();
  const ramadan = useRamadanStore.getState();
  return {
    now,
    gender: useSettingsStore.getState().gender,
    hijriOffset: useCalendarPrefs.getState().hijriOffset,
    dailyProgress: progress.dailyProgress,
    freezesUsed: progress.freezesUsed,
    prayerLog: prayer.log,
    excused: prayer.excused,
    duha: prayer.duha,
    qiyam: nights,
    lastThirdNights: Object.values(nights)
      .filter((n) => n.loggedAt && inLastThird(n.nightKey, n.loggedAt))
      .map((n) => n.nightKey),
    events: useActivityLogStore.getState().events,
    tasbihLifetime: useTasbihStore.getState().counters.reduce((s, c) => s + (c.totalLifetimeCount ?? 0), 0),
    wirdPages: wirdPagesByDay(),
    readingDays: quran.readingDays ?? {},
    // Listening khatmas run far faster — they count in their own track, not here.
    khatmasFinished: (quran.khatmas ?? [])
      .filter((k) => !listenIds.has(k.id))
      .reduce((n, k) => n + khatmaFinishedCount(k), 0),
    mushafi: { days: mushafi.days, khatmas: mushafi.khatmas, marks: mushafi.marks, tops: mushafi.tops },
    quranWirdDays: Object.keys(quran.wirdHistory ?? {}).filter((k) => {
      const e = quran.wirdHistory[k];
      return e.amount > 0 && e.achieved >= e.amount;
    }),
    hifzSessions: hifz.sessions,
    hifzItems: Object.values(hifz.items),
    awradHistory: targets.history,
    targets: targets.targets,
    ramadan: {
      year: ramadan.hijriYear,
      taraweeh: ramadan.taraweehNights,
      juz: new Set(Object.values(ramadan.juzCompletedByDate).flat()).size,
    },
    sadaqah: useSadaqahStore.getState().entries,
    circles: useStudyStore.getState().circles,
    tasks: useTasksStore.getState().tasks,
    house: useHouseStore.getState().entries,
    asmaStudied: useAsmaProgressStore.getState().studied.length,
    hadithFavorites: useHadithStore.getState().favorites.length,
  };
}

export const currentBadgeMetrics = (): BadgeMetrics => computeBadgeMetrics(collectBadgeSnapshot());

/** The latest metrics, published by startBadgeSync for every screen to share. */
export const useBadgeMetricsStore = create<{ metrics: BadgeMetrics | null }>(() => ({ metrics: null }));

export function useBadgeMetrics(): BadgeMetrics {
  const published = useBadgeMetricsStore((s) => s.metrics);
  // Before the first sync lands (boot), compute once locally.
  const fallback = useMemo(() => (published ? null : currentBadgeMetrics()), [published]);
  return (published ?? fallback)!;
}

/** The whole gallery model for this user (catalog × progress × unlocks). */
export function useBadgeModel(): BadgeModel {
  const metrics = useBadgeMetrics();
  const unlocked = useBadgeStore((s) => s.unlocked);
  const unlockedAt = useBadgeStore((s) => s.unlockedAt);
  const gender = useSettingsStore((s) => s.gender);
  return useMemo(() => buildBadgeModel(metrics, unlocked, unlockedAt, gender), [metrics, unlocked, unlockedAt, gender]);
}

/** Progress toward one badge: `{ current, target }` (null for unknown ids). */
export function badgeProgress(id: string, metrics: BadgeMetrics = currentBadgeMetrics()) {
  const x = BADGES.find((y) => y.id === id);
  return x ? progressOf(x, metrics) : null;
}

// ── celebration ────────────────────────────────────────────────────────────
export interface Celebration {
  /** Newly unlocked ids, rarest first. */
  ids: string[];
  /** The level just reached, when the batch raised it. */
  levelRank?: number;
}

/** Queue of unlock batches waiting for the in-app celebration (not persisted). */
export const useBadgeCelebrationStore = create<{ queue: Celebration[]; mounted: number }>(() => ({ queue: [], mounted: 0 }));

/**
 * Unlocks every badge the metrics now satisfy. Each batch is celebrated ONCE
 * — in the celebration sheet when it is mounted (components/reminders/
 * BadgeCelebration), else by toast. A bulk unlock (the first run after new
 * badges ship) arrives as a single batch, rarest badge first.
 */
export function evaluateBadges(metrics: BadgeMetrics = currentBadgeMetrics()): BadgeDefinition[] {
  const store = useBadgeStore.getState();
  const gender = useSettingsStore.getState().gender;
  const have = new Set(store.unlocked);
  const ready = BADGES.filter((x) => !have.has(x.id) && badgeVisible(x, gender) && progressOf(x, metrics).current >= x.target);
  if (!ready.length) return [];

  const levelBefore = levelFor(badgePoints(store.unlocked, gender)).level;
  const fresh = new Set(store.unlockMany(ready.map((x) => x.id)));
  const won = ready.filter((x) => fresh.has(x.id)).sort((a, c) => RARITY_RANK[c.rarity] - RARITY_RANK[a.rarity]);
  if (!won.length) return [];
  const levelAfter = levelFor(badgePoints(useBadgeStore.getState().unlocked, gender)).level;
  const levelRank = levelAfter.rank > levelBefore.rank ? levelAfter.rank : undefined;

  const cel = useBadgeCelebrationStore.getState();
  if (cel.mounted > 0) {
    useBadgeCelebrationStore.setState({ queue: [...cel.queue, { ids: won.map((x) => x.id), levelRank }] });
  } else {
    toast.success(won.length > 1 ? `${toArabicDigits(won.length)} أوسمة جديدة` : 'وسام جديد', won[0].titleAr);
    if (levelRank) toast.success(`ارتقيتَ إلى مستوى «${levelAfter.titleAr}»`, 'بارك الله في مداومتك');
  }
  void hapticsService.notify('success');
  return won;
}

let badgeSyncStarted = false;

/**
 * Recompute the metrics now and whenever a measured store changes (debounced
 * — the tasbih/activity stores change on every tap), publish them, then
 * unlock. Also refreshes on return to the app and every few minutes, so
 * «تحديات اليوم» roll over at midnight.
 */
export function startBadgeSync(debounceMs = 1200): () => void {
  if (badgeSyncStarted) return () => undefined;
  badgeSyncStarted = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sync = () => {
    try {
      const metrics = currentBadgeMetrics();
      useBadgeMetricsStore.setState({ metrics });
      evaluateBadges(metrics);
    } catch (e) {
      console.warn('[badges] evaluate failed', e);
    }
  };
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(sync, debounceMs);
  };
  const watch = <S, T>(store: Parameters<typeof watchSlice<S, T>>[0], pick: (s: S) => T) => watchSlice(store, pick, kick);
  // Data slices only: progressStore.computeStreak writes `streaks`, which must
  // not re-trigger this.
  const unsubs = [
    watch(useProgressStore, (s) => s.dailyProgress),
    watch(useProgressStore, (s) => s.freezesUsed),
    watch(useRamadanStore, (s) => s.taraweehNights),
    watch(useRamadanStore, (s) => s.juzCompletedByDate),
    watch(useQiyamStore, (s) => s.nights),
    watch(usePrayerLogStore, (s) => s.log),
    watch(usePrayerLogStore, (s) => s.duha),
    watch(usePrayerLogStore, (s) => s.excused),
    // Mosque badges open up once the user says they are male.
    watch(useSettingsStore, (s) => s.gender),
    watch(useTasbihStore, (s) => s.counters),
    watch(useActivityLogStore, (s) => s.events),
    watch(useTargetsStore, (s) => s.history),
    watch(useTargetsStore, (s) => s.targets),
    watch(useQuranStore, (s) => s.wirdHistory),
    watch(useQuranStore, (s) => s.readingDays),
    watch(useQuranStore, (s) => s.khatmas),
    // Every مصحفي pull (khatma types, ribbons, the reading log).
    watch(useMushafiStore, (s) => s.syncedAt),
    watch(useMemorizationStore, (s) => s.sessions),
    watch(useSadaqahStore, (s) => s.entries),
    watch(useStudyStore, (s) => s.circles),
    watch(useTasksStore, (s) => s.tasks),
    watch(useHouseStore, (s) => s.entries),
    watch(useAsmaProgressStore, (s) => s.studied),
    watch(useHadithStore, (s) => s.favorites),
    watch(useCalendarPrefs, (s) => s.hijriOffset),
  ];
  const onVisible = () => document.visibilityState === 'visible' && kick();
  document.addEventListener('visibilitychange', onVisible);
  const tick = setInterval(kick, 5 * 60_000);
  sync();
  return () => {
    unsubs.forEach((u) => u());
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(tick);
    if (timer) clearTimeout(timer);
    badgeSyncStarted = false;
  };
}
