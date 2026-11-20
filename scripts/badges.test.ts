/**
 * Executable check for the badge catalog and the pure badge metrics
 * (services/badgeMetrics.ts): combined days, best-ever streaks, Hijri seasons,
 * weekly chains, secrets and the gallery model.
 *
 * Run: npx esbuild scripts/badges.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/badges.test.mjs
 *      node .tmp-test/badges.test.mjs
 */
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { BADGES, METRICS, TRACKS, RARITY_ORDER, badgesFor, type BadgeMetric } from '@/data/badges';
import { buildBadgeModel, computeBadgeMetrics, doorStandings, progressOf, type BadgeSnapshot } from '@/services/badgeMetrics';
import { fromHijri, toHijri } from '@/services/HijriService';
import { eachPrayerStreak, type PrayerDayLog } from '@/store/prayerLogStore';
import { computeStreakFromActiveDates } from '@/services/statsService';
import type { Person, SilatEntry } from '@/store/silatModel';
import type { ProgramRun } from '@/store/programsModel';
import { templateById } from '@/data/programsCatalog';

// ── catalog ────────────────────────────────────────────────────────────────
const ids = BADGES.map((b) => b.id);
assert.equal(new Set(ids).size, ids.length, 'duplicate badge id');
assert.ok(BADGES.length >= 300, `catalog has ${BADGES.length} badges`);
assert.ok(badgesFor('female').length >= 290);
// Every pre-2026-11 id survives (users keep what they earned).
const LEGACY = `streak_overall_7 streak_overall_30 streak_overall_100 streak_overall_365 streak_prayers_7 streak_prayers_30
streak_dhikr_7 streak_dhikr_30 streak_quran_7 streak_quran_30 streak_qiyam_7 streak_qiyam_30 count_fasting_30 count_dhikr_100
qiyam_nights_10 qiyam_nights_40 qiyam_nights_100 qiyam_rakaat_100 qiyam_rakaat_1000 qiyam_witr_30 dhikr_reps_1000 dhikr_reps_10000
dhikr_reps_100000 dhikr_morning_7 dhikr_evening_7 dhikr_morning_30 dhikr_evening_30 quran_pages_100 quran_khatma_1 quran_khatma_3
prayers_week_1 prayers_week_4 prayers_week_12 fajr_streak_7 fajr_streak_40 dhuhr_streak_30 asr_streak_30 maghrib_streak_30
isha_streak_30 duha_streak_7 duha_days_30 duha_days_100 early_10 early_40 awrad_10 awrad_50 awrad_200 weeks_4 weeks_12 weeks_52
streak_overall_3 streak_overall_14 streak_prayers_100 fajr_streak_100 prayers_week_52 duha_days_1 duha_streak_30 duha_streak_100
duha_days_360 duha_rakaat_500 duha_rakaat_2000 duha_eight_10 duha_eight_40 mosque_1 mosque_40 mosque_200 mosque_1000 mosque_5000
mosque_full_streak_7 mosque_full_40 mosque_fajr_40 mosque_fajr_isha_30 mosque_fajr_isha_100 rawatib_full_1 rawatib_streak_7
rawatib_streak_30 rawatib_full_40 rawatib_full_100 sunnah_100 sunnah_1000 count_dhikr_1 dhikr_both_30 dhikr_both_100
dhikr_morning_100 dhikr_evening_100 dhikr_post_30 dhikr_post_100 dhikr_sleep_7 dhikr_sleep_30 qiyam_nights_1 streak_qiyam_3
streak_qiyam_100 qiyam_rakaat_5000 count_fasting_5 fasting_mon_thu_20 count_fasting_100 quran_pages_1000 streak_quran_100
awrad_500 ramadan_full`.split(/\s+/);
assert.equal(LEGACY.length, 100);
for (const id of LEGACY) assert.ok(ids.includes(id), `legacy badge ${id} missing`);
for (const t of TRACKS) {
  const targets = t.tiers.map((x) => x.target);
  assert.ok(targets.every((v, i) => i === 0 || v > targets[i - 1]), `track ${t.metric} has repeated targets`);
}
for (const b of BADGES) {
  assert.ok(b.metric in METRICS, b.id);
  assert.ok(RARITY_ORDER.includes(b.rarity), b.id);
  if (b.hidden) assert.ok(b.hint, `${b.id} is hidden without a hint`);
  assert.ok(!/!/.test(b.titleAr + b.descriptionAr), `${b.id}: no exclamation marks in copy`);
}
assert.ok(BADGES.filter((b) => b.id.startsWith('mosque_')).every((b) => b.audience === 'male'));

// ── a synthetic life ───────────────────────────────────────────────────────
const NOW = new Date('2026-11-08T15:00:00');
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const ago = (n: number) => key(addDays(NOW, -n));
const at = (k: string, h: number) => new Date(`${k}T${String(h).padStart(2, '0')}:00:00`).getTime();

