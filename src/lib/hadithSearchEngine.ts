import { closeWords, normalizeArabic, queryTokens, stripPrefix, type Vocab } from './arabicSearch';

/**
 * Full-text search over the nine hadith books, without an index: every hadith
 * is normalised (no tashkeel, folded letters) into ONE string, and each query
 * word is found with `indexOf` scans — fast enough for ~20M chars and far
 * lighter on memory than an inverted index. Typos and spelling variants come
 * from the bundled vocabulary (`closeWords`): «يصبها» also finds «يصيبها».
 */

export interface Corpus {
  /** Normalised hadiths joined by '\n'. */
  text: string;
  /** Start offset of each hadith in `text`. */
  starts: Int32Array;
  book: Uint8Array;
  num: Uint32Array;
}

/** `normalized`: the texts already went through `normalizeArabic` (the worker
 *  does it per chunk on arrival, so the raw text can be freed early). */
export function buildCorpus(books: { book: number; texts: string[] }[], normalized = false): Corpus {
  const parts: string[] = [];
  const book: number[] = [];
  const num: number[] = [];
  for (const b of books) {
    b.texts.forEach((t, i) => {
      parts.push(normalized ? t : normalizeArabic(t));
      book.push(b.book);
      num.push(i + 1);
    });
  }
  const starts = new Int32Array(parts.length);
  let at = 0;
  parts.forEach((p, i) => {
    starts[i] = at;
    at += p.length + 1;
  });
  return { text: parts.join('\n'), starts, book: Uint8Array.from(book), num: Uint32Array.from(num) };
}

const isGap = (ch: string | undefined) => ch === undefined || ch === ' ' || ch === '\n';

/** Mark every hadith containing `pattern`. `level` per hit: 3 = the word itself
 *  (optionally with و/ف/ب/ل/ك/ال before it), 2 = inside a longer word. */
function scan(c: Corpus, pattern: string, onHit: (doc: number, level: 2 | 3, pos: number) => void, wholeWordOnly = false) {
  const { text, starts } = c;
  let doc = 0;
  for (let pos = text.indexOf(pattern); pos !== -1; pos = text.indexOf(pattern, pos + 1)) {
    while (doc + 1 < starts.length && starts[doc + 1] <= pos) doc++;
    const end = pos + pattern.length;
    let level: 2 | 3 = 2;
    if (isGap(text[end])) {
      if (isGap(text[pos - 1])) level = 3;
      else {
        let ws = pos;
        while (!isGap(text[ws - 1])) ws--;
        if (stripPrefix(text.slice(ws, end)) === pattern) level = 3;
      }
    }
    if (wholeWordOnly && level !== 3) continue;
    onHit(doc, level, pos);
  }
}

export interface SearchHit {
  book: number;
  number: number;
  /** Matched only through a close spelling, not the typed words. */
  near: boolean;
}

export interface SearchResult {
  total: number;
  /** Hits that contain every typed word as written (ranked first). */
  exact: number;
  hits: SearchHit[];
  /** Words to highlight: the typed words plus the close spellings used. */
  words: string[];
}

export interface SearchOptions {
  books?: number[];
  offset?: number;
  limit?: number;
}

/**
 * Rank: typed words matched as words > inside words > close spellings, a bonus
 * when the words sit together (or form the typed phrase), then book order and
 * number. Up to two words must all match; longer queries may miss one.
 */
