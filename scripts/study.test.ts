/**
 * Executable check for «العلم والمهام» pure logic (src/store/studyModel.ts) +
 * the tasks store rollover: next-session math across weekday/midnight
 * boundaries, recurring task rollover, reminder id stability and quick-add parsing.
 *
 * Run: npx esbuild scripts/study.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --loader:.woff=empty --loader:.woff2=empty --loader:.ttf=empty
 *        --loader:.css=empty "--define:import.meta.env={}" --outfile=.tmp-test/study.test.mjs
 *      (the widgetBridge import pulls app fonts and import.meta.env — stub them)
 *      node .tmp-test/study.test.mjs
 */
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

import {
  addDays,
  atTime,
  completionLog,
  dayHeadingAr,
  dayKey,
  hiddenFromWidget,
  openGroupOf,
  detectPlatform,
  isDoneOn,
  nextSession,
  nextSlotStart,
  occursOn,
  parseQuickAdd,
  planStudyReminders,
  subtaskDone,
  taskCounts,
  withSubtaskDone,
  type StudyCircle,
  type Task,
} from '@/store/studyModel';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Fixed clock: Saturday 2026-09-26 23:30 local.
const SAT = new Date(2026, 8, 26, 23, 30).getTime();

const circle = (over: Partial<StudyCircle> = {}): StudyCircle => ({
  id: 'c1',
  title: 'شرح الأربعين',
  platform: 'telegram',
  subject: 'hadith',
  format: 'live',
  slots: [{ weekday: 0, time: '00:10', durationMin: 60 }], // Sunday 00:10
  sessions: [],
  reminderOffsets: [30, 0],
  remindersEnabled: true,
  log: [],
  status: 'active',
  createdAt: SAT - 30 * 86_400_000,
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'مراجعة',
  repeat: 'none',
  priority: 'normal',
  list: 'study',
  subtasks: [],
  done: false,
  createdAt: SAT - 86_400_000,
  ...over,
});

