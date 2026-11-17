import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import type { QuranBookmark } from '@/types';

/** A page-level bookmark (saves a whole Mushaf page, not a single verse). */
export interface PageBookmark {
  id: string;
  pageNumber: number;
  note?: string;
  /** Colour tag (same set as verse bookmarks). Older saves lack it → gold. */
  color?: QuranBookmark['color'];
  createdAt: string;
}

export type BookmarkPatch = Partial<Pick<QuranBookmark, 'note' | 'color'>>;

interface BookmarksState {
  bookmarks: QuranBookmark[];
  pageBookmarks: PageBookmark[];

  // Verse bookmarks
  addBookmark: (verseKey: string, note?: string, color?: QuranBookmark['color']) => QuranBookmark;
  removeBookmark: (id: string) => void;
  updateNote: (id: string, note: string) => void;
  updateBookmark: (id: string, patch: BookmarkPatch) => void;
  isBookmarked: (verseKey: string) => boolean;
  findByVerse: (verseKey: string) => QuranBookmark | undefined;

  // Page bookmarks
  addPageBookmark: (pageNumber: number, note?: string) => PageBookmark;
  removePageBookmark: (id: string) => void;
  isPageBookmarked: (pageNumber: number) => boolean;
  findPageBookmark: (pageNumber: number) => PageBookmark | undefined;
  togglePageBookmark: (pageNumber: number) => boolean; // returns the new state (true = bookmarked)
  updatePageBookmark: (id: string, patch: BookmarkPatch) => void;
}

let counter = 0;
function generateId(prefix: 'bm' | 'pbm' = 'bm'): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      pageBookmarks: [],

      addBookmark: (verseKey, note, color = 'gold') => {
        const [s, a] = verseKey.split(':').map((n) => Number(n));
        const entry: QuranBookmark = {
          id: generateId('bm'),
          verseKey,
          surahNumber: s,
          ayahNumber: a,
          note,
          color,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ bookmarks: [...state.bookmarks, entry] }));
        return entry;
      },

      removeBookmark: (id) =>
        set((state) => ({ bookmarks: state.bookmarks.filter((b) => b.id !== id) })),

      updateNote: (id, note) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, note } : b)),
        })),

      updateBookmark: (id, patch) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),

      isBookmarked: (verseKey) => !!get().bookmarks.find((b) => b.verseKey === verseKey),
      findByVerse: (verseKey) => get().bookmarks.find((b) => b.verseKey === verseKey),

      addPageBookmark: (pageNumber, note) => {
        const entry: PageBookmark = {
          id: generateId('pbm'),
          pageNumber,
          note,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ pageBookmarks: [...state.pageBookmarks, entry] }));
        return entry;
      },

      removePageBookmark: (id) =>
        set((state) => ({ pageBookmarks: state.pageBookmarks.filter((b) => b.id !== id) })),

      isPageBookmarked: (pageNumber) =>
        !!get().pageBookmarks.find((b) => b.pageNumber === pageNumber),

      findPageBookmark: (pageNumber) =>
        get().pageBookmarks.find((b) => b.pageNumber === pageNumber),

      togglePageBookmark: (pageNumber) => {
        const existing = get().findPageBookmark(pageNumber);
        if (existing) {
          get().removePageBookmark(existing.id);
          return false;
        }
        get().addPageBookmark(pageNumber);
        return true;
      },

      updatePageBookmark: (id, patch) =>
        set((state) => ({
          pageBookmarks: state.pageBookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
    }),
    { name: 'myzikr:bookmarks', storage: safeStorage },
  ),
);
