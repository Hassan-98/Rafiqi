import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { harvestOf, harvestStart, raceOf, verdictOf } from '@/services/selfRace';
import { raceMoments, type MomentsInput } from '@/services/raceMoments';

const dk = (d: Date) => format(d, 'yyyy-MM-dd');
// Thursday 19 Nov 2026, 14:00 — the week began Saturday 14 Nov.
const NOW = new Date(2026, 10, 19, 14, 0);
const day = (offset: number) => dk(addDays(new Date(2026, 10, 19), offset));

// ── day ──
{
  const t = { [day(0)]: 80, [day(-1)]: 100, [day(-2)]: 150, [day(-3)]: 60 };
  const r = raceOf('today', t, NOW);
  assert.equal(r.now, 80);
  assert.equal(r.ghost, 100);
  assert.equal(r.record?.points, 150, 'the best finished day');
  assert.equal(r.avg, Math.round((100 + 150 + 60) / 3), 'mean of the days with points');
  const v = verdictOf(r);
  assert.equal(v.kind, 'behind');
  assert.equal(v.gap, 20);
  assert.match(v.text, /لتلحق بأمسك/);
  assert.match(verdictOf(r, true).text, /لتلحقي/);
  assert.equal(verdictOf(raceOf('today', { ...t, [day(0)]: 151 }, NOW)).kind, 'record');
  assert.equal(verdictOf(raceOf('today', { ...t, [day(0)]: 120 }, NOW)).kind, 'ahead');
  assert.equal(verdictOf(raceOf('today', {}, NOW)).kind, 'start');
  // One finished day with points is not a record yet.
  assert.equal(raceOf('today', { [day(-1)]: 40 }, NOW).record, null);
  const y = raceOf('yesterday', t, NOW);
  assert.equal(y.now, 100);
  assert.equal(y.ghost, 150);
}

// ── week: Saturday → today (6 days) against last week's same 6 days ──
{
  const t: Record<string, number> = {};
  for (let i = -5; i <= 0; i++) t[day(i)] = 10; // this week: 60
  for (let i = -12; i <= -6; i++) t[day(i)] = 20; // last week: 7 × 20 = 140, its first 6 = 120
  const r = raceOf('week', t, NOW);
  assert.equal(r.now, 60);
  assert.equal(r.ghost, 120);
  assert.equal(r.prevTotal, 140);
  assert.equal(r.ghostLabel, 'الأسبوع الماضي حتى الخميس');
  assert.equal(r.days?.length, 7);
  assert.deepEqual(r.days?.map((d) => d.now), [10, 10, 10, 10, 10, 10, null], 'days to come are null');
  assert.equal(r.days?.[0].ghost, 20);
  assert.equal(r.record, null, 'one finished week is no record');

  // A browsed week (Sat 7 → Fri 13 Nov, from any day in it): all seven days against the week before.
  const p = raceOf('pastWeek', t, new Date(2026, 10, 9));
  assert.equal(p.now, 140);
  assert.equal(p.ghostLabel, 'الأسبوع الذي قبله');
  assert.deepEqual(p.days?.map((d) => d.now), [20, 20, 20, 20, 20, 20, 20], 'every day of a finished week counts');
  assert.equal(verdictOf(p).text, 'لا شيء في الأسبوع الذي قبله للمقارنة');
  assert.equal(verdictOf(raceOf('pastWeek', { ...t, [day(-13)]: 40 }, new Date(2026, 10, 9))).text, 'زاد على الأسبوع الذي قبله بـ١٠٠ نقطة');
  assert.equal(verdictOf(raceOf('pastWeek', {}, new Date(2025, 0, 1))).text, 'لا نقاط مسجّلة لك في هذا الأسبوع');
}

// ── month: 1st → 19th against last month's 1st → 19th ──
{
  const t: Record<string, number> = {};
  for (let d = 1; d <= 19; d++) t[dk(new Date(2026, 10, d))] = 5; // 95
  for (let d = 1; d <= 31; d++) t[dk(new Date(2026, 9, d))] = 10; // Oct: 310, first 19 = 190
  for (let d = 1; d <= 30; d++) t[dk(new Date(2026, 8, d))] = 1; // Sep: 30
  const r = raceOf('month', t, NOW);
  assert.equal(r.now, 95);
  assert.equal(r.ghost, 190);
  assert.equal(r.prevTotal, 310);
  assert.equal(r.record?.points, 310);
  assert.equal(r.record?.label, 'أكتوبر');

  // A browsed month (October, from any day in it): the whole month against all of September, told in the past.
  const p = raceOf('pastMonth', t, new Date(2026, 9, 31));
  assert.equal(p.now, 310);
  assert.equal(p.ghost, 30);
  assert.equal(p.prevTotal, 30);
  assert.equal(p.ghostLabel, 'الشهر الذي قبله');
  assert.equal(raceOf('pastMonth', t, new Date(2026, 9, 5)).now, 310, 'any day in it = the whole month');
  assert.equal(verdictOf(p).text, 'زاد على الشهر الذي قبله بـ٢٨٠ نقطة');
  assert.equal(verdictOf(raceOf('pastMonth', t, new Date(2026, 8, 1))).text, 'لا شيء في الشهر الذي قبله للمقارنة');
  assert.equal(verdictOf(raceOf('pastMonth', {}, new Date(2025, 0, 1))).text, 'لا نقاط مسجّلة لك في هذا الشهر');
  assert.match(verdictOf(raceOf('pastMonth', { [dk(new Date(2026, 8, 1))]: 50, [dk(new Date(2026, 9, 1))]: 20 }, new Date(2026, 9, 1))).text, /^أقل من الشهر الذي قبله بـ٣٠/);
}

