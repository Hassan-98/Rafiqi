import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

export type InspirationInterval = 'h2' | 'h3' | 'h6' | 'twice' | 'daily';
export type InspirationMix = 'both' | 'ayat' | 'hadith';

/** «آية وحديث» notification settings (see services/inspirationReminders.ts). */
export interface InspirationSettings {
  enabled: boolean;
  interval: InspirationInterval;
  /** HH:mm — used by 'daily' only. */
  dailyTime: string;
  /** HH:mm active window for the interval modes. */
  windowStart: string;
  windowEnd: string;
  mix: InspirationMix;
  /** Prefer occasion-appropriate content on special days / Fridays. */
  dayAware: boolean;
}

export const INSPIRATION_DEFAULTS: InspirationSettings = {
  enabled: false,
  interval: 'h3',
  dailyTime: '09:00',
  windowStart: '08:00',
  windowEnd: '22:00',
  mix: 'both',
  dayAware: true,
};

interface InspirationState {
  settings: InspirationSettings;
  setSettings: (patch: Partial<InspirationSettings>) => void;
}

export const useInspirationStore = create<InspirationState>()(
  persist(
    (set) => ({
      settings: INSPIRATION_DEFAULTS,
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'myzikr:inspiration',
      version: 1,
      storage: safeStorage,
      // Fields added later get their defaults on data persisted by older builds.
      merge: (persisted, current) => ({
        ...current,
        settings: { ...INSPIRATION_DEFAULTS, ...((persisted as Partial<InspirationState>)?.settings ?? {}) },
      }),
    },
  ),
);