function blank(): BadgeSnapshot {
  return {
    now: NOW,
    gender: 'male',
    hijriOffset: 0,
    dailyProgress: {},
    freezesUsed: {},
    prayerLog: {},
    excused: {},
    duha: {},
    qiyam: {},
    lastThirdNights: [],
    events: [],
    tasbihLifetime: 0,
    wirdPages: {},
    readingDays: {},
    khatmasFinished: 0,
    mushafi: { days: {}, khatmas: [], marks: [] },
    quranWirdDays: [],
    hifzSessions: [],
    hifzItems: [],
    awradHistory: [],
    targets: [],
    ramadan: { year: null, taraweeh: [], juz: 0 },
    sadaqah: [],
    circles: [],
    tasks: [],
    asmaStudied: 0,
    hadithFavorites: 0,
  };
}

const FIVE = { fard: true };
const fullDay = (extra: Partial<Record<'rawatib' | 'mosque', boolean>> = {}): PrayerDayLog => ({
  fajr: { ...FIVE, ...(extra.rawatib ? { sunnahBefore: true } : {}), ...(extra.mosque ? { mosque: true } : {}) },
  dhuhr: { ...FIVE, ...(extra.rawatib ? { sunnahBefore: true, sunnahAfter: true } : {}), ...(extra.mosque ? { mosque: true } : {}) },
  asr: { ...FIVE, ...(extra.mosque ? { mosque: true } : {}) },
  maghrib: { ...FIVE, ...(extra.rawatib ? { sunnahAfter: true } : {}), ...(extra.mosque ? { mosque: true } : {}) },
  isha: { ...FIVE, ...(extra.rawatib ? { sunnahAfter: true } : {}), ...(extra.mosque ? { mosque: true } : {}) },
});
const dhikrEvent = (k: string, set: string, amount = 10) => ({ ts: at(k, 8), dateKey: k, domain: 'dhikr', refId: set, amount });
const mark = (s: BadgeSnapshot, k: string, moduleId: string) => {
  const day = s.dailyProgress[k] ?? { dateKey: k, modules: [], overallRate: 0 };
  day.modules.push({ moduleId, completed: true, completionRate: 1 });
  s.dailyProgress[k] = day;
};
const v = (s: BadgeSnapshot, m: BadgeMetric) => computeBadgeMetrics(s).value[m];

// «اليوم الكامل»: five fard + 12 rawatib + الضحى + the night's witr.
{
  const s = blank();
  const k = ago(3);
  s.prayerLog[k] = fullDay({ rawatib: true });
  s.duha[k] = 4;
  assert.equal(v(s, 'day_prayer_complete'), 0, 'no witr yet');
  s.qiyam[k] = { rakaat: 2, witr: true, loggedAt: at(k, 23) };
  assert.equal(v(s, 'day_prayer_complete'), 1);
  assert.equal(v(s, 'sunnah_duha_days'), 1);
  assert.equal(v(s, 'rawatib_full_days'), 1);
  assert.equal(v(s, 'nawafil_rakaat'), 12 + 4 + 3);
  // + adhkar and Quran → «اليوم الذهبي».
  assert.equal(v(s, 'day_golden'), 0);
  s.events.push(dhikrEvent(k, 'morning'), dhikrEvent(k, 'evening'), dhikrEvent(k, 'postPrayer'));
  s.wirdPages[k] = 5;
  assert.equal(v(s, 'day_golden'), 1);
  assert.equal(v(s, 'day_guarded'), 1);
  // + fasting and sadaqah → the secret «يوم الإحسان».
  mark(s, k, 'fasting');
  s.sadaqah.push({ date: k, cause: 'إطعام' });
  assert.equal(v(s, 'day_ihsan'), 1);
  assert.equal(v(s, 'day_khayr'), 1);
  assert.equal(v(s, 'day_fast_qiyam'), 1);
}

// «يوم محفوظ» — a woman's excused day still counts once her adhkar are read; never as a prayer day.
{
  const s = blank();
  s.gender = 'female';
  const k = ago(2);
  s.excused[k] = true;
  s.events.push(dhikrEvent(k, 'morning'), dhikrEvent(k, 'evening'));
  assert.equal(v(s, 'day_guarded'), 1);
  assert.equal(v(s, 'prayer_days'), 0);
}

// «الإشراق»: men need Fajr in the mosque, women Fajr.
{
  const s = blank();
  const k = ago(1);
  s.prayerLog[k] = { fajr: { fard: true } };
  s.duha[k] = 2;
  s.events.push(dhikrEvent(k, 'morning'));
  assert.equal(v(s, 'ishraq_days'), 0);
  s.prayerLog[k] = { fajr: { fard: true, mosque: true } };
  assert.equal(v(s, 'ishraq_days'), 1);
  s.prayerLog[k] = { fajr: { fard: true } };
  s.gender = 'female';
  assert.equal(v(s, 'ishraq_days'), 1);
}

// A past chain unlocks a streak badge; locked progress shows the live run.
{
  const s = blank();
  for (let i = 40; i < 50; i++) s.prayerLog[ago(i)] = { fajr: { fard: true } };
  const m = computeBadgeMetrics(s);
  assert.equal(m.value.fajr_streak, 0);
  assert.equal(m.best.fajr_streak, 10);
  const f7 = BADGES.find((b) => b.id === 'fajr_streak_7')!;
  const f40 = BADGES.find((b) => b.id === 'fajr_streak_40')!;
  assert.equal(progressOf(f7, m).current, 10);
  assert.equal(progressOf(f40, m).current, 0);
}

