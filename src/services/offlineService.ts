import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';
import { surahs } from '@/data/surahs';
import { ALL_ADHKAR_AUDIO_URLS } from '@/data/adhkarAudio';
import { useDownloadsStore, type PackId, type PackState } from '@/store/downloadsStore';
import { quranApiService, isCompleteMushafPage, mushafLayout, readerGlyph } from './QuranApiService';
import { mushafFontLoader } from './MushafFontLoader';
import {
  paths,
  OFFLINE_TAFSIR_ID,
  Job,
  runQueue,
  scopeAyat,
  countAyat,
  indexHas,
  indexMissing,
  everyayahUrl,
  absoluteAudioUrl,
  reciterId,
  networkGate,
  type AudioScope,
  type Gate,
} from '@/components/offline/offlineCore';
import type { AudioSegment, Qari, TafsirEntry, VerseWithWords } from '@/types';

/**
 * Offline downloads («التنزيلات والعمل دون إنترنت»). Everything lives under
 * Directory.Data/offline (native only — see offlineCore `paths`):
 *   pages/{p}.json · fonts/{v}/p{N}.woff2 (MushafFontLoader) · tafsir16/{s}.json
 *   audio/{qari}/{s}_{a}.mp3 + audio/{qari}/meta/{s}.json (word segments) · adhkar/*.mp3
 *
 * Packs (mushaf, tafsir, audio, adhkar) run as pausable, resumable jobs:
 * a re-run skips whatever is already on disk. Playback/reading check the
 * persisted indexes in downloadsStore synchronously (no stat per ayah) and
 * QuranApiService falls back to the network only when something is missing.
 */

const DIR = Directory.Data;
const API = 'https://api.quran.com/api/v4';
/** Layout (quran.com mushaf id) offline pages are saved in. */
const pageMushaf = () => mushafLayout(readerGlyph());

const native = () => Capacitor.isNativePlatform();
const ds = () => useDownloadsStore.getState();

function pagesOf(surahNumber: number): number[] {
  const s = surahs.find((x) => x.number === surahNumber);
  if (!s) return [];
  const [start, end] = s.pages;
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

// ── Filesystem helpers ──────────────────────────────────────────────────────
async function writeJson(path: string, obj: unknown): Promise<void> {
  await Filesystem.writeFile({ path, directory: DIR, data: JSON.stringify(obj), encoding: Encoding.UTF8, recursive: true });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const r = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 });
    return JSON.parse(r.data as string) as T;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await Filesystem.stat({ path, directory: DIR })).size > 0;
  } catch {
    return false;
  }
}

const madeDirs = new Set<string>();
async function ensureDir(path: string): Promise<void> {
  if (madeDirs.has(path)) return;
  // downloadFile ignores `recursive` on Android — the parent must exist first.
  await Filesystem.mkdir({ path, directory: DIR, recursive: true }).catch(() => undefined);
  madeDirs.add(path);
}

/** Native streaming download (no base64 through the bridge); `.part` + rename so
 *  an interrupted file never looks complete to a resumed run. */
async function downloadTo(url: string, path: string): Promise<void> {
  await ensureDir(path.slice(0, path.lastIndexOf('/')));
  const part = `${path}.part`;
  try {
    await Filesystem.downloadFile({ url, path: part, directory: DIR, connectTimeout: 15_000, readTimeout: 30_000 });
    await Filesystem.rename({ from: part, to: path, directory: DIR, toDirectory: DIR });
  } catch (e) {
    await Filesystem.deleteFile({ path: part, directory: DIR }).catch(() => undefined);
    throw e;
  }
}

async function rmdir(path: string): Promise<void> {
  await Filesystem.rmdir({ path, directory: DIR, recursive: true }).catch(() => undefined);
  for (const d of madeDirs) if (d.startsWith(path)) madeDirs.delete(d);
}

async function dirSize(path: string): Promise<number> {
  try {
    const { files } = await Filesystem.readdir({ path, directory: DIR });
    let n = 0;
    for (const f of files) n += f.type === 'directory' ? await dirSize(`${path}/${f.name}`) : f.size;
    return n;
  } catch {
    return 0;
  }
}

type ChapterMeta = Record<number, { url: string; segments?: number[][] }>;

