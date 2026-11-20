/**
 * Executable check for «محاسبة الجمعة» (services/fridayReview.ts).
 *   npx esbuild scripts/fridayReview.test.ts --bundle --format=esm --platform=node --alias:@=./src \
 *     --define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"} --loader:.woff=empty --loader:.woff2=empty \
 *     --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/fridayReview.mjs && node .tmp-test/fridayReview.mjs
 */
import assert from 'node:assert/strict';
import {
  REVIEW_POINTS,
  compareWeek,
  dk,
  focusOfWeek,
  fridayReviewAttention,
  fridayReviewPointsOn,
  homeCardState,
  inReviewWindow,
  nextReminderAt,
  noon,
  pickBestWeak,
  pickableOf,
  questionsFor,
  registerReviewSection,
  reviewSections,
  reviewStreak,
  reviewWeek,
  shiftWeek,
  weekById,
  weekOf,
  weeklyTrend,
  type ReviewInput,
} from '@/services/fridayReview';
import { CORE_QUESTIONS, focusSuggestions } from '@/services/fridayReviewContent';
import type { PrayerDayLog } from '@/store/prayerLogStore';

const at = (k: string, h: number, m = 0) => {
  const d = noon(k);
  d.setHours(h, m, 0, 0);
  return d;
};

// ── weeks: Saturday → Friday, id = the Friday ──
const TUE = '2026-11-17';
assert.equal(noon(TUE).getDay(), 2);
const W = weekOf(noon(TUE));
assert.deepEqual([W.from, W.to, W.id, W.days.length], ['2026-11-14', '2026-11-20', '2026-11-20', 7]);
assert.equal(noon(W.from).getDay(), 6);
assert.equal(noon(W.to).getDay(), 5);
assert.equal(weekById('2026-11-20').from, '2026-11-14');
assert.equal(shiftWeek(W, -1).id, '2026-11-13');
assert.equal(shiftWeek(W, 1).id, '2026-11-27');
// Across the DST change of a spring (any TZ): 52 shifts land on Fridays.
let w = W;
for (let i = 0; i < 60; i++) w = shiftWeek(w, -1);
assert.equal(noon(w.id).getDay(), 5);

// The review is about: Saturday → the week that ended; otherwise the running one.
assert.equal(reviewWeek(at('2026-11-21', 10)).id, '2026-11-20');
assert.equal(reviewWeek(at('2026-11-20', 10)).id, '2026-11-20');
assert.equal(reviewWeek(at('2026-11-19', 20)).id, '2026-11-20');
assert.equal(reviewWeek(at('2026-11-15', 9)).id, '2026-11-20');

// Window: Thursday evening → end of Saturday.
assert.equal(inReviewWindow(at('2026-11-19', 17, 59)), false);
assert.equal(inReviewWindow(at('2026-11-19', 18)), true);
assert.equal(inReviewWindow(at('2026-11-20', 1)), true);
assert.equal(inReviewWindow(at('2026-11-21', 23, 59)), true);
assert.equal(inReviewWindow(at('2026-11-22', 0, 1)), false);

// ── domains ──
const full: PrayerDayLog = {
  fajr: { fard: true, mosque: true },
  dhuhr: { fard: true, sunnahBefore: true, sunnahAfter: true },
  asr: { fard: true },
  maghrib: { fard: true, sunnahAfter: true },
  isha: { fard: true, sunnahAfter: true },
};
const three: PrayerDayLog = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true } };

function input(): ReviewInput {
  return {
    gender: 'male',
    prayerLog: {},
    excused: {},
    duha: {},
    qiyam: {},
    events: [],
    dailyProgress: {},
    mushafiDays: {},
    awradHistory: [],
    targets: [],
    sadaqah: [],
    tasks: [],
  };
}

const s = input();
const prevW = shiftWeek(W, -1);
// This week (Sat→Thu): all five, last week three a day.
for (const k of W.days.slice(0, 6)) s.prayerLog[k] = full;
for (const k of prevW.days) s.prayerLog[k] = three;
// Morning adhkar 4 days this week, 1 last week; evening never.
for (const k of W.days.slice(0, 4)) s.events.push({ dateKey: k, domain: 'dhikr', refId: 'morning' });
s.events.push({ dateKey: prevW.days[0], domain: 'dhikr', refId: 'morning' });
// Qiyam: 2 nights last week, none this week.
s.qiyam[prevW.days[1]] = { rakaat: 2 };
s.qiyam[prevW.days[3]] = { rakaat: 4 };
// Qur'an pages in مصحفي.
s.mushafiDays[W.days[0]] = [1, 2, 3];
s.mushafiDays[W.days[2]] = [4, 5];
s.mushafiDays[prevW.days[0]] = [10];
// Awrad: last week 2/3 closed periods; this week 1 closed done + a running daily one complete.
s.awradHistory.push(
  { endedAt: at(prevW.days[0], 23, 59).getTime(), completed: true },
  { endedAt: at(prevW.days[1], 23, 59).getTime(), completed: true },
  { endedAt: at(prevW.days[2], 23, 59).getTime(), completed: false },
  { endedAt: at(W.days[0], 23, 59).getTime(), completed: true },
);
s.targets.push({ recurrence: 'daily', deadline: at(W.days[5], 23, 59).getTime(), current: 100, total: 100 });
s.sadaqah.push({ date: W.days[1] });