// Today never breaks a chain; qiyam is judged by the night (before noon = last night).
{
  const s = blank();
  for (let i = 1; i <= 5; i++) s.prayerLog[ago(i)] = fullDay();
  assert.equal(v(s, 'prayers_streak'), 5);
  const s2 = blank();
  s2.now = new Date('2026-11-08T02:00:00');
  for (let i = 2; i <= 4; i++) s2.qiyam[ago(i)] = { rakaat: 11, witr: false, loggedAt: at(ago(i), 23) };
  assert.equal(computeBadgeMetrics(s2).value.qiyam_streak, 3, 'tonight (keyed yesterday) is still open at 02:00');
  assert.equal(computeBadgeMetrics(s2).value.qiyam_eleven, 3);
}

// Hijri seasons: Arafah, Ashura + Tasu'a, a whole Ramadan (an excused day fills its place), the last ten nights.
{
  const s = blank();
  const hk = (y: number, m: number, d: number) => key(fromHijri({ year: y, month: m, day: d }));
  mark(s, hk(1447, 12, 9), 'fasting');
  mark(s, hk(1448, 1, 9), 'fasting');
  mark(s, hk(1448, 1, 10), 'fasting');
  for (const d of [13, 14, 15]) mark(s, hk(1447, 11, d), 'fasting');
  let m = computeBadgeMetrics(s).value;
  assert.equal(m.arafah, 1);
  assert.equal(m.ashura, 1);
  assert.equal(m.tasua_ashura, 1);
  assert.equal(m.fasting_white_months, 1);
  assert.equal(m.dhulhijjah_fasts, 1);

  let len = 0;
  while (toHijri(fromHijri({ year: 1447, month: 9, day: len + 1 })).month === 9 && len < 30) len++;
  assert.ok(len === 29 || len === 30);
  for (let d = 1; d <= len; d++) if (d !== 5) mark(s, hk(1447, 9, d), 'fasting');
  assert.equal(computeBadgeMetrics(s).value.ramadan_fasted, 0, 'one day missing');
  s.excused[hk(1447, 9, 5)] = true;
  assert.equal(computeBadgeMetrics(s).value.ramadan_fasted, 1);
  // Night N = the evening before Hijri day N.
  for (let d = 21; d <= len; d++) {
    const eve = hk(1447, 9, d - 1);
    s.qiyam[eve] = { rakaat: 8, witr: true, loggedAt: at(eve, 23) };
  }
  m = computeBadgeMetrics(s).value;
  assert.equal(m.ramadan_last_ten, 1);
  assert.equal(m.ramadan_odd_nights, 1);
  delete s.qiyam[hk(1447, 9, 26)]; // night 27
  m = computeBadgeMetrics(s).value;
  assert.equal(m.ramadan_last_ten, 0);
  assert.equal(m.ramadan_odd_nights, 0);
  // Taraweeh: a complete Ramadan reads 30 even when it had 29 nights.
  s.ramadan = { year: 1447, taraweeh: Array.from({ length: len }, (_, i) => i + 1), juz: 30 };
  assert.equal(computeBadgeMetrics(s).value.taraweeh_full, 30);
}

// Weekly chains (sadaqah): the running week may still be empty.
{
  const s = blank();
  for (let w = 1; w <= 4; w++) s.sadaqah.push({ date: ago(w * 7), cause: `باب ${w}` });
  const m = computeBadgeMetrics(s);
  assert.equal(m.value.sadaqah_week_streak, 4);
  assert.equal(m.value.sadaqah_causes, 4);
}

// Dhikr: 100 tasbih in a day, a 1000-rep day, distinct sets; the daily wird chain from history.
{
  const s = blank();
  const k = ago(1);
  s.events.push({ ts: at(k, 10), dateKey: k, domain: 'tasbih', refId: 'subhanallah', amount: 120 });
  s.events.push({ ts: at(k, 11), dateKey: k, domain: 'dhikr', refId: '4', amount: 900 });
  s.events.push(dhikrEvent(k, 'sleep'));
  const m = computeBadgeMetrics(s).value;
  assert.equal(m.tasbih_100_days, 1);
  assert.equal(m.dhikr_day_max, 1030);
  assert.equal(m.dhikr_sets, 2);

  const w = blank();
  for (let i = 10; i >= 1; i--) w.awradHistory.push({ targetId: 't1', endedAt: at(ago(i), 23), completed: i !== 4, extra: 2 });
  const wm = computeBadgeMetrics(w);
  assert.equal(wm.best.wird_streak, 6);
  assert.equal(wm.value.awrad_extra, 20);
}

// «عودٌ حميد»: back after 7+ missed days, then three in a row.
{
  const s = blank();
  for (const i of [30, 29, 15, 14, 13]) mark(s, ago(i), 'dhikr');
  assert.equal(v(s, 'comeback'), 1);
}

// Today's challenges.
{
  const s = blank();
  const t = key(NOW);
  s.prayerLog[t] = { fajr: { fard: true }, dhuhr: { fard: true } };
  s.events.push(dhikrEvent(t, 'morning'));
  const today = computeBadgeMetrics(s).today;
  const guarded = today.find((c) => c.metric === 'day_guarded')!;
  assert.equal(guarded.doneCount, 1);
  assert.equal(guarded.parts.find((p) => p.id === 'fard')!.note, '٢/٥');
  assert.ok(today.some((c) => c.metric === 'day_mosque_sunnah'), 'men see the mosque day');
  assert.ok(!today.some((c) => c.metric === 'day_fast_qiyam'), 'only shown on a fasting day');
}

