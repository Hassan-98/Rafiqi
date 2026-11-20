// sh: npx esbuild scripts/dayAttention.test.ts --bundle --format=esm --platform=node --alias:@=./src '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}' --loader:.woff=empty --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/dayAttention.mjs && node .tmp-test/dayAttention.mjs
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { dayAttention, habitRates, presentAttention, scoreOf, type AttentionInput, type AttentionItem, type DayTimes } from '@/services/dayAttention';
import { planCompanion, type CompanionInput } from '@/services/smartCompanion';
import { fastReason, seasonNotice } from '@/services/attention/occasions';
import { DAILY_CHORES, houseAttention } from '@/services/attention/house';
import { choreOf } from '@/data/houseChores';
import { registerAttentionSource } from '@/services/attention/registry';
import { fromHijri } from '@/services/HijriService';
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
}
// v2 ranking: what can still be prayed on time is «الآن»; logging the missed ones follows.
{
  const list = dayAttention(at(16, 50));
  assert.equal(list[0].id, 'closing.prayer.asr', list.map((x) => `${x.id}:${x.score}`).join());
  const view = presentAttention(list);
  assert.equal(view.focus?.id, 'closing.prayer.asr');
  assert.ok(view.today.some((x) => x.level === 'missed'));
  // «لماذا؟»: the streak at stake and the time left, in words.
  assert.equal(view.focus!.why, 'سلسلتك ٣٠ يوماً، وبقي ٢٥ دقيقة');
  assert.ok(list.every((x) => typeof x.score === 'number'));
  // A missed fard still outranks a habit running out.
  const k = at(11, 0);
  delete k.snap.prayerLog![key(addDays(k.now, -1))]!.asr;
  k.snap.activity = Array.from({ length: 25 }, (_, n) => ev(key(addDays(k.now, -(n + 1))), 6, 'dhikr', 'morning'));
  const order = dayAttention(k).map((x) => x.id);
  assert.ok(order.indexOf('missed.yesterday.asr') < order.indexOf('adhkar.morning'), order.join());
  assert.equal(find(k, 'adhkar.morning')!.level, 'closing', 'the last stretch before Dhuhr');
  assert.ok(find(k, 'adhkar.morning')!.why!.includes('سلسلتك ٢٥ يوماً'), find(k, 'adhkar.morning')!.why);
}
// Score parts: fard > sunnah > extra; urgency rises as the deadline nears; prep sits lowest.
{
  const now = hm(SUNDAY, 12);
  const item = (o: Partial<AttentionItem>): AttentionItem => ({ id: 'x', level: 'closing', icon: 'task', kicker: '', title: '', body: '', to: '/', ...o });
  assert.ok(scoreOf(item({ weight: 'fard' }), now) > scoreOf(item({ weight: 'sunnah' }), now));
  assert.ok(scoreOf(item({ weight: 'sunnah' }), now) > scoreOf(item({}), now), 'a source without a weight is an extra');
  const near = item({ deadline: new Date(now.getTime() + 20 * 60_000) });
  const far = item({ deadline: new Date(now.getTime() + 5 * 3_600_000) });
  assert.ok(scoreOf(near, now) > scoreOf(far, now));
  assert.ok(scoreOf(item({ level: 'prep', weight: 'sunnah' }), now) < scoreOf(item({ level: 'suggest', weight: 'sunnah' }), now));
  assert.equal(scoreOf(item({ score: 7 }), now), 7, 'a source may set its own score');
  assert.equal(presentAttention([item({ level: 'prep' })]).focus, undefined, 'tomorrow is never «الآن»');
}
// A weekday on which a prayer is usually missed: its closing call comes earlier, and says why.
{
  const now = hm(SUNDAY, 16, 15); // 60 min before Maghrib
  const prayerLog: NonNullable<AttentionInput['snap']['prayerLog']> = {};
  for (let n = 1; n <= 56; n++) {
    const d = addDays(now, -n);
    prayerLog[key(d)] = d.getDay() === 0 ? { fajr: { fard: true }, dhuhr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } } : { ...all5 };
  }
  prayerLog[key(now)] = { fajr: { fard: true }, dhuhr: { fard: true } };
  const i: AttentionInput = { snap: { dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, prayerLog, activity: [] }, now, times: times(now) };
  const c = find(i, 'closing.prayer.asr');
  assert.ok(c, ids(i).join());
  assert.ok(c!.why!.startsWith('لأنها قد تفوتك يوم الأحد'), c!.why);
  const mon = at(16, 15, new Date(2026, 10, 9, 12));
  mon.snap.prayerLog![key(mon.now)] = { fajr: { fard: true }, dhuhr: { fard: true } };
  assert.ok(!find(mon, 'closing.prayer.asr'), 'other weekdays keep the 40 minutes');
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
  const s = dayAttention(i).filter((x) => x.id.startsWith('suggest.'));
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'suggest.duha');
  assert.deepEqual(s[0].action, { kind: 'duha', dateKey: key(i.now) });
  assert.ok(s[0].why!.startsWith('لأنها تغيب عنك مؤخراً، ووقتها مفتوح الآن'), s[0].why);
  i.muted = ['duha'];
  assert.ok(!ids(i).includes('suggest.duha'));
  assert.equal(dayAttention(i).filter((x) => x.id.startsWith('suggest.')).length, 0, 'nothing else seldom is open at 9:00 (morning adhkar are their own item now)');
  assert.ok(find(i, 'adhkar.morning'), 'morning adhkar stay either way');
  i.muted = [];
  i.hidden = ['suggest.duha'];
  assert.ok(!ids(i).includes('suggest.duha'));
}
// A habit (الضحى most days) is chased when closing, never "suggested".
{
  const i = at(11, 10);
  i.snap.duha = Object.fromEntries(Array.from({ length: 20 }, (_, n) => [key(addDays(i.now, -(n + 1))), 2]));
  assert.ok(find(i, 'closing.duha'));
  assert.equal(find(i, 'closing.duha')!.streak, 20);
  assert.ok(!ids(i).includes('suggest.duha'));
  assert.ok(!find(at(9), 'closing.duha'), 'no habit, no chase');
  i.snap.duha[key(i.now)] = 2;
  assert.ok(!find(i, 'closing.duha'), 'done today');
}
// Friday's own sunnah outranks the habits; الكهف opens with Thursday's Maghrib.
{
  const fri = new Date(2026, 10, 13, 12, 0);
  const i = at(16, 30, fri);
  assert.equal(dayAttention(i).find((x) => x.id.startsWith('suggest.'))?.id, 'suggest.fridayHour');
  const k = at(9, 0, fri);
  assert.equal(dayAttention(k).find((x) => x.id.startsWith('suggest.'))?.id, 'suggest.kahf');
  k.pagesToday = [293, 294];
  assert.notEqual(dayAttention(k).find((x) => x.id.startsWith('suggest.'))?.id, 'suggest.kahf', 'read already');
  const thu = at(18, 0, new Date(2026, 10, 12, 12));
  const eve = find(thu, 'suggest.kahf');
  assert.equal(eve?.kicker, 'ليلة الجمعة');
  assert.ok(eve!.body.includes('ليلة الجمعة'), eve!.body);
  assert.ok(!find(at(16, 0, new Date(2026, 10, 12, 12)), 'suggest.kahf'), 'Thursday before Maghrib');
}
// Tomorrow's fast → «استعدّ للغد» after Asr, with «سأصومه»; the intent then wakes the suhoor item.
{
  const sun = at(20); // Sunday evening → Monday
  const monday = key(addDays(sun.now, 1));
  const p = find(sun, `prep.fast.${monday}`);
  assert.ok(p && p.title.includes('الإثنين'), p?.title);
  assert.equal(p!.level, 'prep');
  assert.deepEqual(p!.action, { kind: 'intent', dateKey: monday });
  assert.ok(presentAttention(dayAttention(sun)).tomorrow.some((x) => x.id === p!.id));
  assert.ok(!find(at(13), `prep.fast.${monday}`), 'before Asr');
  assert.ok(!find({ ...sun, muted: ['fasting'] }, `prep.fast.${monday}`), 'muted');
  const ex = at(20);
  ex.snap.excused = { [key(ex.now)]: true };
  assert.ok(!find(ex, `prep.fast.${monday}`), 'excused');
  const sure = find({ ...sun, fastIntent: monday }, `prep.fast.${monday}`);
  assert.equal(sure?.action, undefined);
  assert.ok(sure!.kicker.includes('نويتَ'));
  // The fast day before dawn.
  const dawn = at(3, 40, new Date(2026, 10, 9, 12));
  assert.ok(!find(dawn, 'closing.suhoor'), 'no intent, no fasting habit');
  const s = find({ ...dawn, fastIntent: monday }, 'closing.suhoor');
  assert.ok(s, ids({ ...dawn, fastIntent: monday }).join());
  assert.equal(s!.deadline!.getTime(), hm(dawn.now, 4, 40).getTime());
}
// Fast reasons (Umm al-Qura): Arafah and Ashura are major; the Eids, Tashreeq and Ramadan are not voluntary fasts.
{
  const h = (m: number, d: number) => fromHijri({ year: 1448, month: m, day: d });
  assert.equal(fastReason(h(12, 9))?.id, 'arafah');
  assert.equal(fastReason(h(12, 9))?.major, true);
  assert.equal(fastReason(h(1, 10))?.id, 'ashura');
  assert.equal(fastReason(h(1, 9))?.id, 'tasua');
  assert.equal(fastReason(h(12, 3))?.id, 'dhul_hijjah_ten');
  assert.equal(fastReason(h(12, 10)), null, 'Eid');
  assert.equal(fastReason(h(12, 12)), null, 'Tashreeq');
  assert.equal(fastReason(h(9, 5)), null, 'Ramadan');
  assert.equal(fastReason(h(10, 1)), null, 'Eid al-Fitr');
  assert.equal(fastReason(h(10, 4))?.id, 'shawwal_six');
  assert.notEqual(fastReason(h(10, 4), 0, true)?.id, 'shawwal_six', 'six already fasted');
  assert.equal(fastReason(h(4, 14))?.id, 'white_days');
}
// Seasons ahead: Ramadan's countdown, the last ten, the ten of Dhul-Hijjah.
{
  const r = fromHijri({ year: 1448, month: 9, day: 1 });
  assert.equal(seasonNotice(addDays(r, -10))?.title, 'رمضان بعد ١٠ أيام');
  assert.equal(seasonNotice(addDays(r, -30))?.id, 'season.ramadan.1448');
  assert.equal(seasonNotice(addDays(r, -25)), null, 'between the milestones');
  assert.ok(seasonNotice(addDays(r, -1))!.body.includes('الهلال'));
  assert.equal(seasonNotice(fromHijri({ year: 1448, month: 9, day: 20 }))?.title, 'الليلة أولى ليالي العشر الأواخر');
  assert.equal(seasonNotice(fromHijri({ year: 1448, month: 9, day: 18 }))?.title, 'العشر الأواخر بعد ٣ أيام');
  const dh = fromHijri({ year: 1448, month: 12, day: 1 });
  assert.equal(seasonNotice(addDays(dh, -3))?.title, 'العشر من ذي الحجة بعد ٣ أيام');
  assert.ok(seasonNotice(addDays(dh, -1))!.body.includes('يضحّي'));
  // On Home: a «استعدّ» item, muted with «seasons».
  const i = at(10, 0, addDays(r, -10));
  const s = find(i, 'season.ramadan.1448');
  assert.equal(s?.level, 'prep');
  assert.ok(!find({ ...i, muted: ['seasons'] }, 'season.ramadan.1448'));
}
// Registered sources join the list, ranked and explained; muted / failing ones stay out.
{
  const offs = [
    registerAttentionSource({
      id: 'test-silat',
      collect: (ctx) => [
        {
          id: 'silat.call',
          level: 'closing',
          weight: 'sunnah',
          icon: 'people',
          kicker: 'صلة الرحم',
          title: 'اتصل بخالتك',
          body: '«من أحبّ أن يُبسط له في رزقه… فليصل رحمه»',
          to: '/silat',
          deadline: new Date(ctx.now.getTime() + 20 * 60_000),
          habit: 'silat',
          why: 'لأنك نويت أن تصلها كل أسبوع',
        },
      ],
    }),
    registerAttentionSource({
      id: 'test-boom',
      collect: () => {
        throw new Error('boom');
      },
    }),
  ];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const i = at(13);
    const s = find(i, 'silat.call');
    assert.ok(s, ids(i).join());
    assert.equal(s!.why, 'لأنك نويت أن تصلها كل أسبوع، وبقي ٢٠ دقيقة');
    assert.ok(!find({ ...i, muted: ['silat'] }, 'silat.call'));
    assert.ok(!find({ ...i, hidden: ['silat.call'] }, 'silat.call'));
  } finally {
    console.warn = warn;
    offs.forEach((f) => f());
  }
  assert.ok(!find(at(13), 'silat.call'), 'unregistered');
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
  assert.ok(late!.body.includes('سلسلة العصر'), `the streak's last safe moment: ${late!.body}`);
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

