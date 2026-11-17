import { useTajweedColorsStore, ALL_TAJWEED_RULES, type TajweedTone } from '@/store/tajweedColorsStore';
import { setTajweedPaletteOverrides } from '@/services/MushafFontLoader';

/**
 * Applies the user's custom tajweed colours everywhere, live:
 *  - Mushaf (V4 COLR fonts): `override-colors` on the tajweed font palettes;
 *  - text mode: a runtime style sheet overriding the `.tajweed-*` classes
 *    (more specific than index.css, light and dark reader themes separately).
 * The legend reads the same store, so all three always agree.
 */
const DARK_THEMES = ['night', 'black', 'dusk'];
let sheet: HTMLStyleElement | null = null;

function apply(overrides: Record<TajweedTone, Record<string, string>>): void {
  const fontPairs = (tone: TajweedTone): [number, string][] =>
    ALL_TAJWEED_RULES.filter((r) => overrides[tone][r.id]).flatMap((r) =>
      r.cpal.map((i) => [i, overrides[tone][r.id]] as [number, string]),
    );
  setTajweedPaletteOverrides(fontPairs('light'), fontPairs('dark'));

  if (typeof document === 'undefined') return;
  const css: string[] = [];
  for (const r of ALL_TAJWEED_RULES) {
    if (!r.classes.length) continue;
    const light = overrides.light[r.id];
    const dark = overrides.dark[r.id];
    if (light) css.push(`${r.classes.map((c) => `html .mushaf-surface .tajweed-${c}`).join(', ')} { color: ${light}; }`);
    if (dark) {
      const sel = DARK_THEMES.flatMap((t) =>
        r.classes.map((c) => `html .mushaf-surface[data-mushaf-theme='${t}'] .tajweed-${c}`),
      );
      css.push(`${sel.join(', ')} { color: ${dark}; }`);
    }
  }
  sheet ??= document.head.appendChild(document.createElement('style'));
  sheet.textContent = css.join('\n');
}

/** Start once at boot; re-applies on every change. */
export function startTajweedColorSync(): void {
  apply(useTajweedColorsStore.getState().overrides);
  useTajweedColorsStore.subscribe((s, prev) => {
    if (s.overrides !== prev.overrides) apply(s.overrides);
  });
}
