/**
 * «برامج التدرّج» — the pure engine (src/store/programsModel.ts) and the
 * catalogue: schedules, step of each day, verification from every source,
 * forgiving/strict grace, pauses, excused and rest days, stamps, points,
 * Home attention items and the reminder plan (stable, dateless ids).
 *
 * Run: npx esbuild scripts/programs.test.ts --bundle --format=esm --platform=node --alias:@=./src
 *        "--define:import.meta.env={\"DEV\":false,\"PROD\":true,\"MODE\":\"test\"}" --loader:.woff=empty
 *        --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty
 *        --outfile=.tmp-test/programs.mjs && node .tmp-test/programs.mjs
 */
process.env.TZ = 'Europe/Berlin'; // DST ends 2026-10-25 — day walks must not slip
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

import assert from 'node:assert/strict';
import { PROGRAM_TEMPLATES, templateById, templatesFor } from '@/data/programsCatalog';
import {
  buildSteps,
  dayNumber,
  evaluateRun,
  milestonesOf,
  phasesOf,
  planProgramReminders,
  programAttention,
  programDef,
  programPointsOn,
  rawatibSlotsOn,
  rangeText,
  stampsFor,
  type ProgramRun,
  type ProgramSources,
} from '@/store/programsModel';
import { shiftKey } from '@/store/studyModel';
import type { DayTimes } from '@/services/dayAttention';

const D0 = '2026-11-08'; // a Sunday
const k = (n: number) => shiftKey(D0, n);
const at = (key: string, h: number, m = 0) => {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};
const src = (p: Partial<ProgramSources> = {}): ProgramSources => ({
  gender: 'male',
  prayerLog: {},
  excused: {},
  duha: {},
  qiyam: {},
  events: [],
  dailyProgress: {},
  ...p,
});
const run = (p: Partial<ProgramRun>): ProgramRun => ({
  id: 'r1',
  startDay: D0,
  grace: 'forgiving',
  status: 'active',
  pauses: {},
  checks: {},
  remindersOn: true,
  createdAt: 0,
  ...p,
});
const ok = (...days: number[]) => Object.fromEntries(days.map((d) => [k(d), { ok: true }]));
const states = (r: ProgramRun, s: ProgramSources, now: Date) => evaluateRun(r, s, now).days.map((d) => d.state);

// ── schedules ────────────────────────────────────────────────────────────────
{
  const lin = buildSteps('linear', 7, 2, 8, 'rakaat');
  assert.equal(lin.length, 7);
  assert.equal(lin[0], 2);
  assert.equal(lin[6], 8);
  assert.ok(lin.every((v, i) => v % 2 === 0 && (i === 0 || v >= lin[i - 1])), 'rakaat stay in pairs, never drop');
  assert.deepEqual([...new Set(buildSteps('weekly', 21, 10, 100, 'count'))], [10, 55, 100]);
  assert.deepEqual(buildSteps('fixed', 5, 3, 9, 'pages'), [3, 3, 3, 3, 3]);
  assert.deepEqual(buildSteps('linear', 4, 9, 9, 'check'), [1, 1, 1, 1]);
  assert.ok(buildSteps('linear', 30, 10, 1000, 'count').every((v) => v % 10 === 0), 'big counts round to 10');
  assert.deepEqual(phasesOf([2, 2, 3, 3, 3, 5]), [
    { from: 1, to: 2, target: 2 },
    { from: 3, to: 5, target: 3 },
    { from: 6, to: 6, target: 5 },
  ]);
}

