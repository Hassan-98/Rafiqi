import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DuaaLibraryState {
  favorites: string[];
  recentlyViewed: string[]; // capped at 20
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  markViewed: (id: string) => void;
}

export const useDuaaLibraryStore = create<DuaaLibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentlyViewed: [],

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),

      isFavorite: (id) => get().favorites.includes(id),

      markViewed: (id) =>
        set((s) => {
          const filtered = s.recentlyViewed.filter((x) => x !== id);
          return { recentlyViewed: [id, ...filtered].slice(0, 20) };
        }),
    }),
    { name: 'myzikr:duaa-library' },
  ),
);
