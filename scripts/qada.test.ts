/**
 * Executable check for «قضاء ما فات» (src/services/qadaPlan.ts + qadaStore):
 * Ramadan detection across Hijri boundaries and the sighting offset, the
 * deadline, forbidden days, the fast plan, the prayer plan + ETA, suggestions,
 * estimator, points, reminders (stable ids) and the Home attention items.
 *
 * Run: npx esbuild scripts/qada.test.ts --bundle --format=esm --platform=node --alias:@=./src
 *        "--define:import.meta.env={\"DEV\":false,\"PROD\":true,\"MODE\":\"test\"}" --loader:.woff=empty
 *        --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty
 *        --outfile=.tmp-test/qada.mjs && node .tmp-test/qada.mjs
 */
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

import assert from 'node:assert/strict';
import { addDays } from 'date-fns';
import { fromHijri, hijriMonthLength, hijriMonthStart, toHijri } from '@/services/HijriService';
import {
  DEFAULT_SETTINGS,
  QADA_NOTIF_IDS,
  blockedReason,
  currentFastPlan,
  dateOf,
  estimateMissedDays,
  excusedRamadanSuggestions,
  fastStatus,
  keyOf,
  lastRamadanYear,
  nextRamadanStart,
  planFasts,
  planQadaReminders,
  prayerEta,
  prayerPlanToday,
  prayerTotals,
  qadaAttention,
  qadaPointsOn,
  QADA_POINTS,
  unloggedFardSuggestions,
  type QadaData,
  type QadaDebt,
} from '@/services/qadaPlan';
import { setQadaFast, useQadaStore } from '@/store/qadaStore';
import { useProgressStore } from '@/store/progressStore';

const K = keyOf;
const data = (p: Partial<QadaData> = {}): QadaData => ({ debts: [], paid: {}, dismissed: [], settings: DEFAULT_SETTINGS, ...p });
const fast = (year: number, count: number, extra: Partial<QadaDebt> = {}): QadaDebt =>
  ({ id: `f${year}${count}`, kind: 'fast', count, reason: 'travel', year, source: 'manual', at: 0, ...extra }) as QadaDebt;

// ── Hijri anchors (computed, not hard-coded) ─────────────────────────────
const r1447 = hijriMonthStart(1447, 9); // ≈ 2026-02-18
const r1448 = hijriMonthStart(1448, 9); // ≈ 2027-02-08
const len1447 = hijriMonthLength(1447, 9);
const lastRam1447 = addDays(r1447, len1447 - 1);
const eid1447 = addDays(r1447, len1447);
assert.equal(toHijri(r1447).month, 9);
assert.equal(toHijri(r1447).day, 1);
assert.equal(toHijri(addDays(r1447, -1)).month, 8, 'day before 1 Ramadan is Sha’ban');
assert.equal(toHijri(lastRam1447).month, 9);
assert.deepEqual([toHijri(eid1447).month, toHijri(eid1447).day], [10, 1]);
assert.equal(K(r1447).slice(0, 7), '2026-02', 'Ramadan 1447 begins Feb 2026 (Umm al-Qura)');
assert.equal(K(r1448).slice(0, 7), '2027-02', 'Ramadan 1448 begins Feb 2027');

