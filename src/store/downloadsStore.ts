import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Qari } from '@/types';
import { indexAdd, type AudioIndex, type AudioScope } from '@/components/offline/offlineCore';

export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'paused' | 'done' | 'error';

export interface SurahDownload {
  surah: number;
  status: DownloadStatus;
  progress: number; // 0..1
  withAudio: boolean;
  qari: Qari;
  pages: number[]; // mushaf pages covered by this surah
  bytes: number; // approx downloaded size (audio)
  updatedAt: string;
}

/** Progress of the "download the whole mushaf as pages" job. */
export interface BulkPagesState {
  status: DownloadStatus;
  done: number;
  total: number;
  /** Pages that failed in the last bulk run — surfaced so a partial run never
   *  silently masquerades as "المصحف كامل متاح دون إنترنت". */
  failed?: number;
}

/** The downloads center packs. */
export type PackId = 'mushaf' | 'tafsir' | 'audio' | 'adhkar';

export interface PackState {
  status: DownloadStatus;
  done: number;
  total: number;
  failed: number;
  /** Why a pack is paused/blocked: no connection, or on mobile data with «Wi-Fi فقط». */
  reason?: 'offline' | 'cellular';
  /** audio pack: the reciter + scope label of the current/last run. */
  qari?: Qari;
  scope?: AudioScope;
  label?: string;
}

interface DownloadsState {
  items: Record<number, SurahDownload>;
  /** Individually saved mushaf pages (full-mushaf download + auto-save on view). */
  pageSet: Record<number, true>;
  /** @deprecated kept for persisted-shape compatibility; see `packs.mushaf`. */
  bulk: BulkPagesState;
  /** Per-ayah audio on disk (fast sync lookup for playback). */
  audioIndex: AudioIndex;
  /** Surahs whose Al-Muyassar tafsir is on disk. */
  tafsirSurahs: Record<number, true>;
  packs: Partial<Record<PackId, PackState>>;
  /** Big audio downloads only on Wi-Fi (default on). */
  wifiOnly: boolean;
  setItem: (surah: number, patch: Partial<SurahDownload>) => void;
  removeItem: (surah: number) => void;
  get: (surah: number) => SurahDownload | undefined;
  markPage: (page: number) => void;
  setBulk: (patch: Partial<BulkPagesState>) => void;
  clearPages: () => void;
  addAudio: (qari: Qari, surah: number, ayat: number[]) => void;
  /** Forget audio for a qari (whole reciter) or one of its surahs. */
  dropAudio: (qari: Qari, surah?: number) => void;
  markTafsir: (surah: number) => void;
  clearTafsir: () => void;
  setPack: (id: PackId, patch: Partial<PackState>) => void;
  setWifiOnly: (v: boolean) => void;
}

type Persisted = Partial<Pick<DownloadsState, 'items' | 'pageSet' | 'bulk' | 'audioIndex' | 'tafsirSurahs' | 'packs' | 'wifiOnly'>>;

/**
 * Rehydrate fix-ups: a job can't survive an app restart, so a persisted
 * 'downloading' becomes 'paused' (resumable); and surahs downloaded by older
 * builds are folded into the audio/tafsir indexes (same file paths).
 */
export function normalizeDownloads(p: Persisted): Persisted {
  const packs = { ...p.packs };
  for (const k of Object.keys(packs) as PackId[]) {
    if (packs[k]?.status === 'downloading') packs[k] = { ...packs[k]!, status: 'paused' };
  }
  const items = { ...p.items };
  let audioIndex = p.audioIndex ?? {};
  const tafsirSurahs = { ...p.tafsirSurahs };
  for (const [k, d] of Object.entries(items)) {
    if (d.status === 'downloading' || d.status === 'queued') items[Number(k)] = { ...d, status: 'error' };
    if (d.status !== 'done') continue;
    tafsirSurahs[d.surah] = true;
    if (d.withAudio) audioIndex = indexAdd(audioIndex, d.qari, d.surah, Array.from({ length: 300 }, (_, i) => i + 1));
  }
  return { ...p, packs, items, audioIndex, tafsirSurahs };
}

export const useDownloadsStore = create<DownloadsState>()(
  persist(
    (set, get) => ({
      items: {},
      pageSet: {},
      bulk: { status: 'idle', done: 0, total: 0 },
      audioIndex: {},
      tafsirSurahs: {},
      packs: {},
      wifiOnly: true,
      setItem: (surah, patch) =>
        set((s) => {
          const prev =
            s.items[surah] ??
            ({
              surah,
              status: 'idle',
              progress: 0,
              withAudio: false,
              qari: 'husary',
              pages: [],
              bytes: 0,
              updatedAt: new Date().toISOString(),
            } as SurahDownload);
          return {
            items: { ...s.items, [surah]: { ...prev, ...patch, surah, updatedAt: new Date().toISOString() } },
          };
        }),
      removeItem: (surah) =>
        set((s) => {
          const next = { ...s.items };
          delete next[surah];
          return { items: next };
        }),
      get: (surah) => get().items[surah],
      markPage: (page) => set((s) => (s.pageSet[page] ? s : { pageSet: { ...s.pageSet, [page]: true } })),
      setBulk: (patch) => set((s) => ({ bulk: { ...s.bulk, ...patch } })),
      clearPages: () => set({ pageSet: {}, bulk: { status: 'idle', done: 0, total: 0 } }),
      addAudio: (qari, surah, ayat) => set((s) => ({ audioIndex: indexAdd(s.audioIndex, qari, surah, ayat) })),
      dropAudio: (qari, surah) =>
        set((s) => {
          const ix = { ...s.audioIndex };
          if (surah == null) delete ix[qari];
          else if (ix[qari]) {
            const q = { ...ix[qari] };
            delete q[surah];
            ix[qari] = q;
          }
          return { audioIndex: ix };
        }),
      markTafsir: (surah) =>
        set((s) => (s.tafsirSurahs[surah] ? s : { tafsirSurahs: { ...s.tafsirSurahs, [surah]: true } })),
      clearTafsir: () => set({ tafsirSurahs: {} }),
      setPack: (id, patch) =>
        set((s) => ({
          packs: { ...s.packs, [id]: { status: 'idle', done: 0, total: 0, failed: 0, ...s.packs[id], ...patch } },
        })),
      setWifiOnly: (wifiOnly) => set({ wifiOnly }),
    }),
    {
      name: 'myzikr:downloads',
      merge: (persisted, current) => ({ ...current, ...normalizeDownloads((persisted ?? {}) as Persisted) }),
    },
  ),
);