// ── the catalogue ────────────────────────────────────────────────────────────
{
  const len: Record<string, number> = {
    jamaah21: 21, takbeer40: 40, onTime40: 40, rawatib35: 35, duha30: 30, qiyam30: 30,
    adhkar30: 30, istighfar40: 40, quran60: 60, khatma30: 30, fastMonThu: 13, quitHabit: 40,
  };
  for (const t of PROGRAM_TEMPLATES) {
    assert.equal(t.steps.length, len[t.id], `${t.id} length`);
    assert.ok(t.steps.every((v, i) => v > 0 && (i === 0 || v >= t.steps[i - 1])), `${t.id} never steps down`);
    assert.ok(t.source?.text && t.source.ref, `${t.id} has a source`);
    assert.ok(t.reminders.length > 0, `${t.id} has a reminder`);
    if (t.next) assert.ok(templateById(t.next), `${t.id} → ${t.next} exists`);
  }
  assert.equal(templateById('qiyam30')!.steps.at(-1), 11);
  assert.equal(templateById('istighfar40')!.steps.at(-1), 1000);
  assert.equal(templateById('quran60')!.steps.at(-1), 20);
  const men = templatesFor('male').map((t) => t.id);
  const women = templatesFor('female').map((t) => t.id);
  assert.ok(men.includes('takbeer40') && !men.includes('onTime40'));
  assert.ok(women.includes('onTime40') && !women.includes('takbeer40') && !women.includes('jamaah21'));
  assert.equal(templatesFor(null).length, PROGRAM_TEMPLATES.length);
  assert.equal(templateById('takbeer40')!.grace, 'strict');
  assert.ok(templateById('takbeer40')!.graceLocked);
  assert.equal(rangeText(templateById('qiyam30')!), 'من ٢ إلى ١١ ركعة');
  const quit = programDef({ templateId: 'quitHabit', name: 'التدخين', days: 21 });
  assert.equal(quit.title, 'ترك التدخين');
  assert.equal(quit.steps.length, 21);
  const custom = programDef({ custom: { title: 'تسبيح', days: 14, unit: 'count', start: 33, end: 100, curve: 'weekly' } });
  assert.equal(custom.verify, 'count');
  assert.equal(custom.steps.length, 14);
  assert.equal(programDef({ custom: { title: 'ورد', days: 10, unit: 'pages', start: 1, end: 5, curve: 'linear', autoQuran: true } }).verify, 'quran');
}

// ── forgiving: a missed day repeats its step ─────────────────────────────────
{
  const r = run({ templateId: 'qiyam30' });
  const s = src({ qiyam: { [k(0)]: { rakaat: 2, witr: false }, [k(2)]: { rakaat: 2, witr: false } } });
  const ev = evaluateRun(r, s, at(k(3), 13));
  assert.deepEqual(ev.days.map((d) => d.state), ['done', 'missed', 'done', 'pending']);
  assert.equal(ev.step, 2);
  assert.equal(ev.restarts, 0);
  assert.equal(dayNumber(ev), 3, '«اليوم ٣ من ٣٠»');
  assert.equal(ev.days[1].step, 1, 'the missed day aimed at step 2…');
  assert.equal(ev.days[2].step, 1, '…and the next day repeats it');
}

// ── قيام: the night belongs to its evening; before noon last night is still open ──
{
  const r = run({ templateId: 'qiyam30' });
  const s = src({ qiyam: { [k(0)]: { rakaat: 2, witr: false } } });
  const morning = evaluateRun(r, s, at(k(1), 9));
  assert.equal(morning.openKey, k(0));
  assert.equal(morning.today?.state, 'done');
  const before = evaluateRun(r, src(), at(k(1), 9));
  assert.equal(before.today?.state, 'pending', 'unlogged at 9am → still pending, not missed');
  // Step 6 needs 3 units: 2 rakaat + witr.
  const r2 = run({ templateId: 'qiyam30', checks: ok(0, 1, 2, 3, 4) });
  assert.equal(evaluateRun(r2, src({ qiyam: { [k(5)]: { rakaat: 2, witr: true } } }), at(k(5), 23)).today?.state, 'done');
  assert.equal(evaluateRun(r2, src({ qiyam: { [k(5)]: { rakaat: 2, witr: false } } }), at(k(5), 23)).today?.state, 'pending');
}

// ── strict: a miss restarts the count ────────────────────────────────────────
{
  const r = run({ templateId: 'quitHabit', name: 'السهر', grace: 'strict', checks: ok(0, 1, 3) });
  const ev = evaluateRun(r, src(), at(k(4), 10));
  assert.deepEqual(ev.days.map((d) => d.state), ['done', 'done', 'missed', 'done', 'pending']);
  assert.equal(ev.days[2].reset, true);
  assert.equal(ev.step, 1);
  assert.equal(ev.restarts, 1);
  assert.equal(ev.lastReset, k(2));
  assert.equal(ev.best, 2);
  // A miss on step 0 restarts nothing.
  const fresh = evaluateRun(run({ templateId: 'quitHabit', grace: 'strict' }), src(), at(k(2), 10));
  assert.equal(fresh.restarts, 0);
  // Retro-confirming the missed day heals the chain (pure re-evaluation).
  assert.equal(evaluateRun({ ...r, checks: ok(0, 1, 2, 3) }, src(), at(k(4), 10)).step, 4);
}

