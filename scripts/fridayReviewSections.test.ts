/**
 * Executable check for the review's own sections (services/fridayReviewSections.ts).
 *   npx esbuild scripts/fridayReviewSections.test.ts --bundle --format=esm --platform=node --alias:@=./src \
 *     --define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"} --loader:.woff=empty --loader:.woff2=empty \
 *     --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/fridayReviewSections.mjs && node .tmp-test/fridayReviewSections.mjs
 */
import assert from 'node:assert/strict';
import { programsSection, qadaSection, silatSection } from '@/services/fridayReviewSections';
import { reviewSections, type SectionWindow } from '@/services/fridayReview';
import { DEFAULT_SETTINGS, lastRamadanYear, dateOf, type QadaData } from '@/services/qadaPlan';
import type { Person, SilatEntry } from '@/store/silatModel';
import type { ProgramRun, ProgramSources } from '@/store/programsModel';
import type { ContactType } from '@/data/silatContent';
import { shiftKey } from '@/store/studyModel';

// Saturday 7 → Friday 13 November 2026, against 31 October → 6 November.
const W: SectionWindow = { from: '2026-11-07', to: '2026-11-13', prevFrom: '2026-10-31', prevTo: '2026-11-06' };
const noonMs = (k: string) => dateOf(k).getTime();

// ── registration ─────────────────────────────────────────────────────────────
{
  const ids = reviewSections().map((s) => s.id);
  for (const id of ['silat', 'programs', 'qada']) assert.ok(ids.includes(id), `${id} registers on import`);
}

// ── صلة الرحم ────────────────────────────────────────────────────────────────
{
  const people: Person[] = [
    { id: 'm', name: '', relation: 'mother', everyDays: 7, createdAt: noonMs('2026-10-01') },
    { id: 'b', name: 'خالد', relation: 'brother', everyDays: 7, createdAt: noonMs('2026-10-01') },
  ];
  let i = 0;
  const e = (personId: string, type: ContactType, day: string): SilatEntry => ({ id: `e${i++}`, personId, type, day, at: noonMs(day) });

  // Up: 3 visits + 2 calls, everyone on time; last week one call and the brother late.
  const up = silatSection(
    people,
    [
      e('m', 'call', '2026-10-30'),
      e('b', 'call', '2026-11-01'),
      e('m', 'visit', '2026-11-07'),
      e('b', 'visit', '2026-11-08'),
      e('m', 'visit', '2026-11-10'),
      e('b', 'call', '2026-11-12'),
      e('m', 'call', '2026-11-13'),
    ],
    W,
    'male',
  );
  assert.ok(up);
  assert.equal(up.summary, '٣ زيارات · اتصالان');
  assert.equal(up.prev, 'صلة واحدة');
  assert.equal(up.diff, 4);
  assert.equal(up.trend, 'up');
  assert.equal(up.score, 1, 'everyone kept on rhythm');
  assert.equal(up.prevScore, 0.5, 'the brother was late last week');
  assert.equal(up.phrase, 'لم تتأخّر صلة أحد عن موعدها');
  assert.equal(up.focus?.[0], 'أزور أمي هذا الأسبوع', 'one living parent → by name');
  assert.ok(up.focus?.includes('أصل أحد أرحامي كل يومين'));
  assert.equal(up.to, '/silat');

  // Down: three visits last week, a single call this week; the brother slipped.
  const down = silatSection(
    people,
    [e('m', 'visit', '2026-11-01'), e('b', 'visit', '2026-11-02'), e('m', 'visit', '2026-11-04'), e('m', 'call', '2026-11-09')],
    W,
    'male',
  );
  assert.ok(down);
  assert.equal(down.summary, 'اتصال واحد');
  assert.equal(down.prev, '٣ صلات');
  assert.equal(down.diff, -2);
  assert.equal(down.trend, 'down');
  assert.equal(down.score, 0.5);
  assert.equal(down.phrase, '١ من ٢ في موعد صلتهم');
  assert.ok(down.focus?.includes('أصل خالد قبل الجمعة القادمة'), 'the late relative is named');

  // Both parents → «والديّ».
  const both = silatSection([...people, { id: 'f', name: '', relation: 'father', everyDays: 7, createdAt: noonMs('2026-10-01') }], [], W, 'male');
  assert.equal(both?.focus?.[0], 'أزور والديّ هذا الأسبوع');
  assert.equal(both?.summary, '٠');

  // Hidden: nobody added (or only deleted people).
  assert.equal(silatSection([], [], W), null);
  assert.equal(silatSection([{ ...people[0], deletedAt: 1 }], [], W), null);
}