export function searchCorpus(c: Corpus, vocab: Vocab, query: string, opts: SearchOptions = {}): SearchResult {
  const { offset = 0, limit = 30 } = opts;
  const allow = opts.books ? new Set(opts.books) : null;
  const n = c.starts.length;
  const empty: SearchResult = { total: 0, exact: 0, hits: [], words: [] };

  // A bare number → that hadith in each (selected) book.
  if (/^\s*[0-9٠-٩]+\s*$/.test(query)) {
    const want = Number(normalizeArabic(query));
    const hits: SearchHit[] = [];
    for (let i = 0; i < n; i++) if (c.num[i] === want && (!allow || allow.has(c.book[i]))) hits.push({ book: c.book[i], number: want, near: false });
    return { total: hits.length, exact: hits.length, hits: hits.slice(offset, offset + limit), words: [] };
  }

  const tokens = queryTokens(query).filter((t) => t.length >= 2 || /\d/.test(t));
  if (!tokens.length) return empty;
  const need = tokens.length <= 2 ? tokens.length : tokens.length - 1;

  const levels = tokens.map(() => new Uint8Array(n));
  tokens.forEach((t, k) => {
    const lv = levels[k];
    scan(c, t, (doc, level) => {
      if (level > lv[doc]) lv[doc] = level;
    });
  });

  // Close spellings only for words the books never use as typed (a likely
  // typo) — or for every word when the exact matches are scarce. Expanding
  // well-spelled words floods results: «الصبر» would pull in «الصبح».
  let exactDocs = 0;
  for (let d = 0; d < n && exactDocs < 10; d++)
    if ((!allow || allow.has(c.book[d])) && levels.reduce((m, lv) => m + (lv[d] ? 1 : 0), 0) >= need) exactDocs++;
  const words = [...tokens];
  const variantOf = new Map<string, number>();
  tokens.forEach((t, k) => {
    if (vocab.known.has(t) && exactDocs >= 10) return;
    const lv = levels[k];
    for (const v of closeWords(t, vocab)) {
      words.push(v);
      variantOf.set(v, k);
      scan(c, v, (doc) => {
        if (!lv[doc]) lv[doc] = 1;
      }, true);
    }
  });

  const phrase = tokens.length > 1 ? new Uint8Array(n) : null;
  if (phrase) scan(c, tokens.join(' '), (doc) => (phrase[doc] = 1));

  const cand: { doc: number; score: number; near: boolean }[] = [];
  for (let d = 0; d < n; d++) {
    if (allow && !allow.has(c.book[d])) continue;
    let matched = 0;
    let score = 0;
    let near = false;
    for (let k = 0; k < tokens.length; k++) {
      const l = levels[k][d];
      if (!l) continue;
      matched++;
      score += l;
      if (l === 1) near = true;
    }
    if (matched < need) continue;
    if (matched < tokens.length) near = true;
    if (phrase?.[d]) score += 4;
    cand.push({ doc: d, score, near });
  }

  // Proximity: the typed words (or their close spellings) side by side.
  if (tokens.length > 1 && cand.length <= 20000) {
    for (const x of cand) {
      if (phrase?.[x.doc]) continue;
      const end = x.doc + 1 < n ? c.starts[x.doc + 1] - 1 : c.text.length;
      const ws = c.text.slice(c.starts[x.doc], end).split(' ');
      const last = new Array<number>(tokens.length).fill(-1e9);
      let best = Infinity;
      ws.forEach((w, i) => {
        const core = stripPrefix(w);
        let k = tokens.findIndex((t) => w.includes(t) || core === t);
        if (k < 0) k = variantOf.get(w) ?? -1;
        if (k < 0) return;
        last[k] = i;
        const lo = Math.min(...last);
        if (lo > -1e9) best = Math.min(best, i - lo + 1);
      });
      if (best <= tokens.length + 1) x.score += 3;
      else if (best <= tokens.length + 5) x.score += 1;
    }
  }

  cand.sort((a, b) => Number(a.near) - Number(b.near) || b.score - a.score || c.book[a.doc] - c.book[b.doc] || a.doc - b.doc);
  return {
    total: cand.length,
    exact: cand.filter((x) => !x.near).length,
    hits: cand.slice(offset, offset + limit).map((x) => ({ book: c.book[x.doc], number: c.num[x.doc], near: x.near })),
    words: [...new Set(words)],
  };
}

/** Split display text into runs, marking the words a search matched. */
export function highlightRuns(text: string, words: readonly string[]): { s: string; hit: boolean }[] {
  if (!words.length) return [{ s: text, hit: false }];
  const set = new Set(words);
  return text.split(/(\s+)/).map((s) => {
    const w = normalizeArabic(s);
    const hit = !!w && (set.has(w) || set.has(stripPrefix(w)) || words.some((t) => t.length >= 2 && w.includes(t)));
    return { s, hit };
  });
}
