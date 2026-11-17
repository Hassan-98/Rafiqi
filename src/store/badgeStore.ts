import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** At most this many badges shown on the «أنا» profile. */
export const MAX_FEATURED = 3;

interface BadgeState {
  unlocked: string[]; // badge ids
  unlockedAt: Record<string, string>; // id → ISO timestamp
  /** Badges the user pinned to their profile (newest last). */
  featured: string[];
  /** ISO time the gallery was last opened — later unlocks are «جديد». */
  seenAt: string | null;
  unlock: (id: string) => boolean; // returns true if newly unlocked
  /** One write for a batch (first run after new badges ship can unlock dozens). */
  unlockMany: (ids: string[]) => string[];
  isUnlocked: (id: string) => boolean;
  toggleFeatured: (id: string) => void;
  markSeen: () => void;
}

export const useBadgeStore = create<BadgeState>()(
  persist(
    (set, get) => ({
      unlocked: [],
      unlockedAt: {},
      featured: [],
      seenAt: null,

      unlock: (id) => get().unlockMany([id]).length > 0,

      unlockMany: (ids) => {
        const have = new Set(get().unlocked);
        const fresh = [...new Set(ids)].filter((id) => !have.has(id));
        if (!fresh.length) return [];
        const at = new Date().toISOString();
        set((s) => ({
          unlocked: [...s.unlocked, ...fresh],
          unlockedAt: { ...s.unlockedAt, ...Object.fromEntries(fresh.map((id) => [id, at])) },
        }));
        return fresh;
      },

      isUnlocked: (id) => get().unlocked.includes(id),

      toggleFeatured: (id) =>
        set((s) => ({
          featured: s.featured.includes(id)
            ? s.featured.filter((x) => x !== id)
            : [...s.featured, id].slice(-MAX_FEATURED),
        })),

      markSeen: () => set({ seenAt: new Date().toISOString() }),
    }),
    { name: 'myzikr:badges' },
  ),
);

/** Unlocks since the gallery was last opened. */
export const unseenBadgeCount = (s: Pick<BadgeState, 'unlockedAt' | 'seenAt'>): number =>
  Object.values(s.unlockedAt).filter((at) => !s.seenAt || at > s.seenAt).length;
