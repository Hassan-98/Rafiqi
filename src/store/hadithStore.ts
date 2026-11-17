import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Hadith {
  id: string;
  arabic: string;
  book: string;
  chapter?: string;
  number?: number;
  grade?: 'sahih' | 'hasan' | 'daif';
}

/** Stable id for records saved while the remote mapping was broken
 *  (every hadith got `bukhari_undefined`, so one favourite toggled all). */
function rekey(h: Hadith): Hadith {
  if (!h.id.endsWith('_undefined')) return h;
  let hash = 0;
  for (let i = 0; i < h.arabic.length; i++) hash = (hash * 31 + h.arabic.charCodeAt(i)) | 0;
  return { ...h, id: `bukhari_t${(hash >>> 0).toString(36)}`, book: 'صحيح البخاري' };
}

/**
 * Ids from the old remote Bukhari fetch (`bukhari_<hadithnumber>`) → the
 * bundled corpus id (`ara-bukhari_<hadithnumber>`, same numbering). The
 * text-hashed `bukhari_t…` legacy ids and the old `b1…b30` fallback ids stay
 * as they are: their stored record still renders, it just has no corpus twin.
 */
export const canonicalHadithId = (id: string): string => id.replace(/^bukhari_(\d+)$/, 'ara-bukhari_$1');

function canon(h: Hadith): Hadith {
  const id = canonicalHadithId(h.id);
  return id === h.id ? h : { ...h, id };
}

function dedupe(list: Hadith[]): Hadith[] {
  const seen = new Set<string>();
  return list.filter((h) => !seen.has(h.id) && !!seen.add(h.id));
}

interface HadithState {
  /** Cached hadith for the day, keyed by `yyyyMMdd`. */
  cache: Record<string, Hadith>;
  /** Favourite hadiths (full records, so legacy ones still render). */
  favorites: Hadith[];
  /** Favourite ayat by verse key ('2:255'). */
  ayahFavorites: string[];
  setCached: (dateKey: string, h: Hadith) => void;
  toggleFavorite: (h: Hadith) => void;
  isFavorite: (id: string) => boolean;
  toggleAyahFavorite: (key: string) => void;
  isAyahFavorite: (key: string) => boolean;
}

export const useHadithStore = create<HadithState>()(
  persist(
    (set, get) => ({
      cache: {},
      favorites: [],
      ayahFavorites: [],

      setCached: (dateKey, h) =>
        set((s) => ({ cache: { ...s.cache, [dateKey]: h } })),

      toggleFavorite: (h) =>
        set((s) => {
          const id = canonicalHadithId(h.id);
          // Cloud merge can bring back an old-format twin — drop both forms.
          const has = s.favorites.some((x) => canonicalHadithId(x.id) === id);
          return {
            favorites: has
              ? s.favorites.filter((x) => canonicalHadithId(x.id) !== id)
              : [...s.favorites, { ...h, id }],
          };
        }),

      isFavorite: (id) => {
        const c = canonicalHadithId(id);
        return get().favorites.some((x) => canonicalHadithId(x.id) === c);
      },

      toggleAyahFavorite: (key) =>
        set((s) => ({
          ayahFavorites: s.ayahFavorites.includes(key)
            ? s.ayahFavorites.filter((k) => k !== key)
            : [...s.ayahFavorites, key],
        })),

      isAyahFavorite: (key) => get().ayahFavorites.includes(key),
    }),
    {
      name: 'myzikr:hadith',
      version: 2,
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<Pick<HadithState, 'cache' | 'favorites' | 'ayahFavorites'>>;
        if (version < 1) {
          st.favorites = dedupe((st.favorites ?? []).map(rekey));
          st.cache = Object.fromEntries(Object.entries(st.cache ?? {}).map(([k, h]) => [k, rekey(h)]));
        }
        if (version < 2) {
          st.favorites = dedupe((st.favorites ?? []).map(canon));
          st.cache = Object.fromEntries(Object.entries(st.cache ?? {}).map(([k, h]) => [k, canon(h)]));
          st.ayahFavorites = st.ayahFavorites ?? [];
        }
        return st as HadithState;
      },
    },
  ),
);
