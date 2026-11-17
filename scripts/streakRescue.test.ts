/**
 * Executable check for «استعادة السلسلة»: bridged streak days, the break finder
 * and the «مختصر» adhkar filter.
 *
 * Run: npx esbuild scripts/streakRescue.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/streakRescue.test.mjs
 *      node .tmp-test/streakRescue.test.mjs
 */
import assert from 'node:assert/strict';
import { computeStreakFromActiveDates } from '@/services/statsService';
import { findBreak, rescueMultiplier } from '@/services/streakRescueMath';
import { briefAdhkar, morningAdhkar, eveningAdhkar, postPrayerAdhkar } from '@/data/adhkar';

const now = new Date('2026-10-29T12:00:00');
const chain = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

// Missed 26–28: the chain is gone… unless those days are bridged.
assert.equal(computeStreakFromActiveDates(chain, now).current, 0);
const bridged = new Set(['2026-10-26', '2026-10-27', '2026-10-28']);
assert.equal(computeStreakFromActiveDates(chain, now, bridged).current, 6);
assert.equal(computeStreakFromActiveDates([...chain, '2026-10-29'], now, bridged).current, 7);
assert.equal(computeStreakFromActiveDates([...chain, '2026-10-29'], now, bridged).longest, 7);

// Three missed days → step 3 (250%), lost chain of 6.
const br = findBreak(new Set(chain), new Set(), '2026-10-29');
assert.ok(br);
assert.deepEqual(br.missed, ['2026-10-26', '2026-10-27', '2026-10-28']);
assert.equal(br.lost, 6);
assert.equal(rescueMultiplier(br.missed.length), 2.5);
assert.equal(rescueMultiplier(1), 1.5);

// Nothing missed, already bridged, a one-day chain, or past the week → no offer.
assert.equal(findBreak(new Set([...chain, '2026-10-28']), new Set(), '2026-10-29'), null);
assert.equal(findBreak(new Set(chain), bridged, '2026-10-29'), null);
assert.equal(findBreak(new Set(['2026-10-25']), new Set(), '2026-10-29'), null);
assert.equal(findBreak(new Set(chain), new Set(), '2026-11-03'), null);
assert.ok(findBreak(new Set(chain), new Set(), '2026-11-02')); // 7 missed: last day of the offer

// «مختصر»: a strict subset of morning/evening, untouched elsewhere and when off.
const m = briefAdhkar(morningAdhkar, true);
const e = briefAdhkar(eveningAdhkar, true);
assert.equal(m.length, morningAdhkar.length - 4);
assert.equal(e.length, eveningAdhkar.length - 3);
assert.ok(!m.some((it) => ['morning-16', 'morning-23', 'morning-30', 'morning-31'].includes(it.id)));
assert.equal(m.find((it) => it.id === 'morning-29')?.count, 10);
assert.equal(e.find((it) => it.id === 'evening-28')?.count, 10);
assert.equal(morningAdhkar.find((it) => it.id === 'morning-29')?.count, 100); // full set untouched
assert.equal(briefAdhkar(morningAdhkar, false), morningAdhkar);
assert.equal(briefAdhkar(postPrayerAdhkar, true), postPrayerAdhkar);

console.log('streakRescue: ok');
