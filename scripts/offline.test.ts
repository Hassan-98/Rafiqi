/**
 * Offline downloads: size estimates, juz scopes, the ayah-audio index, the
 * pausable queue and the rehydrate fix-ups.
 *
 * Run: npx esbuild scripts/offline.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/offline.test.mjs && node .tmp-test/offline.test.mjs
 */
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  get length() { return mem.size; },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const core = await import('@/components/offline/offlineCore');
  const { normalizeDownloads } = await import('@/store/downloadsStore');
  const { ALL_ADHKAR_AUDIO_URLS } = await import('@/data/adhkarAudio');
  const { surahs } = await import('@/data/surahs');

  // ── Scopes ─────────────────────────────────────────────────────────────
  const all = core.scopeAyat({ kind: 'all' });
  check('whole Quran = 6236 ayat', core.countAyat(all) === 6236);
  const seen = new Set<string>();
  let juzTotal = 0;
  let overlap = false;
  for (let j = 1; j <= 30; j++) {
    const m = core.scopeAyat({ kind: 'juz', juz: j });
    for (const [s, list] of m) for (const a of list) {
      const k = `${s}:${a}`;
      if (seen.has(k)) overlap = true;
      seen.add(k);
      juzTotal += 1;
    }
  }
  check('30 juz cover 6236 ayat exactly once', juzTotal === 6236 && !overlap && seen.size === 6236, `${juzTotal}`);
  const j2 = core.scopeAyat({ kind: 'juz', juz: 2 });
  check('juz 2 = 2:142..2:252', j2.get(2)?.[0] === 142 && j2.get(2)?.at(-1) === 252 && j2.size === 1);
  const j14 = core.scopeAyat({ kind: 'juz', juz: 13 });
  check('juz 13 ends at 14:52 (next juz starts at 15:1)', j14.get(14)?.at(-1) === 52);
  check('surah scope', core.countAyat(core.scopeAyat({ kind: 'surah', surah: 36 })) === 83);

  // ── Size estimates ─────────────────────────────────────────────────────
  const MB = 1024 * 1024;
  const husaryAll = core.estimateAudioBytes('husary', all);
  check('Husary whole Quran ≈ 1.1 GB', husaryAll > 900 * MB && husaryAll < 1400 * MB, `${Math.round(husaryAll / MB)} MB`);
  const maherAll = core.estimateAudioBytes('maher', all);
  check('Maher (64kbps) smaller than Husary', maherAll < husaryAll);
  const sumSurahs = surahs.reduce((n, s) => n + core.estimateAudioBytes('sudais', core.scopeAyat({ kind: 'surah', surah: s.number })), 0);
  check('sum of surah estimates = whole estimate', Math.abs(sumSurahs - core.estimateAudioBytes('sudais', all)) < 200);
  const sumJuz = Array.from({ length: 30 }, (_, i) => core.estimateAudioBytes('sudais', core.scopeAyat({ kind: 'juz', juz: i + 1 }))).reduce((a, b) => a + b, 0);
  check('sum of juz estimates ≈ whole estimate', Math.abs(sumJuz / core.estimateAudioBytes('sudais', all) - 1) < 0.001);
  check('formatBytes MB Arabic', core.formatBytes(5.5 * MB) === '٥٫٥ م.ب' && core.formatBytes(12.5 * MB) === '١٣ م.ب', core.formatBytes(5.5 * MB));
  check('formatBytes GB Arabic', core.formatBytes(1.2 * 1024 * MB) === '١٫٢ ج.ب', core.formatBytes(1.2 * 1024 * MB));
  check('formatBytes KB Arabic', core.formatBytes(340 * 1024) === '٣٤٠ ك.ب');

  // ── Index ──────────────────────────────────────────────────────────────
  let ix: import('@/components/offline/offlineCore').AudioIndex = {};
  ix = core.indexAdd(ix, 'maher', 1, [1, 2, 3]);
  check('partial surah → ayah list', core.indexHas(ix, 'maher', 1, 2) && !core.indexHas(ix, 'maher', 1, 4));
  check('other qari not affected', !core.indexHas(ix, 'husary', 1, 1));
  ix = core.indexAdd(ix, 'maher', 1, [4, 5, 6, 7]);
  check('complete surah collapses to true', ix.maher[1] === true && core.indexCount(ix, 'maher', 1) === 7);
  const miss = core.indexMissing(ix, 'maher', core.scopeAyat({ kind: 'juz', juz: 1 }));
  check('missing skips downloaded surah', !miss.has(1) && miss.get(2)?.length === 141);
  const before = ix;
  check('indexAdd is immutable & no-op when complete', core.indexAdd(ix, 'maher', 1, [1]) === before);

  // ── URLs + network gate ────────────────────────────────────────────────
  check('protocol-relative url fixed', core.absoluteAudioUrl('//mirrors.quranicaudio.com/x.mp3') === 'https://mirrors.quranicaudio.com/x.mp3');
  check('relative url → qurancdn', core.absoluteAudioUrl('Sudais/mp3/001001.mp3') === 'https://audio.qurancdn.com/Sudais/mp3/001001.mp3');
  check('everyayah url', core.everyayahUrl('maher', 2, 255) === 'https://everyayah.com/data/Maher_AlMuaiqly_64kbps/002255.mp3');
  check('everyayah null for quran.com reciter', core.everyayahUrl('husary', 1, 1) === null);
  check('gate: wifi-only on cellular', core.networkGate(true, 'cellular', true) === 'cellular');
  check('gate: cellular allowed', core.networkGate(true, 'cellular', false) === 'ok');
  check('gate: offline', core.networkGate(false, 'wifi', false) === 'offline');
  check('adhkar path matches the listening cache', core.paths.adhkar('https://www.hisnmuslim.com/audio/ar/75.mp3') === 'offline/adhkar/audio_ar_75.mp3');
  check('adhkar pack has unique clips', ALL_ADHKAR_AUDIO_URLS.length === new Set(ALL_ADHKAR_AUDIO_URLS).size && ALL_ADHKAR_AUDIO_URLS.length >= 40);

  // ── Queue: concurrency, failures, pause/resume, cancel ─────────────────
  {
    const job = new core.Job();
    let live = 0;
    let peak = 0;
    const res = await core.runQueue(
      Array.from({ length: 20 }, (_, i) => i),
      async (i) => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live -= 1;
        if (i % 7 === 3) throw new Error('boom');
      },
      { concurrency: 4, job },
    );
    check('queue respects concurrency 4', peak === 4, `${peak}`);
    check('failures collected, not fatal', res.failed.length === 3 && !res.cancelled, JSON.stringify(res.failed));
  }
  {
    const job = new core.Job();
    const done: number[] = [];
    const p = core.runQueue(
      Array.from({ length: 10 }, (_, i) => i),
      async (i) => {
        await new Promise((r) => setTimeout(r, 5));
        done.push(i);
      },
      { concurrency: 2, job },
    );
    await new Promise((r) => setTimeout(r, 12));
    job.pause();
    await new Promise((r) => setTimeout(r, 20));
    const atPause = done.length;
    await new Promise((r) => setTimeout(r, 30));
    check('pause stops pulling new items', done.length === atPause && atPause < 10, `${atPause}`);
    job.resume();
    const res = await p;
    check('resume finishes every item', done.length === 10 && !res.cancelled);
  }
  {
    const job = new core.Job();
    let n = 0;
    const p = core.runQueue(
      Array.from({ length: 50 }, (_, i) => i),
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        n += 1;
      },
      { concurrency: 3, job },
    );
    await new Promise((r) => setTimeout(r, 12));
    job.pause();
    job.cancel(); // cancel while paused must release the waiting lanes
    const res = await p;
    check('cancel (even while paused) ends the run', res.cancelled && n < 50);
  }

  // ── Rehydrate fix-ups ──────────────────────────────────────────────────
  const n = normalizeDownloads({
    packs: { audio: { status: 'downloading', done: 3, total: 9, failed: 0, qari: 'maher', scope: { kind: 'juz', juz: 30 } } },
    items: {
      36: { surah: 36, status: 'done', progress: 1, withAudio: true, qari: 'sudais', pages: [440], bytes: 0, updatedAt: '' },
      2: { surah: 2, status: 'downloading', progress: 0.3, withAudio: false, qari: 'husary', pages: [], bytes: 0, updatedAt: '' },
    },
  });
  check('interrupted job → paused (resumable)', n.packs?.audio?.status === 'paused');
  check('interrupted surah item → error', n.items?.[2].status === 'error');
  check('legacy surah audio folded into the index', n.audioIndex?.sudais?.[36] === true);
  check('legacy surah tafsir folded in', n.tafsirSurahs?.[36] === true);

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  if (failures) process.exit(1);
}

void main();
