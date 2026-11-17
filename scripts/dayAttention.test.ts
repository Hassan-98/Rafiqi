// npx esbuild scripts/dayAttention.test.ts --bundle --format=esm --platform=node --alias:@=./src --outfile=.tmp-test/attention.test.mjs && node .tmp-test/attention.test.mjs
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { dayAttention, habitRates, type AttentionInput, type DayTimes } from '@/services/dayAttention';
import { planCompanion, type CompanionInput } from '@/services/smartCompanion';
import { SMART_DEFAULTS } from '@/store/notificationStore';

const SUNDAY = new Date(2026, 10, 8, 12, 0);
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const hm = (day: Date, h: number, m = 0) => {
  const t = new Date(day);
  t.setHours(h, m, 0, 0);
  return t;
};
const times = (day: Date): DayTimes => ({
  fajr: hm(day, 4, 40),
  sunrise: hm(day, 6, 5),
  dhuhr: hm(day, 11, 45),
  asr: hm(day, 14, 50),
  maghrib: hm(day, 17, 15),
  isha: hm(day, 18, 35),
});
const ev = (k: string, h: number, domain: string, refId: string) => ({ ts: new Date(`${k}T${String(h).padStart(2, '0')}:00:00`).getTime(), dateKey: k, domain, refId, title: '', amount: 1 });
const all5 = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };

/** A prayer-logging user, 30 days in, with every prayer logged until yesterday. */
function at(h: number, m = 0, day = SUNDAY): AttentionInput {
  const now = hm(day, h, m);
  const prayerLog: NonNullable<AttentionInput['snap']['prayerLog']> = {};
  for (let n = 1; n <= 30; n++) prayerLog[key(addDays(now, -n))] = { ...all5 };
  return { snap: { dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, prayerLog, activity: [] }, now, times: times(now) };
}
const ids = (i: AttentionInput) => dayAttention(i).map((x) => x.id);
const find = (i: AttentionInput, id: string) => dayAttention(i).find((x) => x.id === id);

// A fard whose time is over and isn't logged → «missed», with one-tap logging; non-loggers hear nothing.
{
  const i = at(15, 30);
  i.snap.prayerLog![key(i.now)] = { fajr: { fard: true } };
  const m = find(i, 'missed.today.dhuhr');
  assert.ok(m, ids(i).join());
  assert.equal(m!.level, 'missed');
  assert.deepEqual(m!.action, { kind: 'prayers', dateKey: key(i.now), prayers: ['dhuhr'] });
  i.snap.prayerLog = {};
  assert.ok(!ids(i).some((x) => x.startsWith('missed') || x.startsWith('closing.prayer')), 'not a logger');
  const ex = at(15, 30);
  ex.snap.excused = { [key(ex.now)]: true };
  ex.snap.prayerLog![key(ex.now)] = { fajr: { fard: true } };
  assert.ok(!ids(ex).some((x) => x.startsWith('missed.today')), 'excused day');
}
// The running prayer in its last 40 minutes → «closing», counted down to its end.
{
  const i = at(16, 50);
  i.snap.prayerLog![key(i.now)] = { fajr: { fard: true }, dhuhr: { fard: true } };
  const c = find(i, 'closing.prayer.asr');
  assert.ok(c);
  assert.equal(c!.deadline!.getTime(), hm(i.now, 17, 15).getTime());
  assert.ok(c!.body.includes('تصفرّ'), c!.body);
  assert.ok(!find(at(15, 30), 'closing.prayer.asr'), 'too early to warn');
  // missed comes first.
  assert.equal(dayAttention(at(16, 50))[0].level, 'missed');
}
// Yesterday's unlogged prayers until Dhuhr; last night's Isha is "closing" until Fajr.
{
  const i = at(9);
  delete i.snap.prayerLog![key(addDays(i.now, -1))]!.asr;
  assert.deepEqual(find(i, 'missed.yesterday.asr')?.action, { kind: 'prayers', dateKey: key(addDays(i.now, -1)), prayers: ['asr'] });
  const late = at(12);
  delete late.snap.prayerLog![key(addDays(late.now, -1))]!.asr;
  assert.ok(!ids(late).some((x) => x.startsWith('missed.yesterday')), 'gone at Dhuhr');
  const night = at(3);
  delete night.snap.prayerLog![key(addDays(night.now, -1))]!.isha;
  assert.ok(find(night, 'closing.prayer.isha-night'));
  assert.ok(!ids(night).some((x) => x.startsWith('missed.yesterday')), 'Isha is still in its time');
}
// A seldom sunnah while its time is open → ONE suggestion; muted or hidden makes way for the next.
{
  const i = at(9);
  i.snap.prayerLog![key(i.now)] = { fajr: { fard: true } };
  const s = dayAttention(i).filter((x) => x.level === 'suggest');
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'suggest.duha');
  assert.deepEqual(s[0].action, { kind: 'duha', dateKey: key(i.now) });
  i.muted = ['duha'];
  assert.ok(!ids(i).includes('suggest.duha'));
  assert.equal(dayAttention(i).filter((x) => x.level === 'suggest').length, 1, 'the next one steps in');
  i.muted = [];
  i.hidden = ['suggest.duha'];
  assert.ok(!ids(i).includes('suggest.duha'));
}
// A habit (الضحى most days) is chased when closing, never "suggested".
{
  const i = at(11, 10);
  i.snap.duha = Object.fromEntries(Array.from({ length: 20 }, (_, n) => [key(addDays(i.now, -(n + 1))), 2]));
  assert.ok(find(i, 'closing.duha'));
  assert.ok(!ids(i).includes('suggest.duha'));
  assert.ok(!find(at(9), 'closing.duha'), 'no habit, no chase');
  i.snap.duha[key(i.now)] = 2;
  assert.ok(!find(i, 'closing.duha'), 'done today');
}
// Friday's own sunnah outranks the habits; tomorrow's fast shows after Asr.
{
  const fri = new Date(2026, 10, 13, 12, 0);
  const i = at(16, 30, fri);
  assert.equal(dayAttention(i).find((x) => x.level === 'suggest')?.id, 'suggest.fridayHour');
  const k = at(9, 0, fri);
  assert.equal(dayAttention(k).find((x) => x.level === 'suggest')?.id, 'suggest.kahf');
  k.pagesToday = [293, 294];
  assert.notEqual(dayAttention(k).find((x) => x.level === 'suggest')?.id, 'suggest.kahf', 'read already');
  const sun = at(20); // Sunday evening → Monday
  assert.ok(find(sun, 'suggest.fasting')?.title.includes('الإثنين'));
}
// Rates: a newcomer is judged over a week at least; the mosque share waits for ten fard.
{
  const i = at(9);
  i.snap.prayerLog = { [key(addDays(i.now, -1))]: { fajr: { fard: true, sunnahBefore: true } } };
  const r = habitRates(i.snap, i.now, true);
  assert.equal(r.fajrSunnah, 1 / 7);
  assert.equal(r.mosque, undefined);
  const full = at(9);
  full.snap.prayerLog![key(addDays(full.now, -1))] = { ...all5, fajr: { fard: true, mosque: true } };
  assert.equal(habitRates(full.snap, full.now, true).mosque, 1 / 150);
  assert.equal(habitRates(full.snap, full.now, false).mosque, undefined);
}

