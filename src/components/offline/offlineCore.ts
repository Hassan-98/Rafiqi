/**
 * Pure offline-download logic (no Capacitor, no React) so it can be checked in
 * node: scripts/offline.test.ts. Paths, size estimates, the ayah-audio index,
 * download scopes and a pausable concurrent queue.
 */
import type { Qari } from '@/types';
import { EVERYAYAH_FOLDERS, RECITER_IDS } from '@/types';
import { surahs } from '@/data/surahs';

// ── File layout (Directory.Data) ─────────────────────────────────────────────
export const OFFLINE_TAFSIR_ID = 16;
export const paths = {
  page: (p: number) => `offline/pages/${p}.json`,
  /** One file per surah: Record<ayah, html>. */
  tafsirSurah: (s: number) => `offline/tafsir16/${s}.json`,
  /** Legacy per-ayah tafsir (older builds) — still read. */
  tafsirAyah: (vk: string) => `offline/tafsir/${vk.replace(':', '_')}.json`,
  audioDir: (q: Qari | string) => `offline/audio/${q}`,
  audio: (q: Qari | string, s: number, a: number) => `offline/audio/${q}/${s}_${a}.mp3`,
  /** quran.com chapter recitation (urls + word segments) for offline highlighting. */
  audioMeta: (q: Qari | string, s: number) => `offline/audio/${q}/meta/${s}.json`,
  /** Shared with useAdhkarListen (it also caches a clip after one full play). */
  adhkar: (url: string) => `offline/adhkar/${url.replace(/^https:\/\/[^/]+\//, '').replace(/\//g, '_')}`,
};

// ── Size model ───────────────────────────────────────────────────────────────
/** Arabic letters per surah (imlaei text, quran.com) — the audio size proxy. */
export const SURAH_LETTERS = [
  143, 26249, 14985, 16332, 12206, 12726, 14435, 5387, 11115, 7589, 7817, 7307, 3545, 3539, 2882, 7832, 6643, 6552, 3935,
  5399, 5094, 5314, 4483, 5754, 3878, 5630, 4790, 5930, 4317, 3472, 2171, 1563, 5788, 3594, 3238, 3068, 3899, 3065, 4869,
  5108, 3365, 3522, 3609, 1474, 2085, 2667, 2423, 2510, 1533, 1507, 1546, 1324, 1433, 1469, 1647, 1756, 2545, 2046, 1970,
  1560, 966, 768, 801, 1091, 1203, 1105, 1347, 1289, 1133, 971, 965, 1109, 854, 1035, 676, 1087, 841, 796, 785, 552, 435,
  333, 750, 445, 469, 254, 296, 382, 584, 342, 253, 314, 165, 102, 162, 288, 115, 404, 158, 169, 160, 123, 73, 134, 97, 77,
  114, 43, 99, 80, 81, 47, 73, 80,
];

/** bytes ≈ perAyah + perLetter × letters, fitted on 20 HEAD samples per reciter (2026-09).
 *  ponytail: static calibration; re-fit (scratch script) if a CDN changes bitrate. */
