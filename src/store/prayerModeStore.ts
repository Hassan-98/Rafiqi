import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { DEFAULT_PRAYER_MODE, type PrayerModeConfig } from '@/services/prayerModePlan';
import type { PrayerName } from '@/types';

/**
 * «وضع الصلاة» settings. Device-local (the silencing happens on THIS phone),
 * so 'myzikr:prayerMode' is in cloudSyncService's NON_SYNCABLE.
 */
interface PrayerModeState extends PrayerModeConfig {
  set: (patch: Partial<PrayerModeConfig>) => void;
  setPrayer: (p: PrayerName, patch: Partial<PrayerModeConfig['prayers'][PrayerName]>) => void;
  setJumuah: (patch: Partial<PrayerModeConfig['jumuah']>) => void;
}

export const usePrayerModeStore = create<PrayerModeState>()(
  persist(
    (set) => ({
      ...DEFAULT_PRAYER_MODE,
      set: (patch) => set(patch),
      setPrayer: (p, patch) => set((s) => ({ prayers: { ...s.prayers, [p]: { ...s.prayers[p], ...patch } } })),
      setJumuah: (patch) => set((s) => ({ jumuah: { ...s.jumuah, ...patch } })),
    }),
    { name: 'myzikr:prayerMode', storage: safeStorage },
  ),
);
