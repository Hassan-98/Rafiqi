// Run: npx esbuild scripts/mushafi.test.ts --bundle --format=esm --platform=node --alias:@=./src --outfile=.tmp-test/mushafi.mjs && node .tmp-test/mushafi.mjs
import assert from 'node:assert/strict';
import {
  ayahKey,
  khatmaState,
  normalizeMushafiCode,
  noteTops,
  prettyMushafiCode,
  quranTypeStats,
  sessionCredit,
  sessionStats,
  typesActiveOn,
  type MushafiKhatma,
  type MushafiSession,
} from '@/store/mushafiStore';
import { PAGE_FIRST_AYAH } from '@/data/quranPages';

const k = (o: Partial<MushafiKhatma> = {}): MushafiKhatma => ({ id: 'k1', m: 'r1', n: 'ختمة', at: 1, s: '2026-11-01', d: 30, b: 0, t: 1, ...o });
const ribbon = (p: number, extra = {}) => [{ id: 'r1', p, name: 'ختمة رمضان', color: '#aa0000', t: 1, ...extra }];

// Day 0, ribbon on page 1 (nothing read): today's portion = round(604/30) = 20 pages.
let s = khatmaState(k(), ribbon(1), '2026-11-01');
assert.equal(s.top, 0);
assert.equal(s.end, 20);
assert.equal(s.owe, 20);
assert.equal(s.share, 20);
assert.equal(s.name, 'ختمة رمضان');
assert.equal(s.next, 1);

// Ribbon moved to page 15 → 14 read; rd counts only on the LAST page (مصحفي 2026-11-10).
s = khatmaState(k(), ribbon(15), '2026-11-01');
assert.equal(s.top, 14);
assert.equal(s.owe, 6);
s = khatmaState(k({ rd: 15 }), ribbon(15), '2026-11-01');
assert.equal(s.top, 14);
assert.equal(s.type, 'tilawa');
assert.equal(khatmaState(k({ ty: 'listen' }), ribbon(15), '2026-11-01').type, 'listen');
assert.equal(khatmaState(k({ ty: 'nonsense' }), ribbon(15), '2026-11-01').type, 'tilawa');

// Cumulative: day 2 with only 10 read → end = round(604*3/30) = 60, owe 50, late = due(2)-10 = 40-10 = 30.
s = khatmaState(k(), ribbon(11), '2026-11-03');
assert.equal(s.end, 60);
assert.equal(s.owe, 50);
assert.equal(s.late, 30);

// Ahead of plan → owe 0 (never negative).
s = khatmaState(k(), ribbon(100), '2026-11-01');
assert.equal(s.owe, 0);

// Ribbon deleted → falls back to the khatma's own page/name.
s = khatmaState(k({ at: 51, n: 'الختمة' }), [], '2026-11-02');
assert.equal(s.top, 50);
assert.equal(s.name, 'الختمة');

// Finished: top = 604 → not live.
s = khatmaState(k({ rd: 604, f: '2026-11-20' }), ribbon(604), '2026-11-21');
assert.equal(s.live, false);
assert.equal(s.owe, 0);
assert.equal(s.finished, '2026-11-20');

// التهجد edition: 244 pages.
s = khatmaState(k({ d: 10 }), ribbon(1, { k: 'tahajjud' }), '2026-11-01');
assert.equal(s.total, 244);
assert.equal(s.end, 24);