const AUDIO_MODEL: Record<Qari, { perAyah: number; perLetter: number }> = {
  abdulbasit: { perAyah: 33175, perLetter: 10079 },
  sudais: { perAyah: 41783, perLetter: 5268 },
  shatri: { perAyah: 5558, perLetter: 4312 },
  rifai: { perAyah: 21716, perLetter: 6360 },
  husary: { perAyah: 0, perLetter: 3580 },
  husary_muallim: { perAyah: 0, perLetter: 9144 },
  alafasy: { perAyah: 40692, perLetter: 4406 },
  minshawi: { perAyah: 0, perLetter: 5170 },
  shuraim: { perAyah: 13832, perLetter: 3035 },
  tablawi: { perAyah: 17976, perLetter: 5192 },
  maher: { perAyah: 0, perLetter: 1860 },
  dossari: { perAyah: 33497, perLetter: 4305 },
  // ponytail: bitrate-scaled estimates (≈ kbps × 40 B/letter), not HEAD-fitted — re-fit if sizes look off.
  fares: { perAyah: 0, perLetter: 2560 },
  ghamdi: { perAyah: 0, perLetter: 1600 },
  ajmy: { perAyah: 0, perLetter: 5120 },
  basfar: { perAyah: 0, perLetter: 7680 },
  juhany: { perAyah: 0, perLetter: 5120 },
  jibreel: { perAyah: 0, perLetter: 5120 },
  qatami: { perAyah: 0, perLetter: 5120 },
  ali_jaber: { perAyah: 0, perLetter: 2560 },
  bukhatir: { perAyah: 0, perLetter: 5120 },
  ayyoub: { perAyah: 0, perLetter: 5120 },
  hudhaify: { perAyah: 0, perLetter: 5120 },
  akhdar: { perAyah: 0, perLetter: 1280 },
  qahtani: { perAyah: 0, perLetter: 7680 },
  matroud: { perAyah: 0, perLetter: 5120 },
  yaser_salamah: { perAyah: 0, perLetter: 5120 },
  banna: { perAyah: 0, perLetter: 1280 },
  mustafa_ismail: { perAyah: 0, perLetter: 1920 },
  minshawi_mujawwad: { perAyah: 0, perLetter: 7680 },
  husary_mujawwad: { perAyah: 0, perLetter: 5120 },
  abdulbasit_murattal: { perAyah: 0, perLetter: 7680 },
};

const MB = 1024 * 1024;
/** Measured: page JSON ≈ 37 KB + V4 page font ≈ 52 KB. */
export const MUSHAF_BYTES = 604 * 90 * 1024;
export const TAFSIR_BYTES = Math.round(4.5 * MB);
/** 33 Hisn al-Muslim clips + 16 Husary ayat (HEAD-summed). */
export const ADHKAR_BYTES = Math.round(17.3 * MB);

const versesOf = (s: number) => surahs[s - 1]?.versesCount ?? 0;

/** Estimated bytes for a set of ayat (surah → ayah numbers). */
export function estimateAudioBytes(qari: Qari, ayat: Map<number, number[]>): number {
  const m = AUDIO_MODEL[qari] ?? AUDIO_MODEL.husary;
  let bytes = 0;
  for (const [s, list] of ayat) {
    const total = versesOf(s) || 1;
    bytes += m.perAyah * list.length + m.perLetter * (SURAH_LETTERS[s - 1] ?? 0) * (list.length / total);
  }
  return Math.round(bytes);
}

/** «١٢٫٥ م.ب» / «٣٤٠ ك.ب» / «١٫٢ ج.ب» (Arabic-Indic digits). */
export function formatBytes(n: number): string {
  const d = (x: string) => x.replace(/\d/g, (c) => '٠١٢٣٤٥٦٧٨٩'[Number(c)]).replace('.', '٫');
  if (n < MB) return `${d(String(Math.max(1, Math.round(n / 1024))))} ك.ب`;
  if (n < 1024 * MB) return `${d((n / MB).toFixed(n < 10 * MB ? 1 : 0))} م.ب`;
  return `${d((n / (1024 * MB)).toFixed(1))} ج.ب`;
}

// ── Download scopes ──────────────────────────────────────────────────────────
/** First ayah of each juz (quran.com /juzs, verified). */
export const JUZ_STARTS: Array<[number, number]> = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

export type AudioScope = { kind: 'surah'; surah: number } | { kind: 'juz'; juz: number } | { kind: 'all' };

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** surah → ayah numbers covered by a scope, in mushaf order. */
export function scopeAyat(scope: AudioScope): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (scope.kind === 'surah') {
    out.set(scope.surah, range(1, versesOf(scope.surah)));
  } else if (scope.kind === 'all') {
    for (let s = 1; s <= 114; s++) out.set(s, range(1, versesOf(s)));
  } else {
    const [s0, a0] = JUZ_STARTS[scope.juz - 1];
    const next = JUZ_STARTS[scope.juz]; // undefined for juz 30
    const [s1, a1] = next ? (next[1] > 1 ? [next[0], next[1] - 1] : [next[0] - 1, versesOf(next[0] - 1)]) : [114, 6];
    for (let s = s0; s <= s1; s++) out.set(s, range(s === s0 ? a0 : 1, s === s1 ? a1 : versesOf(s)));
  }
  return out;
}

