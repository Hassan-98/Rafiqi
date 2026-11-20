// sh: npx esbuild scripts/engagement.test.ts --bundle --format=esm --platform=node --alias:@=./src '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}' --loader:.woff=empty --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/engagement.mjs && node .tmp-test/engagement.mjs
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import {
  addOutcomes,
  arm,
  easedAllows,
  easing,
  fatigueOf,
  nudgeActed,
  sentToday,
  settle,
  topicLabel,
  type ArmedNudge,
  type Outcome,
} from '@/services/engagement';
import { planCompanion, type CompanionInput, type DayTimes } from '@/services/smartCompanion';
import type { InsightsSnapshot } from '@/services/insightsEngine';
import { SMART_DEFAULTS } from '@/store/notificationStore';

const DAY = new Date(2026, 10, 8, 12); // Sunday
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const hm = (h: number, m = 0, day = DAY) => {
  const t = new Date(day);
  t.setHours(h, m, 0, 0);
  return t;
};
const K = key(DAY);
const snap = (o: Partial<InsightsSnapshot> = {}): InsightsSnapshot => ({ dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, activity: [], ...o });
const ev = (t: Date, domain: string, refId?: string) => ({ ts: t.getTime(), dateKey: key(t), domain, refId, title: '', amount: 1 });
const armed = (topic: string | undefined, t: Date, extra: Partial<ArmedNudge> = {}): ArmedNudge => ({ slot: `myzikr_smart_${topic}`, topic, at: t.getTime(), day: key(t), ...extra });

// Acted = the deed was logged after the nudge, within its window; ignored = the window passed without it.
{
  const a = armed('morning', hm(6, 25));
  assert.equal(nudgeActed(a, snap({ activity: [ev(hm(6, 40), 'dhikr', 'morning')] }), hm(7)), true);
  assert.equal(nudgeActed(a, snap(), hm(7)), null, 'still in its window');
  assert.equal(nudgeActed(a, snap(), hm(10)), false);
  assert.equal(nudgeActed(a, snap({ activity: [ev(hm(5, 0), 'dhikr', 'morning')] }), hm(10)), false, 'before it rang is not an answer');
  // Post-prayer adhkar: the prayer's own flag counts.
  const after = armed('after', hm(15, 20), { slot: 'myzikr_smart_after:asr' });
  assert.equal(nudgeActed(after, snap({ prayerLog: { [K]: { asr: { fard: true, adhkar: true } } } }), hm(18)), true);
  // The wird: reading after it rang (above its base).
  const q = armed('quran', hm(18), { base: 2 });
  assert.equal(nudgeActed(q, snap({ wirdHistory: { [K]: { unit: 'page', amount: 4, achieved: 2 } } }), hm(23)), false);
  assert.equal(nudgeActed(q, snap({ wirdHistory: { [K]: { unit: 'page', amount: 4, achieved: 3 } } }), hm(19)), true);
  assert.equal(nudgeActed(armed('suggest.duha', hm(9)), snap({ duha: { [K]: 2 } }), hm(10)), true);
  // Untold topics are never eased: no topic (prayer checks), Friday's hour, a source without a verdict.
  assert.equal(nudgeActed(armed(undefined, hm(9)), snap(), hm(23)), null);
  assert.equal(nudgeActed(armed('suggest.fridayHour', hm(16)), snap(), hm(23)), null);
  assert.equal(nudgeActed(armed('x.silat.call', hm(16)), snap(), hm(23)), null);
  assert.equal(nudgeActed(armed('x.silat.call', hm(16)), snap(), hm(23), () => true), true);
}
// settle: outcomes for what can be told; today's delivered stay (no second send); older ones go.
{
  const ledger: Record<string, ArmedNudge> = {
    a: armed('morning', hm(6, 25)),
    b: armed('evening', hm(19)), // still ahead
    c: armed('morning', hm(6, 25, addDays(DAY, -2))), // too old
    d: armed(undefined, hm(12, 30), { slot: 'myzikr_smart_pray_dhuhr' }),
  };
  const r = settle(ledger, snap(), hm(11));
  assert.deepEqual(r.outcomes, [{ topic: 'morning', outcome: { day: K, acted: false } }]);
  assert.equal(r.armed.a.settled, true);
  assert.ok(r.armed.b && !r.armed.b.settled);
  assert.ok(!r.armed.c);
  assert.ok(r.armed.d, 'kept for dedupe');
  assert.deepEqual(settle(r.armed, snap(), hm(12)).outcomes, [], 'settled once');
}
// arm: what is planned is remembered; a pending one that vanished from the plan was cancelled.
{
  const now = hm(10);
  const prev: Record<string, ArmedNudge> = {
    [`myzikr_smart_morning|${K}`]: armed('morning', hm(6, 25), { slot: 'myzikr_smart_morning' }),
    [`myzikr_smart_evening|${K}`]: armed('evening', hm(16), { slot: 'myzikr_smart_evening' }),
  };
  const next = arm(
    prev,
    [
      { id: 'myzikr_smart_quran', at: hm(18), topic: 'quran', dedupe: 'myzikr_smart_quran' },
      { id: 'myzikr_smart_weekly', at: hm(18) },
    ],
    now,
    snap({ wirdHistory: { [K]: { unit: 'page', amount: 4, achieved: 1 } } }),
  );
  assert.deepEqual(Object.keys(next).sort(), [`myzikr_smart_morning|${K}`, `myzikr_smart_quran|${K}`]);
  assert.equal(next[`myzikr_smart_quran|${K}`].base, 1);
  assert.deepEqual(sentToday(next, now), ['myzikr_smart_morning']);
}
// Easing: three ignored in a row → every 2nd day, then 4th, 8th, 16th; one act restores.
{
  const o = (...acted: boolean[]): Outcome[] => acted.map((a, i) => ({ day: key(addDays(DAY, i - acted.length)), acted: a }));
  assert.equal(easing(o(true, false, false)), 0);
  assert.equal(easing(o(false, false, false)), 1);
  assert.equal(easing(o(false, false, false, false)), 2);
  assert.equal(easing(o(...Array(9).fill(false))), 4, 'capped');
  assert.equal(easing(o(false, false, false, true)), 0);
  assert.equal(easedAllows({ level: 1, last: key(addDays(DAY, -1)) }, K), false);
  assert.equal(easedAllows({ level: 1, last: key(addDays(DAY, -2)) }, K), true);
  assert.equal(easedAllows({ level: 2, last: key(addDays(DAY, -3)) }, K), false);
  // addOutcomes keeps the last twelve and forgets two months back.
  const many = addOutcomes({ old: [{ day: '2026-01-01', acted: false }] }, Array.from({ length: 15 }, () => ({ topic: 'evening', outcome: { day: K, acted: false } })), DAY);
  assert.equal(many.evening.length, 12);
  assert.equal(many.old, undefined);
  // The last delivery can be newer than the last outcome (still pending).
  const f = fatigueOf({ evening: o(false, false, false) }, { x: armed('evening', hm(17)) }, hm(20));
  assert.deepEqual(f.evening, { level: 1, last: K });
  assert.equal(topicLabel('suggest.duha'), 'الضحى');
  assert.equal(topicLabel('x.silat.call', { 'x.silat.call': 'صلة الرحم' }), 'صلة الرحم');
}