export interface OfflineUsage {
  mushaf: number;
  tafsir: number;
  adhkar: number;
  audio: Record<string, number>;
}

class OfflineService {
  readonly supported = native();

  // ── Availability (sync, from the persisted store) ──────────────────────────
  private doneSurahs() {
    return Object.values(ds().items).filter((d) => d.status === 'done');
  }

  hasPage(page: number): boolean {
    if (ds().pageSet[page]) return true;
    return this.doneSurahs().some((d) => d.pages.includes(page));
  }

  /** How many distinct mushaf pages are available offline (for UI). */
  downloadedPageCount(): number {
    const set = new Set<number>(Object.keys(ds().pageSet).map(Number));
    for (const d of this.doneSurahs()) for (const p of d.pages) set.add(p);
    return set.size;
  }

  hasTafsir(verseKey: string, tafsirId: number): boolean {
    return tafsirId === OFFLINE_TAFSIR_ID && Boolean(ds().tafsirSurahs[Number(verseKey.split(':')[0])]);
  }

  /** Any downloaded ayah of any reciter — not only whole-surah downloads. */
  hasAudio(verseKey: string, qari: Qari): boolean {
    const [s, a] = verseKey.split(':').map(Number);
    return indexHas(ds().audioIndex, qari, s, a);
  }

  hasSurahAudio(surah: number, qari: Qari): boolean {
    return ds().audioIndex[qari]?.[surah] === true;
  }

  // ── Offline reads (used by QuranApiService) ────────────────────────────────
  /** A saved page + the layout it was saved in (0 = a bare array from an
   *  older build: v4-API data, see QuranApiService `mushafLayout`). */
  async readPage(page: number): Promise<{ mushaf: number; verses: VerseWithWords[] } | null> {
    const raw = await readJson<VerseWithWords[] | { mushaf: number; verses: VerseWithWords[] }>(paths.page(page));
    return Array.isArray(raw) ? { mushaf: 0, verses: raw } : raw;
  }

  private tafsirMemo: { s: number; map: Record<number, string> } | null = null;

  async readTafsir(verseKey: string): Promise<TafsirEntry | null> {
    const [s, a] = verseKey.split(':').map(Number);
    if (this.tafsirMemo?.s !== s) {
      const map = await readJson<Record<number, string>>(paths.tafsirSurah(s));
      this.tafsirMemo = map ? { s, map } : null;
    }
    const html = this.tafsirMemo?.map[a];
    if (html != null) return { verseKey, tafsirId: OFFLINE_TAFSIR_ID, resourceName: 'التفسير الميسر', html };
    return readJson<TafsirEntry>(paths.tafsirAyah(verseKey)); // older builds: one file per ayah
  }

  async localAudioSrc(verseKey: string, qari: Qari): Promise<string | null> {
    const [s, a] = verseKey.split(':').map(Number);
    try {
      const { uri } = await Filesystem.getUri({ path: paths.audio(qari, s, a), directory: DIR });
      return Capacitor.convertFileSrc(uri);
    } catch {
      return null;
    }
  }

  /** Word-timing segments saved with a quran.com reciter's download (for highlighting offline). */
  async localSegments(verseKey: string, qari: Qari): Promise<AudioSegment[] | undefined> {
    if (everyayahUrl(qari, 1, 1)) return undefined;
    const [s, a] = verseKey.split(':').map(Number);
    const meta = await this.chapterMeta(qari, s, { localOnly: true }).catch(() => null);
    return meta?.[a]?.segments?.map((x) => ({ wordPosition: x[0], startMs: x[2], endMs: x[3] }));
  }

  // ── Page save (reader auto-save + mushaf pack + per-surah) ─────────────────
  private savingPages = new Set<number>();

  /** Fire-and-forget, idempotent, native-only — auto-saves a page when opened. */
  savePageForOffline(page: number): void {
    if (!native() || page < 1 || page > 604) return;
    if (this.hasPage(page)) return;
    this.resavePage(page);
  }

  /** (Re)write a page's offline copy from the network — also upgrades pages
   *  saved by older builds (missing line numbers / V4 glyphs). */
  resavePage(page: number): void {
    if (!native() || this.savingPages.has(page)) return;
    this.savingPages.add(page);
    void this.savePage(page)
      .catch(() => undefined)
      .finally(() => this.savingPages.delete(page));
  }

