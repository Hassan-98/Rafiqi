import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Lazy loader for the KFGQPC per-page Quran fonts.
 *
 * Each Madani Mushaf page (1-604) has its own font whose glyphs are
 * pre-positioned for that exact page.
 *  - `v4` (default): the QCF V4 **tajweed** colour fonts (COLR + CPAL), drawn
 *    from `word.codeV2`. Each file carries 6 palettes — 0 light-tajweed,
 *    1 dark-tajweed, 3 light-plain, 4 dark-plain — so tajweed on/off and the
 *    dark reader themes are just a `font-palette` switch (see index.css).
 *  - `v1`: the legacy plain fonts, drawn from `word.codeV1`. Kept only as a
 *    fallback (pages cached without codeV2, WebViews without font-palette).
 *
 * Reliability rules (each was a field bug):
 *  - The face is added to `document.fonts` BEFORE it loads, so
 *    `document.fonts.load()` / `.ready` really wait for it.
 *  - A failed load is NOT remembered forever — the next ensure() retries.
 *  - On native, font bytes are cached under Data/offline/fonts so a page that
 *    rendered once renders offline too (never as fallback "broken letters").
 */

export type MushafFontVersion = 'v1' | 'v4';

const CDN = 'https://cdn.jsdelivr.net/gh/quran/quran.com-frontend-next@master/public/fonts/quran/hafs';
const REMOTE: Record<MushafFontVersion, (p: number) => string> = {
  v1: (p) => `${CDN}/v1/woff2/p${p}.woff2`,
  v4: (p) => `${CDN}/v4/colrv1/woff2/p${p}.woff2`,
};
const localPath = (v: MushafFontVersion, p: number) => `offline/fonts/${v}/p${p}.woff2`;

const inflight = new Map<string, Promise<void>>();
const loaded = new Set<string>();
const id = (v: MushafFontVersion, p: number) => `${v}:${p}`;

function fontFamily(pageNumber: number, version: MushafFontVersion = 'v1'): string {
  return version === 'v4' ? `QCFv4Page${pageNumber}` : `QCFv1Page${pageNumber}`;
}

/** `font-palette` + `@font-palette-values` need Chromium 101+. Older WebViews
 *  would draw V4 in black ink on dark themes, so they stay on V1. */
export const fontPaletteSupported =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('font-palette', '--qcf');

// One shared sheet of palette rules listing every loaded V4 family. A
// @font-palette-values name can only be defined once, so the rule text is
// rebuilt (cheap) whenever a family is added.
const v4Families: string[] = [];
let paletteSheet: HTMLStyleElement | null = null;
/** User tajweed colours: CPAL entry → hex, per tajweed palette. */
let tajweedOverrides: { light: [number, string][]; dark: [number, string][] } = { light: [], dark: [] };

/**
 * Reader themes' colours — mirrors the `--mushaf-*` vars of each
 * `.mushaf-surface[data-mushaf-theme]` block in index.css (keep in sync by
 * hand: `@font-palette-values` can't read CSS variables). `cream` = the base
 * block; `night` = also the unthemed dark default.
 */
const READER_THEMES: Record<string, { dark: boolean; paper: string; ink: string; frame: string; accent: string }> = {
  cream: { dark: false, paper: '#fdf9ef', ink: '#1a2420', frame: '#a47b2a', accent: '#2c6e60' },
  sepia: { dark: false, paper: '#f7edd7', ink: '#2a2113', frame: '#85601f', accent: '#7d3a1c' },
  mint: { dark: false, paper: '#f4f9f4', ink: '#13261e', frame: '#2d7458', accent: '#a4812f' },
  sand: { dark: false, paper: '#f9f1e3', ink: '#2a2115', frame: '#9a6a2a', accent: '#2f5f78' },
  night: { dark: true, paper: '#1b3730', ink: '#e8f0ee', frame: '#cdb06a', accent: '#7cc2aa' },
  black: { dark: true, paper: '#0b0b0a', ink: '#ece6d2', frame: '#b99a55', accent: '#8c7a4c' },
  dusk: { dark: true, paper: '#263244', ink: '#e7ecf3', frame: '#cfb57c', accent: '#8fb3d9' },
};

/** `a` → `b` by `t` (0–1), as #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The ayah-end marker's CPAL entries (identical in every V4 page font):
 * 10 ring, 11 the top/bottom flourishes (#ff0080 pink in the light
 * palettes), 12 fill, 13 digits — repainted in the reader theme's colours.
 */
function markerColors(t: (typeof READER_THEMES)[string]): [number, string][] {
  return [
    [10, t.accent],
    [11, t.frame],
    [12, mix(t.paper, t.accent, t.dark ? 0.22 : 0.12)],
    [13, t.ink],
  ];
}

