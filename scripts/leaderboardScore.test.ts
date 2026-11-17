/**
 * Executable check for «الترتيب» day points (services/leaderboardScore.ts).
 *   npx esbuild scripts/leaderboardScore.test.ts --bundle --format=esm --platform=node \
 *     --alias:@=./src --outfile=.tmp-test/lb.test.mjs "--define:import.meta.env={}" && node .tmp-test/lb.test.mjs
 */
import assert from 'node:assert/strict';
import { scoreDay, wirdWeight, LB, type ScoreInput, type WirdInput } from '@/services/leaderboardScore';
import { CHORES, choresFor } from '@/data/houseChores';

const K = '2026-11-14';
const Y = '2026-11-13';
const ts = (k: string, h: number) => new Date(`${k}T${String(h).padStart(2, '0')}:00:00`).getTime();
const ev = (k: string, domain: string, refId: string | undefined, amount: number) => ({ ts: ts(k, 9), dateKey: k, domain, refId, amount });

function base(): ScoreInput {
  return {
    prayerLog: {},
    excused: {},
    duha: {},
    qiyam: {},
    lastThirdNights: [],
    events: [],
    dailyProgress: {},
    mushafi: { days: {}, khatmas: [], marks: [] },
    sadaqah: [],
    targets: [],
  };
}
const pts = (s: ScoreInput, k = K) => scoreDay(s, k).total;
const endOf = (k: string) => new Date(`${k}T23:59:59.999`).getTime();
/** A daily wird of 100 dhikr, its period = K. */
const wird = (o: Partial<WirdInput> & { id: string }): WirdInput => ({
  title: o.id,
  unit: 'dhikr',
  total: 100,
  current: 0,
  deadline: endOf(K),
  recurrence: 'daily',
  ...o,
});
const awrad = (s: ScoreInput, k = K) => scoreDay(s, k).parts.filter((p) => p.id.startsWith('awrad:')).reduce((n, p) => n + p.points, 0);
const part = (s: ScoreInput, id: string, k = K) => scoreDay(s, k).parts.find((p) => p.id === id)?.points ?? 0;

// Empty day.
assert.equal(pts(base()), 0);
assert.deepEqual(scoreDay(base(), K).parts, []);

// Five fard, two in the mosque (Fajr heavier), three post-prayer adhkar, rawatib.
{
  const s = base();
  s.gender = 'male';
  s.prayerLog[K] = {
    fajr: { fard: true, mosque: true, adhkar: true, sunnahBefore: true },
    dhuhr: { fard: true, mosque: true, adhkar: true, sunnahBefore: true, sunnahAfter: true },
    asr: { fard: true, adhkar: true },
    maghrib: { fard: true },
    isha: { fard: true },
  };
  assert.equal(part(s, 'fard'), 50);
  assert.equal(part(s, 'mosque'), LB.mosqueHeavy + LB.mosque);
  assert.equal(part(s, 'after'), 3 * LB.after);
  assert.equal(part(s, 'rawatib'), 2 + 4 + 2);
  assert.equal(pts(s), 50 + LB.mosqueHeavy + LB.mosque + 9 + 8);
  assert.equal(pts(s, Y), 0, 'other days untouched');
}

// Excused day: the five fard credited, nothing negative.
{
  const s = base();
  s.excused[K] = true;
  assert.equal(part(s, 'fard'), 5 * LB.fard);
}

// Qiyam belongs to its evening; capped rakaat; witr + last third; legacy 0 rakaat = 2.
{
  const s = base();
  s.qiyam[Y] = { rakaat: 20, witr: true, loggedAt: ts(K, 3) };
  s.lastThirdNights = [Y];
  assert.equal(part(s, 'qiyam', Y), LB.qiyamMax * LB.qiyam + LB.witr + LB.lastThird);
  assert.equal(part(s, 'qiyam', K), 0, 'a night prayed after midnight scores its evening');
  s.qiyam[K] = { rakaat: 0, witr: false, loggedAt: ts(K, 23) };
  assert.equal(part(s, 'qiyam', K), 2 * LB.qiyam);
}

