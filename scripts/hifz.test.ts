/**
 * Executable check for «الحفظ والمراجعة» (services/hifzModel.ts).
 *   npx esbuild scripts/hifz.test.ts --bundle --format=esm --platform=node --alias:@=./src \
 *     --outfile=.tmp-test/hifz.mjs "--define:import.meta.env={}" \
 *     --loader:.css=empty --loader:.ttf=empty --loader:.woff2=empty && node .tmp-test/hifz.mjs
 *   (the reminder's plugin → settingsStore → data/appFonts pulls font CSS into the bundle)
 */
import assert from 'node:assert/strict';
import { ayahIndex, hifzModel, juzPages, pagesAyat, rangeTxt, reviewReminder, runs, surahAyat } from '@/services/hifzModel';
import { newestById, useMushafiStore, type MushafiSession } from '@/store/mushafiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { companionSources, type SourceContext } from '@/services/attention/registry';
import '@/services/attention/plugins';
import { PAGE_FIRST_AYAH } from '@/data/quranPages';

const NOW = new Date('2026-11-20T20:00:00').getTime();
const DAY = 86_400_000;
let n = 0;
const ses = (ty: MushafiSession['ty'], a: number, z: number, daysAgo: number, o: Partial<MushafiSession> = {}): MushafiSession => {
  const e = NOW - daysAgo * DAY - 3_600_000;
  return { id: `x${n++}`, ty, a, z, s: e - 1_800_000, e, t: 1, ...o };
};
const pages = (from: number, to: number) => pagesAyat(from, to);

// Spans.
assert.deepEqual(runs([5, 1, 3, 2]), [{ from: 1, to: 3 }, { from: 5, to: 5 }]);
assert.equal(ayahIndex(18, 1), 2140);
assert.equal(ayahIndex(1, 99), 6, 'clamped into the surah');
assert.deepEqual(surahAyat(114), [6230, 6235]);
assert.deepEqual(juzPages(30), [582, 604]);
assert.deepEqual(pages(582, 604), [PAGE_FIRST_AYAH[581], 6235]);
assert.equal(rangeTxt(...surahAyat(67)), 'الملك كاملة');

// جزء عمّ reviewed a month ago, a 14-day cycle: all of it البعيد and late; today's share = ⌈23/14⌉ = 2, its first pages.
let m = hifzModel([ses('review', ...pages(582, 604), 30)], NOW, 14);
assert.equal(m.held, 23);
assert.equal(m.juz[29].held, 23);
assert.equal(m.today.share, 2);
assert.deepEqual(m.today.far, [{ from: 582, to: 583 }]);
assert.deepEqual(m.today.recent, []);
assert.equal(m.today.late, 23);
assert.equal(m.pages[581].state, 'late');
assert.equal(m.pages[580].state, 'none');
assert.equal(m.surahs[113].held, 6);
assert.equal(m.next, null, 'no hifz session: nothing to suggest');

// Reviewed today: the share is done, even with other pages — those still late.
m = hifzModel([ses('review', ...pages(582, 604), 30), ses('review', ...pages(590, 591), 0)], NOW, 14);
assert.equal(m.today.done, 2);
assert.deepEqual(m.today.far, []);
assert.equal(m.today.left, 0);
assert.equal(m.today.late, 21);
assert.equal(m.pages[589].state, 'ok');

// القريب: memorized new yesterday → due today; memorized 8 days ago → البعيد; half a page isn't held.
m = hifzModel([ses('hifz', ...pages(581, 581), 1), ses('hifz', ...pages(570, 570), 8), ses('hifz', pageAyat0(569), pageAyat0(569) + 2, 1)], NOW, 7);
assert.equal(m.held, 2);
assert.equal(m.today.recentCount, 1);
assert.deepEqual(m.today.recent, [{ from: 581, to: 581 }]);
assert.deepEqual(m.today.far, [{ from: 570, to: 570 }], '⌈1/7⌉ = 1');
assert.equal(m.pages[580].state, 'today');
assert.equal(m.pages[580].times, 1);
// …gone over again today: done, twice.
m = hifzModel([ses('hifz', ...pages(581, 581), 1), ses('review', ...pages(581, 581), 0)], NOW, 7);
assert.deepEqual(m.today.recent, []);
assert.equal(m.pages[580].times, 2);
assert.equal(m.pages[580].state, 'ok');