function renderPaletteSheet(): void {
  if (!fontPaletteSupported || typeof document === 'undefined' || v4Families.length === 0) return;
  paletteSheet ??= document.head.appendChild(document.createElement('style'));
  const fams = v4Families.join(', ');
  const rule = (name: string, palette: number, overrides: [number, string][] = []) =>
    `@font-palette-values --${name} { font-family: ${fams}; base-palette: ${palette};${
      overrides.length ? ` override-colors: ${overrides.map(([i, c]) => `${i} ${c}`).join(', ')};` : ''
    } }`;
  const cream = markerColors(READER_THEMES.cream);
  const night = markerColors(READER_THEMES.night);
  const out = [
    // Unthemed light / dark defaults (index.css maps them).
    rule('qcf-light-tajweed', 0, [...cream, ...tajweedOverrides.light]),
    rule('qcf-dark-tajweed', 1, [...night, ...tajweedOverrides.dark]),
    rule('qcf-light-plain', 3, cream),
    rule('qcf-dark-plain', 4, night),
  ];
  // One palette pair per reader theme, so the ayah markers wear its colours.
  // Same specificity as index.css's theme rules and later in <head> → wins.
  const body = (theme: string, tajweed: boolean) =>
    `.mushaf-surface[data-mushaf-theme='${theme}'] .mushaf-body[data-qcf='v4']${tajweed ? "[data-tajweed='on']" : ''}`;
  for (const [name, t] of Object.entries(READER_THEMES)) {
    const marker = markerColors(t);
    out.push(
      rule(`qcf-${name}-plain`, t.dark ? 4 : 3, marker),
      rule(`qcf-${name}-tajweed`, t.dark ? 1 : 0, [...marker, ...(t.dark ? tajweedOverrides.dark : tajweedOverrides.light)]),
      `${body(name, false)} { font-palette: --qcf-${name}-plain; }`,
      `${body(name, true)} { font-palette: --qcf-${name}-tajweed; }`,
    );
  }
  paletteSheet.textContent = out.join('\n');
}

function registerPalettes(family: string): void {
  v4Families.push(`"${family}"`);
  renderPaletteSheet();
}

/** Apply user-customised tajweed colours to the Mushaf page fonts. */
export function setTajweedPaletteOverrides(light: [number, string][], dark: [number, string][]): void {
  tajweedOverrides = { light, dark };
  renderPaletteSheet();
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function readCached(v: MushafFontVersion, p: number): Promise<ArrayBuffer | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await Filesystem.readFile({ path: localPath(v, p), directory: Directory.Data });
    return typeof r.data === 'string' ? base64ToBuffer(r.data) : await (r.data as Blob).arrayBuffer();
  } catch {
    return null;
  }
}

async function fetchBytes(v: MushafFontVersion, p: number): Promise<ArrayBuffer> {
  const res = await fetch(REMOTE[v](p));
  if (!res.ok) throw new Error(`font ${v} p${p}: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (Capacitor.isNativePlatform()) {
    void Filesystem.writeFile({
      path: localPath(v, p),
      directory: Directory.Data,
      data: bufferToBase64(buf),
      recursive: true,
    }).catch(() => undefined);
  }
  return buf;
}

async function activate(family: string, bytes: ArrayBuffer): Promise<void> {
  const face = new FontFace(family, bytes);
  document.fonts.add(face);
  try {
    await face.load();
  } catch (e) {
    document.fonts.delete(face);
    throw e;
  }
}

async function loadOne(v: MushafFontVersion, p: number): Promise<void> {
  if (loaded.has(id(v, p))) return;
  const family = fontFamily(p, v);
  const cached = await readCached(v, p);
  try {
    await activate(family, cached ?? (await fetchBytes(v, p)));
  } catch (e) {
    if (!cached) throw e;
    // The disk copy is written in the background — one cut short (app closed
    // mid-write) failed this page on every retry. Drop it, fetch once more.
    void Filesystem.deleteFile({ path: localPath(v, p), directory: Directory.Data }).catch(() => undefined);
    await activate(family, await fetchBytes(v, p));
  }
  loaded.add(id(v, p));
  if (v === 'v4') registerPalettes(family);
}

export const mushafFontLoader = {
  fontFamily,

  /** Trigger loading (idempotent, retried after a failure). Resolves once
   *  the face is active and safe to measure. */
  ensure(pageNumber: number, version: MushafFontVersion = 'v1'): Promise<void> {
    const key = id(version, pageNumber);
    let p = inflight.get(key);
    if (!p) {
      p = loadOne(version, pageNumber).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  },

  /** Warm a neighbouring page so the next flip is instant. Failures ignored. */
  prefetch(pageNumber: number, version: MushafFontVersion = 'v1'): void {
    if (pageNumber < 1 || pageNumber > 604) return;
    void this.ensure(pageNumber, version).catch(() => undefined);
  },

  isLoaded(pageNumber: number, version: MushafFontVersion = 'v1'): boolean {
    return loaded.has(id(version, pageNumber));
  },

  /** Store a page's font on disk for offline reading (bulk downloads). */
  async cacheOffline(pageNumber: number, version: MushafFontVersion = 'v4'): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (await readCached(version, pageNumber)) return;
    await fetchBytes(version, pageNumber);
  },
};
