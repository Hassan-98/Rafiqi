import type {
  Surah,
  VerseWithWords,
  Word,
  TafsirEntry,
  TafsirId,
  Qari,
  AudioTrack,
  AudioSegment,
  QuranSearchResult,
} from '@/types';
import { RECITER_IDS, EVERYAYAH_FOLDERS } from '@/types';
import { storageService, STORAGE_NAMESPACE } from './StorageService';
import { evictQuranCache, quranCacheBytes, pruneQuranCache, QURAN_CACHE_BUDGET_BYTES } from './quranCacheEvict';
import { absoluteAudioUrl } from '@/components/offline/offlineCore';
import { isOffline, notifyOfflineMissing, OfflineMissingError, type OfflineKind } from '@/components/offline/offlineNotice';
import { fontPaletteSupported, type MushafFontVersion } from './MushafFontLoader';
import { useQuranStore } from '@/store/quranStore';

/** Offline + not downloaded → a clear «نزّله الآن» toast and a typed error (not a silent failure). */
function offlineGuard<T>(kind: OfflineKind, p: Promise<T>, notify = true): Promise<T> {
  return p.catch((e: unknown) => {
    if (!isOffline()) throw e;
    if (notify) notifyOfflineMissing(kind);
    throw new OfflineMissingError(kind);
  });
}

const QURAN_API_BASE = 'https://api.quran.com/api/v4';
/** quran.com's own API — its `mushaf` param picks a page's verses AND line numbers. */
const QDC_API_BASE = 'https://api.qurancdn.com/api/qdc';
const AUDIO_CDN = 'https://audio.qurancdn.com';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_LONG_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface QuranApiChapter {
  id: number;
  revelation_place: 'makkah' | 'madinah';
  name_arabic: string;
  name_simple: string;
  translated_name: { name: string };
  verses_count: number;
  pages: [number, number];
}

interface QuranApiWord {
  id: number;
  position: number;
  verse_key: string;
  audio_url?: string | null;
  char_type_name: string;
  location?: string;
  line_number?: number;
  page_number?: number;
  text_uthmani?: string;
  text_indopak?: string;
  code_v1?: string;
  code_v2?: string;
  translation?: { text?: string };
  transliteration?: { text?: string };
  text?: string;
}

interface QuranApiVerse {
  id: number;
  verse_key: string;
  verse_number?: number;
  text_uthmani?: string;
  text_uthmani_tajweed?: string;
  text_indopak?: string;
  page_number?: number;
  juz_number?: number;
  hizb_number?: number;
  rub_el_hizb_number?: number;
  words?: QuranApiWord[];
}

interface QuranApiTafsir {
  tafsir: {
    verse_key: string;
    resource_id: number;
    resource_name: string;
    text: string;
  };
}

interface RecitationResponse {
  audio_files: Array<{
    verse_key: string;
    url: string;
    duration?: number;
    segments?: Array<[number, number, number, number, number]>;
  }>;
}

interface ChapterRecitationResponse {
  audio_file: { audio_url: string };
}

interface SearchResponse {
  search: {
    query: string;
    total_results: number;
    current_page: number;
    total_pages: number;
    results: Array<{
      verse_key: string;
      text: string;
      highlighted?: string;
    }>;
  };
}

export interface IQuranApiService {
  getChapters(): Promise<Surah[]>;
  getVerses(chapterId: number, page?: number, perPage?: number): Promise<QuranApiVerse[]>;
  getVersesWithWords(
    chapterId: number,
    page?: number,
    perPage?: number,
    opts?: { tajweed?: boolean; indopak?: boolean },
  ): Promise<VerseWithWords[]>;
  getVerseByKey(verseKey: string, opts?: { tajweed?: boolean; indopak?: boolean }): Promise<VerseWithWords>;
  getTafsir(verseKey: string, tafsirId: TafsirId): Promise<TafsirEntry>;
  getRecitation(verseKey: string, qari: Qari): Promise<AudioTrack>;
  getChapterRecitation(chapterId: number, qari: Qari): Promise<{ url: string }>;
  getWordAudioUrl(word: Word): string | null;
  searchVerses(q: string, opts?: { page?: number; size?: number }): Promise<QuranSearchResult[]>;
  getVersesByJuz(juzNumber: number, opts?: { tajweed?: boolean }): Promise<VerseWithWords[]>;
  getVersesByPage(pageNumber: number, opts?: { tajweed?: boolean; glyph?: MushafFontVersion }): Promise<VerseWithWords[]>;
  getVersesByHizb(hizbNumber: number, opts?: { tajweed?: boolean }): Promise<VerseWithWords[]>;
}