// The model: secrets stay out of «الأقرب», mosque tracks only for men.
{
  const s = blank();
  s.qiyam[ago(1)] = { rakaat: 2, witr: false, loggedAt: at(ago(1), 23) };
  s.lastThirdNights = [];
  const m = computeBadgeMetrics(s);
  const model = buildBadgeModel(m, ['qiyam_nights_1'], { qiyam_nights_1: NOW.toISOString() }, 'female', NOW);
  assert.equal(model.got, 1);
  assert.ok(!model.tracks.some((t) => t.category === 'mosque'));
  assert.ok(model.tracks.find((t) => t.metric === 'qiyam_last_third')!.secret);
  assert.ok(model.nearest.every((x) => !x.badge.hidden));
  assert.ok(model.nearest.some((x) => x.badge.id === 'qiyam_nights_10'));
  assert.equal(model.thisMonth, 1);
}

// أذكار ما بعد الصلاة are per prayer: all five make the day; older data (before
// the first per-prayer tick) keeps counting a post-prayer reading as the day.
{
  const s = blank();
  const old = ago(10);
  s.prayerLog[old] = fullDay();
  s.events.push(dhikrEvent(old, 'postPrayer'));
  assert.equal(v(s, 'dhikr_post_prayer_days'), 1, 'legacy day counts');
  assert.equal(v(s, 'post_prayer_adhkar'), 5);
  const k = ago(1);
  s.prayerLog[k] = fullDay();
  for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib'] as const) s.prayerLog[k][p]!.adhkar = true;
  s.events.push(dhikrEvent(k, 'postPrayer'));
  assert.equal(v(s, 'dhikr_post_prayer_days'), 1, 'four of five is not the day');
  assert.equal(v(s, 'post_prayer_adhkar'), 5 + 4);
  s.prayerLog[k].isha!.adhkar = true;
  assert.equal(v(s, 'dhikr_post_prayer_days'), 2);
  assert.equal(v(s, 'post_prayer_adhkar'), 10);
  // A day after the first tick no longer counts from a reading alone.
  const later = ago(0);
  s.prayerLog[later] = { fajr: { fard: true, adhkar: true } };
  s.events.push(dhikrEvent(later, 'postPrayer'));
  assert.equal(v(s, 'dhikr_post_prayer_days'), 2);
  const post = computeBadgeMetrics(s).today.find((c) => c.metric === 'day_dhikr_all')!.parts.find((p) => p.id === 'post')!;
  assert.equal(post.done, false);
  assert.equal(post.note, '١/٥');
  // Chain: yesterday (5/5); the old legacy day is 9 days earlier → current 1.
  assert.equal(v(s, 'post_prayer_streak'), 1);
}

// An excused day: «يوم الذاكرين» needs no post-prayer adhkar.
{
  const s = blank();
  s.gender = 'female';
  const k = ago(2);
  s.excused[k] = true;
  s.events.push(dhikrEvent(k, 'morning'), dhikrEvent(k, 'evening'), dhikrEvent(k, 'sleep'));
  assert.equal(v(s, 'day_dhikr_all'), 1);
}

// The fast integer chains agree with the app's own streak functions (random lives).
{
  let seedN = 7;
  const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 25; trial++) {
    const s = blank();
    for (let n = 0; n < 220; n++) {
      const k = ago(n);
      if (rnd() < 0.82) s.prayerLog[k] = { fajr: { fard: true }, isha: { fard: rnd() < 0.9 } };
      else if (rnd() < 0.3) s.excused[k] = true;
      if (rnd() < 0.6) mark(s, k, 'dhikr');
      if (rnd() < 0.05) s.freezesUsed[k] = ['dhikr'];
    }
    const m = computeBadgeMetrics(s);
    const each = eachPrayerStreak(s.prayerLog, s.excused, s.duha, NOW);
    assert.equal(m.value.fajr_streak, each.fajr.current, `trial ${trial} fajr current`);
    assert.equal(m.best.fajr_streak, each.fajr.longest, `trial ${trial} fajr longest`);
    assert.equal(m.best.isha_streak, each.isha.longest, `trial ${trial} isha longest`);
    const dhikrKeys = Object.keys(s.dailyProgress).filter((k) => s.dailyProgress[k].modules.some((x) => x.moduleId === 'dhikr'));
    const ref = computeStreakFromActiveDates(dhikrKeys, NOW, new Set(Object.keys(s.freezesUsed)));
    assert.equal(m.value.dhikr_streak, ref.current, `trial ${trial} dhikr current`);
    assert.equal(m.best.dhikr_streak, ref.longest, `trial ${trial} dhikr longest`);
  }
}