// ── Excused days in Ramadan → suggestions ────────────────────────────────
{
  const excused: Record<string, true> = {
    [K(addDays(r1447, -1))]: true, // 29/30 Sha'ban — not Ramadan
    [K(r1447)]: true, // 1 Ramadan
    [K(addDays(r1447, 1))]: true, // 2 Ramadan
    [K(lastRam1447)]: true, // last day of Ramadan
    [K(eid1447)]: true, // 1 Shawwal — not Ramadan
  };
  const today = '2026-11-17';
  let sug = excusedRamadanSuggestions(excused, data(), today, 0);
  assert.equal(sug.length, 1);
  assert.equal(sug[0].year, 1447);
  assert.deepEqual(sug[0].days, [K(r1447), K(addDays(r1447, 1)), K(lastRam1447)]);

  // Sighting offset +1: the Sha'ban eve becomes 1 Ramadan, the last day becomes the Eid.
  sug = excusedRamadanSuggestions(excused, data(), today, 1);
  assert.deepEqual(sug[0].days, [K(addDays(r1447, -1)), K(r1447), K(addDays(r1447, 1))]);
  // Offset −1: 1 Ramadan becomes 30 Sha'ban; the Eid day becomes the last of Ramadan… only if
  // Ramadan (offset −1) still has a day there — check by the calendar itself.
  sug = excusedRamadanSuggestions(excused, data(), today, -1);
  for (const k of sug.flatMap((s) => s.days)) assert.equal(toHijri(dateOf(k), -1).month, 9);
  assert.ok(!sug.flatMap((s) => s.days).includes(K(r1447)), 'offset −1: 1 Ramadan (UQ) is Sha’ban');

  // Today and later are not suggested (still in progress).
  sug = excusedRamadanSuggestions(excused, data(), K(addDays(r1447, 1)), 0);
  assert.deepEqual(sug[0].days, [K(r1447)]);

  // Days already in a debt / answered / years entered by hand are skipped.
  sug = excusedRamadanSuggestions(excused, data({ debts: [fast(1447, 1, { reason: 'haid', days: [K(r1447)] })], dismissed: [`ex:${K(lastRam1447)}`] }), today, 0);
  assert.deepEqual(sug[0].days, [K(addDays(r1447, 1))]);
  sug = excusedRamadanSuggestions(excused, data({ debts: [fast(1447, 4, { reason: 'haid' })] }), today, 0);
  assert.equal(sug.length, 0, 'a haid debt counted by hand covers its year');

  // Two Ramadans → two groups, oldest first.
  const r1446 = hijriMonthStart(1446, 9);
  sug = excusedRamadanSuggestions({ ...excused, [K(addDays(r1446, 5))]: true }, data(), today, 0);
  assert.deepEqual(sug.map((s) => s.year), [1446, 1447]);
}

// ── Deadline ──────────────────────────────────────────────────────────────
{
  assert.equal(K(nextRamadanStart(dateOf('2026-11-17'))), K(r1448));
  assert.equal(K(nextRamadanStart(addDays(r1448, -1))), K(r1448), '30 Sha’ban → tomorrow');
  assert.equal(K(nextRamadanStart(r1447)), K(r1448), 'in Ramadan → next year’s');
  assert.equal(K(nextRamadanStart(lastRam1447)), K(r1448));
  assert.equal(K(nextRamadanStart(eid1447)), K(r1448));
  assert.equal(lastRamadanYear(dateOf('2026-11-17')), 1447);
  assert.equal(lastRamadanYear(addDays(r1447, -1)), 1446);
  assert.equal(lastRamadanYear(r1447), 1447);

  const st = fastStatus(data({ debts: [fast(1447, 3), fast(1446, 2)], paid: { '2026-11-01': { fast: 1 } } }), dateOf('2026-11-17'));
  assert.equal(st.owed, 5);
  assert.equal(st.paid, 1);
  assert.equal(st.remaining, 4);
  assert.deepEqual(st.byYear.map((y) => [y.year, y.remaining, y.overdue]), [[1446, 1, true], [1447, 3, false]], 'oldest settled first; 1446 is overdue');
  assert.equal(st.overdue, 1);
  assert.ok(st.daysToRamadan > 70 && st.daysToRamadan < 95, `≈80 days to Ramadan, got ${st.daysToRamadan}`);
  // Day before the deadline: not overdue yet; on 1 Ramadan it is.
  assert.equal(fastStatus(data({ debts: [fast(1447, 1)] }), addDays(r1448, -1)).overdue, 0);
  assert.equal(fastStatus(data({ debts: [fast(1447, 1)] }), r1448).overdue, 1);
  // Over-paid: never negative.
  assert.equal(fastStatus(data({ debts: [fast(1447, 1)], paid: { a: { fast: 1 }, b: { fast: 1 } } }), dateOf('2026-11-17')).remaining, 0);
}

// ── Forbidden days ────────────────────────────────────────────────────────
{
  const dh = (d: number) => fromHijri({ year: 1447, month: 12, day: d });
  assert.equal(blockedReason(eid1447), 'eidFitr');
  assert.equal(blockedReason(addDays(eid1447, 1)), null, '2 Shawwal allowed');
  assert.equal(blockedReason(dh(9)), null, 'Arafah allowed');
  assert.equal(blockedReason(dh(10)), 'eidAdha');
  assert.equal(blockedReason(dh(11)), 'tashreeq');
  assert.equal(blockedReason(dh(13)), 'tashreeq');
  assert.equal(blockedReason(dh(14)), null);
  assert.equal(blockedReason(r1447), 'ramadan');
  assert.equal(blockedReason(addDays(r1447, -1)), null);
}

