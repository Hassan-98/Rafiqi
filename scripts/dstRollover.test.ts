/**
 * Executable check for daily-wird deadlines across a DST fall-back (Egypt
 * 2026-10-29: 24:00 → 23:00) and the one-time repair of the phantom day the
 * old `+ 86_400_000` code made.
 *
 * Run: npx esbuild scripts/dstRollover.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/dst.test.mjs "--define:import.meta.env={}"
 *        --loader:.woff2=empty --loader:.woff=empty --loader:.css=empty --loader:.ttf=empty
 *        --alias:@capacitor/local-notifications=./scripts/fakes/localNotifications.ts
 *      TZ=Africa/Cairo node .tmp-test/dst.test.mjs
 */
import assert from 'node:assert/strict';
import { nextDeadline, repairDstPhantoms, type Target, type TargetPeriodRecord } from '@/store/targetsStore';

assert.equal(new Date('2026-10-30T12:00:00Z').getTimezoneOffset(), -120, 'run with TZ=Africa/Cairo');

const Z = (iso: string) => new Date(iso).getTime();
const THU = Z('2026-10-29T21:59:59.999Z'); // Thu 23:59:59.999 EET — the day is 25 h
const FRI = Z('2026-10-30T21:59:59.999Z');
const SAT = Z('2026-10-31T21:59:59.999Z');
// What the old code made: Thursday closed at the FIRST midnight, Friday at 23:00.
const OLD_THU = Z('2026-10-29T20:59:59.999Z');
const OLD_FRI = Z('2026-10-30T20:59:59.999Z');

// ── Deadlines: one period per local day, each ending at 23:59:59.999 ──
assert.equal(nextDeadline('daily', Z('2026-10-28T20:59:59.999Z')), THU);
assert.equal(nextDeadline('daily', THU), FRI);
assert.equal(nextDeadline('daily', FRI), SAT);
assert.equal(nextDeadline('daily', Z('2026-10-30T21:30:00Z')), FRI); // created Fri 23:30 → today
// Spring forward (2027-04-30 00:00 → 01:00): Friday is 23 h, nothing spills over.
assert.equal(nextDeadline('daily', Z('2027-04-29T21:59:59.999Z')), Z('2027-04-30T20:59:59.999Z'));

// ── Repair ──
const rec = (endedAt: number, done: number, goal = 100): TargetPeriodRecord => ({
  targetId: 'w', title: 'ورد', unit: 'dhikr', endedAt, goal, base: 100, done, extra: 0, completed: done >= goal,
});
const wird = (p: Partial<Target>): Target => ({
  id: 'w', title: 'ورد', unit: 'dhikr', total: 100, baseTotal: 100, current: 0, createdAt: 0,
  deadline: SAT, intervalMinutes: 60, reminderEnabled: false, recurrence: 'daily', ...p,
});

// (a) Friday done before 23:00, the phantom 23:00–24:00 left at 0: streak 9 → 0,
//     a rescue offer opened and (carry on) a whole extra goal piled on Saturday.
{
  const before = [rec(FRI, 0), rec(OLD_FRI, 100), rec(OLD_THU, 100), rec(OLD_THU - 86_400_000, 100)];
  const t = wird({ streak: 0, rescue: { lost: 9, step: 1 }, carryOver: true, total: 200, current: 30 });
  const out = repairDstPhantoms([t], before);
  assert.equal(out.history.length, 3, 'Friday counted once');
  assert.deepEqual(out.history[0], { ...rec(FRI, 100), done: 100, completed: true });
  assert.equal(out.targets[0].streak, 9);
  assert.equal(out.targets[0].rescue, undefined);
  assert.equal(out.targets[0].total, 100);
  assert.equal(out.targets[0].current, 30);
  // Idempotent.
  assert.deepEqual(repairDstPhantoms(out.targets, out.history), out);
}

// (b) Wird done in the phantom hour itself: Friday "missed" at 23:00 (rescue
//     lost 5), then the hour completed; a Saturday since closed done too.
{
  const before = [rec(SAT, 100), rec(FRI, 100), rec(OLD_FRI, 0), rec(OLD_THU, 100)];
  const t = wird({ deadline: Z('2026-11-01T21:59:59.999Z'), streak: 2, rescue: { lost: 5, step: 3 } });
  const out = repairDstPhantoms([t], before);
  assert.equal(out.targets[0].streak, 7); // 5 + Friday + Saturday
  assert.equal(out.targets[0].rescue, undefined);
  assert.equal(out.history.length, 3);
}

// (c) Short chain, no rescue opened (streak was 1): rebuilt from history.
{
  const out = repairDstPhantoms([wird({ streak: 0 })], [rec(FRI, 0), rec(OLD_FRI, 100), rec(OLD_THU, 0)]);
  assert.equal(out.targets[0].streak, 1);
}

// (d) Friday really missed: the break stands, only the double day is folded.
{
  const t = wird({ streak: 0, rescue: { lost: 9, step: 1 } });
  const out = repairDstPhantoms([t], [rec(FRI, 0), rec(OLD_FRI, 40), rec(OLD_THU, 100)]);
  assert.equal(out.targets[0].streak, 0);
  assert.deepEqual(out.targets[0].rescue, { lost: 9, step: 1 });
  assert.equal(out.history.length, 2);
  assert.equal(out.history[0].done, 40);
}

// (e) Device not opened since Thursday: the stale deadline is snapped to the
//     real end of Thursday, so the rollover never makes the phantom.
{
  const out = repairDstPhantoms([wird({ deadline: OLD_THU })], []);
  assert.equal(out.targets[0].deadline, THU);
  assert.equal(nextDeadline('daily', out.targets[0].deadline), FRI);
  assert.equal(repairDstPhantoms([wird({ deadline: OLD_FRI })], []).targets[0].deadline, FRI);
}

console.log('dstRollover: ok');

// «أتممته» and manual entry log what they add (stats + weekly awrad points), against the CURRENT period.
{
  const { useTargetsStore } = await import('@/store/targetsStore');
  const { useActivityLogStore } = await import('@/store/activityLogStore');
  const st = useTargetsStore.getState();
  const logged = (id: string) => useActivityLogStore.getState().events.filter((e) => e.refId === id).reduce((n, e) => n + e.amount, 0);
  const id = st.addTarget({ title: 'w', unit: 'dhikr', total: 70, recurrence: 'weekly', deadline: Date.now() + 3 * 86_400_000, intervalMinutes: 1440, reminderEnabled: false });
  useTargetsStore.getState().addProgress(id, 20);
  useTargetsStore.getState().complete(id);
  assert.equal(logged(id), 70, '20 counted + 50 by «أتممته»');
  // A daily wird whose period ended yesterday at 100/100: a manual 30 today is 30, not 30 − 100.
  const d = useTargetsStore.getState().addTarget({ title: 'd', unit: 'dhikr', total: 100, recurrence: 'daily', deadline: Date.now() - 1000, intervalMinutes: 1440, reminderEnabled: false, current: 100 });
  useTargetsStore.getState().setProgress(d, 30);
  assert.equal(logged(d), 30);
  console.log('awrad logging: ok');
}