// ── تكبيرة الإحرام: all five or the forty restart ───────────────────────────
{
  const five = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const r = run({
    templateId: 'takbeer40',
    grace: 'strict',
    checks: { [k(0)]: { items: five }, [k(1)]: { items: five.slice(0, 4) }, [k(2)]: { items: five } },
  });
  const ev = evaluateRun(r, src(), at(k(3), 8));
  assert.deepEqual(ev.days.map((d) => d.state), ['done', 'missed', 'done', 'pending']);
  assert.equal(ev.restarts, 1);
  assert.equal(ev.step, 1);
  assert.equal(ev.today?.target, 5);
}

// ── pauses (travel/illness) and one excused day ──────────────────────────────
{
  const strict = run({ templateId: 'quitHabit', grace: 'strict', checks: ok(0, 3), pauses: { [k(1)]: k(2) } });
  const ev = evaluateRun(strict, src(), at(k(4), 10));
  assert.deepEqual(ev.days.map((d) => d.state), ['done', 'paused', 'paused', 'done', 'pending']);
  assert.equal(ev.restarts, 0);
  assert.equal(ev.step, 2);
  const open = evaluateRun(run({ templateId: 'quitHabit', checks: ok(0), pauses: { [k(1)]: null } }), src(), at(k(4), 10));
  assert.equal(open.paused, true);
  assert.deepEqual(open.days.slice(1).map((d) => d.state), ['paused', 'paused', 'paused', 'paused']);
  assert.equal(open.today?.state, 'paused');
}

// ── women: excused days neither count nor break ─────────────────────────────
{
  const all = { fajr: { fard: true, onTime: true }, dhuhr: { fard: true, onTime: true }, asr: { fard: true, onTime: true }, maghrib: { fard: true, onTime: true }, isha: { fard: true, onTime: true } };
  const r = run({ templateId: 'onTime40', grace: 'strict' });
  const s = src({ gender: 'female', prayerLog: { [k(0)]: all, [k(2)]: all }, excused: { [k(1)]: true } });
  const ev = evaluateRun(r, s, at(k(3), 10));
  assert.deepEqual(ev.days.map((d) => d.state), ['done', 'excused', 'done', 'pending']);
  assert.equal(ev.step, 2);
  assert.ok(ev.days[0].auto, 'verified from the prayer log');
  // Four of five on time → missed (strict restarts).
  const four = { ...all, isha: { fard: true } };
  assert.equal(evaluateRun(r, src({ gender: 'female', prayerLog: { [k(0)]: all, [k(1)]: four } }), at(k(2), 10)).restarts, 1);
}

// ── fasting: Mondays only for three weeks, then Monday and Thursday ──────────
{
  const r = run({ templateId: 'fastMonThu' });
  const fast = (...days: number[]) => Object.fromEntries(days.map((d) => [k(d), { modules: [{ moduleId: 'fasting', completed: true }] }]));
  const ev = evaluateRun(r, src({ dailyProgress: fast(1) }), at(k(9), 12)); // Tue 17 Nov
  assert.deepEqual(ev.days.map((d) => d.state), ['rest', 'done', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'missed', 'rest']);
  assert.equal(ev.step, 1);
  assert.equal(ev.nextDue, k(15), 'next Monday');
  // After three Mondays, Thursday is due too.
  const ev2 = evaluateRun(r, src({ dailyProgress: fast(1, 8, 15) }), at(k(18), 9)); // Thu 26 Nov
  assert.equal(ev2.step, 3);
  assert.equal(ev2.today?.state, 'pending');
  assert.equal(milestonesOf(ev2.def).some((m) => m.kind === 'week'), false, 'no week milestones on rest-day programs');
}

// ── السنن الرواتب: escalating slots, a man's Friday ─────────────────────────
{
  const friday = '2026-11-13';
  assert.equal(rawatibSlotsOn(friday, true, 5).length, 4);
  assert.equal(rawatibSlotsOn(friday, true, 5).reduce((n, s) => n + s.rakaat, 0), 10);
  assert.equal(rawatibSlotsOn(friday, false, 5).reduce((n, s) => n + s.rakaat, 0), 12);
  assert.equal(rawatibSlotsOn(k(1), true, 2).map((s) => s.label).join('،'), 'سنة الفجر،بعدية المغرب');
  const r = run({ templateId: 'rawatib35' });
  const s = src({ prayerLog: { [k(0)]: { fajr: { fard: true, sunnahBefore: true } } } });
  const ev = evaluateRun(r, s, at(k(1), 8));
  assert.equal(ev.days[0].state, 'done');
  assert.ok(ev.days[0].auto);
}

