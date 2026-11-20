/**
 * Executable check for «صلة الرحم» pure logic (src/store/silatModel.ts):
 * due/overdue math, «الأولى بالصلة» sorting, week coverage and its streak,
 * the board's points, reminder planning (stable ids) and Home items.
 *
 * Run: npx esbuild scripts/silat.test.ts --bundle --format=esm --platform=node --alias:@=./src
 *        "--define:import.meta.env={\"DEV\":false,\"PROD\":true,\"MODE\":\"test\"}" --loader:.woff=empty
 *        --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty
 *        --outfile=.tmp-test/silat.mjs && node .tmp-test/silat.mjs
 */
import assert from 'node:assert/strict';
import {
  baselineFor, capRanked, compareRanked, countsBetween, countsFor, coverageStreak, diffDays, dueText, easiestAction, emptyCounts,
  isDueNow, milestoneOf, nextAnniversary, needsVisit, othersText, personHeat, planSilatReminders, planWeekday, rankPeople,
  reconcileEntry, repairSteps, silahOfDay, silatAttention, silatBadgeMetrics, silatPointsOn, statusOf, templatesFor, weekCircle,
  weekCoverage, weekStartKey, DEFAULT_PREFS, type Person, type SilatEntry,
} from '@/store/silatModel';
import { dayKey, parseKey, shiftKey } from '@/store/studyModel';
import {
  CHANNELS, CONTACT, CONTACT_GROUPS, CONTINUING_DEEDS, DECEASED_TYPES, LIVING_TYPES, MESSAGE_TEMPLATES, RELATIONS, TYPE_TEXT,
  closenessOf, groupOf, isContact, isFemaleRelation, relationLabel, relationsFor, typeLabel, type ContactType,
} from '@/data/silatContent';

const TODAY = '2026-11-17'; // a Tuesday
const at = (key: string, h = 10) => {
  const d = parseKey(key);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};
let seq = 0;
const person = (id: string, relation: string, everyDays: number, created = '2026-10-01', extra: Partial<Person> = {}): Person => ({
  id, name: id, relation, everyDays, createdAt: at(created, 8), ...extra,
});
const entry = (personId: string, type: ContactType, day: string, h = 10): SilatEntry => ({ id: `e${++seq}`, personId, type, day, at: at(day, h) });

// ── status ──
{
  const mom = person('mom', 'mother', 1);
  const s1 = statusOf(mom, [entry('mom', 'call', '2026-11-16')], TODAY);
  assert.equal(s1.state, 'due');
  assert.equal(s1.daysLeft, 0);
  const s2 = statusOf(mom, [entry('mom', 'call', '2026-11-14')], TODAY);
  assert.equal(s2.state, 'late');
  assert.equal(s2.daysLeft, -2);
  assert.equal(dueText(s2), 'تأخّرت صلته يومين');
  assert.equal(dueText(s2, true), 'تأخّرت صلتها يومين');
  const s3 = statusOf(mom, [entry('mom', 'visit', TODAY)], TODAY);
  assert.equal(s3.state, 'done');
  assert.equal(s3.left, 1);
  // du'a is not contact for the living…
  assert.equal(statusOf(mom, [entry('mom', 'dua', TODAY)], TODAY).state, 'late');
  // …but it is what reaches one who has died
  assert.equal(statusOf({ ...mom, deceased: true }, [entry('mom', 'dua', TODAY)], TODAY).state, 'done');
  // never reached, no baseline: not due on day one — the first cycle runs from the day added
  const fresh = statusOf(person('new', 'brother', 7, TODAY), [], TODAY);
  assert.equal(fresh.state, 'ok');
  assert.equal(fresh.dueDay, '2026-11-24');
  assert.equal(statusOf(person('newMom', 'mother', 2, TODAY), [], TODAY).state, 'ok');
  assert.equal(statusOf(person('old', 'brother', 7, '2026-11-14'), [], TODAY).daysLeft, 4);
  assert.equal(statusOf(person('old', 'brother', 7, '2026-11-10'), [], TODAY).state, 'due');
  assert.equal(dueText(statusOf(person('old', 'brother', 7, '2026-11-10'), [], TODAY)), 'لم تصله بعد');
  assert.equal(statusOf(person('old', 'brother', 7, '2026-11-08'), [], TODAY).daysLeft, -2);
  // weekly, reached 3 days ago → in 4 days, ring 4/7 left
  const sis = statusOf(person('sis', 'sister', 7), [entry('sis', 'message', '2026-11-14')], TODAY);
  assert.equal(sis.state, 'ok');
  assert.equal(sis.daysLeft, 4);
  assert.ok(Math.abs(sis.left - 4 / 7) < 1e-9);
  // a future-dated entry doesn't count today
  assert.equal(statusOf(mom, [entry('mom', 'call', '2026-11-18')], TODAY).lastDay, null);
}