const thu = at(W.days[5], 19); // Thursday 19:00
const c = compareWeek(s, W, thu);
assert.equal(c.elapsed, 6);
assert.equal(c.partial, true);
assert.deepEqual(c.prevDays, prevW.days.slice(0, 6));
const row = (id: string) => c.rows.find((r) => r.id === id)!;

assert.equal(row('fard').now.value, 30);
assert.equal(row('fard').now.max, 30);
assert.equal(row('fard').prev.value, 18);
assert.equal(row('fard').trend, 'up');
assert.equal(row('fard').phrase, 'تامّة، تقبّل الله');
assert.equal(row('jamaah').now.value, 6);
// Rawatib: 4+2+2+2 = 10 of 12 a day (Friday not in the 6 days).
assert.equal(row('rawatib').now.value, 60);
assert.equal(row('rawatib').now.max, 72);
assert.equal(row('adhkar').now.value, 4);
assert.equal(row('adhkar').now.text, 'صباحاً ٤ · مساءً ٠');
assert.equal(row('adhkar').trend, 'up');
assert.equal(row('qiyam').now.value, 0);
assert.equal(row('qiyam').trend, 'down');
assert.equal(row('qiyam').phrase, 'غاب هذا الأسبوع');
assert.equal(row('qiyam').tracked, true);
assert.equal(row('quran').now.value, 5);
assert.equal(row('quran').now.text, '٥ صفحات');
assert.equal(row('quran').now.score, 2 / 6);
assert.equal(row('awrad').now.value, 2);
assert.equal(row('awrad').now.max, 2);
assert.equal(row('awrad').prev.value, 2);
assert.equal(row('awrad').prev.max, 3);
assert.equal(row('awrad').trend, 'up'); // 100% vs 67%
assert.equal(row('sadaqah').now.value, 1);
assert.equal(row('sadaqah').phrase, 'بداية طيبة هذا الأسبوع');
// Never done → not tracked, and never «ما أستدركه».
assert.equal(row('fasting').tracked, false);
assert.equal(row('tasks').tracked, false);
assert.equal(row('duha').tracked, false);
assert.equal(row('duha').phrase, 'لم يُسجَّل شيء بعد');

const picks = c.rows.map(pickableOf).filter((p): p is NonNullable<typeof p> => !!p);
assert.ok(!picks.some((p) => p.id === 'fasting'));
const { best, weak } = pickBestWeak(picks);
// fard, awrad, sadaqah all 1 → the most improved first: sadaqah (0 → 1).
assert.equal(best?.id, 'sadaqah');
assert.equal(weak?.id, 'qiyam'); // 0, and dropped
assert.ok(c.score != null && c.score > 0 && c.score < 100);
assert.ok(c.prevScore != null && c.prevScore < c.score!);
assert.equal(pickBestWeak([{ id: 'a', label: 'a', score: 1, prevScore: 1 }, { id: 'b', label: 'b', score: 1, prevScore: 0 }]).weak, null);
assert.equal(pickBestWeak([{ id: 'a', label: 'a', score: 0, prevScore: 0 }]).best, null);

// Excused days leave the denominators.
const e = input();
e.gender = 'female';
for (const k of W.days) e.prayerLog[k] = { fajr: { fard: true, onTime: true } };
e.excused[W.days[0]] = true;
e.excused[W.days[1]] = true;
const ce = compareWeek(e, W, at(W.to, 22));
assert.equal(ce.partial, true); // Friday is still running
assert.equal(ce.rows.find((r) => r.id === 'fard')!.now.max, 25);
assert.equal(ce.rows.find((r) => r.id === 'jamaah')!.label, 'الصلاة على وقتها');
assert.equal(compareWeek(e, W, at('2026-11-21', 9)).partial, false);

// Trend: 12 weeks, oldest first, the running week last.
const t = weeklyTrend(s, thu);
assert.equal(t.length, 12);
assert.equal(t[11].week.id, W.id);
assert.equal(t[10].week.id, prevW.id);
assert.equal(t[11].score, c.score);
assert.equal(t[0].score, null);

// ── questions ──
const q1 = questionsFor('2026-11-20', null, []);
const q2 = questionsFor('2026-11-27', null, []);
assert.equal(q1.length, CORE_QUESTIONS.length + 1);
assert.deepEqual(q1.slice(0, 5).map((q) => q.id), q2.slice(0, 5).map((q) => q.id));
assert.notEqual(q1[5].id, q2[5].id);
const mine = questionsFor('2026-11-20', ['heart'], [{ id: 'x', text: 'سؤالي' }]);
assert.deepEqual(mine.map((q) => q.id), ['heart', 'x']);
assert.ok(questionsFor('2025-01-03', null, []).every(Boolean)); // weeks before the epoch rotate too

