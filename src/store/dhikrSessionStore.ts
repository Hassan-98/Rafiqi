import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { safeStorage } from './safeStorage';

/**
 * Per-set adhkar reading progress, persisted so a user can leave the morning
 * (or any) set part-way and resume later the same day with every recited dhikr
 * still marked complete. Daily sets reset automatically on a new calendar day —
 * a stored session whose `dateKey` is not today is treated as empty.
 */

function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export interface DhikrSetProgress {
  /** itemId → times tapped this session. */
  counts: Record<string, number>;
  /** itemId → explicitly skipped. */
  skipped: Record<string, boolean>;
  /** Card the reader stopped on, so reopening resumes in place. */
  currentIndex: number;
  /** Calendar day this progress belongs to (yyyy-MM-dd). */
  dateKey: string;
}

/** Stable empty session — shared reference so memoised reads don't re-render. */
export const EMPTY_SESSION: DhikrSetProgress = Object.freeze({
  counts: {},
  skipped: {},
  currentIndex: 0,
  dateKey: '',
});

/** Today's session for a set, or the empty session if missing / from a past day. */
export function freshSession(raw: DhikrSetProgress | undefined): DhikrSetProgress {
  return raw && raw.dateKey === todayKey() ? raw : EMPTY_SESSION;
}

interface DhikrSessionState {
  sessions: Record<string, DhikrSetProgress>;
  increment: (setId: string, itemId: string) => void;
  setCount: (setId: string, itemId: string, value: number) => void;
  setSkipped: (setId: string, itemId: string, value: boolean) => void;
  setIndex: (setId: string, index: number) => void;
  reset: (setId: string) => void;
}

/** Roll a session forward to today, discarding a stale (previous-day) one. */
function current(sessions: Record<string, DhikrSetProgress>, setId: string): DhikrSetProgress {
  const raw = sessions[setId];
  return raw && raw.dateKey === todayKey()
    ? raw
    : { counts: {}, skipped: {}, currentIndex: 0, dateKey: todayKey() };
}

export const useDhikrSessionStore = create<DhikrSessionState>()(
  persist(
    (set) => ({
      sessions: {},

      increment: (setId, itemId) =>
        set((s) => {
          const cur = current(s.sessions, setId);
          return {
            sessions: {
              ...s.sessions,
              [setId]: { ...cur, counts: { ...cur.counts, [itemId]: (cur.counts[itemId] ?? 0) + 1 } },
            },
          };
        }),

      setCount: (setId, itemId, value) =>
        set((s) => {
          const cur = current(s.sessions, setId);
          return {
            sessions: {
              ...s.sessions,
              [setId]: { ...cur, counts: { ...cur.counts, [itemId]: Math.max(0, value) } },
            },
          };
        }),

      setSkipped: (setId, itemId, value) =>
        set((s) => {
          const cur = current(s.sessions, setId);
          return {
            sessions: {
              ...s.sessions,
              [setId]: { ...cur, skipped: { ...cur.skipped, [itemId]: value } },
            },
          };
        }),

      setIndex: (setId, index) =>
        set((s) => {
          const cur = current(s.sessions, setId);
          return { sessions: { ...s.sessions, [setId]: { ...cur, currentIndex: Math.max(0, index) } } };
        }),

      reset: (setId) =>
        set((s) => ({
          sessions: { ...s.sessions, [setId]: { counts: {}, skipped: {}, currentIndex: 0, dateKey: todayKey() } },
        })),
    }),
    { name: 'myzikr:dhikr-sessions', storage: safeStorage },
  ),
);