// ── adhkar (activity log), istighfar (tasbih + hand), Qur'an (مصحفي) ─────────
{
  const e = (key: string, domain: string, refId: string, amount = 1) => ({ dateKey: key, domain, refId, amount });
  const r = run({ templateId: 'adhkar30', checks: ok(...Array.from({ length: 10 }, (_, i) => i)) });
  const morningOnly = src({ events: [e(k(10), 'dhikr', 'morning', 30)] });
  const d10 = evaluateRun(r, morningOnly, at(k(10), 20)).today!;
  assert.equal(d10.target, 2, 'evening joins after ten days');
  assert.equal(d10.state, 'pending');
  const withBook = { ...r, checks: { ...r.checks, [k(10)]: { items: ['evening'] } } };
  assert.equal(evaluateRun(withBook, morningOnly, at(k(10), 20)).today!.state, 'done', 'evening read from a book');

  const ist = run({ templateId: 'istighfar40', linkRef: 'c1', checks: { [k(0)]: { amount: 3 } } });
  const d0 = evaluateRun(ist, src({ events: [e(k(0), 'tasbih', 'c1', 7), e(k(0), 'tasbih', 'other', 50)] }), at(k(0), 21)).today!;
  assert.equal(d0.amount, 10);
  assert.equal(d0.state, 'done');
  assert.equal(d0.auto, false, '7 of 10 from the tasbih — not auto');

  const q = run({ templateId: 'quran60' });
  const qs = src({ mushafi: { days: { [k(0)]: [1] } }, readingDays: { [k(1)]: 3 } });
  const qev = evaluateRun(q, qs, at(k(1), 21));
  assert.deepEqual(qev.days.map((d) => d.state), ['done', 'done']);
}

// ── stamps keep a closed day verified after its source is gone ───────────────
{
  const r = run({ templateId: 'adhkar30' });
  const s = src({ events: [{ dateKey: k(0), domain: 'dhikr', refId: 'morning', amount: 20 }] });
  const seen = stampsFor(r, s, at(k(2), 10));
  assert.deepEqual(seen, { [k(0)]: 1 });
  const stamped = { ...r, checks: { [k(0)]: { seen: 1 } } };
  assert.equal(evaluateRun(stamped, src(), at(k(2), 10)).days[0].state, 'done', 'pruned log, still done');
  assert.deepEqual(stampsFor(stamped, s, at(k(2), 10)), {}, 'idempotent');
}

// ── DST: a long walk keeps one entry per calendar day ───────────────────────
{
  const r = run({ templateId: 'quitHabit', days: 90, startDay: '2026-10-01', checks: {} });
  const ev = evaluateRun(r, src(), new Date(2026, 10, 15, 12));
  assert.equal(ev.days.length, 46);
  assert.ok(ev.days.every((d, i) => i === 0 || d.key === shiftKey(ev.days[i - 1].key, 1)));
  assert.ok(ev.days.some((d) => d.key === '2026-10-25') && ev.days.some((d) => d.key === '2026-10-26'));
}

// ── points: +2 a day, +5 at a first milestone, +40 at the end ───────────────
{
  const r = run({ templateId: 'quitHabit', days: 21, grace: 'strict', checks: ok(...Array.from({ length: 21 }, (_, i) => i)) });
  const p = (n: number) => programPointsOn([r], k(n), src(), at(k(21), 10)).total;
  assert.equal(p(0), 2);
  assert.equal(p(6), 7, 'week one');
  assert.equal(p(10), 7, 'halfway (11 of 21)');
  assert.equal(p(20), 42, 'finished');
  assert.equal(p(21), 0, 'after the end');
  // A milestone counts once: restarting and re-reaching day 7 earns the day's 2 only.
  const again = run({ templateId: 'quitHabit', grace: 'strict', checks: ok(...Array.from({ length: 7 }, (_, i) => i), ...Array.from({ length: 7 }, (_, i) => 8 + i)) });
  assert.equal(programPointsOn([again], k(6), src(), at(k(16), 10)).total, 7);
  assert.equal(programPointsOn([again], k(14), src(), at(k(16), 10)).total, 2);
  assert.equal(programPointsOn([again], k(7), src(), at(k(16), 10)).total, 0, 'the missed day');
  const parts = programPointsOn([r], k(20), src(), at(k(21), 10)).parts;
  assert.equal(parts[0].id, 'program:r1');
}

