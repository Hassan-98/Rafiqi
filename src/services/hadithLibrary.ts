import { HADITH_BOOKS, HADITH_CHUNK } from '@/data/hadithBooks';
import { chunkPath, fetchGzText } from '@/lib/hadithData';
import type { SearchOptions, SearchResult } from '@/lib/hadithSearchEngine';
import type { InspirationItem } from './inspirationService';

// Display cache: a handful of 1000-hadith chunks (≈1 MB each) at a time.
const MAX_CHUNKS = 8;
const chunks = new Map<string, Promise<string[]>>();

function loadChunk(book: number, chunk: number): Promise<string[]> {
  const key = `${book}:${chunk}`;
  let p = chunks.get(key);
  if (p) {
    chunks.delete(key);
  } else {
    p = fetchGzText(chunkPath(book, chunk)).then((t) => JSON.parse(t) as string[]);
    p.catch(() => chunks.delete(key));
  }
  chunks.set(key, p);
  while (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value!);
  return p;
}

/** Hadith texts `from`…`to` (1-based, inclusive) of one book. */
export async function getHadiths(book: number, from: number, to: number): Promise<string[]> {
  const out: string[] = [];
  for (let c = Math.floor((from - 1) / HADITH_CHUNK); c <= Math.floor((to - 1) / HADITH_CHUNK); c++) {
    const texts = await loadChunk(book, c);
    const base = c * HADITH_CHUNK;
    for (let n = Math.max(from, base + 1); n <= Math.min(to, base + texts.length); n++) out.push(texts[n - base - 1]);
  }
  return out;
}

export const getHadith = async (book: number, n: number): Promise<string | undefined> => (await getHadiths(book, n, n))[0];

/** A library hadith as the shared item shape (copy / share / favourite). */
export function libraryItem(book: number, number: number, text: string): InspirationItem {
  return { kind: 'hadith', id: `lib-${book}-${number}`, text, book: HADITH_BOOKS[book].name, number, tags: [] };
}

// ── Search worker ───────────────────────────────────────────────────────────
type Out =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; id: number; result: SearchResult }
  | { type: 'error'; id: number; message: string };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (r: SearchResult) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<(done: number, total: number) => void>();
let lastProgress: [number, number] | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../lib/hadithSearch.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Out>) => {
    const m = e.data;
    if (m.type === 'progress') {
      lastProgress = [m.done, m.total];
      progressListeners.forEach((f) => f(m.done, m.total));
      return;
    }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === 'result') w.resolve(m.result);
    else w.reject(new Error(m.message));
  };
  worker.onerror = () => {
    waiting.forEach((w) => w.reject(new Error('worker')));
    waiting.clear();
    worker?.terminate();
    worker = null;
    lastProgress = null;
  };
  return worker;
}

/** Search all (or some) books. The first call loads + normalises the whole
 *  library inside the worker (progress via `onSearchProgress`). */
export function searchHadith(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'search', id, query, opts });
  });
}

/** Subscribe to the index build progress; fires the latest value immediately. */
export function onSearchProgress(f: (done: number, total: number) => void): () => void {
  progressListeners.add(f);
  if (lastProgress) f(...lastProgress);
  return () => progressListeners.delete(f);
}

/** Start loading the index ahead of the first query (e.g. on focusing search). */
export const warmSearch = () => void getWorker().postMessage({ type: 'warm' });