  /** Page text + layout AND its page font, so it renders fully offline. */
  private async savePage(page: number, opts: { mark?: boolean; strictFont?: boolean } = {}): Promise<void> {
    const verses = await quranApiService.getVersesByPageRich(page);
    await writeJson(paths.page(page), { mushaf: pageMushaf(), verses });
    if (opts.mark !== false) ds().markPage(page);
    const font = mushafFontLoader.cacheOffline(page, readerGlyph());
    if (opts.strictFont) await font;
    else await font.catch(() => undefined);
  }

  private async isPageCurrent(page: number): Promise<boolean> {
    const local = await this.readPage(page);
    return Boolean(local?.mushaf === pageMushaf() && local.verses.length && isCompleteMushafPage(local.verses));
  }

  // ── Tafsir (one API call per surah) ────────────────────────────────────────
  private async saveTafsirSurah(s: number): Promise<void> {
    const res = await fetch(`${API}/tafsirs/${OFFLINE_TAFSIR_ID}/by_chapter/${s}?per_page=300`);
    if (!res.ok) throw new Error(`tafsir ${s}: ${res.status}`);
    const j = (await res.json()) as { tafsirs: Array<{ verse_key: string; text: string }> };
    const map: Record<number, string> = {};
    for (const t of j.tafsirs ?? []) map[Number(t.verse_key.split(':')[1])] = t.text;
    const n = surahs[s - 1]?.versesCount ?? 0;
    if (Object.keys(map).length < n) throw new Error(`tafsir ${s}: incomplete`);
    await writeJson(paths.tafsirSurah(s), map);
    if (this.tafsirMemo?.s === s) this.tafsirMemo = null;
    ds().markTafsir(s);
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  private metaMemo = new Map<string, Promise<ChapterMeta>>();

  /** quran.com reciters: one call per surah for all ayah urls + word segments, kept on disk. */
  private chapterMeta(qari: Qari, s: number, opts: { localOnly?: boolean } = {}): Promise<ChapterMeta> {
    const key = `${qari}:${s}`;
    const hit = this.metaMemo.get(key);
    if (hit) return hit;
    const load = async (): Promise<ChapterMeta> => {
      const local = await readJson<ChapterMeta>(paths.audioMeta(qari, s));
      if (local) return local;
      if (opts.localOnly) throw new Error('no local meta');
      const res = await fetch(`${API}/recitations/${reciterId(qari)}/by_chapter/${s}?per_page=300&fields=segments`);
      if (!res.ok) throw new Error(`recitation ${qari} ${s}: ${res.status}`);
      const j = (await res.json()) as { audio_files: Array<{ verse_key: string; url: string; segments?: number[][] }> };
      const meta: ChapterMeta = {};
      for (const f of j.audio_files ?? []) {
        meta[Number(f.verse_key.split(':')[1])] = { url: absoluteAudioUrl(f.url), segments: f.segments };
      }
      await writeJson(paths.audioMeta(qari, s), meta);
      return meta;
    };
    const p = load();
    p.catch(() => this.metaMemo.delete(key));
    this.metaMemo.set(key, p);
    // ponytail: keep only a few surahs' meta in memory (segments are ~150 KB for al-Baqarah).
    if (this.metaMemo.size > 4) this.metaMemo.delete(this.metaMemo.keys().next().value!);
    return p;
  }

  private async fetchAyah(qari: Qari, s: number, a: number): Promise<void> {
    const path = paths.audio(qari, s, a);
    if (!(await exists(path))) {
      const url = everyayahUrl(qari, s, a) ?? (await this.chapterMeta(qari, s))[a]?.url;
      if (!url) throw new Error(`no audio url ${qari} ${s}:${a}`);
      await downloadTo(url, path);
    }
    ds().addAudio(qari, s, [a]);
  }

  // ── Pack runner: pause / resume / cancel / network gate ────────────────────
  private jobs: Partial<Record<PackId, Job>> = {};
  private autoPaused = new Set<PackId>();
  private cellularOk = new Set<PackId>();
  private watching = false;

  isRunning(id: PackId): boolean {
    return Boolean(this.jobs[id]);
  }

  private wifiApplies(id: PackId): boolean {
    return (id === 'audio' || id === 'adhkar') && ds().wifiOnly && !this.cellularOk.has(id);
  }

  private async gate(id: PackId): Promise<Gate> {
    const st = await Network.getStatus().catch(() => null);
    return networkGate(st?.connected ?? navigator.onLine !== false, st?.connectionType ?? 'unknown', this.wifiApplies(id));
  }

  private watchNetwork(): void {
    if (this.watching) return;
    this.watching = true;
    void Network.addListener('networkStatusChange', (st) => {
      for (const id of ['mushaf', 'tafsir', 'audio', 'adhkar'] as PackId[]) {
        const g = networkGate(st.connected, st.connectionType, this.wifiApplies(id));
        const job = this.jobs[id];
        const pack = ds().packs[id];
        if (job && g !== 'ok' && job.state === 'running') {
          job.pause();
          this.autoPaused.add(id);
          ds().setPack(id, { status: 'paused', reason: g });
        } else if (g === 'ok' && job && this.autoPaused.has(id)) {
          this.autoPaused.delete(id);
          job.resume();
          ds().setPack(id, { status: 'downloading', reason: undefined });
        } else if (g === 'ok' && !job && pack?.status === 'paused' && pack.reason) {
          void this.resume(id); // blocked before it could start → start now
        }
      }
    }).catch(() => undefined);
  }

  private async runPack<T>(
    id: PackId,
    items: T[],
    worker: (t: T) => Promise<void>,
    cfg: { total: number; already: number; concurrency: number; extra?: Partial<PackState>; finalDone?: () => number },
  ): Promise<void> {
    if (!native() || this.jobs[id]) return;
    this.watchNetwork();
    const job = new Job();
    this.jobs[id] = job;
    let done = cfg.already;
    let failed = 0;
    ds().setPack(id, { status: 'downloading', done, total: cfg.total, failed: 0, reason: undefined, ...cfg.extra });
    const g0 = await this.gate(id);
    if (g0 !== 'ok') {
      delete this.jobs[id];
      ds().setPack(id, { status: 'paused', reason: g0 });
      return;
    }
    // A request that dies because the network dropped waits for it and retries once.
    const guarded = async (t: T) => {
      try {
        await worker(t);
      } catch (e) {
        const g = await this.gate(id);
        if (g === 'ok' || job.state === 'cancelled') throw e;
        if (job.state === 'running') {
          job.pause();
          this.autoPaused.add(id);
          ds().setPack(id, { status: 'paused', reason: g });
        }
        if (!(await job.gate())) throw e;
        await worker(t);
      }
    };
    try {
      const res = await runQueue(items, guarded, {
        concurrency: cfg.concurrency,
        job,
        onSettled: (ok) => {
          if (ok) done += 1;
          else failed += 1;
          ds().setPack(id, { done, failed });
        },
      });
      if (res.cancelled) ds().setPack(id, { status: 'idle', reason: undefined });
      else
        ds().setPack(id, {
          status: failed > 0 ? 'error' : 'done',
          done: cfg.finalDone?.() ?? done,
          failed,
          reason: undefined,
        });
    } catch {
      ds().setPack(id, { status: 'error', failed });
    } finally {
      delete this.jobs[id];
      this.autoPaused.delete(id);
      this.cellularOk.delete(id);
    }
  }

  pause(id: PackId): void {
    const job = this.jobs[id];
    if (!job) return;
    job.pause();
    this.autoPaused.delete(id);
    ds().setPack(id, { status: 'paused', reason: undefined });
  }

  /** Resume a paused job, or (after an app restart / a block) start it again — it skips what's on disk. */
  async resume(id: PackId, opts: { allowCellular?: boolean } = {}): Promise<void> {
    if (opts.allowCellular) this.cellularOk.add(id);
    const job = this.jobs[id];
    if (job) {
      const g = await this.gate(id);
      if (g !== 'ok') return void ds().setPack(id, { status: 'paused', reason: g });
      this.autoPaused.delete(id);
      job.resume();
      ds().setPack(id, { status: 'downloading', reason: undefined });
      return;
    }
    const pack = ds().packs[id];
    if (id === 'mushaf') return this.downloadMushaf();
    if (id === 'tafsir') return this.downloadTafsir();
    if (id === 'adhkar') return this.downloadAdhkar();
    if (pack?.qari && pack.scope) return this.downloadAudio(pack.qari, pack.scope, pack.label);
  }

  cancel(id: PackId): void {
    const job = this.jobs[id];
    if (job) job.cancel();
    else ds().setPack(id, { status: 'idle', reason: undefined });
  }

  // ── Packs ──────────────────────────────────────────────────────────────────
  /** The whole mushaf: 604 pages (text + layout) + their page fonts. */
  downloadMushaf(): Promise<void> {
    const pages = Array.from({ length: 604 }, (_, i) => i + 1);
    return this.runPack(
      'mushaf',
      pages,
      async (p) => {
        if (this.hasPage(p) && (await this.isPageCurrent(p))) await mushafFontLoader.cacheOffline(p, readerGlyph());
        else await this.savePage(p, { strictFont: true });
      },
      { total: 604, already: 0, concurrency: 3, finalDone: () => this.downloadedPageCount() },
    );
  }

  /** @deprecated kept for older callers — use downloadMushaf(). */
  downloadAllPages(): Promise<void> {
    return this.downloadMushaf();
  }
  cancelBulkPages(): void {
    this.cancel('mushaf');
  }

  /** Al-Muyassar for all 6236 ayat — 114 requests (one per surah). */
  downloadTafsir(): Promise<void> {
    const todo = surahs.map((s) => s.number).filter((s) => !ds().tafsirSurahs[s]);
    return this.runPack('tafsir', todo, (s) => this.saveTafsirSurah(s), {
      total: 114,
      already: 114 - todo.length,
      concurrency: 3,
    });
  }

  /** Per-ayah audio for one reciter over a surah / juz / the whole Quran. */
  downloadAudio(qari: Qari, scope: AudioScope, label?: string): Promise<void> {
    const ayat = scopeAyat(scope);
    const missing = indexMissing(ds().audioIndex, qari, ayat);
    const items: Array<[number, number]> = [];
    for (const [s, list] of missing) for (const a of list) items.push([s, a]);
    const total = countAyat(ayat);
    return this.runPack('audio', items, ([s, a]) => this.fetchAyah(qari, s, a), {
      total,
      already: total - items.length,
      concurrency: 4,
      extra: { qari, scope, label },
    });
  }

  /** Every Hisn al-Muslim clip + Quranic ayah used by adhkar listening. */
  downloadAdhkar(): Promise<void> {
    return this.runPack(
      'adhkar',
      ALL_ADHKAR_AUDIO_URLS,
      async (url) => {
        const path = paths.adhkar(url);
        if (!(await exists(path))) await downloadTo(url, path);
      },
      { total: ALL_ADHKAR_AUDIO_URLS.length, already: 0, concurrency: 3 },
    );
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async deleteMushaf(): Promise<void> {
    this.jobs.mushaf?.cancel();
    await rmdir('offline/pages');
    await rmdir('offline/fonts');
    ds().clearPages();
    // Per-surah bundles lose their pages; their audio/tafsir live on in their own indexes.
    for (const k of Object.keys(ds().items)) ds().removeItem(Number(k));
    ds().setPack('mushaf', { status: 'idle', done: 0, failed: 0, reason: undefined });
  }

  async deleteTafsir(): Promise<void> {
    this.jobs.tafsir?.cancel();
    await rmdir('offline/tafsir16');
    await rmdir('offline/tafsir');
    this.tafsirMemo = null;
    ds().clearTafsir();
    ds().setPack('tafsir', { status: 'idle', done: 0, failed: 0, reason: undefined });
  }

  /** A reciter's audio — all of it, or one surah. */
  async deleteAudio(qari: Qari, surah?: number): Promise<void> {
    if (ds().packs.audio?.qari === qari && this.jobs.audio) this.jobs.audio.cancel();
    if (surah == null) {
      await rmdir(paths.audioDir(qari));
    } else {
      const n = surahs[surah - 1]?.versesCount ?? 0;
      for (let a = 1; a <= n; a++) await Filesystem.deleteFile({ path: paths.audio(qari, surah, a), directory: DIR }).catch(() => {});
      await Filesystem.deleteFile({ path: paths.audioMeta(qari, surah), directory: DIR }).catch(() => {});
    }
    for (const k of [...this.metaMemo.keys()]) if (k.startsWith(`${qari}:`)) this.metaMemo.delete(k);
    ds().dropAudio(qari, surah);
    for (const d of Object.values(ds().items)) {
      if (d.withAudio && d.qari === qari && (surah == null || d.surah === surah)) ds().setItem(d.surah, { withAudio: false });
    }
  }

  async deleteAdhkar(): Promise<void> {
    this.jobs.adhkar?.cancel();
    await rmdir('offline/adhkar');
    ds().setPack('adhkar', { status: 'idle', done: 0, failed: 0, reason: undefined });
  }

  /** Bytes on disk per pack (readdir sizes). */
  async usage(): Promise<OfflineUsage> {
    const out: OfflineUsage = { mushaf: 0, tafsir: 0, adhkar: 0, audio: {} };
    if (!native()) return out;
    out.mushaf = (await dirSize('offline/pages')) + (await dirSize('offline/fonts'));
    out.tafsir = (await dirSize('offline/tafsir16')) + (await dirSize('offline/tafsir'));
    out.adhkar = await dirSize('offline/adhkar');
    try {
      const { files } = await Filesystem.readdir({ path: 'offline/audio', directory: DIR });
      for (const f of files) if (f.type === 'directory') out.audio[f.name] = await dirSize(`offline/audio/${f.name}`);
    } catch {
      /* nothing downloaded yet */
    }
    return out;
  }

  /** Count of adhkar clips on disk (the pack may have been filled by listening). */
  async adhkarOnDisk(): Promise<number> {
    if (!native()) return 0;
    try {
      const { files } = await Filesystem.readdir({ path: 'offline/adhkar', directory: DIR });
      const names = new Set(files.map((f) => f.name));
      return ALL_ADHKAR_AUDIO_URLS.filter((u) => names.has(paths.adhkar(u).split('/').pop()!)).length;
    } catch {
      return 0;
    }
  }

  // ── Per-surah bundle (pages + tafsir + optional audio) ─────────────────────
  async downloadSurah(surahNumber: number, opts: { withAudio: boolean; qari: Qari }): Promise<boolean> {
    const surah = surahs.find((s) => s.number === surahNumber);
    if (!surah || !native()) return false;
    const { setItem } = ds();
    const pages = pagesOf(surahNumber);
    const verses = surah.versesCount;
    const totalSteps = pages.length + 1 + (opts.withAudio ? verses : 0);
    let done = 0;
    const bump = () => {
      done += 1;
      setItem(surahNumber, { progress: Math.min(0.999, done / totalSteps) });
    };
    setItem(surahNumber, { status: 'downloading', progress: 0, withAudio: opts.withAudio, qari: opts.qari, pages, bytes: 0 });
    try {
      for (const page of pages) {
        if (!(this.hasPage(page) && (await this.isPageCurrent(page)))) await this.savePage(page, { mark: false });
        bump();
      }
      if (!ds().tafsirSurahs[surahNumber]) await this.saveTafsirSurah(surahNumber);
      bump();
      let failed = 0;
      if (opts.withAudio) {
        const res = await runQueue(
          Array.from({ length: verses }, (_, i) => i + 1),
          (a) => this.fetchAyah(opts.qari, surahNumber, a),
          { concurrency: 4, job: new Job(), onSettled: bump },
        );
        failed = res.failed.length;
      }
      setItem(surahNumber, { status: failed ? 'error' : 'done', progress: failed ? done / totalSteps : 1 });
      return failed === 0;
    } catch (e) {
      console.warn('[offline] downloadSurah failed', surahNumber, e);
      setItem(surahNumber, { status: 'error' });
      return false;
    }
  }

  async removeSurah(surahNumber: number): Promise<void> {
    const { items, removeItem, pageSet } = ds();
    const rec = items[surahNumber];
    if (native() && rec) {
      // Pages shared with another downloaded surah or the whole-mushaf pack stay.
      const keep = new Set(
        Object.values(items)
          .filter((d) => d.surah !== surahNumber && d.status === 'done')
          .flatMap((d) => d.pages),
      );
      for (const p of rec.pages) {
        if (!keep.has(p) && !pageSet[p]) await Filesystem.deleteFile({ path: paths.page(p), directory: DIR }).catch(() => {});
      }
      if (rec.withAudio) await this.deleteAudio(rec.qari, surahNumber);
    }
    removeItem(surahNumber);
  }
}

export const offlineService = new OfflineService();