// Duha capped at 8 rakaat; legacy `true` = 2.
{
  const s = base();
  s.duha[K] = 12;
  s.duha[Y] = true;
  assert.equal(part(s, 'duha'), LB.duhaMax * LB.duha);
  assert.equal(part(s, 'duha', Y), 2 * LB.duha);
}

// Fasting 30, sadaqah once a day whatever the amount.
{
  const s = base();
  s.dailyProgress[K] = { dateKey: K, overallRate: 1, modules: [{ moduleId: 'fasting', completed: true, completionRate: 1 } as never] };
  s.sadaqah = [
    { date: K, cause: 'x' },
    { date: K, cause: 'y' },
  ];
  assert.equal(part(s, 'fasting'), 30);
  assert.equal(part(s, 'sadaqah'), LB.sadaqah);
}

// Adhkar sets pro rata to their full reps; a second reading can't exceed the set.
{
  const s = base();
  s.setReps = { morning: 100, evening: 100 };
  s.events = [ev(K, 'dhikr', 'morning', 50), ev(K, 'dhikr', 'evening', 300), ev(K, 'dhikr', 'sleep', 3)];
  assert.equal(part(s, 'morning'), LB.morning / 2);
  assert.equal(part(s, 'evening'), LB.evening);
  assert.equal(part(s, 'sleep'), LB.sleep, 'no set size → any reading counts whole');
}

// Tasbih: one per hundred, capped.
{
  const s = base();
  s.events = [ev(K, 'tasbih', 'c1', 5000)];
  assert.equal(part(s, 'tasbih'), LB.tasbihMax);
}