// ── sorting ──
{
  const people = [
    person('aunt', 'auntM', 30),
    person('mom', 'mother', 1),
    person('bro', 'brother', 7),
    person('sis', 'sister', 7),
    person('friend', 'friend', 14),
    person('uncle', 'uncleP', 30),
  ];
  const entries = [
    entry('aunt', 'call', '2026-10-08'), // 30 days → due 11-07, 10 days late (ratio .33)
    entry('mom', 'call', '2026-11-16'), // due today
    entry('bro', 'call', '2026-11-03'), // due 11-10, 7 days late (ratio 1)
    entry('sis', 'call', TODAY), // done
    entry('friend', 'call', '2026-11-15'), // in 12 days
    entry('uncle', 'call', '2026-11-01'), // in 14 days
  ];
  const order = rankPeople(people, entries, TODAY).map((r) => r.person.id);
  assert.deepEqual(order, ['mom', 'bro', 'aunt', 'friend', 'uncle', 'sis']);
  // deleted, deceased and repairing people are off the board
  const off = rankPeople(
    [...people, person('x', 'brother', 7, '2026-10-01', { deletedAt: 1 }), person('y', 'father', 1, '2026-10-01', { deceased: true }), person('z', 'cousin', 30, '2026-10-01', { repair: { since: 1 } })],
    entries,
    TODAY,
  );
  assert.equal(off.length, people.length);
  assert.equal(typeof compareRanked, 'function');
}

// ── week, coverage, streak ──
{
  assert.equal(weekStartKey(TODAY), '2026-11-14'); // Saturday
  assert.equal(weekStartKey('2026-11-14'), '2026-11-14');
  assert.equal(weekStartKey('2026-11-20'), '2026-11-14'); // Friday

  const sis = person('sis', 'sister', 7);
  const bro = person('bro', 'brother', 7);
  const cov = weekCoverage([sis, bro], [entry('sis', 'call', '2026-11-10'), entry('bro', 'call', '2026-11-05')], TODAY);
  assert.deepEqual(cov, { kept: 1, total: 2, pct: 50 });
  // reaching the late brother today mends today, not the days he already waited
  assert.equal(weekCoverage([sis, bro], [entry('sis', 'call', '2026-11-10'), entry('bro', 'call', '2026-11-05'), entry('bro', 'visit', TODAY)], TODAY).kept, 1);
  // due today and reached today keeps the week; due yesterday and reached only today doesn't
  assert.equal(weekCoverage([bro], [entry('bro', 'call', '2026-11-10'), entry('bro', 'call', TODAY)], TODAY).pct, 100);
  assert.equal(weekCoverage([bro], [entry('bro', 'call', '2026-11-09'), entry('bro', 'call', TODAY)], TODAY).pct, 0);
  // due today, not yet reached: not missed yet
  assert.equal(weekCoverage([bro], [entry('bro', 'call', '2026-11-10')], TODAY).pct, 100);
  // just added and never reached: a full rhythm of grace before it counts against the week
  assert.equal(weekCoverage([person('nb', 'neighbor', 14, '2026-11-15')], [], TODAY).pct, 100);

  const mom = person('mom', 'mother', 1, '2026-10-24');
  const daily: SilatEntry[] = [];
  for (let d = '2026-10-24'; d < TODAY; d = shiftKey(d, 1)) daily.push(entry('mom', 'call', d));
  // reached every day up to yesterday (today still open): 3 whole weeks + this one so far
  assert.equal(coverageStreak([mom], daily, TODAY), 4);
  // a missed day breaks its week
  assert.equal(coverageStreak([mom], daily.filter((e) => e.day !== '2026-11-03'), TODAY), 2);
  // missed yesterday → this week is broken
  assert.equal(coverageStreak([mom], daily.filter((e) => e.day !== '2026-11-16'), TODAY), 0);
  assert.equal(coverageStreak([], [], TODAY), 0);
  assert.equal(weekCoverage([], [], TODAY).pct, null);
}

