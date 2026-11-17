/**
 * Executable check for the adhkar listening sequencer (listenLogic.ts) and
 * the recitation map (adhkarAudio.ts).
 *
 * Run: npx esbuild scripts/adhkarListen.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/adhkarListen.test.mjs
 *      node .tmp-test/adhkarListen.test.mjs
 */
import {
  afterRecitation,
  countedOnce,
  onArrive,
  pauseMs,
  startIndex,
  type ListenCtx,
  type ListenPrefs,
} from '@/components/adhkar/listenLogic';
import { adhkarAudio, MAPPED_ADHKAR_IDS as ALL_MAPPED_IDS } from '@/data/adhkarAudio';
import { morningAdhkar, eveningAdhkar, postPrayerAdhkar, sleepAdhkar } from '@/data/adhkar';
import { feminize } from '@/components/adhkar/feminize';
import { remainingMinutes } from '@/components/adhkar/adhkarSets';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const items = [
  { id: 'a', count: 3 },
  { id: 'b', count: 1 }, // no audio
  { id: 'c', count: 2 },
];
const audio = new Set(['a', 'c']);

/** Drive a whole listening run the way useAdhkarListen does; returns what was recited. */
function run(prefs: Pick<ListenPrefs, 'repeatMode' | 'skipNoAudio'>, counts0: Record<string, number> = {}) {
  let c: ListenCtx = { items, counts: { ...counts0 }, skipped: {}, hasAudio: (id) => audio.has(id), prefs };
  const recited: string[] = [];
  let index = startIndex(c, 0);
  if (index < 0) return { recited, counts: c.counts, end: 'nothing' };
  for (let guard = 0; guard < 50; guard++) {
    const a = onArrive(c, index);
    if (a.kind === 'wait') return { recited, counts: c.counts, end: `wait@${items[index].id}` };
    if (a.kind === 'end') return { recited, counts: c.counts, end: 'end' };
    if (a.kind === 'goto') {
      index = a.index;
      continue;
    }
    // play → pause → count (+1) → decide
    for (;;) {
      recited.push(items[index].id);
      c = { ...c, counts: countedOnce(c, items[index].id) };
      const n = afterRecitation(c, index);
      if (n.kind === 'again') continue;
      if (n.kind === 'end') return { recited, counts: c.counts, end: 'end' };
      index = n.index;
      break;
    }
  }
  return { recited, counts: c.counts, end: 'runaway' };
}

console.log('listen sequencer');
{
  const r = run({ repeatMode: 'count', skipNoAudio: true });
  check('count mode repeats each dhikr to its target, skipping no-audio', r.recited.join('') === 'aaacc', r.recited.join(''));
  check('count mode fills the counters', r.counts.a === 3 && r.counts.c === 2 && !r.counts.b, JSON.stringify(r.counts));
  check('count mode ends after the last recitable dhikr', r.end === 'end', r.end);
}
{
  const r = run({ repeatMode: 'count', skipNoAudio: false });
  check('no-audio dhikr waits for the user when skipping is off', r.recited.join('') === 'aaa' && r.end === 'wait@b', `${r.recited.join('')} ${r.end}`);
}
{
  const r = run({ repeatMode: 'once', skipNoAudio: true });
  check('once mode recites each dhikr one time, in order', r.recited.join('') === 'ac', r.recited.join(''));
  check('once mode counts one repetition each (never fakes completion)', r.counts.a === 1 && r.counts.c === 1);
}
{
  const r = run({ repeatMode: 'count', skipNoAudio: true }, { a: 3 });
  check('resumes at the first unfinished dhikr', r.recited.join('') === 'cc', r.recited.join(''));
  const partial = run({ repeatMode: 'count', skipNoAudio: true }, { a: 1 });
  check('a part-counted dhikr only gets its remaining repetitions', partial.recited.join('') === 'aacc', partial.recited.join(''));
  const done = run({ repeatMode: 'count', skipNoAudio: true }, { a: 3, c: 2 });
  check('nothing to listen to when every recitable dhikr is done', done.end === 'nothing', done.end);
}
{
  const c: ListenCtx = {
    items,
    counts: { a: 3 },
    skipped: {},
    hasAudio: (id) => audio.has(id),
    prefs: { repeatMode: 'count', skipNoAudio: true },
  };
  check('navigating to a finished dhikr still recites it (review)', onArrive(c, 0).kind === 'play');
  const after = afterRecitation({ ...c, counts: countedOnce(c, 'a') }, 0);
  check('a review recitation is not counted and moves on', countedOnce(c, 'a').a === 3 && after.kind === 'goto' && after.index === 2);
  check('startIndex wraps to the start when the current card is past the last unfinished one', startIndex({ ...c, counts: {} }, 2) === 2 && startIndex({ ...c, counts: { c: 2 } }, 2) === 0);
}
{
  const c: ListenCtx = {
    items,
    counts: { a: 3 },
    skipped: {},
    hasAudio: (id) => audio.has(id),
    prefs: { repeatMode: 'fixed', skipNoAudio: true, fixedTimes: 2 },
  };
  const second = afterRecitation(c, 0, 2);
  check(
    'fixed mode recites exactly N times (even past the target), then moves on',
    afterRecitation(c, 0, 1).kind === 'again' && second.kind === 'goto' && second.index === 2,
  );
}
check('pause modes',pauseMs(0, 9000) === 0 && pauseMs(5, 9000) === 5000 && pauseMs('match', 4321.4) === 4321);

