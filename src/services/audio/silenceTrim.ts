import { lastAudibleSec, trimmedEnd } from './silence';

/**
 * Background analysis of each ayah file's silent tail. A separate fetch +
 * decode (the <audio> element keeps NO crossOrigin); the recitation CDNs send
 * `Access-Control-Allow-Origin: *`, and offline files are same-origin. Any
 * failure just leaves the natural 'ended' in charge.
 *
 * Results: memory Map + a small persisted LRU (value 0 = "no tail to trim").
 */
const STORE_KEY = 'myzikr:ayah-tails-v1';
const MAX = 2000;

/** Reciter folder + file is enough to identify a clip and keeps the LRU small. */
const keyOf = (url: string) => url.split('?')[0].split('/').slice(-3).join('/');

let cache: Map<string, number> | null = null;
const inflight = new Map<string, Promise<number | null>>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Map<string, number> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, number][]) cache.set(k, v);
  } catch {
    /* corrupt / unavailable — start empty */
  }
  return cache;
}

function remember(key: string, end: number): void {
  const c = load();
  c.delete(key);
  c.set(key, end);
  while (c.size > MAX) c.delete(c.keys().next().value as string);
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...load()]));
    } catch {
      /* quota — the memory cache still works this session */
    }
  }, 2000);
}

/** Known trimmed end (seconds; 0 = don't trim), or undefined if not analysed yet. */
export function knownTailEnd(url: string): number | undefined {
  return load().get(keyOf(url));
}

/** Analyse a clip (deduped). Resolves the trimmed end, or null on failure. */
export function analyseTail(url: string): Promise<number | null> {
  const key = keyOf(url);
  const known = load().get(key);
  if (known !== undefined) return Promise.resolve(known);
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    try {
      if (typeof OfflineAudioContext === 'undefined') return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
      const end = trimmedEnd(lastAudibleSec(audio.getChannelData(0), audio.sampleRate), audio.duration);
      remember(key, end);
      return end;
    } catch {
      return null; // CORS / offline / decode error → natural 'ended'
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}