// Khatma types (مصحفي): per-type pages / streaks / shares, and today's Quran challenges.
{
  const s = blank();
  // Pages 1..60 read over the last 3 days; a tilawa khatma at 1..40, a listening one 41..60.
  s.mushafi.days = {
    [ago(2)]: Array.from({ length: 20 }, (_, i) => 1 + i),
    [ago(1)]: [...Array.from({ length: 10 }, (_, i) => 21 + i), ...Array.from({ length: 10 }, (_, i) => 41 + i)],
    [ago(0)]: [...Array.from({ length: 10 }, (_, i) => 31 + i), ...Array.from({ length: 10 }, (_, i) => 51 + i)],
  };
  s.mushafi.marks = [
    { id: 'r1', p: 41, name: 'تلاوتي', color: '#000000', t: 1 },
    { id: 'r2', p: 61, name: 'سماعي', color: '#000000', t: 1 },
  ];
  s.mushafi.khatmas = [
    { id: 'a', m: 'r1', n: 'تلاوتي', at: 41, s: ago(2), d: 30, b: 0, t: 1 },
    { id: 'b', m: 'r2', n: 'سماعي', at: 61, s: ago(1), d: 10, b: 40, ty: 'listen', t: 1 },
    { id: 'c', m: '', n: 'تفسيري', at: 604, rd: 604, s: ago(90), f: ago(10), d: 60, b: 0, ty: 'tafsir', t: 1 },
  ];
  // Sessions: a listening one beyond the khatmas, a memorized الفاتحة, الكهف on a Friday not ticked in محاسبة الجمعة.
  const fri = (() => { let d = new Date(); while (d.getDay() !== 5) d = addDays(d, -1); return d; })();
  const at = (d: Date, h: number) => new Date(format(d, 'yyyy-MM-dd') + `T${String(h).padStart(2, '0')}:00:00`).getTime();
  s.mushafi.sessions = [
    { id: 's1', ty: 'listen', a: 7, z: 11, s: at(fri, 9), e: at(fri, 10), t: 1 }, // page 2, whole
    { id: 's2', ty: 'hifz', a: 0, z: 6, s: at(fri, 11), e: at(fri, 12), t: 1 },
    { id: 's3', ty: 'tilawa', a: 2140, z: 2249, s: at(fri, 13), e: at(fri, 14), t: 1 },
  ];
  const m = computeBadgeMetrics(s);
  assert.equal(m.value.memorized_pages, 1);
  assert.equal(m.value.memorized_juz, 0);
  assert.equal(m.value.friday_kahf, 1);
  delete s.mushafi.sessions;
  assert.equal(computeBadgeMetrics(s).value.listen_pages, 20);
  assert.equal(m.value.listen_pages, 21, 'a session page beyond the khatmas');
  assert.equal(m.value.listen_streak, 2);
  assert.equal(m.value.tafsir_khatmat, 1);
  assert.equal(m.value.tafsir_pages, 604);
  assert.equal(m.value.quran_types_open, 2);
  assert.equal(m.value.quran_types_done, 1);
  assert.equal(m.value.day_quran_share, 2, 'yesterday + today: both open types advanced');
  const share = m.today.find((c) => c.metric === 'day_quran_share');
  assert.ok(share && share.done && share.parts.length === 2, 'share challenge: tilawa + listen, both done');
  const wird = m.today.find((c) => c.metric === 'quran_wird_days');
  assert.ok(wird && wird.parts.length === 2, 'one part per running khatma');
  assert.ok(wird!.parts.every((p) => p.note), 'each part names its type');
  // Listening khatmas never feed «الختمات»; wird-complete days feed their own chain.
  s.quranWirdDays = [ago(1), ago(0)];
  assert.equal(computeBadgeMetrics(s).value.quran_wird_streak, 2);
  assert.equal(computeBadgeMetrics(s).value.quran_khatmat, 0);
}

// Strengths: judged on the LAST FOUR WEEKS — badges won long ago don't make a door strong;
// العادات/العلم never «wait» for someone who never used them; «المواسم» never waits.
{
  const s = blank();
  for (let n = 0; n < 20; n++) s.prayerLog[ago(n)] = fullDay(); // 20 of the last 28 days
  const m = computeBadgeMetrics(s);
  assert.ok(Math.abs(m.activity!.prayer! - 20 / 28) < 1e-9, String(m.activity!.prayer));
  const dhikr = TRACKS.filter((t) => METRICS[t.metric].cat === 'dhikr').flatMap((t) => t.tiers.slice(0, 2).map((x) => x.id));
  const at = Object.fromEntries(dhikr.map((id) => [id, addDays(NOW, -90).toISOString()]));
  const model = buildBadgeModel(m, dhikr, at, 'male', NOW);
  const { doors, strong, weak } = doorStandings(model);
  assert.equal(strong[0].id, 'prayer');
  assert.ok(!strong.some((d) => d.id === 'dhikr'), 'many dhikr badges, all from long ago, none lately');
  assert.ok(strong.every((d) => d.activity >= 0.1));
  assert.equal(weak.length, 3);
  assert.ok(weak.every((d) => d.id !== 'seasons' && d.step && !d.step.unlocked && !d.step.badge.hidden));
  assert.ok(!weak.some((d) => d.id === 'habits' || d.id === 'knowledge'), 'never used → never «waiting»');
  assert.ok(doors.every((d, i) => i === 0 || doors[i - 1].activity >= d.activity));
  const cats = model.nearest.map((x) => METRICS[x.badge.metric].cat);
  assert.ok(cats.every((c) => cats.filter((y) => y === c).length <= 2), 'nearest: two per door at most');
  // One finished task = the habits door is in use.
  assert.equal(doors.find((d) => d.id === 'habits')?.used, false);
  s.tasks = [{ repeat: 'none', done: true }];
  const used = doorStandings(buildBadgeModel(computeBadgeMetrics(s), dhikr, at, 'male', NOW));
  assert.equal(used.doors.find((d) => d.id === 'habits')?.used, true);
  // A brand-new user: nothing strong, three first steps.
  const fresh = doorStandings(buildBadgeModel(computeBadgeMetrics(blank()), [], {}, 'female', NOW));
  assert.equal(fresh.strong.length, 0);
  assert.equal(fresh.weak.length, 3);
  assert.ok(!fresh.doors.some((d) => d.id === 'mosque'), 'no mosque door for women');
}