// Per-type stats: pages dated by the reading log.
{
  const days = { '2026-11-01': [1, 2, 3], '2026-11-02': [4, 5, 1], '2026-11-03': [300, 301] };
  const marks = [
    { id: 'r1', p: 6, name: 'تلاوتي', color: '#000000', t: 1 },
    { id: 'r2', p: 302, name: 'استماع', color: '#000000', t: 1 },
  ];
  const ks: MushafiKhatma[] = [
    k({ id: 'a', m: 'r1', s: '2026-11-01' }),
    k({ id: 'b', m: 'r2', s: '2026-11-03', b: 299, ty: 'listen' }),
    k({ id: 'c', m: '', at: 604, rd: 604, s: '2026-10-01', f: '2026-10-20', ty: 'tafsir' }),
  ];
  const st = quranTypeStats(days, ks, marks, '2026-11-03');
  assert.deepEqual(st.tilawa.days, { '2026-11-01': 3, '2026-11-02': 2 }); // page 1 dated by its FIRST read
  assert.equal(st.tilawa.pages, 5);
  assert.deepEqual(st.listen.days, { '2026-11-03': 2 });
  assert.equal(st.listen.pages, 2);
  assert.equal(st.tafsir.finished, 1);
  assert.equal(st.tafsir.pages, 604);
  assert.equal(st.tafsir.running.length, 0);
  assert.equal(st.tilawa.running.length, 1);
  assert.deepEqual([...typesActiveOn(ks, '2026-11-03')].sort(), ['listen', 'tilawa']);
  assert.deepEqual([...typesActiveOn(ks, '2026-10-05')], ['tafsir']);
}

// Progress counts as you read, before the ribbon is moved (owner) — near the ribbon only, each page once.
{
  const range = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
  const ks = [k({ id: 'a', m: 'r1', s: '2026-11-01' })];
  const days = { '2026-11-03': [...range(50, 60), 400] }; // 400: far from the ribbon (الكهف…)
  const before = quranTypeStats(days, ks, ribbon(50), '2026-11-03');
  assert.equal(before.tilawa.days['2026-11-03'], 11, 'ribbon still on page 50');
  const after = quranTypeStats(days, ks, ribbon(61), '2026-11-03');
  assert.equal(after.tilawa.days['2026-11-03'], 11, 'moving the ribbon later changes nothing');
}

// The ribbon dates what the reading log never saw (listening, tafsir, a printed mushaf) —
// from where it stood when first seen; nothing before that is credited to any day.
{
  const ks = [k({ id: 'a', m: 'r1', s: '2026-11-01', ty: 'listen' })];
  let tops = noteTops({}, ks, ribbon(50), '2026-11-02'); // first seen at page 50: 1–49 came before
  tops = noteTops(tops, ks, ribbon(61), '2026-11-03'); // the next day: 50–60 heard, no page logged
  const st = quranTypeStats({}, ks, ribbon(61), '2026-11-03', tops);
  assert.deepEqual(st.listen.days, { '2026-11-03': 11 });
  assert.equal(quranTypeStats({}, ks, ribbon(61), '2026-11-03').listen.days['2026-11-03'], undefined, 'without the ribbon log: nothing');
  // A khatma begun today counts from its start.
  const fresh = [k({ id: 'b', m: 'r1', s: '2026-11-03', b: 100 })];
  const t2 = noteTops({}, fresh, ribbon(111), '2026-11-03');
  assert.equal(quranTypeStats({}, fresh, ribbon(111), '2026-11-03', t2).tilawa.days['2026-11-03'], 10);
}

// A khatma read weeks ago and entered today (مصحفي dates every new khatma today): its ribbon
// lands on the last page at once — no day gets it (owner 2026-11-17, «شيم»).
{
  const old = [k({ id: 'c', m: 'r1', s: '2026-11-17', rd: 604, f: '2026-11-17' })];
  const t = noteTops({}, old, ribbon(604), '2026-11-17');
  const st = quranTypeStats({}, old, ribbon(604), '2026-11-17', t);
  assert.deepEqual(st.tilawa.days, {});
  assert.equal(st.tilawa.finished, 1, 'still counts as a finished khatma');
  assert.equal(st.tilawa.pages, 604);
  // Seen at its start first (desktop: both apps open), then the jump — same.
  let t3 = noteTops({}, [k({ id: 'c', m: 'r1', s: '2026-11-17' })], ribbon(1), '2026-11-17');
  t3 = noteTops(t3, old, ribbon(604), '2026-11-17');
  assert.deepEqual(quranTypeStats({}, old, ribbon(604), '2026-11-17', t3).tilawa.days, {});
  // …but what مصحفي logged that day still counts in full.
  const read = { '2026-11-17': Array.from({ length: 70 }, (_, i) => i + 1) };
  assert.equal(quranTypeStats(read, old, ribbon(604), '2026-11-17', t3).tilawa.days['2026-11-17'], 70);
}

