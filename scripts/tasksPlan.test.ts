import assert from 'node:assert/strict';
import type { Task } from '@/store/studyModel';
import { listStats, normalizeAr, searchTasks, slotOf, suggestForToday, todayPlan, upcoming, type DayTimesLite } from '@/store/tasksPlan';

// Thursday 19 Nov 2026, 13:00.
const NOW = new Date(2026, 10, 19, 13, 0).getTime();
const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m);
const TIMES: DayTimesLite = { fajr: at(4, 50), sunrise: at(6, 18), dhuhr: at(11, 40), asr: at(14, 40), maghrib: at(17, 0), isha: at(18, 20) };
let n = 0;
const T = (o: Partial<Task>): Task => ({ id: `t${++n}`, title: `مهمة ${n}`, repeat: 'none', priority: 'normal', list: 'today', subtasks: [], done: false, createdAt: NOW - 86400000 * 5, ...o });

// ── slots ──
assert.equal(slotOf('04:00', TIMES), 'night');
assert.equal(slotOf('05:30', TIMES), 'fajr');
assert.equal(slotOf('09:00', TIMES), 'duha');
assert.equal(slotOf('11:40', TIMES), 'dhuhr', 'the prayer time itself opens its slot');
assert.equal(slotOf('15:00', TIMES), 'asr');
assert.equal(slotOf('17:30', TIMES), 'maghrib');
assert.equal(slotOf('21:00', TIMES), 'isha');

// ── today ──
{
  const tasks = [
    T({ id: 'late', due: '2026-11-17' }),
    T({ id: 'am', due: '2026-11-19', time: '09:00' }),
    T({ id: 'pm', due: '2026-11-19', time: '15:30' }),
    T({ id: 'pm2', due: '2026-11-19', time: '16:00' }),
    T({ id: 'passed', due: '2026-11-19', time: '12:00' }), // its time passed today: still today's, not «متأخرة»
    T({ id: 'any', due: '2026-11-19' }),
    T({ id: 'daily', repeat: 'daily', due: '2026-11-01', time: '21:00' }),
    T({ id: 'weekly-sat', repeat: 'weekly', due: '2026-11-14' }), // Saturdays: not today
    T({ id: 'tomorrow', due: '2026-11-20' }),
    T({ id: 'undated' }),
    T({ id: 'doneNow', due: '2026-11-19', done: true, doneAt: at(10).getTime() }),
    T({ id: 'doneOld', due: '2026-11-10', done: true, doneAt: new Date(2026, 10, 10).getTime() }),
    T({ id: 'dailyDone', repeat: 'daily', due: '2026-11-01', history: { '2026-11-19': at(8).getTime() } }),
  ];
  const p = todayPlan(tasks, NOW, TIMES);
  assert.deepEqual(p.overdue.map((t) => t.id), ['late']);
  assert.deepEqual(p.timed.map((g) => [g.slot, g.tasks.map((t) => t.id)]), [
    ['duha', ['am']],
    ['dhuhr', ['passed']],
    ['asr', ['pm', 'pm2']],
    ['isha', ['daily']],
  ]);
  assert.deepEqual(p.anytime.map((t) => t.id), ['any']);
  assert.deepEqual(p.done.map((t) => t.id).sort(), ['dailyDone', 'doneNow'], 'only what was ticked today');
  // Without prayer times: one timed group, by the clock.
  assert.deepEqual(todayPlan(tasks, NOW, null).timed.map((g) => [g.slot, g.tasks.length]), [[null, 5]]);
}

// ── upcoming ──
{
  const tasks = [
    T({ id: 'today', due: '2026-11-19' }),
    T({ id: 'fri', due: '2026-11-20' }),
    T({ id: 'sun', due: '2026-11-22' }),
    T({ id: 'far', due: '2026-12-10' }),
    T({ id: 'none' }),
    T({ id: 'daily', repeat: 'daily', due: '2026-11-01' }),
    T({ id: 'done', due: '2026-11-21', done: true, doneAt: NOW }),
  ];
  const u = upcoming(tasks, NOW);
  assert.deepEqual(u.days.map((d) => d.key), ['2026-11-20', '2026-11-22']);
  assert.deepEqual(u.days[0].tasks.map((t) => t.id).sort(), ['daily', 'fri'], 'a daily task once, at tomorrow');
  assert.deepEqual(u.later.map((t) => t.id), ['far']);
  assert.deepEqual(u.undated.map((t) => t.id), ['none']);
  assert.equal(u.count, 5);
}

// ── suggestions ──
{
  const tasks = [
    T({ id: 'u1' }),
    T({ id: 'imp', priority: 'high' }),
    T({ id: 'soon', due: '2026-11-21' }),
    T({ id: 'far', due: '2026-11-30' }),
    T({ id: 'today', due: '2026-11-19' }),
    T({ id: 'rep', repeat: 'daily' }),
    T({ id: 'done', done: true }),
  ];
  assert.deepEqual(suggestForToday(tasks, NOW).map((t) => t.id), ['imp', 'soon', 'u1']);
}

// ── lists ──
{
  const tasks = [
    T({ list: 'work', due: '2026-11-17' }),
    T({ list: 'work' }),
    T({ list: 'work', done: true, doneAt: NOW - 1000 }),
    T({ list: 'home' }),
  ];
  const s = Object.fromEntries(listStats(tasks, NOW).map((x) => [x.list, x]));
  assert.deepEqual([s.work.open, s.work.overdue, s.work.doneToday], [2, 1, 1]);
  assert.deepEqual([s.home.open, s.worship.open], [1, 0]);
}

// ── search ──
{
  assert.equal(normalizeAr('مُراجَعة الإجـازة'), 'مراجعه الاجازه');
  const tasks = [
    T({ id: 'a', title: 'مراجعة جزء عمّ' }),
    T({ id: 'b', title: 'شراء خبز', notes: 'من المخبز القريب' }),
    T({ id: 'c', title: 'تجهيز العرض', subtasks: [{ id: 's', title: 'مراجعة الشرائح', done: false }] }),
  ];
  assert.deepEqual(searchTasks(tasks, 'مراجعه', NOW).map((t) => t.id).sort(), ['a', 'c'], 'title and steps, ة ≈ ه');
  assert.deepEqual(searchTasks(tasks, 'المخبز', NOW).map((t) => t.id), ['b'], 'notes too');
  assert.deepEqual(searchTasks(tasks, '  ', NOW), []);
}

console.log('tasksPlan: all checks passed');
