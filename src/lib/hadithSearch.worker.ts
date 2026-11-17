/// <reference lib="webworker" />
import { HADITH_BOOKS, HADITH_CHUNK } from '@/data/hadithBooks';
import { chunkPath, fetchGzText } from './hadithData';
import { normalizeArabic, prepareVocab, type Vocab } from './arabicSearch';
import { buildCorpus, searchCorpus, type Corpus, type SearchOptions } from './hadithSearchEngine';

/**
 * Hadith search worker: on first use loads every chunk, keeps only the
 * NORMALISED text (the page re-reads display text from the chunks), and
 * answers queries off the main thread.
 */
declare const self: DedicatedWorkerGlobalScope;

let ready: Promise<{ corpus: Corpus; vocab: Vocab }> | null = null;

function load() {
  if (ready) return ready;
  const jobs = HADITH_BOOKS.flatMap((b) => Array.from({ length: Math.ceil(b.count / HADITH_CHUNK) }, (_, c) => ({ book: b.id, c })));
  ready = (async () => {
    const norm: string[][] = new Array(jobs.length);
    let next = 0;
    let done = 0;
    // A few files in flight; each is normalised on arrival so its raw text can go.
    const run = async () => {
      while (next < jobs.length) {
        const i = next++;
        const raw = JSON.parse(await fetchGzText(chunkPath(jobs[i].book, jobs[i].c))) as string[];
        norm[i] = raw.map(normalizeArabic);
        self.postMessage({ type: 'progress', done: ++done, total: jobs.length });
      }
    };
    const [vocabText] = await Promise.all([fetchGzText('vocab.txt.gzip'), ...Array.from({ length: 4 }, run)]);
    const books = HADITH_BOOKS.map((b) => ({ book: b.id, texts: [] as string[] }));
    jobs.forEach((j, i) => books[j.book].texts.push(...norm[i]));
    return { corpus: buildCorpus(books, true), vocab: prepareVocab(vocabText.split('\n')) };
  })();
  ready.catch(() => (ready = null));
  return ready;
}

self.onmessage = async (e: MessageEvent<{ type: 'warm' } | { type: 'search'; id: number; query: string; opts: SearchOptions }>) => {
  const m = e.data;
  if (m.type === 'warm') {
    void load().catch(() => {});
    return;
  }
  try {
    const { corpus, vocab } = await load();
    self.postMessage({ type: 'result', id: m.id, result: searchCorpus(corpus, vocab, m.query, m.opts) });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err) });
  }
};