// Friday for men: الجمعة has no قبلية and four after — neither the full-rawatib chain nor
// «قبلية الظهر» breaks on it; a woman's Friday is a Dhuhr like any other.
{
  const { eachRawatibStreak, rawatibFullOn, rawatibRakaatOf } = await import('@/store/prayerLogStore');
  const FRI = ago(2); // NOW is a Sunday
  const s = blank();
  for (let n = 0; n <= 6; n++) {
    const day = fullDay({ rawatib: true });
    if (ago(n) === FRI) delete day.dhuhr!.sunnahBefore;
    s.prayerLog[ago(n)] = day;
  }
  assert.equal(rawatibFullOn(FRI, true), 10);
  assert.equal(rawatibFullOn(FRI, false), 12);
  assert.equal(rawatibRakaatOf(s.prayerLog[FRI], FRI, true), 10, 'four after الجمعة');
  assert.equal(computeBadgeMetrics(s).value.rawatib_streak, 7);
  const qabliyya = eachRawatibStreak(s.prayerLog, {}, true, NOW).find((c) => c.prayer === 'dhuhr' && c.type === 'sunnahBefore')!;
  assert.equal(qabliyya.current, 6, 'Friday bridged, not counted');
  assert.equal(eachRawatibStreak(s.prayerLog, {}, false, NOW).find((c) => c.prayer === 'dhuhr' && c.type === 'sunnahBefore')!.current, 2, 'a woman’s Friday has a قبلية');
}

// ── The 2026-11-17 chapters: صلة الرحم، برامج التدرّج، القضاء، محاسبة الجمعة، المجموعات ──
const has = (s: BadgeSnapshot, id: string) => {
  const x = BADGES.find((b) => b.id === id)!;
  return progressOf(x, computeBadgeMetrics(s)).current >= x.target;
};

// صلة الرحم: contacts with kin and parents (not friends, not du'a), du'a days for a parent,
// visits, neighbours reached, a repaired estrangement, and weeks of everyone reached on time.
{
  let seq = 0;
  const person = (id: string, relation: string, everyDays: number, extra: Partial<Person> = {}): Person => ({
    id, name: id, relation, everyDays, createdAt: at(ago(60), 8), ...extra,
  });
  const entry = (personId: string, type: SilatEntry['type'], day: string): SilatEntry => ({ id: `e${++seq}`, personId, type, day, at: at(day, 10) });
  const s = blank();
  const bro = person('bro', 'brother', 7);
  const friend = person('fr', 'friend', 14);
  const mom = person('mom', 'mother', 1);
  s.silat = { people: [bro, friend, mom], entries: [] };
  for (let i = 1; i <= 9; i++) s.silat.entries.push(entry('bro', 'call', ago(i)));
  for (let i = 1; i <= 5; i++) s.silat.entries.push(entry('fr', 'visit', ago(i)));
  assert.equal(v(s, 'silat_kin'), 9, 'a friend is not kin');
  assert.ok(!has(s, 'silat_kin_10'));
  s.silat.entries.push(entry('bro', 'dua', ago(1)));
  assert.equal(v(s, 'silat_kin'), 9, "du'a is a deed, not a contact");
  s.silat.entries.push(entry('mom', 'visit', ago(2)));
  assert.ok(has(s, 'silat_kin_10'));
  assert.equal(v(s, 'silat_visits'), 6);
  // Du'a for a parent: distinct days (two on one day are one); du'a for a brother is not.
  for (let i = 1; i <= 6; i++) s.silat.entries.push(entry('mom', 'dua', ago(i)));
  s.silat.entries.push(entry('mom', 'dua', ago(1)));
  assert.equal(v(s, 'silat_parent_dua'), 6);
  assert.ok(!has(s, 'parent_dua_7'));
  s.silat.entries.push(entry('mom', 'dua', ago(7)));
  assert.ok(has(s, 'parent_dua_7'));
  // Neighbours: reached by a contact that counts (du'a doesn't).
  const nbs = ['n1', 'n2', 'n3'].map((id) => person(id, 'neighbor', 14));
  s.silat.people.push(...nbs);
  s.silat.entries.push(entry('n1', 'gift', ago(3)), entry('n2', 'help', ago(3)), entry('n3', 'dua', ago(3)));
  assert.equal(v(s, 'silat_neighbors'), 2);
  s.silat.entries.push(entry('n3', 'message', ago(2)));
  assert.ok(has(s, 'neighbors_3'));
  // «الواصل الحق»: a contact AFTER the repair began.
  const cousin = person('cousin', 'cousin', 30, { repair: { since: at(ago(5), 9) } });
  s.silat.people.push(cousin);
  s.silat.entries.push(entry('cousin', 'call', ago(8)));
  assert.equal(v(s, 'silat_reconciled'), 0, 'a call before the repair is not a reconciliation');
  s.silat.entries.push(entry('cousin', 'call', ago(4)));
  assert.ok(has(s, 'reconcile_1'));
  // «على العهد»: a mother reached every day for weeks; one missed day breaks the chain.
  const w = blank();
  const mother = person('m', 'mother', 1, { createdAt: at(ago(40), 8) });
  w.silat = { people: [mother], entries: [] };
  for (let i = 0; i <= 40; i++) w.silat.entries.push(entry('m', 'call', ago(i)));
  assert.ok(v(w, 'silat_weeks') >= 4);
  assert.ok(has(w, 'silat_weeks_4'));
  w.silat.entries = w.silat.entries.filter((e) => e.day !== ago(10)); // Thursday, two weeks back
  assert.equal(v(w, 'silat_weeks'), 2);
  assert.ok(!has(w, 'silat_weeks_4'));
  // No silat data at all → zeros.
  assert.equal(v(blank(), 'silat_kin'), 0);
}