// ── points ──
{
  const mom = person('mom', 'mother', 1);
  const bro = person('bro', 'brother', 7);
  const dad = person('dad', 'father', 1, '2026-10-01', { deceased: true });
  const es = [
    entry('mom', 'visit', TODAY),
    entry('mom', 'call', TODAY, 11),
    entry('mom', 'call', TODAY, 12), // a second call: no more points
    entry('bro', 'call', TODAY),
    entry('dad', 'dua', TODAY),
    entry('dad', 'sadaqah', TODAY),
    entry('mom', 'visit', '2026-11-16'), // another day
  ];
  const r = silatPointsOn(es, [mom, bro, dad], TODAY);
  assert.equal(r.points, 8 + 4 + 4 + 1 + 5);
  assert.deepEqual(r.lines[0], { label: 'زيارة', points: 8 });
  assert.ok(r.lines.some((l) => l.label === 'اتصال ×٢' && l.points === 8));
  // deleted people earn nothing
  assert.equal(silatPointsOn(es, [{ ...mom, deletedAt: 1 }, bro, dad], TODAY).points, 4 + 1 + 5);

  // reconciliation: the first contact after the estrangement (not the du'a) earns +15, once
  const cousin = person('cousin', 'cousin', 30, '2026-10-01', { repair: { since: at('2026-11-10') } });
  const rep = [entry('cousin', 'call', '2026-11-01'), entry('cousin', 'dua', '2026-11-12'), entry('cousin', 'message', '2026-11-15'), entry('cousin', 'call', TODAY)];
  assert.equal(reconcileEntry(cousin, rep)?.day, '2026-11-15');
  assert.equal(silatPointsOn(rep, [cousin], '2026-11-15').points, 2 + 15);
  assert.equal(silatPointsOn(rep, [cousin], TODAY).points, 4);
  assert.deepEqual(repairSteps(cousin, rep), [true, true, true, false]);

  // the day's ceiling
  const many = Array.from({ length: 12 }, (_, i) => person(`p${i}`, 'cousin', 30));
  const big = silatPointsOn(many.map((p) => entry(p.id, 'visit', TODAY)), many, TODAY);
  assert.equal(big.points, 60);
  assert.equal(big.lines.reduce((n, l) => n + l.points, 0), 60);
}

// ── occasions & the sick ──
{
  assert.equal(nextAnniversary('1990-03-05', TODAY), '2027-03-05');
  assert.equal(nextAnniversary('1990-12-01', TODAY), '2026-12-01');
  assert.equal(nextAnniversary('1990-11-17', TODAY), TODAY);
  const ill = person('g', 'grandmother', 7, '2026-10-01', { ill: true });
  assert.equal(needsVisit(ill, [entry('g', 'visit', '2026-11-12')], TODAY), true);
  assert.equal(needsVisit(ill, [entry('g', 'call', '2026-11-16')], TODAY), false);
}

// ── reminders ──
{
  const now = at(TODAY, 12);
  const mom = person('mom', 'mother', 1, '2026-10-01', { remind: true, remindTime: '09:00', birthday: '1960-11-20' });
  const bro = person('bro', 'brother', 7);
  const es = [entry('mom', 'call', '2026-11-16'), entry('bro', 'call', '2026-11-14')];
  const plan = planSilatReminders([mom, bro], es, DEFAULT_PREFS, now, 'male');
  const ids = plan.map((p) => p.id).sort();
  assert.deepEqual(ids, ['myzikr_silat_digest', 'myzikr_silat_o_mom_bd', 'myzikr_silat_p_mom']);
  for (const id of ids) assert.ok(!/\d{4}-?\d{2}-?\d{2}/.test(id), `dated id ${id}`);
  const digest = plan.find((p) => p.id === 'myzikr_silat_digest')!;
  assert.equal(digest.repeat, 'daily');
  assert.equal(digest.at, at(TODAY, 18));
  assert.ok(digest.body.includes('mom') && !digest.body.includes('bro'), digest.body);
  // her own reminder: due today at 09:00 has passed → tomorrow 09:00, and by then she is a day late
  const own = plan.find((p) => p.id === 'myzikr_silat_p_mom')!;
  assert.equal(own.at, at('2026-11-18', 9));
  assert.ok(own.body.includes('تأخّرت'), own.body);
  assert.equal(plan.find((p) => p.id === 'myzikr_silat_o_mom_bd')!.at, at('2026-11-20', 9));

  // nobody due at the next fire → one shot on the first day someone is
  const calm = planSilatReminders([bro], [entry('bro', 'call', TODAY)], DEFAULT_PREFS, now);
  assert.equal(calm[0].repeat, 'none');
  assert.equal(calm[0].at, at('2026-11-24', 18));
  // digest off, nobody → nothing
  assert.equal(planSilatReminders([bro], [], { ...DEFAULT_PREFS, digest: false }, now).length, 0);
}

// ── Home ──
{
  const mom = person('mom', 'mother', 1);
  const aunt = person('aunt', 'auntM', 30);
  const items = silatAttention([mom, aunt], [entry('mom', 'call', '2026-11-14'), entry('aunt', 'call', '2026-10-01')], new Date(at(TODAY, 11)));
  assert.equal(items[0].level, 'closing');
  assert.equal(items[0].id, 'silat.parent.mom');
  assert.equal(items[1].id, 'silat.due');
  // a parent merely due (not late) waits until 4 pm
  const due = silatAttention([mom], [entry('mom', 'call', '2026-11-16')], new Date(at(TODAY, 11)));
  assert.equal(due[0].id, 'silat.due');
  assert.equal(silatAttention([mom], [entry('mom', 'call', '2026-11-16')], new Date(at(TODAY, 17)))[0].id, 'silat.parent.mom');
}

