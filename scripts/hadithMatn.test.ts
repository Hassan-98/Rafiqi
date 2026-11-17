/**
 * Executable check for the الدرر السنية query: it must search the matn, not the isnad.
 *
 * Run: npx esbuild scripts/hadithMatn.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/hadithMatn.test.mjs
 *      node .tmp-test/hadithMatn.test.mjs
 */
import assert from 'node:assert/strict';
import { dorarSearchUrl, matnWords } from '@/lib/hadithMatn';

const b1 =
  'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللَّهِ بْنُ الزُّبَيْرِ قَالَ حَدَّثَنَا سُفْيَانُ قَالَ حَدَّثَنَا يَحْيَى بْنُ سَعِيدٍ الْأَنْصَارِيُّ قَالَ أَخْبَرَنِي مُحَمَّدُ بْنُ إِبْرَاهِيمَ التَّيْمِيُّ أَنَّهُ سَمِعَ عَلْقَمَةَ بْنَ وَقَّاصٍ اللَّيْثِيَّ يَقُولُ سَمِعْتُ عُمَرَ بْنَ الْخَطَّابِ رَضِيَ اللَّهُ عَنْهُ عَلَى الْمِنْبَرِ قَالَ سَمِعْتُ رَسُولَ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ يَقُولُ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى';
assert.deepEqual(matnWords(b1).slice(0, 3), ['إنما', 'الأعمال', 'بالنيات']);
assert.ok(decodeURIComponent(dorarSearchUrl(b1)).endsWith('إنما الأعمال بالنيات وإنما لكل امرئ&all'));
assert.ok(dorarSearchUrl(b1).startsWith('https://www.dorar.net/hadith/search?q='));

const b2 =
  'حَدَّثَنَا عَبْدُ اللَّهِ بْنُ يُوسُفَ قَالَ أَخْبَرَنَا مَالِكٌ عَنْ هِشَامِ بْنِ عُرْوَةَ عَنْ أَبِيهِ عَنْ عَائِشَةَ أُمِّ الْمُؤْمِنِينَ رَضِيَ اللَّهُ عَنْهَا أَنَّ الْحَارِثَ بْنَ هِشَامٍ رَضِيَ اللَّهُ عَنْهُ سَأَلَ رَسُولَ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ فَقَالَ يَا رَسُولَ اللَّهِ كَيْفَ يَأْتِيكَ الْوَحْيُ';
assert.deepEqual(matnWords(b2).slice(0, 4), ['يا', 'رسول', 'الله', 'كيف']);

// No ﷺ marker (a companion's words): after the last «قال».
assert.deepEqual(matnWords('حَدَّثَنَا فُلَانٌ عَنْ فُلَانٍ قَالَ الدِّينُ النَّصِيحَةُ لِلَّهِ وَلِرَسُولِهِ'), ['الدين', 'النصيحة', 'لله', 'ولرسوله']);
// Never the isnad's «حدثنا».
assert.ok(!decodeURIComponent(dorarSearchUrl(b1)).includes('حدثنا'));

console.log('hadithMatn: ok');
