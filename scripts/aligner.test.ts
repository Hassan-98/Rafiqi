/**
 * Executable validation of the recitation aligner (RecitationTracker) against
 * the EXACT field-reported failures: correctly-recited frequent words (لا)
 * and near-twins (يوقنون after يؤمنون) being falsely marked SKIPPED (orange).
 *
 * Run: npx esbuild scripts/aligner.test.ts --bundle --format=esm
 *        --alias:@=./src --outfile=.tmp-test/aligner.test.mjs
 *      node .tmp-test/aligner.test.mjs
 */
import { RecitationTracker, type FinalVerdict } from '@/lib/hifz/aligner';
import { normalizeArabic, tokenizeArabic } from '@/utils/arabicMatch';

let failures = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Build a tracker from Uthmani-style words; returns tracker + skeletons. */
function makeTracker(uthmaniWords: string[]): { tracker: RecitationTracker; skeletons: string[] } {
  const skeletons = uthmaniWords.map(normalizeArabic);
  return { tracker: new RecitationTracker(skeletons), skeletons };
}

/** Feed an ASR transcript (stable finals, word by word). */
function recite(tracker: RecitationTracker, transcript: string): void {
  for (const token of tokenizeArabic(transcript)) tracker.push(token, true);
}

function verdicts(tracker: RecitationTracker): Map<number, FinalVerdict> {
  return tracker.finalize().verdicts;
}

// ── Surat Al-Baqarah 1–4 (Uthmani spellings incl. dagger alef + wasla) ──────
const BAQARAH = [
  'الٓمٓ', 'ذَٰلِكَ', 'ٱلْكِتَٰبُ', 'لَا', 'رَيْبَ', 'فِيهِ', 'هُدًى', 'لِّلْمُتَّقِينَ',
  'ٱلَّذِينَ', 'يُؤْمِنُونَ', 'بِٱلْغَيْبِ', 'وَيُقِيمُونَ', 'ٱلصَّلَوٰةَ', 'وَمِمَّا',
  'رَزَقْنَٰهُمْ', 'يُنفِقُونَ', 'وَٱلَّذِينَ', 'يُؤْمِنُونَ', 'بِمَآ', 'أُنزِلَ',
  'إِلَيْكَ', 'وَمَآ', 'أُنزِلَ', 'مِن', 'قَبْلِكَ', 'وَبِٱلْءَاخِرَةِ', 'هُمْ', 'يُوقِنُونَ',
];
// What the Android recognizer would return for a correct recitation (Imlaei).
const BAQARAH_ASR =
  'الم ذلك الكتاب لا ريب فيه هدى للمتقين الذين يؤمنون بالغيب ويقيمون الصلاة ' +
  'ومما رزقناهم ينفقون والذين يؤمنون بما أنزل إليك وما أنزل من قبلك وبالآخرة هم يوقنون';

console.log('\n1) Perfect recitation of Al-Baqarah 1–4 → every word correct, nothing orange');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, BAQARAH_ASR);
  const v = verdicts(tracker);
  const states = BAQARAH.map((_, i) => v.get(i));
  check('all 28 words resolved correct', states.every((s) => s === 'correct'),
    `got: ${states.map((s, i) => (s !== 'correct' ? `${i}:${BAQARAH[i]}=${s ?? 'none'}` : '')).filter(Boolean).join(', ')}`);
  const s = tracker.stats();
  check('zero skipped', s.skipped === 0, `skipped=${s.skipped}`);
  check('zero wrong', s.wrong === 0, `wrong=${s.wrong}`);
}

console.log('\n2) REGRESSION: «لا» right after «الم» must NOT be absorbed as a repeat');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الم ذلك الكتاب لا ريب');
  const v = tracker.finalize().verdicts;
  check('«لا» (idx 3) = correct', v.get(3) === 'correct', `got ${v.get(3) ?? 'none'}`);
  check('«ريب» (idx 4) = correct', v.get(4) === 'correct', `got ${v.get(4) ?? 'none'}`);
}