// ── «متى وصلته آخر مرة؟» (the baseline) ──
{
  assert.equal(baselineFor('soon', TODAY, 7), '2026-11-15');
  assert.equal(baselineFor('month', TODAY, 7), '2026-10-28');
  assert.equal(baselineFor('long', TODAY, 30), '2026-10-18');
  const add = (rel: string, every: number, since: 'soon' | 'month' | 'long', extra: Partial<Person> = {}) =>
    person(`${rel}-${since}-${every}`, rel, every, TODAY, { baseline: baselineFor(since, TODAY, every), ...extra });

  // «قريباً»: a weekly brother in 5 days, a monthly uncle in 28, a parent every 2 days today
  assert.equal(statusOf(add('brother', 7, 'soon'), [], TODAY).daysLeft, 5);
  assert.equal(statusOf(add('uncleP', 30, 'soon'), [], TODAY).daysLeft, 28);
  const mom = statusOf(add('mother', 2, 'soon'), [], TODAY);
  assert.equal(mom.state, 'due');
  assert.equal(dueText(mom, true), 'موعد صلتها اليوم');
  // «هذا الشهر»: a monthly aunt in 10 days; a weekly sister is due now — never late on the day added
  assert.equal(statusOf(add('auntM', 30, 'month'), [], TODAY).daysLeft, 10);
  const sisP = add('sister', 7, 'month');
  assert.equal(statusOf(sisP, [], TODAY).state, 'due');
  assert.equal(statusOf(sisP, [], TODAY).daysLeft, 0);
  // «منذ زمن»: due now whatever the plan, late the day after
  for (const every of [1, 2, 3, 7, 14, 30]) assert.equal(statusOf(add('cousin', every, 'long'), [], TODAY).state, 'due', `long ${every}`);
  assert.equal(statusOf(add('cousin', 30, 'long'), [], '2026-11-18').state, 'late');

  // the baseline is not a contact: never «وصلته اليوم», no points
  const soon = add('brother', 7, 'soon');
  assert.equal(statusOf(soon, [], TODAY).estimated, true);
  assert.equal(statusOf(soon, [], TODAY).lastDay, '2026-11-15');
  assert.notEqual(statusOf(person('b0', 'brother', 7, TODAY, { baseline: TODAY }), [], TODAY).state, 'done');
  assert.equal(silatPointsOn([], [soon], TODAY).points, 0);
  // a logged contact takes over
  const s2 = statusOf(sisP, [entry(sisP.id, 'call', TODAY)], TODAY);
  assert.equal(s2.state, 'done');
  assert.equal(s2.estimated, false);
  assert.equal(s2.dueDay, '2026-11-24');
  // …but one logged from before the baseline doesn't drag them back
  assert.equal(statusOf(soon, [entry(soon.id, 'call', '2026-11-01')], TODAY).daysLeft, 5);

  // the week's coverage runs the same cycle: due today and not yet reached is not missed yet
  assert.equal(weekCoverage([sisP], [], TODAY).pct, 100);
  assert.equal(weekCoverage([sisP], [], '2026-11-18').pct, 0);
  assert.equal(weekCoverage([soon], [], '2026-11-20').pct, 100);
}

// ── a preferred weekday (TODAY is a Tuesday; 5 = Friday) ──
{
  const bro = person('bro', 'brother', 7, '2026-10-01', { weekday: 5 });
  // reached Tuesday 11-10 → + 7 = Tuesday 11-17 → on to Friday 11-20
  const s = statusOf(bro, [entry('bro', 'call', '2026-11-10')], TODAY);
  assert.equal(s.dueDay, '2026-11-20');
  assert.equal(s.state, 'ok');
  assert.equal(dueText(s), 'موعده الجمعة');
  // reached on a Friday → the next Friday exactly
  assert.equal(statusOf(bro, [entry('bro', 'visit', '2026-11-13')], TODAY).dueDay, '2026-11-20');
  // tomorrow
  const wed = person('wed', 'sister', 7, '2026-10-01', { weekday: 3 });
  assert.equal(dueText(statusOf(wed, [entry('wed', 'call', '2026-11-11')], TODAY), true), 'موعدها غداً، الأربعاء');
  // monthly: the first Friday on or after last + 30 (12-01 is a Tuesday)
  const aunt = person('aunt', 'auntM', 30, '2026-10-01', { weekday: 5 });
  const sa = statusOf(aunt, [entry('aunt', 'call', '2026-11-01')], TODAY);
  assert.equal(sa.dueDay, '2026-12-04');
  assert.equal(dueText(sa, true), 'موعدها الجمعة بعد ١٧ يوماً');
  // shorter than a week: the weekday is ignored
  const mom = person('mom', 'mother', 2, '2026-10-01', { weekday: 5 });
  assert.equal(planWeekday(mom), null);
  assert.equal(statusOf(mom, [entry('mom', 'call', '2026-11-16')], TODAY).dueDay, '2026-11-18');
  // a new person: a full week, then on to Friday; «هذا الشهر» lands on the first Friday from the day added
  assert.equal(statusOf(person('n', 'brother', 7, TODAY, { weekday: 5 }), [], TODAY).dueDay, '2026-11-27');
  assert.equal(statusOf(person('m', 'brother', 7, TODAY, { weekday: 5, baseline: baselineFor('month', TODAY, 7) }), [], TODAY).dueDay, '2026-11-20');
  // the reminder fires on the Friday, and the week's coverage waits for it
  assert.equal(weekCoverage([bro], [entry('bro', 'call', '2026-11-10')], '2026-11-19').pct, 100);
}