// ── Fast plan ─────────────────────────────────────────────────────────────
{
  const from = fromHijri({ year: 1447, month: 12, day: 5 });
  const plan = planFasts(10, from, addDays(from, 12));
  const keys = plan.days.map((d) => d.key);
  assert.deepEqual(plan.blocked.map((b) => b.reason), ['eidAdha', 'tashreeq', 'tashreeq', 'tashreeq']);
  for (const b of plan.blocked) assert.ok(!keys.includes(b.key), 'never on a forbidden day');
  assert.equal(plan.days.length, 8, '12-day window minus 4 forbidden');
  assert.equal(plan.shortfall, 2);
  assert.deepEqual([...keys].sort(), keys, 'sorted');

  // Preference: with plenty of room, only Mon/Thu or white days, earliest first.
  const p2 = planFasts(4, dateOf('2026-11-18'), r1448);
  assert.equal(p2.days.length, 4);
  for (const d of p2.days) {
    const wd = dateOf(d.key).getDay();
    const hd = toHijri(dateOf(d.key)).day;
    assert.ok(wd === 1 || wd === 4 || (hd >= 13 && hd <= 15), `${d.key} is preferred`);
  }
  assert.equal(p2.days[0].key, '2026-11-19', 'first Thursday after the start');

  // Window starting in Ramadan skips the rest of Ramadan (not listed as blocked).
  const p3 = planFasts(3, addDays(r1447, 20), addDays(r1447, 60));
  for (const d of p3.days) assert.notEqual(toHijri(dateOf(d.key)).month, 9);
  assert.ok(!p3.blocked.some((b) => b.reason === 'ramadan'));
  assert.ok(p3.blocked.some((b) => b.reason === 'eidFitr'));

  // Adapts: paying one shrinks the plan; plan starts tomorrow.
  const s = data({ debts: [fast(1447, 3)] });
  const before = currentFastPlan(s, dateOf('2026-11-17'));
  assert.equal(before.days.length, 3);
  assert.ok(before.days[0].key > '2026-11-17');
  const after = currentFastPlan({ ...s, paid: { '2026-11-17': { fast: 1 } } }, dateOf('2026-11-17'));
  assert.equal(after.days.length, 2);
  // Too little time left → shortfall.
  assert.ok(currentFastPlan(data({ debts: [fast(1447, 10)] }), addDays(r1448, -4)).shortfall >= 6);
}

// ── Prayer plan + ETA ─────────────────────────────────────────────────────
{
  const s = data({
    debts: [
      { id: 'a', kind: 'prayer', counts: { fajr: 3, dhuhr: 1 }, source: 'manual', at: 0 },
      { id: 'b', kind: 'prayer', counts: { fajr: 1, asr: 2, maghrib: 0, isha: 1 }, source: 'manual', at: 0 },
    ],
    paid: { '2026-11-10': { fajr: 1, dhuhr: 3 } },
  });
  const t = prayerTotals(s);
  assert.deepEqual(t.owed, { fajr: 4, dhuhr: 1, asr: 2, maghrib: 0, isha: 1 });
  assert.deepEqual(t.remaining, { fajr: 3, dhuhr: 0, asr: 2, maghrib: 0, isha: 1 });
  assert.equal(t.owedTotal, 8);
  assert.equal(t.paidTotal, 2, 'over-paid dhuhr counts only up to what was owed');
  assert.equal(t.remainingTotal, 6);

  // Round-robin over what is still owed.
  let plan = prayerPlanToday(t.remaining, undefined, 5);
  assert.deepEqual(plan.target, { fajr: 2, dhuhr: 0, asr: 2, maghrib: 0, isha: 1 });
  assert.equal(plan.left, 5);
  plan = prayerPlanToday({ fajr: 2, dhuhr: 0, asr: 2, maghrib: 0, isha: 1 }, { fajr: 1 }, 5);
  assert.equal(plan.target.fajr, 2, 'today’s paid counts toward today’s target');
  assert.equal(plan.left, 4);
  assert.equal(prayerPlanToday({ fajr: 100, dhuhr: 100, asr: 100, maghrib: 100, isha: 100 }, undefined, 5).target.isha, 1, 'one with each fard');

  const today = dateOf('2026-11-17');
  assert.equal(prayerEta(0, 0, 5, today), null);
  assert.equal(K(prayerEta(4, 5, 5, today)!), '2026-11-17', 'finishes today');
  assert.equal(K(prayerEta(15, 5, 5, today)!), '2026-11-19');
  assert.equal(K(prayerEta(16, 5, 5, today)!), '2026-11-20');
  assert.equal(K(prayerEta(10, 0, 5, today)!), '2026-11-19', 'today’s share already done');
  assert.equal(prayerEta(10, 0, 0, today), null);
  assert.equal(K(prayerEta(3650, 5, 5, today)!), K(addDays(today, 729)));
}

