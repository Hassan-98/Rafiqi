import assert from 'node:assert/strict';
import { dayInfo, fastedKeys, fastingStats, sixOfShawwalDone, upcomingFasts } from '@/services/fastingPlan';

const D = (k: string) => new Date(`${k}T12:00:00`);

// ── what a day is (Umm al-Qura, no offset) ──
// Thursday 19 Nov 2026 = 9 Jumada al-Akhirah 1448.
{
  const thu = dayInfo(D('2026-11-19'));
  assert.equal(thu.reason?.id, 'thursday');
  assert.equal(thu.blocked, null);
  assert.equal(thu.ramadan, false);
  assert.deepEqual([thu.hijri.day, thu.hijri.month, thu.hijri.year], [9, 6, 1448]);
  assert.equal(dayInfo(D('2026-11-20')).reason, null, 'a Friday is no sunnah fast');
  assert.ok(dayInfo(D('2026-11-24')).reason, 'the 14th: one of the white days');
  const ram = dayInfo(D('2027-02-10'));
  assert.equal(ram.ramadan, true);
  assert.equal(ram.reason, null, 'Ramadan is its own matter');
  assert.equal(dayInfo(D('2027-03-09')).blocked, 'eidFitr');
  assert.equal(dayInfo(D('2027-05-15')).reason?.id, 'arafah');
  assert.equal(dayInfo(D('2027-05-16')).blocked, 'eidAdha');
}

// ── the sunnah fasts ahead, from tomorrow ──
{
  const up = upcomingFasts(D('2026-11-19'), 0, false, 7);
  assert.equal(up[0].key, '2026-11-23', 'Fri, Sat, Sun skipped — Monday the 13th first');
  assert.equal(up[0].daysUntil, 4);
  assert.deepEqual(up.map((u) => u.key), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.ok(!up.some((u) => u.key === '2026-11-19'), 'today is the hero\'s, not the list\'s');
  assert.ok(!upcomingFasts(D('2027-03-08'), 0, false, 1).length, 'the Eid is never offered');
}

// ── six of Shawwal (from its 2nd) ──
{
  const six = new Set(['2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14', '2027-03-15']);
  assert.equal(sixOfShawwalDone(six, D('2027-03-20')), true);
  const five = new Set([...six].slice(0, 5));
  assert.equal(sixOfShawwalDone(five, D('2027-03-20')), false);
  assert.equal(sixOfShawwalDone(new Set([...five, '2027-03-09']), D('2027-03-20')), false, 'the Eid day does not count');
}

// ── counts ──
{
  const fasted = new Set(['2026-10-30', '2026-11-02', '2026-11-19', '2026-11-25']);
  const s = fastingStats(fasted, D('2026-11-19'));
  assert.equal(s.month, 2, 'this month: the 2nd and today');
  assert.equal(s.total, 3, 'a future day is never counted');
  assert.equal(s.year, 3, 'all three in 1448');
  assert.equal(s.ramadan, null);
  const r = fastingStats(new Set(['2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11']), D('2027-02-12'));
  assert.deepEqual(r.ramadan, { fasted: 4, sofar: 5 });
}

// ── read from the progress store ──
assert.deepEqual(
  [...fastedKeys({
    '2026-11-18': { modules: [{ moduleId: 'fasting', completed: true }] },
    '2026-11-17': { modules: [{ moduleId: 'fasting', completed: false }, { moduleId: 'dhikr', completed: true }] },
    '2026-11-16': undefined,
  })],
  ['2026-11-18'],
);

console.log('fastingPlan: all checks passed');