// ── the rule change: nobody turns late on update day ──
{
  // the old statusOf (never reached = due the day added, late after)
  const oldState = (p: Person, es: readonly SilatEntry[], today: string) => {
    let last: string | null = null;
    for (const e of es) if (e.personId === p.id && e.day <= today && countsFor(p, e.type) && (!last || e.day > last)) last = e.day;
    const created = dayKey(p.createdAt);
    const due = last ? shiftKey(last, p.everyDays) : created < today ? created : today;
    return last === today ? 'done' : diffDays(due, today) < 0 ? 'late' : 'other';
  };
  let checked = 0;
  for (const every of [1, 2, 3, 7, 14, 30, 45]) {
    for (let c = 0; c <= 60; c += 3) {
      const created = shiftKey(TODAY, -c);
      const p = person(`p${every}_${c}`, 'cousin', every, created);
      const cases: SilatEntry[][] = [[], [entry(p.id, 'call', created)], [entry(p.id, 'visit', shiftKey(TODAY, -Math.min(c, every)))], [entry(p.id, 'dua', TODAY)]];
      for (const es of cases) {
        const now = statusOf(p, es, TODAY);
        if (now.state === 'late') assert.equal(oldState(p, es, TODAY), 'late', `${p.id} turned late`);
        // with a contact logged, nothing moved at all
        if (es.some((e) => countsFor(p, e.type))) assert.equal(now.dueDay, shiftKey(es[0].day, every), p.id);
        checked++;
      }
    }
  }
  assert.ok(checked > 500);
}

// ── a gentle load ──
{
  const people = [
    person('c1', 'cousin', 30),
    person('c2', 'cousin', 30),
    person('c3', 'cousin', 30),
    person('uncle', 'uncleP', 30),
    person('aunt', 'auntM', 30),
    person('dad', 'father', 2),
    person('mom', 'mother', 2),
  ];
  const es = people.map((p) => entry(p.id, 'call', '2026-10-01')); // everyone late
  const due = rankPeople(people, es, TODAY).filter(isDueNow);
  const { shown, more } = capRanked(due);
  assert.equal(shown.length, 4);
  assert.equal(more, 3);
  assert.deepEqual(shown.map((r) => r.person.id).slice(0, 2), ['mom', 'dad'], 'the parents always first');
  assert.deepEqual(capRanked(due.slice(0, 3)), { shown: due.slice(0, 3), more: 0 });
  assert.equal(othersText(more), 'و٣ آخرون');
  assert.equal(othersText(1), 'وآخر');
  assert.equal(othersText(2), 'وآخران');

  // the digest names three at most: the parents first, the rest counted
  const named = (body: string) => [...people.map((p) => p.id), 'Gran'].filter((id) => body.includes(id));
  const gran = person('Gran', 'grandmother', 7, '2026-10-01', { ill: true });
  const withGran = [...es, entry('Gran', 'gift', '2026-11-16')];
  const body = planSilatReminders([...people, gran], withGran, DEFAULT_PREFS, at(TODAY, 12)).find((n) => n.id === 'myzikr_silat_digest')!.body;
  assert.equal(named(body).length, 3, body);
  assert.ok(body.includes('mom') && body.includes('dad') && body.includes('و٤ غيرهم'), body);
  assert.ok(body.includes('ومريضٌ ينتظر عيادتك') && !body.includes('Gran'), body);
  // with room left, the sick are named
  const calm = planSilatReminders([people[6], gran], [es[6], entry('Gran', 'gift', '2026-11-16')], DEFAULT_PREFS, at(TODAY, 12))[0].body;
  assert.ok(calm.includes('عيادة المريض: Gran'), calm);
}