async function main() {
  // ── next session across the week/midnight boundary ──
  const sunStart = new Date(2026, 8, 27, 0, 10).getTime();
  check('Sat 23:30 → next Sunday-00:10 slot is 40 min later', nextSlotStart({ weekday: 0, time: '00:10' }, SAT) === sunStart);
  check(
    'just after the start → next week (nextSlotStart)',
    nextSlotStart({ weekday: 0, time: '00:10' }, sunStart + 60000) === new Date(2026, 9, 4, 0, 10).getTime(),
  );
  const mid = nextSession(circle(), sunStart + 20 * 60000);
  check('20 min into a 60-min session → live, same start', !!mid && mid.live && mid.at === sunStart);
  const after = nextSession(circle(), sunStart + 61 * 60000);
  check('after it ends → next week, not live', !!after && !after.live && after.at === new Date(2026, 9, 4, 0, 10).getTime());

  // ── circle reminders: offset crosses midnight, ids are stable ──
  const plan1 = planStudyReminders([circle()], [], SAT - 10 * 60000); // Sat 23:20
  const r30 = plan1.find((p) => p.id === 'myzikr_study_c1_0_30');
  check('30-min lead on Sun 00:10 fires Saturday 23:40', !!r30 && new Date(r30.at).getDay() === 6 && new Date(r30.at).getHours() === 23 && new Date(r30.at).getMinutes() === 40);
  check('slot reminders repeat weekly', plan1.every((p) => p.repeat === 'weekly'));
  const ids = (p: { id: string }[]) => p.map((x) => x.id).sort().join(',');
  const plan2 = planStudyReminders([circle()], [], SAT + 3 * 86_400_000);
  const plan3 = planStudyReminders([circle()], [], SAT + 40 * 86_400_000);
  check('same ids a few days / weeks later', ids(plan1) === ids(plan2) && ids(plan2) === ids(plan3), ids(plan3));
  const dated = /^myzikr_[\w.]+_\d{8}$/;
  check('no id matches the legacy dated-purge regex', !plan1.some((p) => dated.test(p.id)));
  check('paused circle → nothing armed', planStudyReminders([circle({ status: 'paused' })], [], SAT).length === 0);
  check('body names the platform', !!r30 && r30.body.includes('تيليجرام') && r30.body.includes('٣٠ دقيقة'));

  // Series daily goal: met today → one-shot tomorrow under the same id.
  const series = circle({
    format: 'series',
    slots: [],
    totalLessons: 10,
    dailyGoal: { enabled: true, time: '23:50', lessons: 1 },
  });
  const goalOpen = planStudyReminders([series], [], SAT).find((p) => p.id === 'myzikr_study_c1_goal');
  const goalMet = planStudyReminders([{ ...series, log: [{ id: 'l', date: SAT - 60000, status: 'watched', n: 1 }] }], [], SAT).find(
    (p) => p.id === 'myzikr_study_c1_goal',
  );
  check('goal open → daily repeat today 23:50', !!goalOpen && goalOpen.repeat === 'daily' && dayKey(goalOpen.at) === dayKey(SAT));
  check('goal met → same id, one-shot tomorrow', !!goalMet && goalMet.repeat === 'none' && dayKey(goalMet.at) === dayKey(addDays(new Date(SAT), 1)));

  // ── recurring tasks roll over ──
  const today = dayKey(SAT);
  const tomorrow = dayKey(addDays(new Date(SAT), 1));
  const daily = task({ repeat: 'daily', time: '23:45', reminderOffset: 0, history: { [today]: SAT } });
  check('done today, open tomorrow', isDoneOn(daily, today) && !isDoneOn(daily, tomorrow));
  check('counts include the ticked recurring task', taskCounts([daily], SAT).done === 1 && taskCounts([daily], SAT).total === 1);
  check('tomorrow it reappears undone', taskCounts([daily], SAT + 86_400_000).done === 0);

  // «مهامي» is persistent: nothing drops off at midnight.
  const oneOffDone = task({ due: today, done: true, doneAt: SAT });
  const undated = task({ id: 't2' });
  const later = taskCounts([oneOffDone, undated], SAT + 3 * 86_400_000);
  check('done one-off + undated task stay listed days later', later.total === 2 && later.done === 1, JSON.stringify(later));
  const weekly = task({ repeat: 'weekly', due: dayKey(addDays(new Date(SAT), 1)) }); // occurs on Sundays
  check('weekly task seen off-day shows its next occurrence', isDoneOn({ ...weekly, history: { [tomorrow]: SAT } }, today));
  const dPlanDone = planStudyReminders([], [daily], SAT).find((p) => p.id === 'myzikr_study_task_t1_d');
  const dPlanOpen = planStudyReminders([], [{ ...daily, history: {} }], SAT).find((p) => p.id === 'myzikr_study_task_t1_d');
  check('open daily task → daily repeat tonight', !!dPlanOpen && dPlanOpen.repeat === 'daily' && dayKey(dPlanOpen.at) === today);
  check('ticked today → one-shot tomorrow, same id', !!dPlanDone && dPlanDone.repeat === 'none' && dayKey(dPlanDone.at) === tomorrow);

  const custom = task({ repeat: 'custom', days: [0, 3], time: '08:00', reminderOffset: 10 });
  const cPlan = planStudyReminders([], [custom], SAT);
  check('custom days → one weekly id per weekday', ids(cPlan) === 'myzikr_study_task_t1_w0,myzikr_study_task_t1_w3', ids(cPlan));
  check('Sunday reminder fires 07:50', new Date(cPlan.find((p) => p.id.endsWith('_w0'))!.at).getHours() === 7);

  const monthly = task({ repeat: 'monthly', due: '2026-01-31' });
  check('monthly on the 31st clamps to Feb 28', occursOn(monthly, '2026-02-28') && !occursOn(monthly, '2026-02-27'));
  check('weekdays skip Friday', !occursOn(task({ repeat: 'weekdays', due: '2026-09-01' }), '2026-10-02'));

  // Store: toggle writes today's occurrence only.
  const { useTasksStore } = await import('@/store/tasksStore');
  const id = useTasksStore.getState().addTask({ title: 'ورد', repeat: 'daily', due: today, priority: 'normal', list: 'worship' });
  useTasksStore.getState().toggleTask(id, today);
  const st = useTasksStore.getState().tasks.find((t) => t.id === id)!;
  check('store toggle → history[today] only', !!st.history?.[today] && !st.done && !st.history?.[tomorrow]);
  useTasksStore.getState().setTaskDone(id, true, today);
  check('setTaskDone is idempotent', !!useTasksStore.getState().tasks.find((t) => t.id === id)!.history?.[today]);

  // ── steps: one per-occurrence rule for the list, the sheet and widget actions ──
  const withSteps = (over: Partial<Task> = {}): Task =>
    task({ subtasks: [{ id: 's1', title: 'اقرأ', done: false }, { id: 's2', title: 'لخّص', done: false }], ...over });
  const one = withSteps({ due: today });
  const oneSet = withSubtaskDone(one, 's1', today, true);
  check('one-off step: set done, sibling untouched', oneSet[0].done && !oneSet[1].done && oneSet[1] === one.subtasks[1]);
  check('one-off step: setting again is a no-op', withSubtaskDone({ ...one, subtasks: oneSet }, 's1', today, true)[0] === oneSet[0]);
  check('omitted done flips', !withSubtaskDone({ ...one, subtasks: oneSet }, 's1', today)[0].done);
  const dSteps = withSteps({ repeat: 'daily', due: today });
  const dSet = { ...dSteps, subtasks: withSubtaskDone(dSteps, 's1', today, true) };
  check('daily step ticks today only', subtaskDone(dSet, dSet.subtasks[0], today) && !subtaskDone(dSet, dSet.subtasks[0], tomorrow));
  const wSteps = withSteps({ repeat: 'weekly', due: tomorrow }); // Sundays; today is Saturday
  const wSet = { ...wSteps, subtasks: withSubtaskDone(wSteps, 's2', today, true) };
  const nextWeek = dayKey(addDays(new Date(SAT), 8));
  check('weekly step ticked off-day lands on the coming occurrence', wSet.subtasks[1].doneKey === tomorrow && subtaskDone(wSet, wSet.subtasks[1], tomorrow));
  check('…and is open again the week after', !subtaskDone(wSet, wSet.subtasks[1], nextWeek));
  check('unticking another occurrence is a no-op', withSubtaskDone(wSet, 's2', nextWeek, false)[1] === wSet.subtasks[1]);

  // Widget `task.step.toggle` actions (protocol in widgetBridge.ts) go through the same rule.
  const { applyWidgetAction, buildSnapshot } = await import('@/services/widgetBridge');
  const yesterday = dayKey(addDays(new Date(SAT), -1));
  const sid = useTasksStore.getState().addTask({
    title: 'تحضير الدرس',
    repeat: 'daily',
    due: dayKey(addDays(new Date(SAT), -7)),
    priority: 'normal',
    list: 'study',
    subtasks: [{ id: 'a', title: 'المتن', done: false }, { id: 'b', title: 'الشرح', done: false }],
  });
  const stepOn = (subId: string, key: string) => {
    const t = useTasksStore.getState().tasks.find((x) => x.id === sid)!;
    return subtaskDone(t, t.subtasks.find((s) => s.id === subId)!, key);
  };
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'a', done: true, date: today, at: SAT });
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'a', done: true, date: today, at: SAT });
  check('widget step action: explicit done is idempotent', stepOn('a', today) && !stepOn('b', today));
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'b', date: today });
  check('widget step action without done flips', stepOn('b', today));
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'a', done: false, date: 'garbage', at: SAT });
  check('a malformed date falls back to the day of `at`', !stepOn('a', today));
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'a', done: true, date: yesterday, at: SAT });
  check('a tap drained a day late keeps its own occurrence', stepOn('a', yesterday) && !stepOn('a', today));
  const before = JSON.stringify(useTasksStore.getState().tasks);
  applyWidgetAction({ type: 'task.step.toggle', id: sid, done: true }); // no stepId
  applyWidgetAction({ type: 'task.step.toggle', id: sid, stepId: 'zz', done: true });
  applyWidgetAction({ type: 'nope', id: sid });
  applyWidgetAction(null);
  check('malformed / unknown actions change nothing', JSON.stringify(useTasksStore.getState().tasks) === before);
  applyWidgetAction({ type: 'task.toggle', id: sid, done: true, date: today });
  check('task.toggle still ticks the task', useTasksStore.getState().tasks.find((x) => x.id === sid)!.history?.[today] !== undefined);
  check('store toggleSubtask returns the new state', useTasksStore.getState().toggleSubtask(sid, 'b', today) === false && !stepOn('b', today));

  // Widget snapshot: 3 step slots, starting at the first open step; counts over all steps.
  const five = ['1', '2', '3', '4', '5'].map((n) => ({ id: `k${n}`, title: `خطوة ${n}`, done: Number(n) <= 2 }));
  const wid = useTasksStore.getState().addTask({ title: 'خمس خطوات', repeat: 'none', priority: 'normal', list: 'today', subtasks: five });
  const snapRow = () => buildSnapshot().tasksToday.find((r) => r.id === wid)!;
  const row = snapRow();
  check('snapshot steps start at the first open one', row.steps?.map((s) => s.id).join() === 'k3,k4,k5', JSON.stringify(row.steps));
  check('snapshot step counts cover all steps', row.stepsDone === 2 && row.stepsTotal === 5);
  useTasksStore.getState().updateTask(wid, { subtasks: five.map((s) => ({ ...s, done: true })) });
  check('all done → back to the first 3', snapRow().steps?.map((s) => s.id).join() === 'k1,k2,k3');
  useTasksStore.getState().updateTask(wid, { subtasks: five.map((s) => ({ ...s, done: false })) });
  check('none done → the first 3', snapRow().steps?.map((s) => s.id).join() === 'k1,k2,k3');
  check('a task without steps carries no steps field', !('steps' in buildSnapshot().tasksToday.find((r) => r.id === id)!));

  // ── quick add + link detection ──
  const q = parseQuickAdd('راجع الدرس غداً الساعة ٩ مساءً مهم', SAT);
  check('quick-add: title', q.title === 'راجع الدرس', q.title);
  check('quick-add: tomorrow 21:00 high', q.due === tomorrow && q.time === '21:00' && q.priority === 'high', JSON.stringify(q));
  const q2 = parseQuickAdd('اتصل بالشيخ الساعة 5', SAT);
  check('bare 5 → 17:00, rolls to tomorrow when passed', q2.time === '17:00' && q2.due === tomorrow, JSON.stringify(q2));
  const q3 = parseQuickAdd('حفظ ٣ أحاديث يوم الجمعة', SAT);
  check('weekday name → next Friday; digits kept', q3.due === '2026-10-02' && q3.title === 'حفظ ٣ أحاديث', JSON.stringify(q3));
  check('t.me → telegram', detectPlatform('انضم: https://t.me/durus')?.platform === 'telegram');
  check('wa.me → whatsapp', detectPlatform('chat.whatsapp.com/AbC')?.platform === 'whatsapp');
  check('youtu.be → youtube', detectPlatform('https://youtu.be/x1')?.platform === 'youtube');
  check('zoom subdomain', detectPlatform('https://us02web.zoom.us/j/123')?.platform === 'zoom');
  check('meet', detectPlatform('meet.google.com/abc-defg-hij')?.link === 'https://meet.google.com/abc-defg-hij');
  check('atTime keeps local wall clock', atTime(new Date(SAT), '09:05').getHours() === 9);

  // ── organisation: open groups, completion log, widget TTL ──
  const DAY = 86_400_000;
  const base = task({ id: 'x', list: 'today', createdAt: SAT - 10 * DAY });
  const satKey = dayKey(SAT);
  check('undated → undated', openGroupOf(base, SAT) === 'undated');
  check('past due → overdue', openGroupOf({ ...base, due: dayKey(SAT - 2 * DAY) }, SAT) === 'overdue');
  check('due today → today', openGroupOf({ ...base, due: satKey }, SAT) === 'today');
  check('due tomorrow → tomorrow', openGroupOf({ ...base, due: dayKey(SAT + DAY) }, SAT) === 'tomorrow');
  check('due in 5 days → later', openGroupOf({ ...base, due: dayKey(SAT + 5 * DAY) }, SAT) === 'later');
  check('daily → today', openGroupOf({ ...base, repeat: 'daily' }, SAT) === 'today');

  const log = completionLog([
    { ...base, id: 'a', done: true, doneAt: SAT - 60_000 },
    { ...base, id: 'b', done: true, doneAt: SAT - 2 * 3_600_000 },
    { ...base, id: 'c', done: true, doneAt: SAT - 2 * DAY },
    { ...base, id: 'd', repeat: 'daily', history: { [dayKey(SAT - DAY)]: SAT - DAY, [satKey]: SAT - 30_000 } },
    { ...base, id: 'open' },
  ]);
  check('log grouped by day, newest first', log.map((g) => g.key).join() === [satKey, dayKey(SAT - DAY), dayKey(SAT - 2 * DAY)].join());
  check('log day sorted by time desc', log[0].items.map((e) => e.t.id).join() === 'd,a,b');
  check('recurring ticks each logged', log.flatMap((g) => g.items).filter((e) => e.t.id === 'd').length === 2);
  check('open tasks not logged', !log.some((g) => g.items.some((e) => e.t.id === 'open')));
  check('heading today/yesterday', dayHeadingAr(satKey, SAT) === 'اليوم' && dayHeadingAr(dayKey(SAT - DAY), SAT) === 'أمس');
  const older = dayHeadingAr(dayKey(SAT - 2 * DAY), SAT);
  check('heading has weekday + Arabic digits', /الخميس/.test(older) && /[٠-٩]/.test(older), older);

  check('widget keeps a fresh done one-off', !hiddenFromWidget({ ...base, done: true, doneAt: SAT - 23 * 3_600_000 }, SAT));
  check('widget drops a day-old done one-off', hiddenFromWidget({ ...base, done: true, doneAt: SAT - 25 * 3_600_000 }, SAT));
  check('widget keeps open + recurring', !hiddenFromWidget(base, SAT) && !hiddenFromWidget({ ...base, repeat: 'daily', done: true, doneAt: SAT - 9 * DAY }, SAT));

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nall study checks passed');
}

void main();
