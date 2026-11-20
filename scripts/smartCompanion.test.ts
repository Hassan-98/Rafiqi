// npx esbuild scripts/smartCompanion.test.ts --bundle --format=esm --platform=node --alias:@=./src --outfile=.tmp-test/companion.test.mjs && node .tmp-test/companion.test.mjs
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { planCompanion, usualMinute, COMPANION_DAILY_CAP, type CompanionInput, type DayTimes } from '@/services/smartCompanion';
import { SMART_DEFAULTS } from '@/store/notificationStore';

const NOW = new Date(2026, 10, 8, 14, 0); // Sunday 14:00, after Dhuhr, before Asr
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const ago = (n: number) => key(addDays(NOW, -n));
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
const ev = (k: string, h: number, m: number, domain: string, refId?: string) => ({
  ts: new Date(`${k}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime(),
  dateKey: k,
  domain,
  refId,
  title: '',
  amount: 1,
});

function base(): CompanionInput {
  const prayerLog: NonNullable<CompanionInput['snap']['prayerLog']> = {};
  for (let n = 1; n <= 7; n++) {
    prayerLog[ago(n)] = { fajr: { fard: true }, dhuhr: { fard: true, adhkar: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };
  }
  prayerLog[key(NOW)] = { fajr: { fard: true } };
  return {
    snap: { dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, prayerLog, activity: [] },
    now: NOW,
    prefs: { ...SMART_DEFAULTS },
    times,
  };
}
const ids = (i: CompanionInput) => planCompanion(i).map((n) => n.id);

// «هل صلّيت الظهر؟» — not logged, its time running: half an hour from now, with «صلّيت».
{
  const plan = planCompanion(base());
  const dhuhr = plan.find((n) => n.id === 'myzikr_smart_pray_dhuhr');
  assert.ok(dhuhr, 'dhuhr check planned');
  assert.equal(dhuhr!.at.getTime(), NOW.getTime() + 30 * 60_000);
  assert.equal(dhuhr!.moduleId, 'prayers');
  assert.equal(dhuhr!.meta?.prayer, 'dhuhr');
  assert.ok(dhuhr!.body.includes('سلسلة الظهر'), dhuhr!.body);
  assert.ok(!plan.some((n) => n.id === 'myzikr_smart_pray_fajr'), 'fajr already logged');
  assert.ok(plan.some((n) => n.id === 'myzikr_smart_pray_asr'), 'asr later today');
  assert.ok(plan.some((n) => n.id === 'myzikr_smart_pray_fajr_d1'), 'tomorrow too');
  assert.ok(!plan.some((n) => n.id.startsWith('myzikr_smart_pray_') && n.id.endsWith('_d2')), 'prayer checks: two days only');
}
// Logged → silent; a user who never logs → no prayer checks at all; excused → none today.
{
  const i = base();
  i.snap.prayerLog![key(NOW)]!.dhuhr = { fard: true };
  assert.ok(!ids(i).includes('myzikr_smart_pray_dhuhr'));
  const j = base();
  j.snap.prayerLog = { [key(NOW)]: {} };
  assert.ok(!ids(j).some((x) => x.startsWith('myzikr_smart_pray_')));
  const k = base();
  k.excusedToday = true;
  assert.ok(!ids(k).some((x) => x.startsWith('myzikr_smart_pray_') && !x.includes('_d')));
  const off = base();
  off.prefs.prayerCheck = false;
  assert.ok(!ids(off).some((x) => x.startsWith('myzikr_smart_pray_')));
}
// The usual minute is learned (median of first events, ≥3 days).
{
  const events = [ev(ago(1), 6, 10, 'dhikr', 'morning'), ev(ago(2), 6, 20, 'dhikr', 'morning'), ev(ago(3), 6, 5, 'dhikr', 'morning'), ev(ago(3), 9, 0, 'dhikr', 'morning')];
  assert.equal(usualMinute(events, (e) => e.refId === 'morning', NOW), 6 * 60 + 10);
  assert.equal(usualMinute(events.slice(0, 2), (e) => e.refId === 'morning', NOW), null);
  const night = [ev(ago(1), 23, 30, 'dhikr', 'sleep'), ev(ago(2), 0, 30, 'dhikr', 'sleep'), ev(ago(3), 23, 50, 'dhikr', 'sleep')];
  assert.equal(usualMinute(night, () => true, NOW, true), 23 * 60 + 50);
}
// Morning adhkar: tomorrow at the learned minute + 15; a hand-set time wins; done today → not today.
{
  const i = base();
  i.snap.activity = [1, 2, 3, 4].map((n) => ev(ago(n), 6, 10, 'dhikr', 'morning'));
  const m1 = planCompanion(i).find((n) => n.id === 'myzikr_smart_morning_d1');
  assert.ok(m1);
  assert.equal(format(m1!.at, 'HH:mm'), '06:25');
  assert.ok(m1!.title.length > 0 && m1!.deepLinkPath.includes('set=morning'));
  i.anchors = { morning: '07:30' };
  assert.equal(format(planCompanion(i).find((n) => n.id === 'myzikr_smart_morning_d1')!.at, 'HH:mm'), '07:30');
  // Evening today: not done yet → planned after Asr; done → gone.
  assert.ok(ids(i).includes('myzikr_smart_evening'));
  i.snap.activity.push(ev(key(NOW), 13, 0, 'dhikr', 'evening'));
  assert.ok(!ids(i).includes('myzikr_smart_evening'));
}
// The chain at stake and the badge one step away shape the text.
{
  const i = base();
  i.snap.activity = [1, 2, 3].map((n) => ev(ago(n), 15, 30, 'dhikr', 'evening'));
  const e = planCompanion(i).find((n) => n.id === 'myzikr_smart_evening')!;
  assert.ok(e.body.includes('سلسلة أذكار المساء'), e.body);
  i.nearBadges = { evening: 'أمسيات مباركة' };
  assert.ok(planCompanion(i).find((n) => n.id === 'myzikr_smart_evening')!.body.includes('«أمسيات مباركة»'));
}
// Delivery: 30 minutes apart, clear of every adhan, outside quiet hours, within the daily cap.
{
  const i = base();
  i.quran = { goal: 4, done: 1, unit: 'page' };
  i.snap.targets = [
    { id: 'a', title: 'الاستغفار', current: 30, total: 100, recurrence: 'daily', streak: 5 },
    { id: 'b', title: 'الصلاة على النبي', current: 0, total: 100, recurrence: 'daily' },
  ];
  i.combos = [{ metric: 'day_prayer_complete', title: 'اليوم الكامل', parts: [{ id: 'fard', label: 'الصلوات الخمس', done: true }, { id: 'rawatib', label: 'الرواتب', done: true }, { id: 'duha', label: 'الضحى', done: true }, { id: 'witr', label: 'الوتر الليلة', done: false }], doneCount: 3, done: false }];
  const plan = planCompanion(i);
  const sorted = plan.map((n) => n.at.getTime()).sort((a, b) => a - b);
  for (let x = 1; x < sorted.length; x++) assert.ok(sorted[x] - sorted[x - 1] >= 30 * 60_000, 'spacing');
  for (const n of plan) {
    const T = times(n.at);
    for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) assert.ok(Math.abs(T[p].getTime() - n.at.getTime()) >= 8 * 60_000, `adhan guard ${n.id}`);
    const m = n.at.getHours() * 60 + n.at.getMinutes();
    if (n.kind !== 'pray' && n.kind !== 'late') assert.ok(m >= 6 * 60 && m < 23 * 60, `quiet ${n.id} ${format(n.at, 'HH:mm')}`);
    assert.ok(!/[!0-9]/.test(n.title + n.body), `copy: ${n.title} ${n.body}`);
  }
  const perDay = new Map<string, number>();
  for (const n of plan) if (n.kind !== 'pray' && n.kind !== 'late') perDay.set(key(n.at), (perDay.get(key(n.at)) ?? 0) + 1);
  for (const v of perDay.values()) assert.ok(v <= COMPANION_DAILY_CAP);
  const combo = plan.find((n) => n.id === 'myzikr_smart_combo');
  assert.ok(combo && combo.title.includes('«الوتر الليلة»') && combo.title.includes('«اليوم الكامل»'));
  const awrad = plan.find((n) => n.id === 'myzikr_smart_awrad');
  assert.ok(awrad && awrad.body.includes('الاستغفار ٧٠'), awrad?.body);
  const quran = plan.find((n) => n.id === 'myzikr_smart_quran');
  assert.ok(quran && quran.title.includes('٣ صفحات'), quran?.title);
}
// After a prayer is logged (by a user who says the adhkar): «أذكار بعد العصر» a few minutes later.
{
  const i = base();
  const now = hm(NOW, 15, 10);
  i.now = now;
  i.snap.prayerLog![key(NOW)]!.asr = { fard: true };
  i.snap.activity = [{ ...ev(key(NOW), 15, 5, 'prayer', 'asr') }];
  const a = planCompanion(i).find((n) => n.id === 'myzikr_smart_after');
  assert.ok(a, 'after-prayer planned');
  assert.ok(a!.at.getTime() >= now.getTime() + 8 * 60_000 && a!.deepLinkPath.includes('postPrayer-asr'));
  i.snap.prayerLog![key(NOW)]!.asr = { fard: true, adhkar: true };
  assert.ok(!ids(i).includes('myzikr_smart_after'));
}
// No location → nothing (every anchor is a prayer time).
{
  const i = base();
  i.times = () => null;
  assert.equal(planCompanion(i).length, 0);
}

// مصحفي khatmas: the wird nudge names what EACH khatma owes, never one khatma over the sum.
{
  const i = base();
  i.quran = { goal: 101, done: 0, unit: 'page' };
  i.khatmas = [
    { name: 'تدبّر البقرة', type: 'tafsir', owe: 53 },
    { name: 'مع الحصري', type: 'listen', owe: 28 },
    { name: 'ختمة الشهر', type: 'tilawa', owe: 20 },
  ];
  const q = planCompanion(i).find((n) => n.id === 'myzikr_smart_quran')!;
  assert.ok(q.body.includes('تفسير ٥٣، استماع ٢٨، تلاوة ٢٠ ص'), q.body);
  assert.ok(!q.body.includes('٦٠٤'), q.body);
  // Two of one kind: their names, not the kind twice.
  i.khatmas = [
    { name: 'ختمة الشهر', type: 'tilawa', owe: 20 },
    { name: 'ختمة السفر', type: 'tilawa', owe: 5 },
  ];
  const q2 = planCompanion(i).find((n) => n.id === 'myzikr_smart_quran')!;
  assert.ok(q2.body.includes('ختمة الشهر ٢٠، ختمة السفر ٥ ص'), q2.body);
}
// A kind that stood still two days or more: in its own words, at its own hour; one a day.
{
  const i = base();
  i.khatmas = [
    { name: 'تدبّر البقرة', type: 'tafsir', owe: 9 },
    { name: 'مع الحصري', type: 'listen', owe: 28 },
  ];
  i.typeIdle = { tafsir: 3, listen: 1 };
  const plan = planCompanion(i);
  const k = plan.filter((n) => n.kind === 'khatma');
  assert.equal(k.length, 1);
  assert.ok(k[0].title.includes('«تدبّر البقرة»') && k[0].title.includes('منذ ٣ أيام'), k[0].title);
  const m = k[0].at.getHours() * 60 + k[0].at.getMinutes();
  assert.ok(m >= 19 * 60 && m < 21 * 60, `تفسير in the calm of night: ${format(k[0].at, 'HH:mm')}`);
  assert.ok(!/[!0-9]/.test(k[0].title + k[0].body), k[0].title + k[0].body);
  assert.ok(!plan.some((n) => n.kind === 'khatma' && n.id.includes('_d')), 'stalls: today only');
  i.typeIdle = { tafsir: 1, listen: 0 };
  assert.ok(!planCompanion(i).some((n) => n.kind === 'khatma'), 'a day off is not a stall');
  i.prefs = { ...SMART_DEFAULTS, wirdNudges: false };
  i.typeIdle = { tafsir: 5 };
  assert.ok(!planCompanion(i).some((n) => n.kind === 'khatma'), 'follows «وِرد القرآن والأوراد»');
}
// Saturdays: a share in a kind never tried.
{
  const i = base();
  i.now = new Date(2026, 10, 14, 9, 0); // Saturday
  i.khatmas = [{ name: 'ختمة الشهر', type: 'tilawa', owe: 20 }];
  i.noShare = ['hifz'];
  const inv = planCompanion(i).find((n) => n.kind === 'invite');
  assert.ok(inv && inv.title === 'اجعل للمراجعة نصيباً', inv?.title);
  assert.ok(inv!.body.includes('مصحفي'), inv!.body);
  i.now = new Date(2026, 10, 9, 9, 0); // Monday → Wednesday: no Saturday
  assert.ok(!planCompanion(i).some((n) => n.kind === 'invite'));
}

// ── weekday learning ──
const all5 = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };
// Asr usually missed on Sundays → asked about early on Sundays only, saying why.
{
  const i = base();
  for (let n = 1; n <= 56; n++) {
    const d = addDays(NOW, -n);
    i.snap.prayerLog![key(d)] = d.getDay() === 0 ? { ...all5, asr: {} } : { ...all5 };
  }
  const plan = planCompanion(i);
  const sun = plan.find((n) => n.id === 'myzikr_smart_pray_asr')!;
  assert.equal(format(sun.at, 'HH:mm'), '15:10');
  assert.ok(sun.body.includes('يوم الأحد'), sun.body);
  const mon = plan.find((n) => n.id === 'myzikr_smart_pray_asr_d1')!;
  assert.ok(mon.at.getTime() - hm(mon.at, 14, 50).getTime() >= 30 * 60_000, format(mon.at, 'HH:mm'));
}
// A habit drifting later moves the learned minute; a weekday with its own rhythm keeps it.
{
  const i = base();
  i.snap.activity = Array.from({ length: 21 }, (_, n) => ev(ago(n + 1), n < 7 ? 7 : 6, 0, 'dhikr', 'morning'));
  assert.equal(format(planCompanion(i).find((n) => n.id === 'myzikr_smart_morning_d1')!.at, 'HH:mm'), '07:15');
  const thu = base();
  thu.now = new Date(2026, 10, 12, 14, 0); // Thursday → Friday is d1
  thu.snap.activity = Array.from({ length: 56 }, (_, n) => addDays(thu.now, -(n + 1))).map((d) => ev(key(d), d.getDay() === 5 ? 9 : 6, d.getDay() === 5 ? 0 : 10, 'dhikr', 'morning'));
  assert.equal(format(planCompanion(thu).find((n) => n.id === 'myzikr_smart_morning_d1')!.at, 'HH:mm'), '09:15');
  assert.equal(format(planCompanion(thu).find((n) => n.id === 'myzikr_smart_morning_d2')!.at, 'HH:mm'), '06:25');
}

// ── the day's frame: «موجز الصباح» and «ختام اليوم» ──
{
  const i = base();
  i.quran = { goal: 4, done: 0, unit: 'page' };
  i.agendaOf = (k) => (k === key(addDays(NOW, 1)) ? ['درس التفسير ٥:٣٠ م'] : []);
  i.sources = [{ id: 'silat', brief: () => ['اتصل بخالتك'] }];
  const b = planCompanion(i).find((n) => n.id === 'myzikr_smart_brief_d1');
  assert.ok(b, planCompanion(i).map((n) => n.id).join());
  assert.equal(b!.kind, 'brief');
  for (const part of ['درس التفسير ٥:٣٠ م', 'وردك ٤ صفحات', 'اتصل بخالتك']) assert.ok(b!.body.includes(part), b!.body);
  const m = b!.at.getHours() * 60 + b!.at.getMinutes();
  assert.ok(m >= 6 * 60 && m <= 10 * 60 + 45, `after quiet hours, before Dhuhr: ${format(b!.at, 'HH:mm')}`);
  assert.ok(!/[!0-9]/.test(b!.title + b!.body), b!.body);
  const off = { ...i, prefs: { ...i.prefs, brief: false } };
  assert.ok(!planCompanion(off).some((n) => n.kind === 'brief'));
  const idle = { ...i, snap: { ...i.snap, prayerLog: {} } };
  assert.ok(!planCompanion(idle).some((n) => n.kind === 'brief' || n.kind === 'wrapup'), 'only for active users');
  const thin = base();
  assert.ok(!planCompanion(thin).some((n) => n.id === 'myzikr_smart_brief_d1'), 'one fact is not a brief');
}
{
  const i = base();
  i.quran = { goal: 4, done: 1, unit: 'page' };
  i.snap.wirdHistory = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [ago(n), { unit: 'page', amount: 4, achieved: 4 }]));
  const w = planCompanion(i).find((n) => n.id === 'myzikr_smart_wrapup')!;
  assert.ok(w, planCompanion(i).map((n) => n.id).join());
  assert.equal(format(w.at, 'HH:mm'), '22:20', 'forty minutes before the quiet hours (no learned bedtime)');
  assert.ok(w.body.startsWith('بقي ممكناً: الوتر، أذكار المساء، ٣ صفحات من وردك، أذكار النوم'), w.body);
  assert.ok(w.body.includes('سلسلة وردك ٥ أيام'), w.body);
  // The wird's own last call stands down: the wrap-up names it.
  assert.ok(!planCompanion(i).some((n) => n.id === 'myzikr_smart_quran_last'));
  // All done but the sleep adhkar: no wrap-up.
  const done = base();
  done.snap.qiyamNights = { [key(NOW)]: { nightKey: key(NOW), rakaat: 2, witr: true, loggedAt: 0 } };
  done.snap.activity = [ev(key(NOW), 13, 0, 'dhikr', 'evening')];
  assert.ok(!planCompanion(done).some((n) => n.id === 'myzikr_smart_wrapup'));
  // A learned bedtime: the wrap-up comes before it, and that night's sleep nudge stands down.
  const bed = base();
  bed.snap.activity = [1, 2, 3, 4].map((n) => ev(ago(n), 23, 30, 'dhikr', 'sleep'));
  const plan = planCompanion(bed);
  assert.equal(format(plan.find((n) => n.id === 'myzikr_smart_wrapup')!.at, 'HH:mm'), '22:50');
  assert.ok(!plan.some((n) => n.kind === 'sleep' && n.at.toDateString() === NOW.toDateString()), plan.map((n) => n.id).join());
  const noWrap = { ...bed, prefs: { ...bed.prefs, wrapup: false } };
  assert.ok(planCompanion(noWrap).some((n) => n.id === 'myzikr_smart_sleep'), 'without the wrap-up the sleep nudge stays');
}

// ── ONE «قبل أن يفوت وقتها» for a streak of three days or more ──
{
  const i = base();
  i.now = hm(NOW, 7, 0);
  i.snap.activity = [1, 2, 3, 4, 5].map((n) => ev(ago(n), 6, 10, 'dhikr', 'morning'));
  const plan = planCompanion(i);
  const last = plan.find((n) => n.id === 'myzikr_smart_morning_last')!;
  assert.ok(last, plan.map((n) => n.id).join());
  assert.equal(format(last.at, 'HH:mm'), '11:00');
  assert.ok(last.body.includes('سلسلتك ٥ أيام'), last.body);
  assert.ok(plan.some((n) => n.id === 'myzikr_smart_morning'), 'the usual one first');
  i.snap.activity = [1, 2].map((n) => ev(ago(n), 6, 10, 'dhikr', 'morning'));
  assert.ok(!planCompanion(i).some((n) => n.id === 'myzikr_smart_morning_last'), 'two days are not yet a streak to rescue');
  // الضحى kept daily: its own last call.
  const d = base();
  d.now = hm(NOW, 9, 0);
  d.snap.duha = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [ago(n), 2]));
  const duha = planCompanion(d).find((n) => n.id === 'myzikr_smart_duha_last');
  assert.equal(duha && format(duha.at, 'HH:mm'), '11:00');
}

// ── السحور for a fast the user intends ──
{
  const i = base();
  assert.ok(!planCompanion(i).some((n) => n.kind === 'suhoor'), 'no intent, no habit: no pre-dawn alarm');
  i.fastIntent = key(addDays(NOW, 1));
  const s = planCompanion(i).find((n) => n.id === 'myzikr_smart_suhoor_d1')!;
  assert.ok(s);
  assert.equal(format(s.at, 'HH:mm'), '04:00', 'forty minutes before Fajr, inside quiet hours');
  assert.ok(s.title.includes('السحور') && s.body.includes('الإثنين'), `${s.title} ${s.body}`);
  i.anchors = { suhoor: '03:30' };
  assert.equal(format(planCompanion(i).find((n) => n.id === 'myzikr_smart_suhoor_d1')!.at, 'HH:mm'), '03:30');
}

// ── a registered source's own nudges: stable ids, the same delivery rules ──
{
  const i = base();
  i.sources = [
    {
      id: 'silat',
      nudges: (ctx) => [{ key: 'call', title: 'اتصل بخالتك', body: '«من سرّه أن يُبسط له في رزقه… فليصل رحمه»', at: hm(ctx.now, 20, 0), to: '/silat', label: 'صلة الرحم' }],
      acted: () => null,
    },
    {
      id: 'boom',
      nudges: () => {
        throw new Error('boom');
      },
    },
  ];
  const warn = console.warn;
  console.warn = () => {};
  const n = planCompanion(i).find((x) => x.id === 'myzikr_smart_x_silat_call');
  console.warn = warn;
  assert.ok(n);
  assert.deepEqual([n!.kind, n!.topic, n!.label, n!.deepLinkPath, n!.moduleId], ['plugin', 'x.silat.call', 'صلة الرحم', '/#/silat', 'smart.plugin']);
}

console.log('smartCompanion: ok');
