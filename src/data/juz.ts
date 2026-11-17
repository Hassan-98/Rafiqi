/**
 * Madani Mushaf (KFGQPC, 604-page) starting page for each of the 30 ajzāʾ.
 * Used by the reader's location hairline and the landing Juz filmstrip so the
 * whole section shares one sense of "where am I in the Quran".
 */
export const JUZ_START_PAGES: number[] = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

export const TOTAL_MUSHAF_PAGES = 604;

/** The juz number (1–30) a given Mushaf page belongs to. */
export function juzForPage(page: number): number {
  let juz = 1;
  for (let i = 0; i < JUZ_START_PAGES.length; i++) {
    if (page >= JUZ_START_PAGES[i]) juz = i + 1;
    else break;
  }
  return juz;
}

/** The starting page (1–604) for a given juz number (1–30). */
export function pageForJuz(juz: number): number {
  return JUZ_START_PAGES[Math.min(30, Math.max(1, juz)) - 1] ?? 1;
}