console.log('recitation map');
{
  const ids = new Set([...morningAdhkar, ...eveningAdhkar, ...postPrayerAdhkar, ...sleepAdhkar].map((d) => d.id));
  const mapped = [...ids].filter((id) => adhkarAudio(id));
  check('the map covers the bundled sets', mapped.length >= 45, String(mapped.length));
  const orphans = ALL_MAPPED_IDS.filter((id) => !ids.has(id));
  check('every recitation belongs to a real dhikr id', orphans.length === 0, orphans.join(','));
  const all = mapped.flatMap((id) => adhkarAudio(id)!);
  check('all recitation URLs are https or bundled (no mixed content)', all.every((s) => s.url.startsWith('https://') || /^[^:]*audio\/adhkar\/[\w-]+\.mp3$/.test(s.url)));
  check('every morning/evening dhikr now has audio', ['morning-26', 'evening-27', 'morning-28', 'evening-29'].every((id) => !!adhkarAudio(id)));
  check('trims are well-formed', all.every((s) => (s.from ?? 0) >= 0 && (s.to == null || s.to > (s.from ?? 0))));
  // Evening forms the Hisn audio never speaks: never Hisn (its «أصبحنا» take); a real evening recording or nothing.
  const evenOnly = ['evening-6', 'evening-9', 'evening-10', 'evening-14', 'evening-20'];
  check('evening-only wordings are not mapped to morning audio', evenOnly.every((id) => (adhkarAudio(id) ?? []).every((seg) => !seg.url.includes('hisnmuslim.com'))));
  check('the masnun-dua evening recordings are mapped', ['evening-6', 'evening-14', 'evening-20'].every((id) => adhkarAudio(id)?.[0].url.includes('masnun-dua')));
}

console.log('feminine wording');
{
  const istighfar = morningAdhkar.find((d) => d.id === 'morning-6')!.arabic;
  check('سيد الاستغفار: «وأنا عبدك» → «وأنا أمتك»', feminize(istighfar).includes('وَأَنَا أَمَتُكَ') && !/عَبْـ?دُك/.test(feminize(istighfar)));
  check(
    'دعاء الهم: «إني عبدك ابن عبدك ابن أمتك» → بنت',
    feminize('اللَّهُمَّ إِنِّي عَبْدُكَ ابْنُ عَبْدِكَ ابْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ').startsWith('اللَّهُمَّ إِنِّي أَمَتُكَ بِنْتُ عَبْدِكَ بِنْتُ أَمَتِكَ'),
  );
  check('«محمداً عبدك ورسولك» stays', feminize('وَأَنَّ مُحَمَّداً عَبْدُكَ وَرَسُولُكَ') === 'وَأَنَّ مُحَمَّداً عَبْدُكَ وَرَسُولُكَ');
}

{
  // Time left counts every repetition, not just words: «سبحان الله وبحمده» ×100 was «دقيقتين».
  const tasbih = morningAdhkar.filter((d) => d.id === 'morning-30');
  const m = remainingMinutes(tasbih, {}, {});
  check('سبحان الله وبحمده ×100 ≈ 5 min', m === 5, `got ${m}`);
  check('half-way ×100 halves the time', remainingMinutes(tasbih, { 'morning-30': 50 }, {}) === 3);
  check('done / skipped → 0', remainingMinutes(tasbih, { 'morning-30': 100 }, {}) === 0 && remainingMinutes(tasbih, {}, { 'morning-30': true }) === 0);
  check('punctuation «،» is not a word', remainingMinutes([{ ...tasbih[0], arabic: 'سُبْحَانَ اللَّهِ ، وَبِحَمْدِهِ' }], {}, {}) === 5);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
