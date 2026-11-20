import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import type { ArmedNudge, Outcome } from '@/services/engagement';

/**
 * «رفيقك اليومي» fatigue ledger (services/engagement.ts): what was armed, and
 * whether each delivered nudge was acted on. Device-local — it describes the
 * notifications of THIS phone (NON_SYNCABLE in cloudSyncService).
 */
interface EngagementState {
  armed: Record<string, ArmedNudge>;
  /** topic → recent outcomes, newest last. */
  outcomes: Record<string, Outcome[]>;
  /** Labels of source topics («خفّفتُ تذكير <label>»). */
  labels: Record<string, string>;
  commit: (armed: Record<string, ArmedNudge>, outcomes: Record<string, Outcome[]>, labels: Record<string, string>) => void;
  /** «إعادته»: forget the ignored run, so the topic is back to normal. */
  restore: (topic: string) => void;
}

export const useEngagementStore = create<EngagementState>()(
  persist(
    (set) => ({
      armed: {},
      outcomes: {},
      labels: {},
      commit: (armed, outcomes, labels) => set((s) => ({ armed, outcomes, labels: { ...s.labels, ...labels } })),
      restore: (topic) =>
        set((s) => {
          const outcomes = { ...s.outcomes };
          delete outcomes[topic];
          return { outcomes };
        }),
    }),
    { name: 'myzikr:engagement', storage: safeStorage },
  ),
);
