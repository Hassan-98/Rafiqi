import { useMemo } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useProgressStore } from '@/store/progressStore';
import { useMushafiStore } from '@/store/mushafiStore';
import { useQuranStore } from '@/store/quranStore';
import { useProgramsStore } from '@/store/programsStore';
import { evaluateRun, stampsFor, type ProgramSources } from '@/store/programsModel';
import { duhaRakaatOf } from '@/store/prayerLogStore';
import { prayerTimeService } from '@/services/PrayerTimeService';
import type { DayTimes } from '@/services/dayAttention';
import type { PrayerName } from '@/types';

/**
 * «برامج التدرّج» ↔ the worship stores: what verification reads, and the
 * one-tap check-ins that write the REAL record (the qiyam night, الضحى, the
 * prayer flags, the fast) so stats, badges and the board see the same deed.
 */

export function readProgramSources(): ProgramSources {
  const p = usePrayerLogStore.getState();
  return {
    gender: useSettingsStore.getState().gender,
    prayerLog: p.log,
    excused: p.excused,
    duha: p.duha,
    qiyam: useQiyamStore.getState().nights,
    events: useActivityLogStore.getState().events,
    dailyProgress: useProgressStore.getState().dailyProgress,
    mushafi: { days: useMushafiStore.getState().days },
    readingDays: useQuranStore.getState().readingDays,
  };
}

export function useProgramSources(): ProgramSources {
  const gender = useSettingsStore((s) => s.gender);
  const prayerLog = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const qiyam = useQiyamStore((s) => s.nights);
  const events = useActivityLogStore((s) => s.events);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const mushafiDays = useMushafiStore((s) => s.days);
  const readingDays = useQuranStore((s) => s.readingDays);
  return useMemo(
    () => ({ gender, prayerLog, excused, duha, qiyam, events, dailyProgress, mushafi: { days: mushafiDays }, readingDays }),
    [gender, prayerLog, excused, duha, qiyam, events, dailyProgress, mushafiDays, readingDays],
  );
}

/** Today's prayer times (null without a location). */
export function prayerTimesFor(day: Date): DayTimes | null {
  const { coords, prayerMethod, madhabSchool } = useSettingsStore.getState();
  if (!coords) return null;
  try {
    return prayerTimeService.getTimes(coords, day, prayerMethod, madhabSchool);
  } catch {
    return null;
  }
}

// ── one-tap check-ins into the real records ─────────────────────────────────

export function setPrayerFlag(key: string, prayer: PrayerName, type: 'mosque' | 'onTime' | 'sunnahBefore' | 'sunnahAfter', on: boolean): void {
  usePrayerLogStore.getState().setPrayer(key, prayer, type, on);
}

/** A night of `units` (rakaat + the witr as one), never lowering what is logged. */
export function logQiyamUnits(nightKey: string, units: number): void {
  const prev = useQiyamStore.getState().nights[nightKey];
  useQiyamStore.getState().logNight({
    nightKey,
    rakaat: Math.max(prev?.rakaat ?? 0, units % 2 ? units - 1 : units),
    witr: units % 2 === 1 || !!prev?.witr,
    minutes: prev?.minutes,
  });
}

export function logDuha(key: string, rakaat: number): void {
  const prev = duhaRakaatOf(usePrayerLogStore.getState().duha[key]);
  usePrayerLogStore.getState().setDuha(key, true, Math.max(prev, rakaat));
}

export function logFast(key: string): void {
  useProgressStore.getState().markModuleComplete('fasting', 1, key);
}

/**
 * Stamp closed days verified by the stores (so a pruned activity log or a
 * record on another device can't undo them) and close finished runs.
 * Idempotent; called by the page and by every reminder sync.
 */
export function reconcilePrograms(now = new Date()): void {
  const src = readProgramSources();
  const st = useProgramsStore.getState();
  for (const run of st.runs) {
    if (run.status !== 'active') continue;
    const seen = stampsFor(run, src, now);
    if (Object.keys(seen).length) st.stamp(run.id, seen);
    const ev = evaluateRun(run, src, now);
    if (ev.finishedOn) st.finish(run.id, ev.finishedOn);
  }
}
