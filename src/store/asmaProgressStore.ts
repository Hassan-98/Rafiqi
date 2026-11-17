import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AsmaProgressState {
  studied: number[]; // indices of names the user opened
  favorites: number[];
  markStudied: (index: number) => void;
  toggleFavorite: (index: number) => void;
  isFavorite: (index: number) => boolean;
}

export const useAsmaProgressStore = create<AsmaProgressState>()(
  persist(
    (set, get) => ({
      studied: [],
      favorites: [],

      markStudied: (index) =>
        set((s) => (s.studied.includes(index) ? s : { studied: [...s.studied, index] })),

      toggleFavorite: (index) =>
        set((s) => ({
          favorites: s.favorites.includes(index)
            ? s.favorites.filter((i) => i !== index)
            : [...s.favorites, index],
        })),

      isFavorite: (index) => get().favorites.includes(index),
    }),
    { name: 'myzikr:asma' },
  ),
);