// A deleted session counts for nothing.
assert.equal(hifzModel([ses('hifz', ...pages(1, 2), 1, { del: 1 })], NOW, 7).held, 0);

// Next: on in the surah; then forward (الفاتحة held → آل عمران) or backward (from the end → المرسلات).
const [naba] = surahAyat(78);
assert.equal(hifzModel([ses('hifz', naba, naba + 19, 1)], NOW, 14).next, ayahIndex(78, 21));
assert.equal(hifzModel([ses('review', ...surahAyat(1), 9), ses('hifz', ...surahAyat(2), 1)], NOW, 14).next, ayahIndex(3, 1));
assert.equal(
  hifzModel([ses('review', surahAyat(79)[0], 6235, 9), ses('hifz', ...surahAyat(78), 1)], NOW, 14).next,
  ayahIndex(77, 1),
);

// Activity: new the first time, review after; minutes.
m = hifzModel([ses('hifz', ...pages(1, 1), 2), ses('hifz', ...pages(1, 1), 1)], NOW, 14);
const [d1, d2] = [...m.days.values()];
assert.equal(Math.round(d1.fresh), 1);
assert.equal(Math.round(d2.review), 1);
assert.equal(d2.fresh, 0);
assert.equal(d1.minutes, 30);
assert.equal(m.log.length, 2);
assert.ok(m.log[0].s > m.log[1].s, 'newest first');

// Sessions recorded here: newest per id; a deletion wins over the older copy.
const a = ses('review', 0, 6, 1);
assert.deepEqual(newestById([a], [{ id: a.id, t: 2, del: 1 } as MushafiSession]).map((x) => x.del), [1]);

// The reminder: what is left, by passage; nothing once the day's review is done.
{
  const two = [ses('hifz', ...pages(581, 581), 1), ses('review', ...pages(1, 1), 30)];
  const r = reviewReminder(hifzModel(two, NOW, 7));
  assert.equal(r?.title, 'مراجعة حفظك اليوم: صفحتان');
  assert.match(r!.body, /الفاتحة كاملة/);
  assert.match(r!.body, /صفحة واحدة متأخرة/);
  assert.equal(reviewReminder(hifzModel([...two, ses('review', ...pages(581, 581), 0), ses('review', ...pages(1, 1), 0)], NOW, 7)), null);

  // Its daily slot (attention/plugins.ts): half an hour after Fajr, or the user's time; today's only if still ahead.
  useMushafiStore.setState({ code: 'X', sessions: two });
  const src = companionSources().find((x) => x.id === 'hifz')!;
  const fajr = (d: Date) => new Date(new Date(d).setHours(5, 0, 0, 0));
  const ctx = (now: Date) => ({ now, today: '', times: null, timesOf: (d: Date) => ({ fajr: fajr(d) }) }) as unknown as SourceContext;
  const at = (now: Date) => src.nudges!(ctx(now)).map((n) => [n.at.getDate(), n.at.getHours(), n.at.getMinutes(), n.quietOk]);
  const early = new Date('2026-11-20T04:00:00');
  assert.deepEqual(at(early).slice(0, 2), [[20, 5, 30, false], [21, 5, 30, false]]);
  assert.equal(at(new Date('2026-11-20T09:00:00'))[0][0], 21, "today's time has passed");
  useSettingsStore.setState({ hifzRemindAt: '21:15' });
  assert.deepEqual(at(early)[0], [20, 21, 15, true], 'the user’s time, even in quiet hours');
  useSettingsStore.setState({ hifzRemind: false });
  assert.equal(at(early).length, 0);
  useSettingsStore.setState({ hifzRemind: true, hifzRemindAt: '' });
  useMushafiStore.setState({ code: null });
  assert.equal(at(early).length, 0, 'not linked');
}

function pageAyat0(p: number) {
  return PAGE_FIRST_AYAH[p - 1];
}
console.log('hifz: ok');