// ── badges ──
{
  const mom = person('mom', 'mother', 1);
  const nb = person('nb', 'neighbor', 14);
  const cousin = person('cousin', 'cousin', 30, '2026-10-01', { repair: { since: at('2026-11-10') } });
  const m = silatBadgeMetrics(
    [mom, nb, cousin],
    [entry('mom', 'visit', TODAY), entry('mom', 'dua', TODAY), entry('mom', 'dua', '2026-11-16'), entry('nb', 'gift', TODAY), entry('cousin', 'call', '2026-11-12')],
    TODAY,
  );
  assert.deepEqual({ ...m, coverageWeeks: 0 }, { kinContacts: 2, visits: 1, parentDuaDays: 2, reconciled: 1, coverageWeeks: 0, neighborsReached: 1 });
}

// ── the catalog of kinds ──
{
  const all = Object.keys(CONTACT) as ContactType[];
  assert.equal(all.length, 21); // «السؤال عنه» removed by the owner 2026-11-19, before release
  // the original eight keep their ids and points (persisted entries and the board depend on them)
  assert.deepEqual(
    Object.fromEntries((['visit', 'help', 'gift', 'call', 'message', 'dua', 'sadaqah', 'wudd'] as const).map((t) => [t, CONTACT[t].points])),
    { visit: 8, help: 6, gift: 5, call: 4, message: 2, dua: 1, sadaqah: 5, wudd: 6 },
  );
  for (const t of all) {
    assert.equal(CONTACT_GROUPS.filter((g) => g.types.includes(t)).length, 1, `${t} in exactly one group`);
    assert.ok(LIVING_TYPES.includes(t) || DECEASED_TYPES.includes(t), `${t} loggable somewhere`);
    assert.ok(TYPE_TEXT[t]?.text && TYPE_TEXT[t].source, `${t} has its fadl with a source`);
    assert.ok(CONTACT[t].done.includes('{ه}'), `${t} done text has the pronoun`);
    assert.ok(CONTACT[t].points >= 1 && CONTACT[t].points <= 10, `${t} points by effort`);
    for (const s of [CONTACT[t].label, CONTACT[t].labelF ?? '', CONTACT[t].done]) assert.ok(!/[!{}]/.test(s.split('{ه}').join('')), `${t}: ${s}`);
  }
  assert.ok(CHANNELS.every(isContact), 'a channel is contact');
  assert.equal(new Set(LIVING_TYPES).size, LIVING_TYPES.length);
  assert.deepEqual(CONTACT_GROUPS.map((g) => g.types[0]).slice(0, 2), ['call', 'visit'], 'the everyday kinds first');
  // effort: a sick visit and mending between people above a visit; a voice note between a message and a call
  assert.ok(CONTACT.iyada.points > CONTACT.visit.points && CONTACT.islah.points > CONTACT.visit.points);
  assert.ok(CONTACT.message.points < CONTACT.voice.points && CONTACT.voice.points < CONTACT.call.points);
  assert.ok(CONTACT.video.points > CONTACT.call.points);
  assert.equal(groupOf('dua'), 'ghayb');
  assert.equal(groupOf('grave'), 'after');
  assert.equal(typeLabel('sadaqah', true), 'صدقة عنها');
  assert.equal(typeLabel('sadaqah'), 'صدقة عنه');
  assert.equal(typeLabel('call', true), 'اتصال');
  assert.ok(CONTINUING_DEEDS.every((d) => DECEASED_TYPES.includes(d.type)));

  // what keeps a rhythm
  const living = { deceased: undefined };
  const gone = { deceased: true };
  for (const t of ['call', 'video', 'voice', 'iyada', 'invite', 'outing', 'food', 'money', 'congrats', 'condole', 'islah'] as const) assert.ok(countsFor(living, t), t);
  for (const t of ['dua', 'sadaqah', 'wudd', 'grave', 'debt', 'hajj'] as const) assert.ok(!countsFor(living, t), t);
  for (const t of ['dua', 'sadaqah', 'wudd', 'grave', 'debt', 'hajj'] as const) assert.ok(countsFor(gone, t), t);
  assert.ok(!countsFor(gone, 'video'));
  const mom = person('mom', 'mother', 1);
  assert.equal(statusOf(mom, [entry('mom', 'dua', TODAY)], TODAY).state, 'late');
  assert.equal(statusOf(mom, [entry('mom', 'video', TODAY)], TODAY).state, 'done');
  assert.equal(statusOf({ ...mom, deceased: true }, [entry('mom', 'grave', TODAY)], TODAY).state, 'done');

  // the new kinds score by effort, once per person a day
  const uncle = person('uncle', 'uncleM', 30, '2026-10-01', { ill: true });
  const dad = person('dad', 'father', 7, '2026-10-01', { deceased: true });
  const es = [entry('uncle', 'iyada', TODAY), entry('uncle', 'iyada', TODAY, 15), entry('uncle', 'dua', TODAY), entry('dad', 'grave', TODAY), entry('dad', 'debt', TODAY)];
  const r = silatPointsOn(es, [uncle, dad], TODAY);
  assert.equal(r.points, 10 + 1 + 5 + 8);
  assert.deepEqual(r.lines[0], { label: 'عيادة مريض', points: 10 });
  // a sick visit is a visit: for the sick card and the badges
  assert.equal(needsVisit(uncle, [entry('uncle', 'iyada', '2026-11-16')], TODAY), false);
  assert.equal(needsVisit(uncle, [entry('uncle', 'dua', TODAY)], TODAY), true);
  assert.equal(silatBadgeMetrics([uncle], [entry('uncle', 'iyada', TODAY), entry('uncle', 'visit', '2026-11-10')], TODAY).visits, 2);
  // counts have a slot for every kind
  const c = countsBetween(es, [uncle, dad], TODAY, TODAY);
  assert.deepEqual(Object.keys(c).sort(), Object.keys(emptyCounts()).sort());
  assert.equal(c.iyada, 2);

  // a kind from a newer version (synced in) is skipped, never a crash or NaN
  const odd = { ...entry('uncle', 'call', TODAY), type: 'teleport' as ContactType };
  assert.equal(silatPointsOn([odd], [uncle], TODAY).points, 0);
  assert.equal(Number.isNaN(Object.values(countsBetween([odd], [uncle], TODAY, TODAY)).reduce((n, x) => n + x, 0)), false);
  assert.ok(personHeat('uncle', [odd], TODAY, 1).every((cell) => cell.value === 0));
}