// Her everyday chores (owner 2026-11-16): from 2 pm until logged — a source that only women get (plugins.ts).
{
  const now = hm(SUNDAY, 15);
  const k = key(now);
  const entries = [
    { chore: 'cook', day: k },
    { chore: 'dishes', day: key(addDays(now, -1)) },
  ];
  assert.deepEqual(houseAttention(entries, now)[0]?.action, { kind: 'chores', chores: ['dishes', 'tidy'] });
  assert.equal(houseAttention(entries, now)[0]?.habit, 'house');
  assert.deepEqual(houseAttention([], hm(SUNDAY, 13)), [], 'too early');
  assert.deepEqual(houseAttention(DAILY_CHORES.map((chore) => ({ chore, day: k })), now), [], 'all logged');
  // Home's chips open each one's levels: every daily chore is a live, levelled one.
  assert.ok(DAILY_CHORES.every((id) => !choreOf(id)?.retired && (choreOf(id)?.kinds?.length ?? 0) >= 2));
}

console.log('dayAttention: ok');

// Morning / evening adhkar: on Home for everyone through their time until read (owner 2026-11-18).
{
  const early = at(7);
  assert.equal(find(early, 'adhkar.morning')?.level, 'suggest', 'after Fajr: «وقتها الآن»');
  early.snap.activity = [ev(key(early.now), 6, 'dhikr', 'morning')];
  assert.ok(!find(early, 'adhkar.morning'), 'read → gone');
  assert.ok(!find(at(13), 'adhkar.morning'), 'not after Dhuhr');
  assert.equal(find(at(15), 'adhkar.evening')?.level, 'suggest', 'from Asr');
  assert.ok(!find(at(14), 'adhkar.evening'), 'not before Asr');
  assert.ok(find(at(17, 50), 'adhkar.evening'), 'after Maghrib, until Isha');
}
