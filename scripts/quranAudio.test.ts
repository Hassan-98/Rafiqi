/**
 * Executable check for the Quran player's repeat / loop / sleep sequencing
 * (src/components/quran/audio/sequence.ts, applied by AudioController.onEnded).
 *
 * Run: npx esbuild scripts/quranAudio.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/quranAudio.test.mjs
 *      node .tmp-test/quranAudio.test.mjs
 */
import { nextStep, rangeKeys, type SeqState } from '@/services/audio/sequence';
import { lastAudibleSec, trimmedEnd } from '@/services/audio/silence';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

/** Drive a queue the way AudioController does; returns the keys played. */
function run(queue: string[], opts: { repeat?: number; loops?: number; surahEnd?: boolean; start?: number } = {}): string[] {
  const repeatTotal = opts.repeat ?? 1;
  const s: SeqState = {
    queue,
    index: opts.start ?? 0,
    repeatRemaining: repeatTotal - 1,
    loopsRemaining: opts.loops ?? 0,
    stopAtSurahEnd: !!opts.surahEnd,
  };
  const played: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    played.push(s.queue[s.index]);
    const step = nextStep(s);
    if (step.kind === 'stop') return played;
    if (step.kind === 'repeat') {
      s.repeatRemaining -= 1;
      continue;
    }
    if (step.kind === 'loop') s.loopsRemaining -= 1;
    s.repeatRemaining = repeatTotal - 1;
    s.index = step.index;
  }
  return played;
}

console.log('quran playback sequence');
const q = rangeKeys(1, 1, 3, 7);
check('rangeKeys builds an ordered, clamped range', q.join() === '1:1,1:2,1:3' && rangeKeys(1, 6, 3, 5).join() === '1:3,1:4,1:5');
check('plain queue plays through once', run(q).join() === '1:1,1:2,1:3');
check('ayah ×2 repeats every ayah before moving on', run(q, { repeat: 2 }).join() === '1:1,1:1,1:2,1:2,1:3,1:3');
check('range ×2 plays the whole range twice', run(q, { loops: 1 }).join() === '1:1,1:2,1:3,1:1,1:2,1:3');
check('single-ayah loop replays the same key', run(['2:255'], { loops: 2 }).join() === '2:255,2:255,2:255');
check('surah loop keeps going (guarded)', run(q, { loops: Infinity }).length === 200);
check('surah loop started mid-surah wraps to ayah 1', run(q, { loops: 1, start: 2 }).join() === '1:3,1:1,1:2,1:3');
check('sleep «نهاية السورة» overrides the loop', run(q, { loops: Infinity, surahEnd: true }).join() === '1:1,1:2,1:3');
check('sleep «نهاية السورة» stops at a surah boundary', run(['1:7', '2:1', '2:2'], { surahEnd: true }).join() === '1:7');

console.log('silent tail');
{
  const sr = 8000;
  // 1s tone (amp 0.3) + 0.2s quiet noise (0.005) + 3s silence = 4.2s.
  const clip = new Float32Array(Math.round(sr * 4.2));
  for (let i = 0; i < sr; i++) clip[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr);
  for (let i = sr; i < sr * 1.2; i++) clip[i] = 0.005 * (i % 2 ? 1 : -1);
  const last = lastAudibleSec(clip, sr);
  check('last audible = end of the tone (below-threshold hiss ignored)', last != null && Math.abs(last - 1) <= 0.05, String(last));
  check('trimmed end = last audible + 0.25s', trimmedEnd(last, 4.2) === 1.25, String(trimmedEnd(last, 4.2)));
  check('a short natural tail is left alone', trimmedEnd(1, 1.6) === 0);
  check('a silent clip is never trimmed', lastAudibleSec(new Float32Array(sr), sr) === null && trimmedEnd(null, 1) === 0);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
