/**
 * Pure "what plays next" decision for the Quran player (no DOM, no audio) so
 * the repeat / loop / sleep rules can be checked in isolation
 * (scripts/quranAudio.test.ts). AudioController applies the result.
 */

export interface SeqState {
  queue: string[];
  index: number;
  /** Repetitions of the CURRENT ayah still to come after this one. */
  repeatRemaining: number;
  /** Whole-queue passes still to come (Infinity = loop forever). */
  loopsRemaining: number;
  /** Sleep timer «نهاية السورة»: stop when the surah (or the queue) ends. */
  stopAtSurahEnd: boolean;
}

export type Step =
  | { kind: 'repeat' }
  | { kind: 'advance'; index: number }
  | { kind: 'loop'; index: number }
  | { kind: 'stop' };

const surahOf = (key: string | undefined) => Number(key?.split(':')[0]);

/** The current track just ended — what next? */
export function nextStep(s: SeqState): Step {
  if (s.repeatRemaining > 0) return { kind: 'repeat' };
  const next = s.queue[s.index + 1];
  if (next !== undefined) {
    if (s.stopAtSurahEnd && surahOf(next) !== surahOf(s.queue[s.index])) return { kind: 'stop' };
    return { kind: 'advance', index: s.index + 1 };
  }
  if (s.stopAtSurahEnd) return { kind: 'stop' };
  if (s.loopsRemaining > 0) return { kind: 'loop', index: 0 };
  return { kind: 'stop' };
}

/** «من آية … إلى آية …» → verse keys (bounds clamped and ordered). */
export function rangeKeys(surah: number, from: number, to: number, versesCount: number): string[] {
  const a = Math.max(1, Math.min(from, to, versesCount));
  const b = Math.min(versesCount, Math.max(from, to, 1));
  return Array.from({ length: b - a + 1 }, (_, i) => `${surah}:${a + i}`);
}

