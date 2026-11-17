/**
 * Arabic search primitives shared by the hadith search worker, the result
 * highlighter and the data generator (which builds the vocabulary with the
 * SAME normalisation — keep them in step).
 */

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Strip diacritics/tatweel, fold letter variants, keep letters and digits only. */
export function normalizeArabic(s: string): string {
  return s
    .replace(TASHKEEL, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-ي0-9]+/g, ' ')
    .trim();
}

/** Display without tashkeel (keeps the original letters and punctuation). */
export const stripTashkeel = (s: string): string => s.replace(TASHKEEL, '');

/** Consonant skeleton: long vowels and hamza dropped, so «يصبها» ≈ «يصيبها». */
export const skeleton = (w: string): string => w.replace(/[اويء]/g, '');

const PREFIX = /^(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك)(?=..)/;

/** The word without one leading conjunction/preposition/article cluster. */
export const stripPrefix = (w: string): string => w.replace(PREFIX, '');

const ROWS = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

/** Optimal-string-alignment distance, or `max + 1` as soon as it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  if (n >= 63 || a.length >= 63) return max + 1;
  let [prev2, prev, cur] = ROWS;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[n];
}

/** How many typos a query word of this length may carry. */
export const typoBudget = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

/** The vocabulary (most frequent first) with each word's prefix-less core and skeletons, computed once. */
export interface Vocab {
  words: readonly string[];
  known: ReadonlySet<string>;
  core: string[];
  skel: string[];
  coreSkel: string[];
}

export function prepareVocab(words: readonly string[]): Vocab {
  const core = words.map(stripPrefix);
  return { words, known: new Set(words), core, skel: words.map(skeleton), coreSkel: core.map(skeleton) };
}

/**
 * Close spellings of a (normalised) query word (most frequent first): same
 * consonant skeleton, or within the typo budget — compared as-is and without a
 * leading و/ف/ب/ل/ك/ال. Words that merely CONTAIN the token are left out: a
 * plain substring scan already finds those.
 */
export function closeWords(token: string, v: Vocab, limit = 12): string[] {
  const budget = typoBudget(token.length);
  const sk = skeleton(token);
  const useSkeleton = sk.length >= 2 && token.length >= 3;
  if (budget === 0 && !useSkeleton) return [];
  const near: string[] = [];
  const far: string[] = [];
  for (let i = 0; i < v.words.length && near.length < limit; i++) {
    const w = v.words[i];
    if (w.length < token.length - 2 || w.length > token.length + 6 || w.includes(token)) continue;
    if (useSkeleton && (v.skel[i] === sk || v.coreSkel[i] === sk)) near.push(w);
    else if (budget > 0 && far.length < limit && (editDistance(v.core[i], token, budget) <= budget || editDistance(w, token, budget) <= budget)) far.push(w);
  }
  return [...near, ...far].slice(0, limit);
}

/** Query → normalised words (deduped, order kept). */
export const queryTokens = (q: string): string[] => [...new Set(normalizeArabic(q).split(' ').filter(Boolean))];
