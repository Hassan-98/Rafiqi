import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { MINDFUL_DEFAULTS, type MindfulData } from '@/services/mindful';

/** «تذكرة الإتقان» ledger (always on — no user setting). Device-local (NON_SYNCABLE): how often THIS screen interrupted. */
export const useMindfulStore = create<MindfulData>()(
  persist(() => ({ ...MINDFUL_DEFAULTS }), {
    name: 'myzikr:mindful',
    storage: safeStorage,
    // Owner 2026-11-17: on for everyone, not a setting — only the ledger (what was shown when) is kept.
    merge: (saved, current) => ({
      ...current,
      ...(saved as Partial<MindfulData>),
      enabled: true,
      openEvery: MINDFUL_DEFAULTS.openEvery,
      inSections: true,
    }),
  }),
);