console.log('\n3) REGRESSION: «يوقنون» after two «يؤمنون» must NOT be skip-marked');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, BAQARAH_ASR);
  const v = verdicts(tracker);
  check('«يوقنون» (idx 27) = correct', v.get(27) === 'correct', `got ${v.get(27) ?? 'none'}`);
  check('second «يؤمنون» (idx 17) = correct', v.get(17) === 'correct', `got ${v.get(17) ?? 'none'}`);
}

console.log('\n4) Real skip is still detected (reciter jumps over «ريب»)');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الم ذلك الكتاب لا فيه هدى للمتقين');
  const v = verdicts(tracker);
  check('«ريب» (idx 4) = skipped', v.get(4) === 'skipped', `got ${v.get(4) ?? 'none'}`);
  check('«فيه» (idx 5) = correct', v.get(5) === 'correct', `got ${v.get(5) ?? 'none'}`);
  check('«هدى» (idx 6) = correct', v.get(6) === 'correct', `got ${v.get(6) ?? 'none'}`);
}

console.log('\n5) Wrong word detected, then self-correction clears it');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الم ذلك الكتاب لا');
  // Two clearly-wrong stable tokens at «ريب» → wrong-pending.
  recite(tracker, 'سيارة مدرسة');
  check('«ريب» wrong-pending after 2 bad tokens', tracker.stateOf(4) === 'wrong-pending',
    `got ${tracker.stateOf(4) ?? 'none'}`);
  // Reciter fixes themselves before it commits.
  recite(tracker, 'ريب فيه هدى');
  const v = verdicts(tracker);
  check('«ريب» = self-corrected', v.get(4) === 'self-corrected', `got ${v.get(4) ?? 'none'}`);
  check('«فيه» = correct', v.get(5) === 'correct', `got ${v.get(5) ?? 'none'}`);
}

console.log('\n6) Glued ASR token «لاريب» covers both words (compound match)');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الم ذلك الكتاب لاريب فيه');
  const v = verdicts(tracker);
  check('«لا» = correct', v.get(3) === 'correct', `got ${v.get(3) ?? 'none'}`);
  check('«ريب» = correct', v.get(4) === 'correct', `got ${v.get(4) ?? 'none'}`);
  check('«فيه» = correct', v.get(5) === 'correct', `got ${v.get(5) ?? 'none'}`);
}

console.log('\n7) Re-reciting a passage (memory backtrack) absorbs silently, no marks');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الم ذلك الكتاب لا ريب فيه');
  recite(tracker, 'لا ريب فيه'); // backtracks to recall, repeats exactly
  recite(tracker, 'هدى للمتقين');
  const v = verdicts(tracker);
  check('no skipped marks from the repeat', tracker.stats().skipped === 0,
    `skipped=${tracker.stats().skipped}`);
  check('«هدى» = correct', v.get(6) === 'correct', `got ${v.get(6) ?? 'none'}`);
}

console.log('\n8) Muqattaʿa recited as letter names («الف لام ميم»)');
{
  const { tracker } = makeTracker(BAQARAH);
  recite(tracker, 'الف لام ميم ذلك الكتاب لا ريب');
  const v = verdicts(tracker);
  check('«الم» = correct via letter names', v.get(0) === 'correct', `got ${v.get(0) ?? 'none'}`);
  check('«لا» = correct', v.get(3) === 'correct', `got ${v.get(3) ?? 'none'}`);
}

console.log('\n9) Uthmani rasm vs ASR spelling (dagger alef family) matches at k=0');
{
  const words = ['وَإِذَا', 'قِيلَ', 'لَهُمْ', 'لَا', 'تُفْسِدُوا۟', 'فِى', 'ٱلْأَرْضِ'];
  const { tracker } = makeTracker(words);
  recite(tracker, 'وإذا قيل لهم لا تفسدوا في الأرض');
  const v = verdicts(tracker);
  const states = words.map((_, i) => v.get(i));
  check('all correct', states.every((s) => s === 'correct'),
    `got: ${states.map((s, i) => (s !== 'correct' ? `${i}:${words[i]}=${s ?? 'none'}` : '')).filter(Boolean).join(', ')}`);
}

console.log(failures === 0 ? '\nALL PASS ✓' : `\n${failures} FAILURE(S) ✗`);
process.exit(failures === 0 ? 0 : 1);