// ── برامج التدرّج ────────────────────────────────────────────────────────────
{
  const src: ProgramSources = { gender: 'male', prayerLog: {}, excused: {}, duha: {}, qiyam: {}, events: [], dailyProgress: {} };
  const run = (p: Partial<ProgramRun>): ProgramRun => ({
    id: 'r1',
    custom: { title: 'وردي', days: 30, unit: 'check', start: 1, end: 1, curve: 'fixed' },
    startDay: W.prevFrom,
    grace: 'forgiving',
    status: 'active',
    pauses: {},
    checks: {},
    remindersOn: false,
    createdAt: 0,
    ...p,
  });
  const ok = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { ok: true }]));
  const week = (from: string, n: number[]) => n.map((d) => shiftKey(from, d));
  const now = new Date(2026, 10, 13, 21); // Friday evening: the 13th is still open

  // Up: every step this week (and the 7th step = the first week's milestone); 3 of 7 last week.
  const up = programsSection([run({ checks: ok(...week(W.prevFrom, [0, 2, 4]), ...week(W.from, [0, 1, 2, 3, 4, 5, 6])) })], src, W, now);
  assert.ok(up);
  assert.equal(up.summary, '٧ من ٧');
  assert.equal(up.prev, '٣ من ٧');
  assert.equal(up.score, 1);
  assert.equal(up.prevScore, 3 / 7);
  assert.equal(up.trend, 'up');
  assert.equal(up.diff, 4);
  assert.equal(up.phrase, 'بلغت مرحلة جديدة، بارك الله لك');
  assert.equal(up.focus?.[0], 'لا أترك خطوة برنامجي يوماً');

  // Down: all of last week, two steps this week; today's open step is not counted as missed.
  const down = programsSection([run({ checks: ok(...week(W.prevFrom, [0, 1, 2, 3, 4, 5, 6]), ...week(W.from, [0, 1])) })], src, W, now);
  assert.ok(down);
  assert.equal(down.summary, '٢ من ٦', 'the pending 13th is neither done nor due');
  assert.equal(down.prev, '٧ من ٧');
  assert.equal(down.trend, 'down');
  assert.equal(down.phrase, 'أقل من الأسبوع الماضي');
  assert.ok(down.focus?.includes('أثبت على «وردي» حتى أتمّه'));

  // Finished this week (not yet closed by the store): still shown.
  const fin = programsSection(
    [run({ startDay: '2026-11-08', custom: { title: 'ثلاثة أيام', days: 3, unit: 'check', start: 1, end: 1, curve: 'fixed' }, checks: ok('2026-11-08', '2026-11-09', '2026-11-10') })],
    src,
    W,
    now,
  );
  assert.equal(fin?.phrase, 'أتممت «ثلاثة أيام»، تقبّل الله');

  // Hidden: no programs, or only one finished weeks ago.
  assert.equal(programsSection([], src, W, now), null);
  const old = run({ startDay: '2026-10-01', status: 'done', finishedOn: '2026-10-03', custom: { title: 'قديم', days: 3, unit: 'check', start: 1, end: 1, curve: 'fixed' }, checks: ok('2026-10-01', '2026-10-02', '2026-10-03') });
  assert.equal(programsSection([old], src, W, now), null);
}