// ── relations: precise ones, the lumped ones kept as legacy ──
{
  assert.equal(new Set(RELATIONS.map((r) => r.id)).size, RELATIONS.length, 'unique ids');
  for (const id of ['nephew', 'niece', 'cousin', 'cousinF']) {
    assert.ok(relationLabel(id, 'male') !== 'قريب', `${id} still labels`);
    assert.ok(closenessOf(id) < RELATIONS.length, `${id} still ranks`);
    assert.ok(!relationsFor('male').some((r) => r.id === id), `${id} not offered`);
    assert.ok(relationsFor('male', id).some((r) => r.id === id), `${id} shown on the person who has it`);
  }
  assert.equal(relationLabel('cousin', 'male'), 'ابن عمّي أو خالي');
  assert.equal(isFemaleRelation('niece', 'male'), true);
  assert.equal(isFemaleRelation('cousinKhalaF', 'male'), true);
  assert.equal(isFemaleRelation('cousinKhala', 'male'), false);
  // legacy ranks among the precise ones it lumped
  assert.ok(closenessOf('brotherSon') < closenessOf('nephew') && closenessOf('nephew') < closenessOf('cousinAmm'));
  assert.ok(closenessOf('cousinAmm') < closenessOf('cousin') && closenessOf('cousin') < closenessOf('kinOther'));
  // the children of aunts have their own relation now
  for (const id of ['cousinAmma', 'cousinAmmaF', 'cousinKhala', 'cousinKhalaF', 'sisterSon', 'milkMother']) assert.ok(relationsFor('female').some((r) => r.id === id), id);
}

// ── «صِلة اليوم» ──
{
  const ill = person('g', 'grandmother', 7, '2026-10-01', { ill: true });
  assert.equal(easiestAction({ ...ill, deceased: true }, [], TODAY), 'dua');
  assert.equal(easiestAction(ill, [], TODAY), 'iyada');
  assert.equal(easiestAction(ill, [entry('g', 'call', TODAY)], TODAY), 'call');
  assert.equal(easiestAction(person('b', 'brother', 7, '2026-10-01', { birthday: '1990-11-17' }), [], TODAY), 'congrats');
  assert.equal(easiestAction(person('b', 'brother', 7, '2026-10-01', { channels: ['visit', 'message'] }), [], TODAY), 'message');
  assert.equal(easiestAction(person('b', 'brother', 7, '2026-10-01', { channels: ['visit', 'video'] }), [], TODAY), 'video');
  assert.equal(easiestAction(person('b', 'brother', 7, '2026-10-01', { channels: ['visit'] }), [], TODAY), 'visit');
  assert.equal(easiestAction(person('b', 'brother', 7), [], TODAY), 'call');

  const mom = person('mom', 'mother', 1, '2026-10-01', { channels: ['visit'] });
  const aunt = person('aunt', 'auntM', 30);
  const due = silahOfDay([aunt, mom], [entry('mom', 'call', '2026-11-15'), entry('aunt', 'call', '2026-10-01')], TODAY)!;
  assert.equal(due.person.id, 'mom', 'the parent first');
  assert.equal(due.why, 'due');
  assert.equal(due.action, 'visit');
  // nobody due: the sick one not visited, then an occasion today, else nothing
  const gran = person('gran', 'grandmother', 7, '2026-10-01', { ill: true });
  const sis = person('sis', 'sister', 7, '2026-10-01', { occasions: [{ id: 'o', label: 'تخرّجها', date: TODAY, yearly: false }] });
  const calm = [entry('gran', 'gift', '2026-11-16'), entry('sis', 'call', '2026-11-16')];
  assert.deepEqual(
    (({ person: p, why, action }) => ({ id: p.id, why, action }))(silahOfDay([sis, gran], calm, TODAY)!),
    { id: 'gran', why: 'ill', action: 'iyada' },
  );
  assert.deepEqual(
    (({ person: p, why, action }) => ({ id: p.id, why, action }))(silahOfDay([sis], calm, TODAY)!),
    { id: 'sis', why: 'occasion', action: 'congrats' },
  );
  assert.equal(silahOfDay([person('bro', 'brother', 7)], [entry('bro', 'call', '2026-11-16')], TODAY), null);
  assert.equal(silahOfDay([], [], TODAY), null);
}