// ── harvest: Friday = the running week; any other day = the week that ended ──
{
  assert.equal(dk(harvestStart(new Date(2026, 10, 20, 19))), '2026-11-14', 'Friday 20 Nov → Saturday 14 Nov');
  assert.equal(dk(harvestStart(new Date(2026, 10, 21, 9))), '2026-11-14', 'Saturday 21 → the week that just ended');
  assert.equal(dk(harvestStart(NOW)), '2026-11-07', 'Thursday 19 → last week');
  const t: Record<string, number> = {};
  for (let d = 14; d <= 20; d++) t[dk(new Date(2026, 10, d))] = d === 18 ? 90 : 30; // 6×30 + 90 = 270
  for (let d = 7; d <= 13; d++) t[dk(new Date(2026, 10, d))] = 20; // 140
  for (let d = 0; d <= 6; d++) t[dk(new Date(2026, 9, 31 + d))] = 10; // 70
  const h = harvestOf(t, new Date(2026, 10, 21, 9));
  assert.equal(h.total, 270);
  assert.equal(h.prevTotal, 140);
  assert.equal(h.delta, 93);
  assert.equal(h.best?.key, '2026-11-18');
  assert.equal(h.days.filter((d) => d.best).length, 1);
  assert.equal(h.activeDays, 7);
  assert.equal(h.record?.points, 140);
  assert.equal(h.newRecord, true);
  assert.equal(h.nextGoal, 300);
  assert.equal(h.live, false);
  assert.equal(h.range, '١٤ – ٢٠ نوفمبر');
  assert.equal(harvestOf(t, new Date(2026, 10, 20, 19)).live, true, 'Friday: still running');
}

// ── «لحظات الترتيب» ──
{
  const base: MomentsInput = { now: NOW, totals: {}, board: true, checkedAt: NOW.getTime(), mine: {}, heads: {} };
  assert.deepEqual(raceMoments({ ...base, now: new Date(2026, 10, 17, 14) }), [], 'nothing to say Tuesday → Thursday');
  const todays = (i: MomentsInput) => raceMoments(i).filter((c) => format(c.at, 'yyyy-MM-dd') === day(0));

  // Behind yesterday, within reach → the evening self-race nudge, exact numbers.
  const self = todays({ ...base, totals: { [day(0)]: 70, [day(-1)]: 100 } });
  assert.equal(self.length, 1);
  assert.equal(self[0].key, 'self');
  assert.equal(self[0].at.getHours(), 20);
  assert.match(self[0].body, /٣٠ نقطة/);
  // Too far behind (did little today) → silence.
  assert.equal(todays({ ...base, totals: { [day(0)]: 10, [day(-1)]: 100 } }).length, 0);

  // Second today, close → «تاج اليوم في متناولك» wins the day over the self-race.
  const crown = todays({
    ...base,
    checkedAt: new Date(2026, 10, 19, 20).getTime(), // read an hour before it fires
    totals: { [day(0)]: 70, [day(-1)]: 100 },
    mine: { today: { rank: 2, points: 70, total: 2 } },
    heads: { today: { first: 90, second: 70 } },
  });
  assert.equal(crown.length, 1);
  assert.equal(crown[0].key, 'crown-today');
  assert.match(crown[0].body, /٢٠ نقطة/);
  // Stale check (from the morning): no numbers.
  const stale = todays({ ...base, // read at 14:00, fires at 21:00
    mine: { today: { rank: 2, points: 70, total: 2 } }, heads: { today: { first: 90, second: 70 } } });
  assert.doesNotMatch(stale[0].body, /[٠-٩]/);
  // Off the board → no crown moments.
  assert.equal(todays({ ...base, board: false, mine: { today: { rank: 2, points: 70, total: 2 } }, heads: { today: { first: 90, second: 70 } } }).length, 0);

  // Thursday: Friday's week crown and Saturday's new week are planned ahead.
  const wed = raceMoments({ ...base, mine: { week: { rank: 2, points: 300, total: 3 } }, heads: { week: { first: 350, second: 300 } } });
  const keys = wed.map((c) => c.key);
  assert.ok(keys.includes('crown-week'), `Friday's crown is planned: ${keys}`);
  assert.ok(keys.includes('new-week'), `Saturday's new week is planned: ${keys}`);
  const fri = wed.find((c) => c.key === 'crown-week')!;
  assert.equal(fri.at.getDay(), 5);
  assert.equal(fri.at.getHours(), 16);
}

console.log('selfRace: all checks passed');