// ── Prayer-log suggestions ────────────────────────────────────────────────
{
  const today = dateOf('2026-11-17');
  const all = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };
  const log = {
    '2026-11-17': { fajr: { fard: true } }, // today — never
    '2026-11-16': { ...all, asr: { fard: false } }, // one missing
    '2026-11-15': { fajr: { fard: true } }, // mostly unlogged → not suggested
    '2026-11-14': all,
    '2026-11-13': { ...all, fajr: undefined, isha: {} }, // two missing
    '2026-11-12': { ...all, dhuhr: {} }, // excused
    '2026-11-11': { ...all, maghrib: {} }, // answered
    '2026-10-01': { ...all, maghrib: {} }, // out of the window
  };
  const sug = unloggedFardSuggestions(log, { '2026-11-12': true }, ['log:2026-11-11'], today);
  assert.deepEqual(sug, [
    { day: '2026-11-16', prayers: ['asr'] },
    { day: '2026-11-13', prayers: ['fajr', 'isha'] },
  ]);
}

// ── Estimator ─────────────────────────────────────────────────────────────
assert.equal(estimateMissedDays(1, 0), 365);
assert.equal(estimateMissedDays(0, 6), 183);
assert.equal(estimateMissedDays(2, 0, 6), 731 - 144);
assert.equal(estimateMissedDays(0, 1, 40), 0, 'never negative');
assert.equal(estimateMissedDays(NaN, 0), 0);

// ── Points ────────────────────────────────────────────────────────────────
{
  const s = { paid: { d1: { fajr: 2, isha: 1 }, d2: { fast: 1 }, d3: { fajr: 30 } } };
  assert.equal(qadaPointsOn(s, 'd1'), 3 * QADA_POINTS.prayer);
  assert.equal(qadaPointsOn(s, 'd2'), 30);
  assert.equal(qadaPointsOn(s, 'd2', { fastCredited: true }), 0, 'no double count with the fasting module');
  assert.equal(qadaPointsOn(s, 'd3'), QADA_POINTS.prayerMax * QADA_POINTS.prayer, 'capped at 10 prayers a day');
  assert.equal(qadaPointsOn(s, 'nope'), 0);
}

// ── Reminders ─────────────────────────────────────────────────────────────
{
  const now = new Date(2026, 10, 17, 10, 0);
  assert.deepEqual(planQadaReminders(data(), now), [], 'nothing owed → nothing armed');
  const s = data({
    debts: [fast(1447, 2), { id: 'p', kind: 'prayer', counts: { fajr: 10 }, source: 'manual', at: 0 }],
    settings: { ...DEFAULT_SETTINGS, daily: true, time: '09:00' },
  });
  const plan = planQadaReminders(s, now);
  for (const n of plan) assert.ok((QADA_NOTIF_IDS as readonly string[]).includes(n.id), `stable id ${n.id}`);
  assert.ok(plan.every((n) => !/\d{8}$/.test(n.id)), 'no dated ids');
  const daily = plan.find((n) => n.id === 'myzikr_qada_daily')!;
  assert.equal(daily.repeat, 'daily');
  assert.equal(new Date(daily.at).getDate(), 18, '09:00 already passed → tomorrow');
  assert.ok(!/١٠|10/.test(daily.body), 'discreet: no debt size on the lock screen');
  const eve = plan.find((n) => n.id === 'myzikr_qada_fast')!;
  assert.equal(new Date(eve.at).getHours(), 21);
  assert.equal(K(addDays(new Date(eve.at), 1)), currentFastPlan(s, now).days[0].key, 'eve of the first planned fast');
  const r30 = plan.find((n) => n.id === 'myzikr_qada_ram30')!;
  const r7 = plan.find((n) => n.id === 'myzikr_qada_ram7')!;
  assert.equal(K(new Date(r30.at)), K(addDays(r1448, -30)));
  assert.equal(K(new Date(r7.at)), K(addDays(r1448, -7)));
  // Same state an hour later → identical ids and fire times (no churn).
  const later = planQadaReminders(s, new Date(2026, 10, 17, 11, 0));
  assert.deepEqual(later.map((n) => [n.id, n.at]), plan.map((n) => [n.id, n.at]));
  // Past the 30-day mark: only the 7-day alert remains.
  const close = planQadaReminders({ ...s, settings: { ...s.settings, daily: false } }, addDays(r1448, -20));
  assert.deepEqual(close.map((n) => n.id), ['myzikr_qada_ram7']);
  assert.deepEqual(planQadaReminders({ ...s, settings: { ...s.settings, daily: false, ramadan: false } }, now), []);
}

