import { STORAGE_NAMESPACE } from './StorageService';

/**
 * Bounds the on-device Quran API response cache.
 *
 * QuranApiService caches each page's verses + words in localStorage. During a
 * long reading session (with ±2 page prefetch) this grows without limit and
 * eventually fills the browser's ~5 MB localStorage quota — at which point the
 * NEXT `setItem` throws QuotaExceededError and breaks unrelated persisted
 * stores (the user-visible "Setting the value of 'myzikr:quran' exceeded the
 * quota"). Keeping the cache under a hard budget prevents that entirely.
 *
 * IMPORTANT: the prefix has a trailing underscore so it targets the API cache
 * keys (`myzikr:quran_v5_page…`, `…_tafsir_…`, `…_audio_…`) and NEVER the
 * zustand store key `myzikr:quran` (no underscore).
 */
const CACHE_PREFIX = `${STORAGE_NAMESPACE}quran_`;

/** Max bytes of Quran API cache to retain. Leaves headroom under the ~5 MB cap. */
export const QURAN_CACHE_BUDGET_BYTES = 3_000_000;

interface CacheKeyInfo {
  key: string;
  ts: number;
  size: number;
}

function listCacheEntries(): CacheKeyInfo[] {
  const out: CacheKeyInfo[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CACHE_PREFIX)) continue;
      const raw = localStorage.getItem(key) ?? '';
      let ts = 0;
      try {
        ts = (JSON.parse(raw) as { timestamp?: number }).timestamp ?? 0;
      } catch {
        /* non-CacheEntry value — treat as oldest so it's evicted first */
      }
      out.push({ key, ts, size: key.length + raw.length });
    }
  } catch {
    /* localStorage unavailable */
  }
  return out;
}

export function quranCacheBytes(): number {
  return listCacheEntries().reduce((sum, e) => sum + e.size, 0);
}

/**
 * Evict oldest Quran cache entries until the cache is under budget AND at least
 * `needBytes` have been freed. Safe to call anytime; only touches cache keys.
 */
export function evictQuranCache(needBytes = 0): void {
  const entries = listCacheEntries().sort((a, b) => a.ts - b.ts); // oldest first
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  let freed = 0;
  for (const e of entries) {
    if (total <= QURAN_CACHE_BUDGET_BYTES && freed >= needBytes) break;
    try {
      localStorage.removeItem(e.key);
    } catch {
      /* ignore */
    }
    total -= e.size;
    freed += e.size;
  }
}

/** Trim the cache down to its budget. Call at startup to recover stuck users. */
export function pruneQuranCache(): void {
  try {
    if (quranCacheBytes() > QURAN_CACHE_BUDGET_BYTES) evictQuranCache(0);
  } catch {
    /* ignore */
  }
}