/**
 * Map a single word. `verseKey` is not always returned per-word by quran.com
 * — `word_fields` controls which optional fields come back, and `verse_key`
 * is not one of them. We therefore derive it from either the parent verse
 * (passed in by `mapVerse`) or, as a fallback, the `location` field which is
 * always `surah:verse:position`.
 */
function mapWord(w: QuranApiWord, parentVerseKey?: string): Word {
  const derivedVerseKey =
    w.verse_key ??
    parentVerseKey ??
    (w.location ? w.location.split(':').slice(0, 2).join(':') : '');
  return {
    id: w.id,
    position: w.position,
    verseKey: derivedVerseKey,
    textUthmani: w.text_uthmani ?? w.text ?? '',
    textIndopak: w.text_indopak,
    codeV1: w.code_v1,
    codeV2: w.code_v2,
    translation: w.translation?.text,
    transliteration: w.transliteration?.text,
    charType: (w.char_type_name ?? 'word') as Word['charType'],
    audioUrl: w.audio_url ?? undefined,
    location: w.location,
    lineNumber: w.line_number,
    pageNumber: w.page_number,
  };
}

/**
 * Page/line layout of a glyph set, as a quran.com mushaf id: V4 glyphs are set
 * in the 1441 Madinah print (1), V1 glyphs in the 1405 print (2). The prints
 * break lines differently on almost every page and move verses across pages
 * on 36 (most of juz 30). The v4 API's `by_page` mixes them — verses by the
 * 1405 pages, word lines by the 1441 ones — so p587 drew 83:5–6 as a stray
 * line of the wrong words and p588 lost them.
 */
export const mushafLayout = (glyph: MushafFontVersion): number => (glyph === 'v1' ? 2 : 1);
/**
 * Glyph set the reader renders now: the plain 1405 (V1) fonts by default —
 * the owner's preferred, heavier look — and the 1441 colour (V4) fonts only
 * with tajweed colours on (and a WebView that can switch font palettes).
 * Page data, caches and offline copies all follow it.
 */
export const readerGlyph = (): MushafFontVersion =>
  fontPaletteSupported && useQuranStore.getState().settings.tajweedEnabled ? 'v4' : 'v1';
/** Pages whose verses differ between the two prints. */
const LAYOUT_SHIFTED_PAGES = new Set([
  120, 121, 122, 123, 144, 145, 531, 532, 533, 534, 564, 565, 567, 568, 569, 570, 575, 576,
  ...Array.from({ length: 18 }, (_, i) => 583 + i),
]);

/**
 * An offline copy returned in a layout other than the reader's (no network):
 * tagged so the page draws it with the glyph set of ITS print — e.g. pages
 * downloaded for the colour font still open offline after the switch to V1.
 */
export type LayoutTaggedVerses = VerseWithWords[] & { mushaf?: number };
const tagLayout = (verses: VerseWithWords[], mushaf: number): LayoutTaggedVerses =>
  Object.defineProperty(verses, 'mushaf', { value: mushaf, enumerable: false });

const versesCacheKey = (slug: string, tajweed?: boolean, mushaf?: number) =>
  `quran_v6_${slug}_${tajweed ? 't' : ''}${mushaf ? `_m${mushaf}` : ''}`;

/** A page carries everything the Mushaf renderer needs (line layout + V4 glyphs). */
export function isCompleteMushafPage(verses: VerseWithWords[]): boolean {
  return verses.every((v) => v.words.every((w) => w.lineNumber != null && (w.charType !== 'word' || w.codeV2)));
}

function mapVerse(v: QuranApiVerse): VerseWithWords {
  const [, ayahStr] = v.verse_key.split(':');
  return {
    id: v.id,
    verseKey: v.verse_key,
    verseNumber: v.verse_number ?? Number(ayahStr) ?? 0,
    textUthmani: v.text_uthmani ?? '',
    textUthmaniTajweed: v.text_uthmani_tajweed,
    textIndopak: v.text_indopak,
    words: (v.words ?? []).map((w) => mapWord(w, v.verse_key)),
    pageNumber: v.page_number ?? 0,
    juzNumber: v.juz_number ?? 0,
    hizbNumber: v.hizb_number ?? 0,
    rubElHizbNumber: v.rub_el_hizb_number ?? 0,
  };
}