// Awrad weigh their effort: a longer text or a bigger count is heavier (owner).
{
  const istighfar = wird({ id: 'a', note: 'أستغفر الله' });
  const tahlil = wird({ id: 'b', note: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير' });
  assert.equal(wirdWeight(istighfar), 4);
  assert.equal(wirdWeight(tahlil), 10);
  assert.ok(wirdWeight({ ...istighfar, total: 1000 }) > wirdWeight(istighfar), 'bigger count');
  assert.equal(wirdWeight(wird({ id: 'p', unit: 'page', total: 1 })), 4);
  assert.equal(wirdWeight(wird({ id: 'j', unit: 'juz', total: 1 })), LB.wirdMax);
  assert.equal(wirdWeight(wird({ id: 's', total: 3 })), LB.wirdMin);
  assert.equal(wirdWeight(wird({ id: 'w', total: 700, recurrence: 'weekly' })), wirdWeight(wird({ id: 'd' })), 'a weekly wird weighs its daily share');
}

// A DAILY wird is read from its own record — «أتممته», manual entry, another device: no log needed.
{
  const s = base();
  s.targets = [wird({ id: 'd', current: 100 }), wird({ id: 'half', current: 50 }), wird({ id: 'once', total: 10, current: 10, recurrence: 'none' })];
  assert.equal(part(s, 'awrad:d'), wirdWeight(s.targets[0]), 'complete without a single logged rep');
  assert.equal(part(s, 'awrad:half'), Math.round(wirdWeight(s.targets[1]) / 2), 'pro rata');
  assert.equal(part(s, 'awrad:once'), 0, 'one-off goals are not daily worship');
  // Yesterday: the closed period; today's live record doesn't leak into it.
  s.periods = [{ targetId: 'd', endedAt: endOf(Y), goal: 100, done: 100 }];
  assert.equal(part(s, 'awrad:d', Y), wirdWeight(s.targets[0]));
  assert.equal(part(s, 'awrad:half', Y), 0);
  // A rescue surcharge isn't part of the period's goal.
  s.targets = [wird({ id: 'r', total: 150, current: 100, rescue: { lost: 5, step: 1, surcharge: 50 } })];
  assert.equal(part(s, 'awrad:r'), wirdWeight(s.targets[0]));
  // نافلة: what goes beyond the goal weighs like the wird — uncapped (owner); yesterday's from its period.
  s.targets = [wird({ id: 'n', current: 100, extra: 300 })];
  assert.equal(part(s, 'nafl:n'), 3 * wirdWeight(s.targets[0]));
  s.periods = [{ targetId: 'n', endedAt: endOf(Y), goal: 100, done: 100, base: 100, extra: 50 }];
  assert.equal(part(s, 'nafl:n', Y), Math.round(wirdWeight(s.targets[0]) / 2));
  s.targets = Array.from({ length: 9 }, (_, i) => wird({ id: `j${i}`, unit: 'juz', total: 1, current: 1, extra: 1 }));
  assert.equal(awrad(s), LB.awradMax, 'the wirds are capped…');
  assert.equal(scoreDay(s, K).parts.filter((x) => x.id.startsWith('nafl:')).reduce((n, x) => n + x.points, 0), 9 * LB.wirdMax, '…their nafila is not');
}

// Women: «على وقتها» weighs like the men's mosque (her prayer at home is the better one).
{
  const s = base();
  s.gender = 'female';
  s.prayerLog[K] = { fajr: { fard: true, onTime: true }, dhuhr: { fard: true, onTime: true, mosque: true }, asr: { fard: true } };
  assert.equal(part(s, 'onTime'), LB.mosqueHeavy + LB.mosque);
  assert.equal(part(s, 'mosque'), 0);
  s.gender = 'male';
  assert.equal(part(s, 'mosque'), LB.mosque, 'a man: only the mosque counts');
  assert.equal(part(s, 'onTime'), 0);
}

// A weekly wird: the day's logged reps against its daily share; all awrad together capped.
{
  const s = base();
  s.targets = [wird({ id: 'w', total: 70, recurrence: 'weekly', deadline: endOf(K) + 3 * 86_400_000 })];
  s.events = [ev(K, 'awrad', 'w', 35), ev(K, 'awrad', 'gone', 999)];
  assert.equal(awrad(s), wirdWeight(s.targets[0]), 'over its day share → whole');
  s.events = [ev(K, 'awrad', 'w', 5)];
  assert.equal(awrad(s), Math.round(wirdWeight(s.targets[0]) / 2));
  s.targets = Array.from({ length: 9 }, (_, i) => wird({ id: `t${i}`, unit: 'juz', total: 1, current: 1 }));
  assert.equal(awrad(s), LB.awradMax);
}

// Friday (Y) for men is الجمعة: no قبلية, four after; a woman's Friday is a Dhuhr.
{
  const s = base();
  s.gender = 'male';
  s.prayerLog[Y] = { dhuhr: { fard: true, sunnahBefore: true, sunnahAfter: true } };
  assert.equal(part(s, 'rawatib', Y), 4 * LB.rawatib);
  s.gender = 'female';
  assert.equal(part(s, 'rawatib', Y), 6 * LB.rawatib);
}

// Quran: only pages a ختمة carries (owner) — read ×2, listened ×1, each page once, uncapped.
const khatma = (id: string, b: number, to: number, ty?: string) => ({ id, m: '', n: id, at: to + 1, s: '2026-11-01', d: 30, b, t: 0, ...(ty ? { ty } : {}) });
const range = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
{
  const s = base();
  s.mushafi.khatmas = [khatma('read', 0, 20), khatma('heard', 100, 110, 'listen')];
  s.mushafi.days[K] = [...range(1, 10), ...range(101, 104), 500, 501]; // 500–501: outside any khatma
  assert.equal(part(s, 'quran'), 10 * LB.pageRead + 4 * LB.pageListen);
  s.mushafi.days[Y] = range(1, 10);
  s.mushafi.days[K] = range(1, 10);
  assert.equal(part(s, 'quran'), 0, 'pages already counted yesterday');
  assert.equal(part(s, 'quran', Y), 10 * LB.pageRead);
  s.mushafi.khatmas = [];
  assert.equal(part(s, 'quran', Y), 0, 'no khatma → reading earns nothing');
  s.mushafi.khatmas = [khatma('all', 0, 604)];
  s.mushafi.days = { [K]: range(1, 604) };
  assert.equal(part(s, 'quran'), 604 * LB.pageRead, 'a whole khatma in a day — no cap (owner)');
}

// A very full day: uncapped Qur'an goes past the server cap (600) — the upload clamps.
{
  const s = base();
  s.prayerLog[K] = Object.fromEntries(
    (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((p) => [p, { fard: true, mosque: true, adhkar: true, sunnahBefore: true, sunnahAfter: true }]),
  );
  s.duha[K] = 12;
  s.qiyam[K] = { rakaat: 99, witr: true, loggedAt: 0 };
  s.lastThirdNights = [K];
  s.dailyProgress[K] = { dateKey: K, overallRate: 1, modules: [{ moduleId: 'fasting', completed: true, completionRate: 1 } as never] };
  s.mushafi.khatmas = [khatma('all', 0, 604)];
  s.mushafi.days[K] = range(1, 604);
  s.sadaqah = [{ date: K, cause: 'x' }];
  s.events = [ev(K, 'dhikr', 'morning', 1), ev(K, 'dhikr', 'evening', 1), ev(K, 'dhikr', 'sleep', 1), ev(K, 'tasbih', 'c', 1e6)];
  s.gender = 'male';
  s.targets = Array.from({ length: 9 }, (_, i) => wird({ id: `t${i}`, unit: 'juz', total: 1, current: 1 }));
  const total = pts(s);
  // Qur'an and nafila are uncapped (owner) — a whole khatma passes the server's 600; pushScores clamps the upload.
  assert.ok(total > 600, `max day ${total}`);
}

// حلقات العلم: minutes (logged → the circle's «مدة الدرس» → the weekday's slot → live 60 / recorded 30), + in person.
{
  const s = base();
  const at = ts(K, 20);
  const wd = new Date(at).getDay();
  s.circles = [
    // Live in person, the slot says 90 min: 9 × 2 + 3 = 21.
    { format: 'live', status: 'active', subject: 'fiqh', platform: 'inperson', slots: [{ weekday: wd, durationMin: 90 }], log: [{ date: at, status: 'attended' }] },
    // Recorded, 40 min logged: 4 × 2 = 8; a missed one and yesterday's earn nothing here.
    {
      format: 'series',
      status: 'active',
      subject: 'tafsir',
      platform: 'youtube',
      log: [
        { date: at, status: 'watched', durationMin: 40 },
        { date: at, status: 'missed', durationMin: 60 },
        { date: ts(Y, 20), status: 'watched' },
      ],
    },
  ];
  assert.equal(part(s, 'study'), 21 + 8);
  assert.equal(part(s, 'study', Y), 3 * LB.studyPer10, 'recorded default: half an hour');
  // The circle's «مدة الدرس» outranks the slot (a logged length outranks both): 4.5 × 2 + 3.
  s.circles![0].durationMin = 45;
  assert.equal(part(s, 'study'), 12 + 8);
  // A typo of 600 minutes counts as studyMaxMin.
  s.circles = [{ format: 'series', status: 'active', subject: 'fiqh', log: [{ date: at, status: 'watched', durationMin: 600 }] }];
  assert.equal(part(s, 'study'), (LB.studyMaxMin / 10) * LB.studyPer10);
}

// مهام المنزل: each chore by its catalog points, on its own day; unknown ids earn nothing.
{
  const s = base();
  s.house = [
    { chore: 'cook', kind: 'full', day: K },
    { chore: 'dishes', kind: 'meal', day: K },
    { chore: 'dishes', kind: 'meal', day: K },
    { chore: 'iron', day: K },
    { chore: 'shopping', kind: 'big', day: Y },
    { chore: 'gone', day: K },
    { chore: 'cook', kind: 'nope', day: K },
  ];
  assert.equal(part(s, 'house'), 10 + 3 + 3 + 4);
  assert.equal(part(s, 'house', Y), 6);
  // Owner 2026-11-16: a man never sees the women's chores; a woman still sees every chore.
  assert.ok(choresFor('male').length && choresFor('male').every((c) => c.for !== 'female'));
  assert.equal(choresFor('female').length, CHORES.length);
}

console.log('leaderboardScore: all checks passed');
