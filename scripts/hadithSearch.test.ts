/**
 * Executable check for the hadith library search (src/lib/hadithSearchEngine.ts)
 * against the real bundled data in public/hadith.
 *
 * Run: npx esbuild scripts/hadithSearch.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/hadithSearch.test.mjs
 *      node .tmp-test/hadithSearch.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildCorpus, searchCorpus } from '@/lib/hadithSearchEngine';
import { closeWords, normalizeArabic, prepareVocab } from '@/lib/arabicSearch';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const gz = (p: string) => gunzipSync(readFileSync(p)).toString('utf8');
let t0 = Date.now();
const books = Array.from({ length: 9 }, (_, b) => {
  const chunks = readdirSync(`public/hadith/b${b}`).length;
  const texts: string[] = [];
  for (let c = 0; c < chunks; c++) texts.push(...(JSON.parse(gz(`public/hadith/b${b}/c${c}.json.gzip`)) as string[]));
  return { book: b, texts };
});
const vocab = prepareVocab(gz('public/hadith/vocab.txt.gzip').split('\n'));
const corpus = buildCorpus(books);
console.log(`load+build ${Date.now() - t0}ms, ${corpus.starts.length} hadiths, ${corpus.text.length} chars`);

check('all 62,169 hadiths loaded', corpus.starts.length === 62169, String(corpus.starts.length));
check('normalize folds tashkeel + letters', normalizeArabic('إِلَى دُنْيَا يُصِيبُهَا') === 'الي دنيا يصيبها');
check('close words: يصبها → يصيبها', closeWords('يصبها', vocab).includes('يصيبها'));

const time = (q: string, books?: number[]) => {
  t0 = Date.now();
  const r = searchCorpus(corpus, vocab, q, { books });
  console.log(`    «${q}» → ${r.total} (${r.exact} exact) in ${Date.now() - t0}ms`);
  return r;
};

const first = (r: ReturnType<typeof searchCorpus>) => r.hits[0] && `${r.hits[0].book}:${r.hits[0].number}`;

let r = time('دنيا يصيبها');
check('exact words: Bukhari 1 first', first(r) === '0:1', first(r));
r = time('دنيا يصبها');
check('typo «يصبها»: Bukhari 1 first', first(r) === '0:1', first(r));
r = time('يصبها', [0]);
check('typo inside one book is fuzzed even if other books use it as typed', r.hits.some((h) => h.book === 0 && h.number === 1), JSON.stringify(r.hits.slice(0, 5)));
r = time('إنما الأعمال بالنيات');
check('phrase with tashkeel-free alef forms', r.hits.slice(0, 3).some((h) => h.book === 0 && h.number === 1), JSON.stringify(r.hits.slice(0, 3)));
r = time('الاعمال بالني');
check('partial word «بالني» finds بالنيات', r.total > 0 && r.hits.some((h) => h.book === 0 && h.number === 1), JSON.stringify(r.hits.slice(0, 5)));
r = time('الصبر');
check('well-spelled word is not fuzzed (no near hits)', r.total > 50 && r.exact === r.total, r.exact + '/' + r.total);
r = time('صلصلة الجرس', [0]);
check('book filter + phrase → Bukhari 2', first(r) === '0:2', first(r));
r = time('٢٥');
check('number query → one per book', r.total === 9 && r.hits.every((h) => h.number === 25));
r = time('الله');
check('very common word stays fast-enough', r.total > 30000);

if (failures) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nall passed');
