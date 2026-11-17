import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { nextReview, type SrsFields } from '@/lib/hifz/srs';

/**
 * Hifz 2.0 data model.
 *
 * v2 stored a single per-surah resume bookmark. v3 adds the Tarteel-grade
 * memory of memorization:
 * - `sessions`   — a capped log of recitation sessions (mode, counts, accuracy,
 *                  per-word mistakes) powering the session summary + history.
 * - `mistakes`   — per-word lifetime mistake frequency (wordKey → record),
 *                  powering the historical-mistake heatmap and review lists.
 * - `items`      — per-surah SRS scheduling (interval/dueAt) powering the
 *                  "مراجعة اليوم" queue on the Hifz home.
 * Bookmarks are kept unchanged (explicit resume point per surah).
 *
 * Everything here is included in BackupService (key `memorization`) and cloud
 * sync (localStorage `myzikr:memorization`).
 */

export interface MemorizationBookmark {
  page: number;
  count: number;
  updatedAt: number;
}

export type HifzMistakeType = 'wrong' | 'skipped' | 'peek';

export interface HifzWordMistake {
  /** verseKey:position — e.g. "2:255:7". */
  wordKey: string;
  surah: number;
  type: HifzMistakeType;
  /** Display text (Uthmani) so review lists don't need a page fetch. */
  text: string;
}

export interface HifzMistakeStat {
  wordKey: string;
  surah: number;
  text: string;
  count: number;
  lastAt: number;
  lastType: HifzMistakeType;
}

export type HifzMode = 'follow' | 'test';

export interface HifzSessionRecord {
  id: string;
  surah: number;
  mode: HifzMode;
  startedAt: number;
  endedAt: number;
  pages: number[];
  correct: number;
  wrong: number;
  skipped: number;
  peek: number;
  extra: number;
  selfCorrected: number;
  /** correct / (correct + wrong + skipped + peek), 0..1. */
  accuracy: number;
  mistakes: HifzWordMistake[];
}

export interface HifzItem extends SrsFields {
  surah: number;
}

const MAX_SESSIONS = 100;
const MAX_MISTAKE_KEYS = 1500;
const MAX_SESSION_MISTAKES = 80;

interface MemorizationState {
  bookmarks: Record<number, MemorizationBookmark>;
  sessions: HifzSessionRecord[];
  mistakes: Record<string, HifzMistakeStat>;
  items: Record<number, HifzItem>;

  getBookmark: (surahId: number) => MemorizationBookmark | undefined;
  saveBookmark: (surahId: number, page: number, count: number) => void;
  clearBookmark: (surahId: number) => void;

  /** Persist a finished session: log + mistake stats + SRS reschedule. */
  recordSession: (record: Omit<HifzSessionRecord, 'id'>) => HifzSessionRecord;
  /** Surahs due for review (dueAt <= now), most overdue first. */
  dueItems: (now?: number) => HifzItem[];
  /** Lifetime mistake count within a surah (for heat badges). */
  surahMistakeCount: (surah: number) => number;
}

export const useMemorizationStore = create<MemorizationState>()(
  persist(
    (set, get) => ({
      bookmarks: {},
      sessions: [],
      mistakes: {},
      items: {},

      getBookmark: (surahId) => get().bookmarks[surahId],
      saveBookmark: (surahId, page, count) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            [surahId]: { page, count: Math.max(0, count), updatedAt: Date.now() },
          },
        })),
      clearBookmark: (surahId) =>
        set((s) => {
          const next = { ...s.bookmarks };
          delete next[surahId];
          return { bookmarks: next };
        }),

      recordSession: (record) => {
        const id = `hs_${record.endedAt}_${Math.floor(Math.random() * 1e6)}`;
        const full: HifzSessionRecord = {
          ...record,
          id,
          mistakes: record.mistakes.slice(0, MAX_SESSION_MISTAKES),
        };
        set((s) => {
          // 1) Session log (newest first, capped).
          const sessions = [full, ...s.sessions].slice(0, MAX_SESSIONS);

          // 2) Per-word lifetime mistake stats.
          const mistakes = { ...s.mistakes };
          for (const m of full.mistakes) {
            const prev = mistakes[m.wordKey];
            mistakes[m.wordKey] = {
              wordKey: m.wordKey,
              surah: m.surah,
              text: m.text,
              count: (prev?.count ?? 0) + 1,
              lastAt: full.endedAt,
              lastType: m.type,
            };
          }
          // Bound storage: drop the oldest entries when far over budget.
          const keys = Object.keys(mistakes);
          if (keys.length > MAX_MISTAKE_KEYS) {
            keys
              .sort((a, b) => mistakes[a].lastAt - mistakes[b].lastAt)
              .slice(0, keys.length - MAX_MISTAKE_KEYS)
              .forEach((k) => delete mistakes[k]);
          }

          // 3) SRS — only TEST sessions measure memory; follow-along doesn't.
          let items = s.items;
          if (full.mode === 'test') {
            const prev = s.items[full.surah];
            items = {
              ...s.items,
              [full.surah]: { surah: full.surah, ...nextReview(prev, full.accuracy, full.endedAt) },
            };
          }

          return { sessions, mistakes, items };
        });

        // Hifz counts toward the daily worship loop: credit the day so the
        // overall streak / freezes / Today cockpit see the session. (Hifz was
        // the only worship act invisible to the daily loop despite producing
        // the richest data in the app.) Lazy import — no store cycles.
        void import('@/store/progressStore').then(({ useProgressStore }) => {
          try {
            useProgressStore.getState().markModuleComplete('hifz');
          } catch {
            /* non-fatal */
          }
        });

        return full;
      },

      dueItems: (now = Date.now()) =>
        Object.values(get().items)
          .filter((i) => i.dueAt <= now)
          .sort((a, b) => a.dueAt - b.dueAt),

      surahMistakeCount: (surah) =>
        Object.values(get().mistakes).reduce((n, m) => n + (m.surah === surah ? m.count : 0), 0),
    }),
    {
      name: 'myzikr:memorization',
      version: 3,
      storage: safeStorage,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<MemorizationState>;
        if (version < 3) {
          // v2 → v3: keep bookmarks, seed the new collections empty. (Actions
          // are re-attached by zustand from the store creator — the persisted
          // slice is data-only, hence the cast.)
          return {
            bookmarks: state.bookmarks ?? {},
            sessions: [],
            mistakes: {},
            items: {},
          } as unknown as MemorizationState;
        }
        return state as MemorizationState;
      },
    },
  ),
);