export const countAyat = (m: Map<number, number[]>) => [...m.values()].reduce((n, l) => n + l.length, 0);

// ── Ayah-audio index: qari → surah → true (whole surah) | ayah numbers ───────
export type AudioIndex = Record<string, Record<number, true | number[]>>;

export function indexHas(ix: AudioIndex, qari: string, s: number, a: number): boolean {
  const e = ix[qari]?.[s];
  return e === true || (Array.isArray(e) && e.includes(a));
}

/** Immutable add; collapses a surah to `true` once every ayah is present. */
export function indexAdd(ix: AudioIndex, qari: string, s: number, ayat: number[]): AudioIndex {
  const cur = ix[qari]?.[s];
  if (cur === true || ayat.length === 0) return ix;
  const set = new Set([...(cur ?? []), ...ayat]);
  const entry: true | number[] = set.size >= versesOf(s) ? true : [...set].sort((x, y) => x - y);
  return { ...ix, [qari]: { ...ix[qari], [s]: entry } };
}

export function indexCount(ix: AudioIndex, qari: string, s: number): number {
  const e = ix[qari]?.[s];
  return e === true ? versesOf(s) : (e?.length ?? 0);
}

export function indexMissing(ix: AudioIndex, qari: string, ayat: Map<number, number[]>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const [s, list] of ayat) {
    const miss = list.filter((a) => !indexHas(ix, qari, s, a));
    if (miss.length) out.set(s, miss);
  }
  return out;
}

// ── Remote URLs ──────────────────────────────────────────────────────────────
const pad3 = (n: number) => String(n).padStart(3, '0');
export function everyayahUrl(qari: Qari, s: number, a: number): string | null {
  const folder = EVERYAYAH_FOLDERS[qari];
  return folder ? `https://everyayah.com/data/${folder}/${pad3(s)}${pad3(a)}.mp3` : null;
}
/** quran.com recitation urls come relative ("Sudais/mp3/…") or protocol-relative ("//mirrors…"). */
export function absoluteAudioUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://audio.qurancdn.com/${url}`;
}
export const reciterId = (q: Qari) => RECITER_IDS[q] ?? RECITER_IDS.husary!;

// ── Network gate ─────────────────────────────────────────────────────────────
export type Gate = 'ok' | 'offline' | 'cellular';
export function networkGate(connected: boolean, type: string, wifiOnly: boolean): Gate {
  if (!connected || type === 'none') return 'offline';
  if (wifiOnly && type === 'cellular') return 'cellular';
  return 'ok';
}

// ── Pausable concurrent queue ────────────────────────────────────────────────
export class Job {
  state: 'running' | 'paused' | 'cancelled' = 'running';
  private waiters: Array<() => void> = [];
  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }
  resume(): void {
    if (this.state === 'paused') this.state = 'running';
    this.flush();
  }
  cancel(): void {
    this.state = 'cancelled';
    this.flush();
  }
  /** Waits while paused; true = keep going, false = cancelled. */
  async gate(): Promise<boolean> {
    while (this.state === 'paused') await new Promise<void>((r) => this.waiters.push(r));
    return this.state === 'running';
  }
  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }
}

/** Runs `worker` over items with N lanes; a failing item is counted, never fatal. */
export async function runQueue<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  opts: { concurrency: number; job: Job; onSettled?: (ok: boolean, item: T) => void },
): Promise<{ cancelled: boolean; failed: T[] }> {
  const failed: T[] = [];
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      if (!(await opts.job.gate())) return;
      const item = items[next++];
      try {
        await worker(item);
        opts.onSettled?.(true, item);
      } catch {
        failed.push(item);
        opts.onSettled?.(false, item);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, lane));
  return { cancelled: opts.job.state === 'cancelled', failed };
}