// برامج التدرّج: a template's badge unlocks on finishing it; locked progress shows the RUNNING attempt.
{
  assert.equal(templateById('takbeer40')!.steps.length, BADGES.find((b) => b.id === 'program_takbeer_40')!.target);
  assert.equal(templateById('onTime40')!.steps.length, BADGES.find((b) => b.id === 'program_on_time_40')!.target);
  assert.equal(templateById('qiyam30')!.steps.length, BADGES.find((b) => b.id === 'program_qiyam_30')!.target);
  const okDays = (from: number, days: number[]) => Object.fromEntries(days.map((d) => [ago(from - d), { ok: true }]));
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const prog = (p: Partial<ProgramRun>): ProgramRun => ({
    id: 'r', startDay: ago(30), grace: 'strict', status: 'active', pauses: {}, checks: {}, remindersOn: false, createdAt: 0, ...p,
  });
  // Strict: 20 days, a miss (reset), then 9 more — best 20, but the badge shows the live 9.
  const s = blank();
  s.programs = [prog({ id: 'a', templateId: 'takbeer40', checks: okDays(30, [...range(0, 19), ...range(21, 29)]) })];
  const m = computeBadgeMetrics(s);
  assert.equal(m.value.program_takbeer, 9);
  assert.equal(m.best.program_takbeer, 20);
  const takbeer = BADGES.find((b) => b.id === 'program_takbeer_40')!;
  assert.equal(progressOf(takbeer, m).current, 9);
  assert.equal(m.value.programs_finished, 0);
  // Forty clean days → finished: the takbeer badge, «المتدرّج», and no comeback.
  s.programs = [prog({ id: 'b', templateId: 'takbeer40', startDay: ago(45), status: 'done', finishedOn: ago(6), checks: okDays(45, range(0, 39)) })];
  assert.ok(has(s, 'program_takbeer_40'));
  assert.ok(has(s, 'programs_1'));
  assert.ok(!has(s, 'program_comeback_1'));
  assert.ok(!has(s, 'program_qiyam_30'));
  // Forgiving qiyam with a missed night, then finished → «سُلَّم القيام» + «من التوّابين».
  s.programs.push(prog({ id: 'c', templateId: 'qiyam30', grace: 'forgiving', startDay: ago(40), checks: okDays(40, [...range(0, 9), ...range(11, 30)]) }));
  const m2 = computeBadgeMetrics(s);
  assert.equal(m2.value.programs_finished, 2);
  assert.equal(m2.value.program_comebacks, 1);
  assert.ok(has(s, 'program_qiyam_30'));
  assert.ok(has(s, 'program_comeback_1'));
  assert.ok(!has(s, 'programs_3'));
  // Gender: «براءة من النار والنفاق» for men, «على أول وقتها» for women; neither before a gender is set.
  assert.ok(badgesFor('male').some((b) => b.id === 'program_takbeer_40'));
  assert.ok(!badgesFor('male').some((b) => b.id === 'program_on_time_40'));
  assert.ok(badgesFor('female').some((b) => b.id === 'program_on_time_40'));
  assert.ok(!badgesFor('female').some((b) => b.id === 'program_takbeer_40'));
  assert.ok(!badgesFor(null).some((b) => b.audience));
  const woman = blank();
  woman.gender = 'female';
  woman.programs = [prog({ id: 'd', templateId: 'onTime40', startDay: ago(45), checks: okDays(45, range(0, 39)) })];
  assert.ok(has(woman, 'program_on_time_40'));
  const model = buildBadgeModel(computeBadgeMetrics(woman), [], {}, 'female', NOW);
  assert.ok(model.tracks.some((t) => t.metric === 'program_on_time') && !model.tracks.some((t) => t.metric === 'program_takbeer'));
}