// ── the companion: «آخر الوقت» and the daily suggestion ──
function companion(now = hm(SUNDAY, 14, 0)): CompanionInput {
  const prayerLog: NonNullable<CompanionInput['snap']['prayerLog']> = {};
  for (let n = 1; n <= 7; n++) prayerLog[key(addDays(now, -n))] = { ...all5 };
  prayerLog[key(now)] = { fajr: { fard: true }, dhuhr: { fard: true } };
  return { snap: { dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, prayerLog, activity: [] }, now, prefs: { ...SMART_DEFAULTS }, times };
}
{
  const plan = planCompanion(companion());
  const late = plan.find((n) => n.id === 'myzikr_smart_late_asr');
  assert.ok(late, plan.map((n) => n.id).join());
  assert.equal(format(late!.at, 'HH:mm'), '16:40');
  assert.equal(late!.moduleId, 'prayers');
  assert.deepEqual([late!.meta?.prayer, late!.meta?.kind], ['asr', 'late']);
  assert.ok(late!.title.includes('المغرب'), late!.title);
  assert.ok(!plan.some((n) => n.id === 'myzikr_smart_late_dhuhr'), 'dhuhr logged');
  assert.ok(!plan.some((n) => n.id.startsWith('myzikr_smart_late_isha')), 'isha has no last call');
  const off = companion();
  off.prefs.lateCalls = false;
  assert.ok(!planCompanion(off).some((n) => n.kind === 'late'));
}
{
  const i = companion();
  const sug = planCompanion(i).filter((n) => n.kind === 'suggest');
  assert.ok(sug.length >= 1 && new Set(sug.map((n) => n.at.toDateString())).size === sug.length, 'at most one a day');
  const fri = companion(hm(new Date(2026, 10, 13), 7, 0));
  assert.equal(planCompanion(fri).find((n) => n.id === 'myzikr_smart_suggest')?.title, 'سورة الكهف');
  // Asr logged and the evening adhkar said: nothing crowds the last hour.
  fri.snap.prayerLog![key(fri.now)]!.asr = { fard: true };
  fri.snap.activity = [ev(key(fri.now), 6, 'dhikr', 'evening')];
  fri.kahfRead = true;
  assert.equal(planCompanion(fri).find((n) => n.id === 'myzikr_smart_suggest')?.title, 'ساعة الإجابة');
  fri.muted = ['fridayHour'];
  assert.notEqual(planCompanion(fri).find((n) => n.id === 'myzikr_smart_suggest')?.title, 'ساعة الإجابة');
  const off = companion();
  off.prefs.suggestions = false;
  assert.ok(!planCompanion(off).some((n) => n.kind === 'suggest'));
}

// Her everyday chores (owner 2026-11-16): from 2 pm until logged, a woman only (the caller passes `house`).
{
  const i = at(15, 0);
  const k = key(i.now);
  i.house = [{ chore: 'cook', day: k }, { chore: 'dishes', day: key(addDays(i.now, -1)) }];
  assert.deepEqual(find(i, 'house.today')?.action, { kind: 'chores', chores: ['dishes', 'clean'] });
  assert.ok(!find(at(15, 0), 'house.today'), 'no log passed: not a woman');
  assert.ok(!find({ ...at(13, 0), house: [] }, 'house.today'), 'too early');
  assert.ok(!find({ ...i, muted: ['house'] }, 'house.today'), 'muted');
  assert.ok(!find({ ...i, house: ['cook', 'dishes', 'clean'].map((chore) => ({ chore, day: k })) }, 'house.today'), 'all logged');
}

console.log('dayAttention: ok');
