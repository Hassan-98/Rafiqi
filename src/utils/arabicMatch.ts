/**
 * Arabic text matching for the memorization "recite test" (التسميع).
 *
 * General-purpose Arabic speech recognition returns plain Modern-Standard
 * spelling with NO tashkeel and inconsistent hamza/alef forms, so we can't
 * compare it to the Uthmani Qur'an text directly. We normalize BOTH sides to a
 * bare-letter skeleton, then compare with a small fuzzy tolerance so a close
 * recitation still counts as correct.
 *
 * Recitation-aware upgrades (2026-06-11, the "system engine only" plan):
 * - **Dagger alef ٰ → full alef** instead of stripping it. Uthmani rasm writes
 *   many long vowels as superscript alef (الكتٰب، السمٰوٰت، إبرٰهيم، الشيطٰن)
 *   while the recognizer outputs Imlaei spelling (الكتاب، السماوات…) — folding
 *   ٰ→ا makes both sides converge instead of systematically mismatching.
 * - **Vowel-run collapse** (اا/وو/يي → single): madd elongations and rasm
 *   variants produce duplicate long vowels on either side.
 * - **Weighted confusable distance**: recognizers constantly swap emphatic /
 *   plain and sibilant pairs on recitation (ت↔ط، د↔ض، ذ↔ظ↔ز، س↔ص↔ث، ق↔ك،
 *   ح↔ه، ع↔ا). Those substitutions cost 0.4 instead of 1, so a word misheard
 *   only by such a pair still matches, while truly different words don't.
 */

// Harakat, tanwin and Quranic annotation marks — EXPLICIT codepoint escapes
// (combining characters are invisible in source text; literal ranges silently
// corrupt when files are rewritten, which once made this regex eat letters):
//   0610–061A Quranic honorifics/signs · 064B–065F harakat, tanwin, hamza
//   marks, madda · 06D6–06DC small high ayah signs · 06DF–06E4, 06E7–06E8,
//   06EA–06ED small high/low marks · 08D3–08FF Quranic annotation extensions.
// U+0670 (dagger alef ٰ) is intentionally NOT stripped — it's folded to a
// full alef first (see normalizeArabic).
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]/g;
const TATWEEL = /\u0640/g;
const DAGGER_ALEF = /\u0670/g;

/** Collapse a word to a comparable bare-letter skeleton. */
export function normalizeArabic(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFC');
  // Uthmani superscript alef = a real long-vowel letter to the recognizer.
  s = s.replace(DAGGER_ALEF, 'ا');
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');
  s = s
    // alef family (incl. wasla, madda, hamza-carrying) → bare alef
    .replace(/[آأإٱٲٳٵ]/g, 'ا')
    .replace(/ى/g, 'ي') // alef maqsura ى → ي
    .replace(/ة/g, 'ه') // ta marbuta ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/ء/g, ''); // standalone hamza ء → drop
  // keep only Arabic letters
  s = s.replace(/[^ء-ي]/g, '');
  // Long-vowel runs (madd, rasm variants like الصلوٰة→صلواه) → one letter.
  s = s.replace(/([اوي])\1+/g, '$1');
  // Silent plural alef (قالوا/قالو) — recognizers drop or add it freely.
  s = s.replace(/وا$/, 'و');
  return s;
}

/**
 * Plain READABLE spelling (not a skeleton) for recognizer biasing strings:
 * strips tashkeel/quranic marks and folds Uthmani-only glyphs (ٰ→ا، ٱ→ا) but
 * keeps hamza forms, ة and ى — i.e. how the word would normally be typed.
 */
export function toPlainSpelling(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFC');
  s = s.replace(DAGGER_ALEF, 'ا');
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');
  s = s.replace(/ٱ/g, 'ا');
  // keep only the Arabic block (letters incl. hamza forms)
  s = s.replace(/[^ء-ي]/g, '');
  return s;
}

/** Split a transcript into normalized word tokens (empties removed). */
export function tokenizeArabic(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[\s،؛؟.,!?]+/)
    .map(normalizeArabic)
    .filter((t) => t.length > 0);
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// ── recitation-aware weighted distance ──────────────────────────────────────
/** Letter groups Arabic ASR habitually confuses on recitation audio. */
const CONFUSABLE_GROUPS = ['تط', 'دض', 'ذظز', 'سصث', 'قك', 'حه', 'عا'];
const CONFUSABLE_COST = 0.4;
const confusablePairs = new Set<string>();
for (const group of CONFUSABLE_GROUPS) {
  for (const x of group) for (const y of group) if (x !== y) confusablePairs.add(x + y);
}

function substitutionCost(x: string, y: string): number {
  if (x === y) return 0;
  return confusablePairs.has(x + y) ? CONFUSABLE_COST : 1;
}

/**
 * Levenshtein with cheap substitutions for confusable letter pairs — the
 * distance a recitation-aware listener would perceive.
 */
export function weightedDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity ratio in [0,1] (1 = identical skeletons), confusable-aware. */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - weightedDistance(a, b) / maxLen;
}

/**
 * Does a recited token acceptably match an EXPECTED word? Both are normalized
 * skeletons. Shorter words demand a tighter match (fewer letters → each error
 * matters more); longer words tolerate more recognizer slop. Also accepts the
 * common ASR case where one side contains the other (merged/clitic words like
 * the article ال).
 */
export function wordsMatch(expectedNorm: string, recitedNorm: string): boolean {
  if (!expectedNorm || !recitedNorm) return false;
  if (expectedNorm === recitedNorm) return true;

  // Shared-affix / clitic tolerance (article ال، و، ف، ب prefixes, dropped
  // endings the recognizer adds or drops): "والله" vs "الله", "بسم" vs "اسم".
  if (expectedNorm.length >= 3 && recitedNorm.length >= 3) {
    if (expectedNorm.endsWith(recitedNorm) || recitedNorm.endsWith(expectedNorm)) return true;
    if (expectedNorm.startsWith(recitedNorm) || recitedNorm.startsWith(expectedNorm)) return true;
    if (expectedNorm.includes(recitedNorm) || recitedNorm.includes(expectedNorm)) return true;
  }

  const dist = weightedDistance(expectedNorm, recitedNorm);
  const sim = similarity(expectedNorm, recitedNorm);
  const len = Math.max(expectedNorm.length, recitedNorm.length);
  // Deliberately LENIENT — close pronunciation counts as correct, so the
  // reciter is never blocked by recognizer slop (tanwin/hamza/letter mix-ups).
  // Tiny words still demand a shared first letter: with only 1–2 letters,
  // "dist ≤ 1" alone made unrelated function words (لا/ما/هم…) interchangeable.
  if (len <= 2) return dist <= 1 && expectedNorm[0] === recitedNorm[0];
  if (len <= 4) return dist <= 1.5;
  if (len <= 7) return sim >= 0.5;
  return sim >= 0.45;
}