// ── «دائرة الصلة» (TODAY Tuesday 11-17; the week Saturday 11-14 → Friday 11-20) ──
{
  const people = [
    person('mom', 'mother', 1), // reached Sunday
    person('bro', 'brother', 7), // due today
    person('sis', 'sister', 7), // reached yesterday
    person('cousin', 'cousinAmm', 30), // due Thursday
    person('friend', 'friend', 14), // due Thursday; only asked after this week
    person('aunt', 'auntM', 30), // not due this week
    person('late', 'uncleP', 30), // late since before the week, reached late today
    person('dad', 'father', 1, '2026-10-01', { deceased: true }),
    person('rift', 'cousinKhal', 30, '2026-10-01', { repair: { since: 1 } }),
  ];
  const es = [
    entry('mom', 'call', '2026-11-15'),
    entry('bro', 'call', '2026-11-10'),
    entry('sis', 'voice', '2026-11-16'),
    entry('cousin', 'call', '2026-10-20'),
    entry('friend', 'call', '2026-11-05'),
    entry('friend', 'dua', '2026-11-16'),
    entry('aunt', 'call', '2026-11-12'),
    entry('late', 'call', '2026-09-01'),
    entry('late', 'visit', TODAY),
    entry('dad', 'dua', TODAY),
  ];
  const c = weekCircle(people, es, TODAY);
  assert.deepEqual(c.reached.map((p) => p.id).sort(), ['late', 'mom', 'sis']);
  assert.deepEqual(c.waiting.map((r) => r.person.id), ['bro', 'cousin', 'friend']);
  // reached last Friday: due again this Friday, so this week's circle waits for him
  assert.deepEqual(weekCircle([people[1]], [entry('bro', 'call', '2026-11-13')], TODAY).waiting.map((r) => r.person.id), ['bro']);
  assert.deepEqual(weekCircle([], [], TODAY), { reached: [], waiting: [] });
}

// ── milestones & ready messages ──
{
  assert.equal(milestoneOf(10), 'العاشرة');
  assert.equal(milestoneOf(25), 'الخامسة والعشرون');
  assert.equal(milestoneOf(100), 'المئة');
  assert.equal(milestoneOf(300), 'رقم ٣٠٠');
  for (const n of [1, 9, 11, 26, 150]) assert.equal(milestoneOf(n), null, String(n));

  const friday = new Date(at('2026-11-20', 9));
  const tuesday = new Date(at(TODAY, 9));
  const bro = person('bro', 'brother', 7);
  assert.equal(templatesFor(bro, friday)[0].id, 'jumuah');
  assert.ok(!templatesFor(bro, tuesday).some((t) => t.id === 'jumuah'));
  assert.equal(templatesFor({ ...bro, ill: true }, tuesday)[0].id, 'sick');
  assert.deepEqual(templatesFor({ ...bro, ill: true }, friday).map((t) => t.id).slice(0, 2), ['sick', 'jumuah']);
  assert.equal(templatesFor(bro, tuesday).length, MESSAGE_TEMPLATES.length - 1);
  // his birthday today: the congratulations first
  const bday = templatesFor({ ...bro, birthday: '1990-11-17' }, tuesday);
  assert.ok(bday.slice(0, 4).every((t) => t.type === 'congrats'), bday.map((t) => t.id).join());
  assert.equal(templatesFor({ ...bro, birthday: '1990-11-18' }, tuesday)[0].id, 'hal');
  assert.equal(new Set(MESSAGE_TEMPLATES.map((t) => t.id)).size, MESSAGE_TEMPLATES.length);
  for (const t of MESSAGE_TEMPLATES) {
    assert.ok(t.type in CONTACT && isContact(t.type), t.id);
    assert.ok(!t.text.includes('!') && !t.text.includes('{'), t.id);
  }
}

console.log('silat: ok');
