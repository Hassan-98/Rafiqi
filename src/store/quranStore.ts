import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import type { Khatma } from './khatmaModel';
import type {
  Qari,
  TafsirId,
  MushafScript,
  QuranReaderTheme,
  QuranReadingPosition,
  WirdConfig,
} from '@/types';

/** Reader layout — book-style two-page spread vs. one page at a time. */
/** 'auto' = two facing pages on landscape-ish screens, one page otherwise. */
export type QuranViewMode = 'auto' | 'spread' | 'single';

/**
 * `mushaf` = authentic per-page KFGQPC V1 glyph layout (font-size acts as zoom;
 * tajweed/tashkeel/script don't apply — glyphs are pre-baked). `text` = flowing
 * Uthmani/IndoPak text where tajweed colouring, the tashkeel toggle and the
 * IndoPak script ARE functional.
 */
export type QuranRenderMode = 'mushaf' | 'text';

/**
 * Reader page themes: the shared `QuranReaderTheme` plus the 2026-09
 * additions — `mint` (soft emerald paper), `sand` (warm sand), `dusk`
 * (blue-grey night). Colours live in index.css (`[data-mushaf-theme]`).
 */
export type ReaderTheme = QuranReaderTheme | 'mint' | 'sand' | 'dusk';
export const DARK_READER_THEMES: readonly ReaderTheme[] = ['night', 'black', 'dusk'];

export interface QuranSettings {
  readerTheme: ReaderTheme;
  /** Use `nightTheme` between maghrib and fajr. Optional: older saves lack it. */
  autoNight?: boolean;
  nightTheme?: ReaderTheme;
  fontSize: number; // 12..42 (mushaf mode maps this to a page zoom)
  renderMode: QuranRenderMode;
  script: MushafScript;
  showTashkeel: boolean;
  /** Also picks the Mushaf glyph set: on → the 1441 print's colour (V4)
   *  fonts; off → the 1405 print's plain V1 fonts (owner's preferred look). */
  tajweedEnabled: boolean;
  selectedTafsirId: TafsirId;
  qari: Qari;
  wordByWordAudio: boolean;
  playbackRate: 0.75 | 1 | 1.25 | 1.5;
  /**
   * `spread` shows two facing pages like a printed Mushaf (right = lower
   * page number, left = higher; pages flip in pairs). Auto-falls back to
   * `single` on narrow viewports regardless of this preference.
   */
  viewMode: QuranViewMode;
  /** «مستوى صوت التلاوة» 0..1, relative to the device media volume.
   *  Listening fields are optional: older saves lack them. */
  volume?: number;
  muted?: boolean;
  /** Pause between ayat / repetitions, seconds. */
  ayahGapSec?: 0 | 1 | 2 | 3;
  /** Turn the reader's pages to follow the reciting ayah. */
  autoFollow?: boolean;
  /** «تخطّي الصمت في نهاية الآية» (default on). */
  trimSilence?: boolean;
  /** Keep the Muallim reciter's built-in repetition pause (no trimming for it). */
  muallimPause?: boolean;
}

/**
 * The app's Quran record. Since 2026-11 the reading itself happens in «مصحفي»
 * (a separate app) — src/services/mushafi.ts `projectToQuran()` fills this
 * store from its sync after every pull. Nothing here is written by hand.
 */
interface QuranStoreState {
  /** Legacy reader settings — QuranApiService still reads `tajweedEnabled`. */
  settings: QuranSettings;
  /** Last position in the old built-in reader (legacy, read-only). */
  position: QuranReadingPosition | null;
  /** Today's wird in pages (مصحفي's khatma portions, or the daily target). */
  wird: WirdConfig | null;
  wirdHistory: Record<string, { unit: WirdConfig['unit']; amount: number; achieved: number }>;
  /** Distinct pages read per day (`yyyy-MM-dd` → count) — pace / badges / stats. */
  readingDays: Record<string, number>;
  /** مصحفي khatmas (ids `m_…`) + khatmas finished in the old reader. */
  khatmas: Khatma[];
  /** The khatma to feature (the one owing most today). */
  activeKhatmaId: string | null;
}

const DEFAULT_SETTINGS: QuranSettings = {
  readerTheme: 'cream',
  fontSize: 24,
  renderMode: 'mushaf',
  script: 'uthmani',
  showTashkeel: true,
  tajweedEnabled: false,
  selectedTafsirId: 16,
  qari: 'husary',
  wordByWordAudio: false,
  playbackRate: 1,
  viewMode: 'auto',
  volume: 1,
  muted: false,
  ayahGapSec: 0,
  autoFollow: true,
  trimSilence: true,
  muallimPause: false,
};

export const useQuranStore = create<QuranStoreState>()(
  persist(
    (): QuranStoreState => ({
      settings: DEFAULT_SETTINGS,
      position: null,
      wird: null,
      wirdHistory: {},
      readingDays: {},
      khatmas: [],
      activeKhatmaId: null,
    }),
    {
      name: 'myzikr:quran',
      storage: safeStorage,
      // v1: العفاسي was removed from the reciters (owner) → move to الحصري.
      // v2: the flowing-text reading mode was removed (owner) → Mushaf only.
      // v3: «تلقائي» view mode added and made the default → 'single' (the old
      //     default for most users) becomes 'auto'; an explicit 'spread' stays.
      version: 3,
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as { settings?: { qari?: string; renderMode?: string; viewMode?: string } };
        if (version < 1 && st.settings?.qari === 'alafasy') st.settings = { ...st.settings, qari: 'husary' };
        if (version < 2 && st.settings?.renderMode === 'text') st.settings = { ...st.settings, renderMode: 'mushaf' };
        if (version < 3 && st.settings && st.settings.viewMode !== 'spread') st.settings = { ...st.settings, viewMode: 'auto' };
        return st as never;
      },
      partialize: (state) => ({
        settings: state.settings,
        position: state.position,
        wird: state.wird,
        wirdHistory: state.wirdHistory,
        readingDays: state.readingDays,
        khatmas: state.khatmas,
        activeKhatmaId: state.activeKhatmaId,
      }),
    },
  ),
);