export class QuranApiService implements IQuranApiService {
  private async fetchWithCache<T>(key: string, url: string, ttlMs = CACHE_TTL_MS): Promise<T> {
    const cached = storageService.get<CacheEntry<T>>(key);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
    let data: T;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Quran API ${response.status}: ${url}`);
      data = (await response.json()) as T;
    } catch (e) {
      // Offline-first: an expired cache entry beats no content.
      if (cached) return cached.data;
      throw e;
    }
    this.writeCache(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Cache a response under the namespaced key, keeping the whole Quran cache
   * under {@link QURAN_CACHE_BUDGET_BYTES}. Evicts the oldest entries when the
   * budget is exceeded and on a QuotaExceededError, then retries once. Failing
   * to cache is non-fatal — it only means a re-fetch next time.
   */
  private writeCache<T>(key: string, entry: CacheEntry<T>): void {
    const nsKey = `${STORAGE_NAMESPACE}${key}`;
    let payload: string;
    try {
      payload = JSON.stringify(entry);
    } catch {
      return;
    }
    try {
      if (quranCacheBytes() + payload.length > QURAN_CACHE_BUDGET_BYTES) {
        evictQuranCache(payload.length);
      }
      localStorage.setItem(nsKey, payload);
    } catch {
      // Quota (or other) — evict aggressively and retry once; give up silently.
      try {
        evictQuranCache(payload.length * 4);
        localStorage.setItem(nsKey, payload);
      } catch {
        /* it's only a cache */
      }
    }
  }

  /** Trim the Quran response cache to its budget (call once at startup). */
  pruneCache(): void {
    pruneQuranCache();
  }

  async getChapters(): Promise<Surah[]> {
    const result = await this.fetchWithCache<{ chapters: QuranApiChapter[] }>(
      'quran_chapters',
      `${QURAN_API_BASE}/chapters?language=ar`,
    );
    return result.chapters.map((c): Surah => ({
      number: c.id,
      nameArabic: c.name_arabic,
      nameSimple: c.name_simple,
      nameTranslation: c.translated_name.name,
      versesCount: c.verses_count,
      pages: c.pages,
      revelationPlace: c.revelation_place,
    }));
  }

  /** @deprecated Use {@link getVersesWithWords}. Kept for back-compat with the old module. */
  async getVerses(chapterId: number, page = 1, perPage = 50): Promise<QuranApiVerse[]> {
    const key = `quran_verses_${chapterId}_p${page}`;
    const url = `${QURAN_API_BASE}/verses/by_chapter/${chapterId}?language=ar&words=false&page=${page}&per_page=${perPage}&fields=text_uthmani`;
    const result = await this.fetchWithCache<{ verses: QuranApiVerse[] }>(key, url);
    return result.verses;
  }

  async getVersesWithWords(
    chapterId: number,
    page = 1,
    perPage = 50,
    opts: { tajweed?: boolean; indopak?: boolean } = {},
  ): Promise<VerseWithWords[]> {
    const fields = [
      'text_uthmani',
      opts.tajweed ? 'text_uthmani_tajweed' : null,
      opts.indopak ? 'text_indopak' : null,
      'page_number',
      'juz_number',
      'hizb_number',
      'rub_el_hizb_number',
    ]
      .filter(Boolean)
      .join(',');

    const wordFields = ['text_uthmani', 'code_v1', 'code_v2', 'translation', 'transliteration', 'location', 'line_number', 'page_number', 'audio_url', 'char_type_name']
      .concat(opts.indopak ? ['text_indopak'] : [])
      .join(',');

    const params = new URLSearchParams({
      language: 'ar',
      words: 'true',
      word_fields: wordFields,
      fields,
      page: String(page),
      per_page: String(perPage),
      translations: '',
    });

    const cacheKey = `quran_v3_chapter_${chapterId}_p${page}_${opts.tajweed ? 't' : ''}${opts.indopak ? 'i' : ''}`;
    const url = `${QURAN_API_BASE}/verses/by_chapter/${chapterId}?${params.toString()}`;
    const result = await this.fetchWithCache<{ verses: QuranApiVerse[] }>(cacheKey, url);
    return result.verses.map(mapVerse);
  }

  async getVerseByKey(
    verseKey: string,
    opts: { tajweed?: boolean; indopak?: boolean } = {},
  ): Promise<VerseWithWords> {
    const fields = [
      'text_uthmani',
      opts.tajweed ? 'text_uthmani_tajweed' : null,
      opts.indopak ? 'text_indopak' : null,
      'page_number',
      'juz_number',
      'hizb_number',
      'rub_el_hizb_number',
    ]
      .filter(Boolean)
      .join(',');
    const wordFields = ['text_uthmani', 'code_v1', 'code_v2', 'translation', 'transliteration', 'location', 'line_number', 'page_number', 'audio_url', 'char_type_name']
      .concat(opts.indopak ? ['text_indopak'] : [])
      .join(',');
    const params = new URLSearchParams({
      language: 'ar',
      words: 'true',
      word_fields: wordFields,
      fields,
    });
    const cacheKey = `quran_v3_key_${verseKey}_${opts.tajweed ? 't' : ''}`;
    const url = `${QURAN_API_BASE}/verses/by_key/${verseKey}?${params.toString()}`;
    const result = await this.fetchWithCache<{ verse: QuranApiVerse }>(cacheKey, url);
    return mapVerse(result.verse);
  }

  async getTafsir(verseKey: string, tafsirId: TafsirId): Promise<TafsirEntry> {
    // Offline-first (Al-Muyassar only — see offlineService).
    let offline: typeof import('./offlineService').offlineService | null = null;
    try {
      offline = (await import('./offlineService')).offlineService;
      if (offline.hasTafsir(verseKey, tafsirId)) {
        const local = await offline.readTafsir(verseKey);
        if (local) return local;
      }
    } catch {
      /* fall through to network */
    }
    const cacheKey = `quran_tafsir_${tafsirId}_${verseKey}`;
    const url = `${QURAN_API_BASE}/tafsirs/${tafsirId}/by_ayah/${verseKey}`;
    try {
      const result = await offlineGuard(
        'tafsir',
        this.fetchWithCache<QuranApiTafsir>(cacheKey, url, CACHE_TTL_LONG_MS),
        false,
      );
      return {
        verseKey,
        tafsirId,
        resourceName: result.tafsir.resource_name,
        html: result.tafsir.text,
      };
    } catch (e) {
      // Offline with another tafsir selected: the downloaded Muyassar beats nothing.
      if (e instanceof OfflineMissingError && offline?.hasTafsir(verseKey, 16)) {
        const local = await offline.readTafsir(verseKey);
        if (local) return { ...local, resourceName: 'التفسير الميسر (المنزّل)' };
      }
      if (e instanceof OfflineMissingError) notifyOfflineMissing('tafsir');
      throw e;
    }
  }

  async getRecitation(verseKey: string, qari: Qari): Promise<AudioTrack> {
    // Offline-first: ANY downloaded ayah of this reciter plays from disk (sync
    // index lookup, no stat), with its saved word segments when we have them.
    try {
      const { offlineService } = await import('./offlineService');
      if (offlineService.hasAudio(verseKey, qari)) {
        const local = await offlineService.localAudioSrc(verseKey, qari);
        if (local) return { verseKey, url: local, segments: await offlineService.localSegments(verseKey, qari) };
      }
    } catch {
      /* fall through to network */
    }
    // Offline and not downloaded: fail clearly (AudioController shows «نزّله الآن»).
    if (isOffline()) throw new OfflineMissingError('audio');
    // everyayah-sourced reciters (e.g. Maher, Dossari) — build the per-ayah
    // URL directly; no API call and no word-by-word segments.
    const folder = EVERYAYAH_FOLDERS[qari];
    if (folder) {
      const [s, a] = verseKey.split(':');
      const pad = (n: string) => n.padStart(3, '0');
      return {
        verseKey,
        url: `https://everyayah.com/data/${folder}/${pad(s)}${pad(a)}.mp3`,
        segments: undefined,
      };
    }
    const reciterId = RECITER_IDS[qari] ?? RECITER_IDS.husary!;
    const cacheKey = `quran_audio_${reciterId}_${verseKey}`;
    const url = `${QURAN_API_BASE}/recitations/${reciterId}/by_ayah/${verseKey}`;
    const result = await offlineGuard(
      'audio',
      this.fetchWithCache<RecitationResponse>(cacheKey, url, CACHE_TTL_LONG_MS),
      false,
    );
    const file = result.audio_files?.[0];
    if (!file) throw new Error(`No audio for ${verseKey} (qari ${qari})`);
    const segments: AudioSegment[] | undefined = file.segments?.map((s) => ({
      wordPosition: s[0],
      startMs: s[2],
      endMs: s[3],
    }));
    return {
      verseKey,
      // Husary/Tablawi/Muallim come back protocol-relative («//mirrors…») — the
      // old `${AUDIO_CDN}/${url}` join turned those into 404s.
      url: absoluteAudioUrl(file.url),
      durationMs: file.duration ? file.duration * 1000 : undefined,
      segments,
    };
  }

  async getChapterRecitation(chapterId: number, qari: Qari): Promise<{ url: string }> {
    const reciterId = RECITER_IDS[qari] ?? RECITER_IDS.husary!;
    const cacheKey = `quran_chapter_audio_${reciterId}_${chapterId}`;
    const url = `${QURAN_API_BASE}/chapter_recitations/${reciterId}/${chapterId}`;
    const result = await this.fetchWithCache<ChapterRecitationResponse>(cacheKey, url, CACHE_TTL_LONG_MS);
    return { url: result.audio_file.audio_url };
  }

  /**
   * A word's recitation clip, built from its verse + position. NOT the API's
   * `audio_url`: that is stale after a waqf sign — it still counts the pause
   * marks that used to be separate words, so every word after one played a
   * LATER word (2:2 «فِيهِ» → …_006 = «هُدًى») and a verse's last words hit
   * missing files (2:2 «هُدًى» → …_008 → 404). The CDN's clips are numbered by
   * the current word position.
   */
  getWordAudioUrl(word: Word): string | null {
    if (word.charType === 'end') return null;
    const [s, a] = word.verseKey.split(':').map(Number);
    if (!s || !a || !word.position) return null;
    const n3 = (n: number) => String(n).padStart(3, '0');
    return `${AUDIO_CDN}/wbw/${n3(s)}_${n3(a)}_${n3(word.position)}.mp3`;
  }

  async searchVerses(
    q: string,
    opts: { page?: number; size?: number } = {},
  ): Promise<QuranSearchResult[]> {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const params = new URLSearchParams({
      q: trimmed,
      size: String(opts.size ?? 20),
      page: String(opts.page ?? 0),
      language: 'ar',
    });
    const url = `${QURAN_API_BASE}/search?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Search ${response.status}`);
    const result = (await response.json()) as SearchResponse;
    return result.search.results.map((r) => {
      const [surahStr, ayahStr] = r.verse_key.split(':');
      return {
        verseKey: r.verse_key,
        surahNumber: Number(surahStr),
        ayahNumber: Number(ayahStr),
        text: r.text,
        highlighted: r.highlighted,
      };
    });
  }

  async getVersesByJuz(juzNumber: number, opts: { tajweed?: boolean } = {}): Promise<VerseWithWords[]> {
    return this.fetchVersesByEndpoint(`by_juz/${juzNumber}`, `juz${juzNumber}`, opts);
  }
  /** A page in the line layout of `glyph` (default: what the reader renders now). */
  async getVersesByPage(
    pageNumber: number,
    opts: { tajweed?: boolean; glyph?: MushafFontVersion } = {},
  ): Promise<VerseWithWords[]> {
    const mushaf = mushafLayout(opts.glyph ?? readerGlyph());
    // Offline-first: a downloaded page is served from the filesystem.
    try {
      const { offlineService } = await import('./offlineService');
      if (offlineService.hasPage(pageNumber)) {
        const local = await offlineService.readPage(pageNumber);
        if (local?.verses.length) {
          const sameLayout = local.mushaf === mushaf;
          if (sameLayout && isCompleteMushafPage(local.verses)) return local.verses;
          // Offline, an older / other-layout copy beats nothing — its lines
          // break elsewhere but the text is right, unless the verses moved.
          if (!navigator.onLine && (sameLayout || !LAYOUT_SHIFTED_PAGES.has(pageNumber))) {
            // Legacy bare arrays (0) are v4-API data: 1441 lines.
            return tagLayout(local.verses, local.mushaf || 1);
          }
        }
        // Saved by an older build (no line numbers / V4 glyphs / v4-API
        // layout) → refresh from the network and rewrite the offline copy.
        if (mushaf === mushafLayout(readerGlyph())) offlineService.resavePage(pageNumber);
      }
    } catch {
      /* fall through to network */
    }
    return offlineGuard(
      'page',
      this.fetchVersesByEndpoint(`by_page/${pageNumber}`, `page${pageNumber}`, { tajweed: opts.tajweed, mushaf }),
    );
  }
  async getVersesByHizb(hizbNumber: number, opts: { tajweed?: boolean } = {}): Promise<VerseWithWords[]> {
    return this.fetchVersesByEndpoint(`by_hizb/${hizbNumber}`, `hizb${hizbNumber}`, opts);
  }

  /**
   * Synchronous cache probe for a page's verses. Returns the mapped verses
   * if a fresh cache entry exists, otherwise `null`. Lets consumers skip
   * the "loading…" state entirely when the page has been prefetched.
   */
  getCachedVersesByPage(
    pageNumber: number,
    opts: { tajweed?: boolean; glyph?: MushafFontVersion } = {},
  ): VerseWithWords[] | null {
    const cacheKey = versesCacheKey(`page${pageNumber}`, opts.tajweed, mushafLayout(opts.glyph ?? readerGlyph()));
    const cached = storageService.get<CacheEntry<{ verses: QuranApiVerse[] }>>(cacheKey);
    if (!cached || Date.now() - cached.timestamp >= CACHE_TTL_MS) return null;
    return cached.data.verses.map(mapVerse);
  }

  /**
   * Fire-and-forget prefetch of a page. Triggers a network fetch (or a
   * cache hit) and silently swallows failures. Used by the reader to load
   * adjacent pages while the user is reading the current one, so flipping
   * forward / back is instant.
   */
  prefetchPage(pageNumber: number, opts: { tajweed?: boolean; glyph?: MushafFontVersion } = {}): void {
    if (pageNumber < 1 || pageNumber > 604 || isOffline()) return;
    if (this.getCachedVersesByPage(pageNumber, opts)) return; // already warm
    void this.getVersesByPage(pageNumber, opts).catch(() => undefined);
  }

  /**
   * Everything a page needs offline — mushaf glyphs + lines and Uthmani /
   * tajweed / IndoPak text — in one request, in the layout of the glyph set
   * the reader uses now. Network only: this is what offlineService saves.
   */
  async getVersesByPageRich(pageNumber: number): Promise<VerseWithWords[]> {
    const fields = [
      'text_uthmani',
      'text_uthmani_tajweed',
      'text_indopak',
      'page_number',
      'juz_number',
      'hizb_number',
      'rub_el_hizb_number',
    ].join(',');
    // Superset of the mushaf page fields: this is also what gets saved for
    // offline reading, and a saved page without line_number / code_v2 used to
    // collapse onto one line in the Mushaf view.
    const wordFields = ['text_uthmani', 'code_v1', 'code_v2', 'location', 'line_number', 'page_number', 'audio_url', 'char_type_name'].join(',');
    const params = new URLSearchParams({
      language: 'ar',
      words: 'true',
      word_fields: wordFields,
      fields,
      per_page: '300',
      mushaf: String(mushafLayout(readerGlyph())),
    });
    const cacheKey = `quran_v6_page_rich_${pageNumber}_m${params.get('mushaf')}`;
    const url = `${QDC_API_BASE}/verses/by_page/${pageNumber}?${params.toString()}`;
    // Downloads report their own failures.
    const result = await offlineGuard('page', this.fetchWithCache<{ verses: QuranApiVerse[] }>(cacheKey, url), false);
    return result.verses.map(mapVerse);
  }

  private async fetchVersesByEndpoint(
    endpointSuffix: string,
    cacheSlug: string,
    opts: { tajweed?: boolean; mushaf?: number },
  ): Promise<VerseWithWords[]> {
    const fields = [
      'text_uthmani',
      opts.tajweed ? 'text_uthmani_tajweed' : null,
      'page_number',
      'juz_number',
      'hizb_number',
      'rub_el_hizb_number',
    ]
      .filter(Boolean)
      .join(',');
    const wordFields = ['text_uthmani', 'code_v1', 'code_v2', 'translation', 'transliteration', 'location', 'line_number', 'page_number', 'audio_url', 'char_type_name'].join(',');
    const params = new URLSearchParams({
      language: 'ar',
      words: 'true',
      word_fields: wordFields,
      fields,
      per_page: '300',
    });
    if (opts.mushaf) params.set('mushaf', String(opts.mushaf));
    const cacheKey = versesCacheKey(cacheSlug, opts.tajweed, opts.mushaf);
    const url = `${opts.mushaf ? QDC_API_BASE : QURAN_API_BASE}/verses/${endpointSuffix}?${params.toString()}`;
    const result = await this.fetchWithCache<{ verses: QuranApiVerse[] }>(cacheKey, url);
    return result.verses.map(mapVerse);
  }
}

export const quranApiService = new QuranApiService();