// ── Home attention ───────────────────────────────────────────────────────────
{
  const times = (key: string): DayTimes => ({
    fajr: at(key, 4, 40), sunrise: at(key, 6, 5), dhuhr: at(key, 11, 45), asr: at(key, 14, 50), maghrib: at(key, 17, 15), isha: at(key, 18, 35),
  });
  const miss = run({ templateId: 'quitHabit', checks: ok(0) });
  const items = programAttention([miss], src(), at(k(3), 20), times(k(3)));
  assert.ok(items.some((i) => i.id === `program.miss.r1.${k(2)}` && i.level === 'suggest'));
  const closing = items.find((i) => i.id === `program.today.r1.${k(3)}`);
  assert.ok(closing && closing.level === 'closing' && closing.to === '/programs?run=r1');
  assert.equal(closing!.deadline!.getTime(), at(k(4), 0).getTime() - 1, 'next midnight − 1 ms');
  assert.equal(programAttention([miss], src(), at(k(3), 14), times(k(3))).filter((i) => i.level === 'closing').length, 0, 'not before evening');

  const reset = run({ templateId: 'quitHabit', grace: 'strict', checks: ok(0, 1) });
  assert.ok(programAttention([reset], src(), at(k(3), 9), times(k(3))).some((i) => i.id === `program.reset.r1.${k(2)}`));

  const duha = run({ templateId: 'duha30' });
  const d = programAttention([duha], src(), at(k(0), 10), times(k(0)));
  assert.equal(d[0]?.icon, 'duha');
  assert.equal(d[0]?.deadline?.getTime(), at(k(0), 11, 35).getTime());
  assert.equal(programAttention([duha], src({ duha: { [k(0)]: 2 } }), at(k(0), 10), times(k(0))).length, 0, 'done → quiet');

  const fast = run({ templateId: 'fastMonThu' });
  assert.ok(programAttention([fast], src(), at(k(0), 19), times(k(0))).some((i) => i.id === `program.fast.r1.${k(1)}`), 'Sunday evening: tomorrow is Monday');
  assert.equal(programAttention([{ ...fast, pauses: { [k(0)]: null } }], src(), at(k(0), 19), times(k(0))).length, 0, 'paused → quiet');
}

// ── reminders: a rolling week, stable dateless ids ──────────────────────────
{
  const times = (d: Date): DayTimes => {
    const key = shiftKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 0);
    return { fajr: at(key, 4, 40), sunrise: at(key, 6, 5), dhuhr: at(key, 11, 45), asr: at(key, 14, 50), maghrib: at(key, 17, 15), isha: at(key, 18, 35) };
  };
  const q = run({ templateId: 'qiyam30' });
  const plan = planProgramReminders([q], src(), at(k(0), 13), times);
  assert.equal(plan.length, 7);
  assert.ok(plan.every((p) => /^myzikr_prog_r1_0_d[0-6]$/.test(p.id)), 'dateless ids');
  assert.equal(new Set(plan.map((p) => p.id)).size, 7);
  assert.equal(plan[0].at, at(k(0), 19, 35).getTime(), 'Isha + 60');
  assert.ok(plan[0].title.includes('اليوم ١ من ٣٠'));
  assert.ok(plan[5].body.includes('ركعتان والوتر'), 'projected: day 6 adds the witr');
  // Same weekday → same id on the next sync.
  const later = planProgramReminders([q], src(), at(k(1), 10), times);
  assert.equal(later.find((p) => p.at === plan[1].at)?.id, plan[1].id);
  // Today's step done → no reminder today; the projection moves on.
  const done = planProgramReminders([q], src({ qiyam: { [k(0)]: { rakaat: 2, witr: false } } }), at(k(0), 23), times);
  assert.equal(done.length, 6);
  assert.ok(done[0].title.includes('اليوم ٢ من ٣٠'));
  assert.equal(planProgramReminders([{ ...q, pauses: { [k(0)]: null } }], src(), at(k(0), 10), times).length, 0);
  assert.equal(planProgramReminders([{ ...q, remindersOn: false }], src(), at(k(0), 10), times).length, 0);
  // Fasting: the evening before each due day.
  const f = planProgramReminders([run({ templateId: 'fastMonThu' })], src(), at(k(0), 10), times);
  assert.equal(f.length, 1);
  assert.equal(f[0].at, at(k(0), 21, 30).getTime());
  assert.ok(f[0].body.startsWith('غداً الاثنين'));
  // Adhkar: the evening reminder joins with the evening set.
  const a = planProgramReminders([run({ templateId: 'adhkar30', checks: ok(0, 1, 2, 3, 4, 5, 6, 7, 8) })], src(), at(k(9), 3), times);
  assert.deepEqual(a.filter((p) => p.id.includes('_1_')).length, 6, 'evening from step 11');
}

console.log('programs: ok');
