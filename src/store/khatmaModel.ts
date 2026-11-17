import { TOTAL_MUSHAF_PAGES as N } from '@/data/juz';

/**
 * A named khatma (ختمة التلاوة، ختمة التجويد، ختمة القيام…): one full pass
 * over the 604 pages that begins at `startPage` and wraps past 604 back to
 * page 1. Progress is the pages actually covered IN ORDER since the start —
 * never "current page / 604", so a khatma started mid-mushaf reads 0٪, not 50٪.
 */
export interface Khatma {
  id: string;
  name: string;
  /** 1–604: where this pass began. */
  startPage: number;
  /** 0–604: pages covered contiguously from `startPage`. 604 = finished. */
  read: number;
  /** Passes finished AND restarted (a finished-but-not-restarted pass is `read === 604`). */
  completions: number;
  /** Pages in this pass when it isn't the whole mushaf (a مصحفي khatma begun mid-way ends at 604). */
  total?: number;
  createdAt: number;
  updatedAt: number;
}

/** Pages the reader may flip past faster than the dwell and still count. */
const SKIP_TOLERANCE = 2;

export const wrapPage = (p: number) => ((((Math.round(p) - 1) % N) + N) % N) + 1;

/** The next page to read (the start page again once finished). */
export const khatmaNextPage = (k: Khatma) => wrapPage(k.startPage + k.read);

const lengthOf = (k: Khatma) => k.total ?? N;

export const khatmaDone = (k: Khatma) => k.read >= lengthOf(k);

export const khatmaPct = (k: Khatma) => Math.round((Math.min(k.read, lengthOf(k)) / lengthOf(k)) * 100);

/** Finished passes, counting a finished pass not yet restarted. */
export const khatmaFinishedCount = (k: Khatma) => k.completions + (khatmaDone(k) ? 1 : 0);

/** Was mushaf page `p` already covered by this pass? */
export const khatmaCovers = (k: Khatma, p: number) => (p - k.startPage + N) % N < k.read;

/**
 * A dwell-read page advances the khatma only when it is the next page (or a
 * page or two past it — quick flips). Pages elsewhere (a lookup, a revisit)
 * leave the khatma alone.
 */
export function advanceKhatma(k: Khatma, page: number, now = Date.now()): Khatma {
  if (khatmaDone(k)) return k;
  const d = (page - khatmaNextPage(k) + N) % N;
  if (d > SKIP_TOLERANCE) return k;
  return { ...k, read: Math.min(N, k.read + d + 1), updatedAt: now };
}

/** Manual "I've reached page X": everything from the start up to X−1 is covered. */
export const readUpTo = (startPage: number, nextPage: number) => (wrapPage(nextPage) - startPage + N) % N;

/** Patch that begins a fresh pass from the same start page. */
export const restartPatch = (k: Khatma) => ({ read: 0, completions: khatmaFinishedCount(k) });

/** The khatma to feature: the active one, else the most recently touched. */
export function featuredKhatma(khatmas: Khatma[], activeId: string | null): Khatma | null {
  return khatmas.find((k) => k.id === activeId) ?? [...khatmas].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}
