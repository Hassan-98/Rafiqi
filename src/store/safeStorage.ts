import { createJSONStorage } from 'zustand/middleware';
import { evictQuranCache } from '@/services/quranCacheEvict';

/**
 * A localStorage-backed zustand persist storage that survives a full disk.
 *
 * zustand's default storage lets a QuotaExceededError propagate, which surfaces
 * as an uncaught runtime error (e.g. "Setting the value of 'myzikr:quran'
 * exceeded the quota"). This wrapper catches that, frees space by trimming the
 * large Quran API response cache (synchronously), retries once, and otherwise
 * drops the write rather than crashing.
 *
 * The serialization + keys are identical to zustand's default
 * (`createJSONStorage(() => localStorage)`), so switching an existing store to
 * this storage keeps its persisted data fully compatible — no migration needed.
 */
export const safeStorage = createJSONStorage(() => ({
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Reclaim space from the (bounded but possibly full) Quran cache, retry once.
      try {
        evictQuranCache(value.length * 2);
        localStorage.setItem(name, value);
      } catch {
        // Give up silently — better than an uncaught QuotaExceededError.
      }
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
}));