// Later days: no ceiling on what the ribbon dates (owner 2026-11-21: 100 pages heard and more).
{
  const ks = [k({ id: 'd', m: 'r1', s: '2026-11-01' })];
  let t = noteTops({}, ks, ribbon(1), '2026-11-01');
  t = noteTops(t, ks, ribbon(36), '2026-11-02'); // 35 pages: a normal heavy day
  t = noteTops(t, ks, ribbon(336), '2026-11-03'); // 300 pages in a day: all of them
  const st = quranTypeStats({}, ks, ribbon(336), '2026-11-03', t);
  assert.deepEqual(st.tilawa.days, { '2026-11-02': 35, '2026-11-03': 300 });
  // A short plan reads more a day: 10 days → 61/day → up to 122.
  const short = [k({ id: 'e', m: 'r1', s: '2026-11-01', d: 10 })];
  let t4 = noteTops({}, short, ribbon(1), '2026-11-01');
  t4 = noteTops(t4, short, ribbon(101), '2026-11-02');
  assert.equal(quranTypeStats({}, short, ribbon(101), '2026-11-02', t4).tilawa.days['2026-11-02'], 100);
}

// Two khatmas over the same pages (owner 2026-11-21: 48 pages listened scored 10): the reading
// khatma, ahead, logged them days before — those days are ITS; the listening is dated today.
{
  const range = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
  const marks = [
    { id: 'r1', p: 1, name: 'تلاوتي', color: '#000000', t: 1 },
    { id: 'r2', p: 1, name: 'استماعي', color: '#000000', t: 1 },
  ];
  const at = (read: number, heard: number) => [{ ...marks[0], p: read }, { ...marks[1], p: heard }];
  const ks = [k({ id: 'read', m: 'r1', s: '2026-11-01' }), k({ id: 'hear', m: 'r2', s: '2026-11-01', ty: 'listen' })];
  let t = noteTops({}, ks, at(1, 1), '2026-11-01');
  t = noteTops(t, ks, at(41, 1), '2026-11-03'); // read 1–40 (logged), the listening still at the start
  t = noteTops(t, ks, at(41, 41), '2026-11-05'); // heard 1–40, screen off but one page
  const days = { '2026-11-03': range(1, 40), '2026-11-05': [35] };
  const st = quranTypeStats(days, ks, at(41, 41), '2026-11-05', t);
  assert.deepEqual(st.tilawa.days, { '2026-11-03': 40 });
  assert.deepEqual(st.listen.days, { '2026-11-05': 40 }, 'all of it on the listening day — not the reading day');
  // A page read far ahead of a ribbon (40+ pages) isn't that khatma's, even once it passes it.
  const solo = [ks[1]];
  let t2 = noteTops({}, solo, at(1, 1), '2026-11-01');
  t2 = noteTops(t2, solo, at(1, 31), '2026-11-03');
  t2 = noteTops(t2, solo, at(1, 71), '2026-11-05');
  assert.deepEqual(quranTypeStats({ '2026-11-02': [65] }, solo, at(1, 71), '2026-11-05', t2).listen.days, { '2026-11-03': 30, '2026-11-05': 40 });
}

