/**
 * Executable check for the badge levels and the rawatib helpers.
 *
 * Run: npx esbuild scripts/badgeLevels.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/badgeLevels.test.mjs
 *      node .tmp-test/badgeLevels.test.mjs
 */
import assert from 'node:assert/strict';
import { BADGES, LEVELS, badgePoints, badgesFor, levelFor } from '@/data/badges';
import { RAWATIB, rawatibFullOn, rawatibRakaatOf, duhaRakaatOf, lastDuhaRakaat, duhaWindow } from '@/store/prayerLogStore';

const SAT = '2026-11-14';
assert.equal(rawatibFullOn(SAT, true), 12);
assert.equal(RAWATIB.length, 5);
assert.equal(rawatibRakaatOf(undefined, SAT, true), 0);
assert.equal(rawatibRakaatOf({ dhuhr: { sunnahBefore: true, sunnahAfter: true } }, SAT, true), 6);
assert.equal(
  rawatibRakaatOf(
    {
      fajr: { sunnahBefore: true },
      dhuhr: { sunnahBefore: true, sunnahAfter: true },
      maghrib: { sunnahAfter: true },
      isha: { sunnahAfter: true },
      asr: { sunnahBefore: true }, // no rawatib for asr — never counted
    },
    SAT,
    true,
  ),
  12,
);

assert.equal(levelFor(0).level.rank, 1);
assert.equal(levelFor(39).level.rank, 1);
assert.equal(levelFor(40).level.rank, 2);
assert.equal(levelFor(80).pct, 50);
assert.ok(LEVELS.every((l, i) => i === 0 || l.min > LEVELS[i - 1].min));
const top = levelFor(LEVELS[LEVELS.length - 1].min + 999);
assert.equal(top.next, null);
assert.equal(top.pct, 100);

assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length, 'duplicate badge id');
assert.equal(badgePoints(['streak_overall_3', 'nope']), 10);
assert.equal(badgePoints(['mosque_1', 'streak_overall_3'], 'female'), 10, 'men-only badges earn women nothing');

// الضحى: legacy `true` reads as 2; the last logged count is the next default.
assert.equal(duhaRakaatOf(true), 2);
assert.equal(duhaRakaatOf(8), 8);
assert.equal(duhaRakaatOf(undefined), 0);
assert.equal(lastDuhaRakaat({}), 2);
assert.equal(lastDuhaRakaat({ '2026-10-01': 8, '2026-10-03': 4, '2026-10-02': true }), 4);
const w = duhaWindow({
  sunrise: new Date('2026-10-29T06:00:00'),
  dhuhr: new Date('2026-10-29T12:00:00'),
  maghrib: new Date('2026-10-29T18:00:00'),
});
assert.equal(w.start.getHours() * 60 + w.start.getMinutes(), 6 * 60 + 15);
assert.equal(w.best.getHours(), 9); // a quarter of the day after sunrise
assert.equal(w.end.getHours() * 60 + w.end.getMinutes(), 11 * 60 + 50);

// Mosque badges: men only.
const mosque = BADGES.filter((b) => b.id.startsWith('mosque_'));
assert.ok(mosque.length >= 5 && mosque.every((b) => b.audience === 'male'));
assert.ok(badgesFor('male').some((b) => b.id === 'mosque_1'));
assert.ok(!badgesFor('female').some((b) => b.id.startsWith('mosque_')));
assert.ok(!badgesFor(null).some((b) => b.id.startsWith('mosque_')));
assert.equal(badgesFor('female').length, BADGES.length - BADGES.filter((b) => b.audience === 'male').length);
assert.ok(BADGES.filter((b) => b.id.startsWith('jumuah_')).every((b) => b.audience === 'male'));

console.log('badgeLevels: ok');