// ── Home attention ────────────────────────────────────────────────────────
{
  const s = data({ debts: [fast(1447, 3), { id: 'p', kind: 'prayer', counts: { fajr: 10, isha: 10 }, source: 'manual', at: 0 }] });
  // Far from Ramadan, morning: nothing unless a fast is planned tomorrow (Wed 18 → Thu 19).
  let items = qadaAttention(s, new Date(2026, 10, 18, 9));
  assert.equal(items.length, 1);
  assert.equal(items[0].icon, 'fasting');
  assert.equal(items[0].level, 'prep', 'a planned fast tomorrow → «استعدّ للغد»');
  assert.match(items[0].title, /عليك ٣ أيام قضاء/);
  assert.match(items[0].body, /صُم غداً الخميس/);
  items = qadaAttention(s, new Date(2026, 10, 17, 9));
  assert.equal(items.length, 0, 'Tue morning, 80 days out, next fast not tomorrow');
  // Afternoon: today's prayer plan.
  items = qadaAttention(s, new Date(2026, 10, 17, 14));
  assert.equal(items.length, 1);
  assert.match(items[0].title, /٥ صلوات/, 'five spread over the two owed prayers');
  // Plan done for today → gone.
  items = qadaAttention({ ...s, paid: { '2026-11-17': { fajr: 3, isha: 2 } } }, new Date(2026, 10, 17, 14));
  assert.equal(items.length, 0);
  // Last ten days before Ramadan: «استعدّ للغد» on a planned eve, else closing in the last week.
  const one = data({ debts: [fast(1447, 1)] });
  const seen = new Set<string>();
  for (let i = 1; i <= 10; i++) {
    const at = new Date(addDays(r1448, -i).setHours(9));
    const it = qadaAttention(one, at)[0];
    const tmr = currentFastPlan(one, at).days[0]?.key === K(addDays(at, 1));
    assert.equal(it.level, tmr ? 'prep' : i <= 7 ? 'closing' : 'suggest', `${i} days before`);
    assert.equal(it.habit, 'qada');
    seen.add(it.level);
  }
  assert.ok(seen.has('prep') && seen.has('closing'), [...seen].join());
}

// ── Store ─────────────────────────────────────────────────────────────────
{
  const st = useQadaStore.getState();
  st.bump('fajr', 1, '2026-11-17');
  st.bump('fajr', 1, '2026-11-17');
  st.bump('fajr', -1, '2026-11-17');
  assert.deepEqual(useQadaStore.getState().paid['2026-11-17'], { fajr: 1 });
  st.bump('fajr', -1, '2026-11-17');
  st.bump('fajr', -1, '2026-11-17');
  assert.equal(useQadaStore.getState().paid['2026-11-17'], undefined, 'empty days removed, never negative');

  setQadaFast('2026-11-16', true, true);
  setQadaFast('2026-11-16', true, true);
  assert.deepEqual(useQadaStore.getState().paid['2026-11-16'], { fast: 1 }, 'one fast a day');
  const fasted = () => useProgressStore.getState().dailyProgress['2026-11-16']?.modules.some((m) => m.moduleId === 'fasting' && m.completed);
  assert.ok(fasted(), 'logged in the fasting module too');
  setQadaFast('2026-11-16', false, true);
  assert.equal(useQadaStore.getState().paid['2026-11-16'], undefined);
  assert.ok(!fasted());

  st.dismiss(['ex:a', 'ex:a', 'log:b']);
  assert.deepEqual(useQadaStore.getState().dismissed, ['ex:a', 'log:b']);
  const persisted = JSON.parse(mem.get('myzikr:qada') ?? '{}');
  assert.ok(persisted.state.settings && !('bump' in persisted.state), 'persists data only');
}

console.log('qada: ok');
