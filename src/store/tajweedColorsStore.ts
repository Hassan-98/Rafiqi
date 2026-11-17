import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { TAJWEED_GROUPS, type TajweedColor } from '@/data/tajweedPalette';

/**
 * User-customised tajweed colours, per reader-theme brightness. Only the
 * groups the user changed are stored; everything else falls back to the
 * font's own palette (src/data/tajweedPalette.ts). Applied to the Mushaf
 * (font-palette override-colors), text mode and the legend by
 * services/tajweedColorOverrides.ts.
 */
export type TajweedTone = 'light' | 'dark';

interface TajweedColorsState {
  overrides: Record<TajweedTone, Record<string, string>>;
  setColor: (tone: TajweedTone, id: string, hex: string) => void;
  resetColor: (tone: TajweedTone, id: string) => void;
  resetAll: (tone: TajweedTone) => void;
}

export const useTajweedColorsStore = create<TajweedColorsState>()(
  persist(
    (set) => ({
      overrides: { light: {}, dark: {} },
      setColor: (tone, id, hex) =>
        set((s) => ({ overrides: { ...s.overrides, [tone]: { ...s.overrides[tone], [id]: hex } } })),
      resetColor: (tone, id) =>
        set((s) => {
          const next = { ...s.overrides[tone] };
          delete next[id];
          return { overrides: { ...s.overrides, [tone]: next } };
        }),
      resetAll: (tone) => set((s) => ({ overrides: { ...s.overrides, [tone]: {} } })),
    }),
    { name: 'myzikr:tajweed-colors', storage: safeStorage },
  ),
);

export const ALL_TAJWEED_RULES: TajweedColor[] = TAJWEED_GROUPS.flatMap((g) => g.rules);

/** Effective colour of a rule for a tone (user override → font default). */
export function tajweedColorFor(
  rule: TajweedColor,
  tone: TajweedTone,
  overrides: Record<TajweedTone, Record<string, string>>,
): string {
  return overrides[tone][rule.id] ?? rule[tone];
}