// Sessions (مصحفي «جلسة»): pages by ayat, first memorization vs review, memorized pages and ajzaa, الكهف on Friday.
{
  const at = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const ses = (o: Partial<MushafiSession>): MushafiSession => ({ id: 'x', ty: 'tilawa', a: 0, z: 6, s: at('2026-11-14', 9), e: at('2026-11-14', 10), t: 1, ...o });
  const total = (m: Map<number, number>) => Math.round([...m.values()].reduce((n, f) => n + f, 0) * 1000) / 1000;
  assert.deepEqual(ayahKey(0), [1, 1]);
  assert.deepEqual(ayahKey(2140), [18, 1]);
  assert.deepEqual(ayahKey(6235), [114, 6]);

  // الفاتحة = page 1, whole; reading memorizes nothing.
  let st = sessionStats([ses({})]);
  assert.deepEqual([...st.items[0].pages], [[1, 1]]);
  assert.equal(st.items[0].minutes, 60);
  assert.equal(st.items[0].day, '2026-11-14');
  assert.equal(st.memorized, 0);
  // Part of a page isn't the page.
  st = sessionStats([ses({ ty: 'hifz', a: 0, z: 5 })]);
  assert.equal(total(st.items[0].pages), Math.round((6 / 7) * 1000) / 1000);
  assert.equal(st.memorized, 0);

  // جزء عمّ (pages 582–604) memorized, then again the next day: new only the first time.
  const amma = PAGE_FIRST_AYAH[581];
  st = sessionStats([
    ses({ id: 'h2', ty: 'hifz', a: amma, z: 6235, s: at('2026-11-15', 9), e: at('2026-11-15', 10) }),
    ses({ id: 'h1', ty: 'hifz', a: amma, z: 6235 }),
  ]);
  assert.deepEqual(st.items.map((x) => x.id), ['h1', 'h2'], 'oldest first');
  assert.equal(st.memorized, 23);
  assert.equal(st.juz, 1);
  assert.equal(total(st.items[0].fresh), 23);
  assert.equal(st.items[1].fresh.size, 0);
  const again = sessionCredit(st.items[1]);
  assert.equal(Math.round(again.review), 23);
  assert.equal(again.hifz, 0);
  assert.equal(st.pageTouched[603], at('2026-11-15', 10), 'last touched = the latest session');
  // Reviewing what was memorized long ago records it; a deleted session doesn't count.
  st = sessionStats([ses({ ty: 'review' }), ses({ id: 'd', ty: 'hifz', a: 7, z: 11, del: 1 })]);
  assert.equal(st.memorized, 1);
  assert.equal(st.items.length, 1);

  // الكهف on a Friday (2026-11-13) in two sittings, reading then listening; a Saturday doesn't count.
  st = sessionStats([
    ses({ id: 'k1', a: 2140, z: 2200, s: at('2026-11-13', 8), e: at('2026-11-13', 9) }),
    ses({ id: 'k2', ty: 'listen', a: 2201, z: 2249, s: at('2026-11-13', 20), e: at('2026-11-13', 21) }),
  ]);
  assert.deepEqual([...st.kahfFridays], ['2026-11-13']);
  assert.equal(sessionStats([ses({ a: 2140, z: 2249 })]).kahfFridays.size, 0, 'Saturday');
  assert.equal(sessionStats([ses({ a: 2141, z: 2249, s: at('2026-11-13', 8) })]).kahfFridays.size, 0, 'not all of it');

  // A page a khatma already credited that day counts once; listening isn't reading.
  const qt = quranTypeStats({ '2026-11-14': [1] }, [k({ id: 'a', m: '', at: 3, s: '2026-11-01' })], [], '2026-11-14');
  assert.equal(sessionCredit(sessionStats([ses({})]).items[0], qt).tilawa, 0);
  assert.equal(sessionCredit(sessionStats([ses({ ty: 'listen' })]).items[0], qt).listen, 1);
  assert.equal(sessionCredit(sessionStats([ses({})]).items[0]).tilawa, 1, 'no khatma: all of it');
}

// Codes.
assert.equal(normalizeMushafiCode('abcd-efgh jklm npqr'), 'ABCDEFGHJKLMNPQR');
assert.equal(normalizeMushafiCode('ABCD-EFGH-JKLM-NPQ0'), null); // 0 is not in the alphabet
assert.equal(normalizeMushafiCode('short'), null);
assert.equal(prettyMushafiCode('ABCDEFGHJKLMNPQR'), 'ABCD-EFGH-JKLM-NPQR');

console.log('mushafi: ok');