// ── القضاء ───────────────────────────────────────────────────────────────────
{
  const owed = { fajr: 50, dhuhr: 50, asr: 50, maghrib: 50, isha: 50 };
  const data = (paid: QadaData['paid'], extra: QadaData['debts'] = []): QadaData => ({
    debts: [{ id: 'p', kind: 'prayer', counts: owed, source: 'manual', at: 0 }, ...extra],
    paid,
    dismissed: [],
    settings: { ...DEFAULT_SETTINGS, perDay: 2 },
  });
  /** `n` prayers made up on each listed day (fajr then dhuhr…). */
  const pay = (days: string[], n: number) => Object.fromEntries(days.map((k) => [k, n === 1 ? { fajr: 1 } : { fajr: 1, dhuhr: n - 1 }]));
  const thisWeek = (n: number) => Array.from({ length: n }, (_, i) => shiftKey(W.from, i));
  const lastWeek = (n: number) => Array.from({ length: n }, (_, i) => shiftKey(W.prevFrom, i));

  // Up: 12 of the week's 14 against 6 last week.
  const up = qadaSection(data({ ...pay(thisWeek(6), 2), ...pay(lastWeek(3), 2) }), W);
  assert.ok(up);
  assert.equal(up.summary, '١٢ من ١٤');
  assert.equal(up.prev, '٦ من ١٤');
  assert.equal(up.score, 12 / 14);
  assert.equal(up.trend, 'up');
  assert.equal(up.diff, 6);
  assert.equal(up.phrase, 'بقي من الخطة ٢');
  assert.equal(up.focus?.[0], 'أقضي مع كل فرضٍ فرضاً');
  for (const t of [up.summary, up.phrase, up.prev]) assert.ok(!/٢٥٠|٢٣٨|عليك/.test(t ?? ''), 'discreet: never the size of the debt');

  // Down: the full plan last week, 4 this week.
  const down = qadaSection(data({ ...pay(thisWeek(2), 2), ...pay(lastWeek(7), 2) }), W);
  assert.ok(down);
  assert.equal(down.summary, '٤ من ١٤');
  assert.equal(down.prev, '١٤ من ١٤');
  assert.equal(down.trend, 'down');
  assert.equal(down.prevScore, 1);

  // Fasts join the plan: two owed → the plan's Monday and Thursday of this week.
  const year = lastRamadanYear(dateOf(W.to));
  const withFast = qadaSection(
    data({ ...pay(thisWeek(7), 2), '2026-11-09': { fajr: 1, dhuhr: 1, fast: 1 } }, [{ id: 'f', kind: 'fast', count: 2, reason: 'travel', year, source: 'manual', at: 0 }]),
    W,
  );
  assert.ok(withFast);
  assert.equal(withFast.summary, '١٥ من ١٦');
  assert.equal(withFast.phrase, 'منها صوم يوم واحد، بقي ١');
  assert.ok(withFast.focus?.includes('أصوم يوماً من القضاء هذا الأسبوع'));

  // Everything made up this week.
  const small = { ...data(pay(['2026-11-08'], 2)), debts: [{ id: 'p', kind: 'prayer' as const, counts: { fajr: 1, dhuhr: 1 }, source: 'manual' as const, at: 0 }] };
  assert.equal(qadaSection(small, W)?.phrase, 'أتممت القضاء كله، تقبّل الله');

  // Hidden: nothing owed and nothing paid (or a debt settled before these two weeks).
  assert.equal(qadaSection({ debts: [], paid: {}, dismissed: [], settings: DEFAULT_SETTINGS }, W), null);
  assert.equal(qadaSection({ ...small, paid: { '2026-10-01': { fajr: 1, dhuhr: 1 } } }, W), null);
}

console.log('fridayReviewSections: all checks passed');