// ── streak ──
const done = (id: string) => [id, { doneAt: at(id, 20).getTime() }] as const;
const reviews = Object.fromEntries([done('2026-10-30'), done('2026-11-06'), done('2026-11-13')]);
assert.deepEqual(reviewStreak(reviews, at('2026-11-17', 9)), { current: 3, longest: 3, total: 3 });
// Saturday, last week not reviewed yet → the chain still stands.
assert.equal(reviewStreak(reviews, at('2026-11-21', 9)).current, 3);
// …and is broken once that window closed.
assert.equal(reviewStreak(reviews, at('2026-11-22', 9)).current, 0);
assert.equal(reviewStreak({ ...reviews, '2026-11-20': { doneAt: 1 } }, at('2026-11-21', 9)).current, 4);
assert.deepEqual(reviewStreak({ ...Object.fromEntries([done('2026-10-02')]), ...reviews }, at('2026-11-17', 9)), { current: 3, longest: 3, total: 4 });

// ── focus: chosen in week W's review, it is the goal of W+1 ──
const withFocus = { '2026-11-13': { focus: { text: 'أوتر كل ليلة', domain: 'qiyam' } } };
assert.equal(focusOfWeek(withFocus, at('2026-11-17', 9))?.text, 'أوتر كل ليلة');
assert.equal(focusOfWeek(withFocus, at('2026-11-14', 9))?.text, 'أوتر كل ليلة'); // Saturday = the new week
assert.equal(focusOfWeek(withFocus, at('2026-11-13', 9)), null);
assert.equal(focusSuggestions('qiyam', true).length, 3);
assert.notDeepEqual(focusSuggestions('jamaah', true), focusSuggestions('jamaah', false));
assert.ok(focusSuggestions(null, true).length > 0);

// ── reminder ──
const asr = (d: Date) => {
  const x = new Date(d);
  x.setHours(15, 0, 0, 0);
  return x;
};
const r = { on: true, day: 5, at: 'asr' };
assert.equal(nextReminderAt(r, at('2026-11-17', 9), asr).getTime(), at('2026-11-20', 15, 30).getTime());
assert.equal(nextReminderAt(r, at('2026-11-20', 15, 10), asr).getTime(), at('2026-11-20', 15, 30).getTime());
assert.equal(nextReminderAt(r, at('2026-11-20', 15, 31), asr).getTime(), at('2026-11-27', 15, 30).getTime());
assert.equal(nextReminderAt(r, at('2026-11-17', 9), () => null).getTime(), at('2026-11-20', 16, 30).getTime());
assert.equal(nextReminderAt({ on: true, day: 4, at: '21:15' }, at('2026-11-17', 9), asr).getTime(), at('2026-11-19', 21, 15).getTime());

// ── leaderboard bonus + Home ──
const st = { reviews: { '2026-11-20': { doneAt: at('2026-11-21', 8).getTime() } } };
assert.equal(fridayReviewPointsOn(st, '2026-11-21'), REVIEW_POINTS);
assert.equal(fridayReviewPointsOn(st, '2026-11-20'), 0);
assert.equal(fridayReviewPointsOn({ reviews: {} }, '2026-11-21'), 0);

const open = fridayReviewAttention({ reviews: {} }, at('2026-11-20', 10));
assert.equal(open?.level, 'suggest');
assert.equal(open?.icon, 'friday');
assert.equal(open?.to, '/friday-review');
const last = fridayReviewAttention({ reviews: {} }, at('2026-11-21', 10));
assert.equal(last?.level, 'closing');
assert.equal(last?.deadline?.getTime(), at('2026-11-22', 0).getTime() - 1);
assert.equal(fridayReviewAttention(st, at('2026-11-21', 10)), null);
assert.equal(fridayReviewAttention({ reviews: {} }, at('2026-11-22', 10)), null);

assert.deepEqual(homeCardState({ reviews: {} }, at('2026-11-19', 20)), { kind: 'ready', week: W });
assert.equal(homeCardState(st, at('2026-11-21', 9))?.kind, 'done');
assert.equal(homeCardState({ reviews: {} }, at('2026-11-17', 9)), null);
assert.deepEqual(homeCardState({ reviews: withFocus }, at('2026-11-17', 9)), { kind: 'focus', focus: withFocus['2026-11-13'].focus });

// ── plug-in sections ──
registerReviewSection({ id: 'silat', title: 'صلة الرحم', compute: () => ({ summary: 'زيارتان' }) });
registerReviewSection({ id: 'silat', title: 'صلة الرحم', compute: () => ({ summary: '٣ زيارات' }) });
assert.equal(reviewSections().length, 1);
assert.equal(reviewSections()[0].compute({ from: W.from, to: W.to, prevFrom: prevW.from, prevTo: prevW.to })?.summary, '٣ زيارات');

assert.equal(dk(noon('2026-03-29')), '2026-03-29');
console.log('fridayReview: ok');