// قضاء ما فات: made-up prayers (never above what is owed); a Ramadan's fasts made up before the
// next Ramadan. Private: every qada badge is a secret — never suggested, found only by doing it.
{
  const s = blank();
  s.qada = { debts: [{ id: 'p', kind: 'prayer', counts: { fajr: 3, isha: 1 }, source: 'manual', at: 0 }], paid: {} };
  assert.ok(!has(s, 'qada_1'));
  s.qada.paid = { [ago(2)]: { fajr: 5 }, [ago(1)]: { asr: 2 } };
  assert.equal(v(s, 'qada_prayers'), 3, 'capped at what is owed, per prayer');
  assert.ok(has(s, 'qada_1'));
  assert.ok(!has(s, 'qada_100'));
  assert.ok(BADGES.filter((b) => b.metric.startsWith('qada_')).every((b) => b.hidden && b.hint));
  // The oldest Ramadan settles first: 1446's day (due 1 Ramadan 1447) paid late, 1447's on time.
  const fast = (year: number, count: number) => ({ id: `f${year}`, kind: 'fast' as const, count, reason: 'illness' as const, year, source: 'manual' as const, at: 0 });
  const r = blank();
  r.qada = { debts: [fast(1446, 1)], paid: { '2026-10-01': { fast: 1 } } };
  assert.equal(v(r, 'qada_ramadan'), 0, '1446 made up after Ramadan 1447 began');
  assert.ok(!has(r, 'qada_ramadan_1'));
  r.qada.debts.push(fast(1447, 1));
  r.qada.paid['2026-10-02'] = { fast: 1 };
  assert.equal(v(r, 'qada_ramadan'), 1);
  r.qada.debts.push(fast(1447, 1)); // one more day owed for 1447, not yet made up
  assert.equal(v(r, 'qada_ramadan'), 0);
  // Discreet: the qada tracks stay secret (out of «القادم» and the door's next step) until found.
  const model = buildBadgeModel(computeBadgeMetrics(blank()), [], {}, 'male', NOW);
  assert.ok(model.tracks.filter((t) => t.metric.startsWith('qada_')).every((t) => t.secret));
  const found = buildBadgeModel(computeBadgeMetrics(s), ['qada_1'], {}, 'male', NOW);
  assert.ok(!found.nearest.some((x) => x.badge.metric.startsWith('qada_')));
  assert.ok(!doorStandings(found).doors.some((d) => d.step?.badge.metric.startsWith('qada_')));
}

// محاسبة الجمعة: consecutive reviewed weeks (keyed by Friday), resolves kept, and الكهف on Fridays.
{
  const s = blank(); // NOW is Sunday 2026-11-08: this week (ending 11-13) is still open
  const done = { doneAt: at('2026-11-06', 18) };
  s.fridayReview = { reviews: { '2026-11-06': done, '2026-10-30': done, '2026-10-23': done, '2026-10-16': done } };
  assert.ok(has(s, 'muhasaba_4'));
  delete s.fridayReview.reviews['2026-10-30'];
  const m = computeBadgeMetrics(s);
  assert.equal(m.value.muhasaba_streak, 1);
  assert.equal(m.best.muhasaba_streak, 2);
  assert.ok(!has(s, 'muhasaba_4'));
  s.fridayReview.reviews = { a: { kept: 'yes' }, b: { kept: 'yes' }, c: { kept: 'partly' }, d: { kept: 'no' } };
  assert.equal(v(s, 'muhasaba_kept'), 2);
  assert.ok(!has(s, 'kept_3'));
  s.fridayReview.reviews.e = { kept: 'yes', doneAt: 1 };
  assert.ok(has(s, 'kept_3'));
  s.fridayReview.sunan = { '2026-11-06': ['kahf', 'salawat'], '2026-10-30': ['kahf'], '2026-10-23': ['salawat'], '2026-10-16': ['kahf'] };
  assert.equal(v(s, 'friday_kahf'), 3);
  assert.ok(!has(s, 'kahf_4'));
  s.fridayReview.sunan['2026-10-09'] = ['kahf', 'hour'];
  assert.ok(has(s, 'kahf_4'));
}

// المجموعات: completed group khatmas the user read in.
{
  const s = blank();
  assert.ok(!has(s, 'group_khatma_1'));
  s.groupKhatmas = { [ago(3)]: 1, [ago(1)]: 2 };
  assert.equal(v(s, 'group_khatmat'), 3);
  assert.ok(has(s, 'group_khatma_1'));
  assert.ok(!has(s, 'group_khatma_5'));
}

// The new doors are optional: never «waiting» for someone who never opened them; activity counts.
{
  const fresh = doorStandings(buildBadgeModel(computeBadgeMetrics(blank()), [], {}, 'male', NOW));
  assert.ok(!fresh.weak.some((d) => d.id === 'silat' || d.id === 'tazkiya'));
  const s = blank();
  s.silat = { people: [{ id: 'm', name: 'm', relation: 'mother', everyDays: 1, createdAt: at(ago(60), 8) }], entries: [] };
  for (let i = 0; i < 28; i++) s.silat.entries.push({ id: `x${i}`, personId: 'm', type: 'call', day: ago(i), at: at(ago(i), 9) });
  assert.equal(computeBadgeMetrics(s).activity!.silat, 1);
  const strong = doorStandings(buildBadgeModel(computeBadgeMetrics(s), [], {}, 'male', NOW)).strong;
  assert.equal(strong[0].id, 'silat');
}

assert.equal(BADGES.length, 429, 'catalog size (379 + 40 for the 2026-11-17 chapters + 10 for مصحفي sessions 2026-11-20)');
assert.equal(TRACKS.length, 139);
console.log(`badges: ok (${BADGES.length} badges, ${TRACKS.length} tracks)`);