// ── in the planner ──
const times = (day: Date): DayTimes => ({
  fajr: hm(4, 40, day),
  sunrise: hm(6, 5, day),
  dhuhr: hm(11, 45, day),
  asr: hm(14, 50, day),
  maghrib: hm(17, 15, day),
  isha: hm(18, 35, day),
});
function base(): CompanionInput {
  const now = hm(14);
  const all5 = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };
  const prayerLog: NonNullable<InsightsSnapshot['prayerLog']> = {};
  for (let n = 1; n <= 7; n++) prayerLog[key(addDays(now, -n))] = { ...all5 };
  prayerLog[key(now)] = { fajr: { fard: true } };
  return { snap: snap({ prayerLog }), now, prefs: { ...SMART_DEFAULTS }, times };
}
const ids = (i: CompanionInput) => planCompanion(i).map((n) => n.id);
// Delivered today → not sent again today (it used to slide to «half an hour from now» on every re-plan).
{
  const i = base();
  assert.ok(ids(i).includes('myzikr_smart_pray_dhuhr'));
  i.sentToday = ['myzikr_smart_pray_dhuhr'];
  assert.ok(!ids(i).includes('myzikr_smart_pray_dhuhr'));
  assert.ok(ids(i).includes('myzikr_smart_pray_dhuhr_d1'), 'tomorrow is another day');
  const n = planCompanion(base()).find((x) => x.id === 'myzikr_smart_evening');
  assert.equal(n?.dedupe, 'myzikr_smart_evening');
  assert.equal(n?.topic, 'evening');
  assert.equal(planCompanion(base()).find((x) => x.id === 'myzikr_smart_pray_asr')?.topic, undefined, 'prayer checks carry no topic');
}
// An eased topic comes every 2^level days — and prayer checks are never eased.
{
  const i = base();
  assert.deepEqual(
    ids(i).filter((x) => x.startsWith('myzikr_smart_evening')),
    ['myzikr_smart_evening', 'myzikr_smart_evening_d1', 'myzikr_smart_evening_d2'],
  );
  i.fatigue = { evening: { level: 1, last: key(addDays(DAY, -1)) } };
  assert.deepEqual(ids(i).filter((x) => x.startsWith('myzikr_smart_evening')), ['myzikr_smart_evening_d1']);
  i.fatigue = { evening: { level: 1, last: key(addDays(DAY, -2)) } };
  assert.deepEqual(ids(i).filter((x) => x.startsWith('myzikr_smart_evening')), ['myzikr_smart_evening', 'myzikr_smart_evening_d2']);
  i.fatigue = { pray: { level: 4, last: K }, late: { level: 4, last: K } };
  assert.ok(ids(i).includes('myzikr_smart_pray_asr') && ids(i).includes('myzikr_smart_late_asr'));
}

console.log('engagement: ok');
