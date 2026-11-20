/**
 * Executable check for «الترتيب» day points (services/leaderboardScore.ts).
 *   npx esbuild scripts/leaderboardScore.test.ts --bundle --format=esm --platform=node \
 *     --alias:@=./src --outfile=.tmp-test/lb.test.mjs "--define:import.meta.env={}" && node .tmp-test/lb.test.mjs
 */
import assert from 'node:assert/strict';
import { scoreDay, wirdWeight, LB, type ScoreInput, type WirdInput } from '@/services/leaderboardScore';
import { CHORES, choreOf, choresFor } from '@/data/houseChores';
import type { MushafiSession } from '@/store/mushafiStore';

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
  assert.equal(part(s, 'fard'), 5 * LB.fard);
  assert.equal(part(s, 'mosque'), LB.mosqueHeavy + LB.mosque);
  assert.equal(part(s, 'after'), 3 * LB.after);
  assert.equal(part(s, 'rawatib'), (2 + 4 + 2) * LB.rawatib);
  assert.equal(pts(s), 5 * LB.fard + LB.mosqueHeavy + LB.mosque + 3 * LB.after + 8 * LB.rawatib);
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

// Duha: 12 rakaat (the top log option) = 36; legacy `true` = 2.
{
  const s = base();
  s.duha[K] = 12;
  s.duha[Y] = true;
  assert.equal(part(s, 'duha'), 36);
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

// Tasbih: 2 per hundred, up to a thousand a day.
{
  const s = base();
  s.events = [ev(K, 'tasbih', 'c1', 350)];
  assert.equal(part(s, 'tasbih'), 6);
  s.events = [ev(K, 'tasbih', 'c1', 5000)];
  assert.equal(part(s, 'tasbih'), 20);
}

// Awrad weigh their effort, per minute, NO ceiling (owner 2026-11-19): a bigger count and a longer text are heavier.
{
  // The two one-tap templates (TargetFormModal): 19 vs 23 letters.
  const istighfar = wird({ id: 'a', title: 'الاستغفار', items: ['أستغفر الله وأتوب إليه'] });
  const salah = wird({ id: 'b', title: 'الصلاة على النبي ﷺ', items: ['اللهم صلِّ وسلِّم على نبيّنا محمد'] });
  assert.equal(wirdWeight(istighfar), 3);
  assert.equal(wirdWeight(salah), 4);
  assert.ok(wirdWeight(salah) > wirdWeight(istighfar), 'الصلاة على النبي is longer to say');
  assert.equal(wirdWeight({ ...istighfar, total: 1000 }), 32);
  assert.equal(wirdWeight({ ...istighfar, total: 200 }), 6, '1000 ≈ five times 200');
  // No text written: the name says which dhikr; «ﷺ» is said in full.
  assert.equal(wirdWeight(wird({ id: 'c', title: 'الاستغفار' })), wirdWeight(istighfar));
  assert.ok(wirdWeight(wird({ id: 'e', title: 'الصلاة على النبي ﷺ' })) > wirdWeight(wird({ id: 'f', title: 'الاستغفار' })));
  assert.equal(wirdWeight(wird({ id: 'g', note: 'اللهم صل على محمد ﷺ' })), wirdWeight(wird({ id: 'h', note: 'اللهم صل على محمد صلى الله عليه وسلم' })));
  const tahlil = wird({ id: 'i', note: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير' });
  assert.equal(wirdWeight(tahlil), 9);
  assert.equal(wirdWeight(wird({ id: 'p', unit: 'page', total: 1 })), LB.pageRead, 'a page = a khatma page');
  assert.equal(wirdWeight(wird({ id: 'j', unit: 'juz', total: 1 })), 40, 'a juz a day, uncapped');
  assert.equal(wirdWeight(wird({ id: 's', total: 3 })), 1, 'a finished wird earns at least one');
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
  assert.equal(awrad(s), 9 * 40, 'no ceiling on the wirds…');
  assert.equal(scoreDay(s, K).parts.filter((x) => x.id.startsWith('nafl:')).reduce((n, x) => n + x.points, 0), 9 * 40, '…nor their nafila');
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

// A weekly wird: the day's logged reps against its daily share; no ceiling on all awrad together.
{
  const s = base();
  s.targets = [wird({ id: 'w', total: 70, recurrence: 'weekly', deadline: endOf(K) + 3 * 86_400_000 })];
  s.events = [ev(K, 'awrad', 'w', 35), ev(K, 'awrad', 'gone', 999)];
  assert.equal(awrad(s), wirdWeight(s.targets[0]), 'over its day share → whole');
  s.events = [ev(K, 'awrad', 'w', 5)];
  assert.equal(awrad(s), Math.round(wirdWeight(s.targets[0]) / 2));
  s.targets = Array.from({ length: 9 }, (_, i) => wird({ id: `t${i}`, unit: 'juz', total: 1, current: 1 }));
  assert.equal(awrad(s), 9 * wirdWeight(s.targets[0]));
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
  s.mushafi.khatmas = [khatma('rev', 0, 20, 'hifz')];
  s.mushafi.days = { [K]: [1, 2] };
  assert.equal(part(s, 'quran'), 2 * LB.reviewPage, 'a review khatma page = a review page');
}

// Sessions (مصحفي «جلسة»): read ×2, heard ×1, first memorization ×15, review ×3 — by pages, not time,
// and a page the day's khatma counted earns once.
{
  const s = base();
  const ses = (o: Partial<MushafiSession>): MushafiSession => ({ id: 'x', ty: 'tilawa', a: 0, z: 6, s: ts(K, 9), e: ts(K, 10), t: 1, ...o });
  s.mushafi.sessions = [ses({})]; // الفاتحة = page 1
  assert.equal(part(s, 'quranSessions'), LB.pageRead);
  s.mushafi.sessions = [ses({ ty: 'listen' })];
  assert.equal(part(s, 'quranSessions'), LB.pageListen);
  assert.equal(part(s, 'quranSessions', Y), 0, 'on the day it began only');
  s.mushafi.sessions = [ses({})];
  s.mushafi.khatmas = [khatma('read', 0, 20)];
  s.mushafi.days[K] = [1];
  assert.equal(part(s, 'quran'), LB.pageRead);
  assert.equal(part(s, 'quranSessions'), 0, 'the khatma already counted page 1 today');
  s.mushafi.khatmas = [];
  s.mushafi.days = {};
  s.mushafi.sessions = [ses({ id: 'h1', ty: 'hifz' }), ses({ id: 'h2', ty: 'hifz', s: ts(K, 11), e: ts(K, 12) })];
  assert.equal(part(s, 'hifz'), LB.hifzPage, 'memorized once');
  assert.equal(part(s, 'review'), LB.reviewPage, 'the second time is review');
  // By pages only, never by time (owner 2026-11-20: الكهف recorded in seconds earned nothing).
  s.mushafi.sessions = [ses({ ty: 'hifz', e: ts(K, 9) + 5_000 })];
  assert.equal(part(s, 'hifz'), LB.hifzPage, 'five seconds long — still its page');
  s.mushafi.sessions = [ses({ ty: 'review', e: ts(K, 9), m: 1 })];
  assert.equal(part(s, 'review'), LB.reviewPage, 'entered by hand, no length — still its page');
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
    // Live in person, the slot says 90 min: 9 × studyPer10 + studyInPerson.
    { format: 'live', status: 'active', subject: 'fiqh', platform: 'inperson', slots: [{ weekday: wd, durationMin: 90 }], log: [{ date: at, status: 'attended' }] },
    // Recorded, 40 min logged: 4 × studyPer10; a missed one and yesterday's earn nothing here.
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
  assert.equal(part(s, 'study'), 9 * LB.studyPer10 + LB.studyInPerson + 4 * LB.studyPer10);
  assert.equal(part(s, 'study', Y), 3 * LB.studyPer10, 'recorded default: half an hour');
  // The circle's «مدة الدرس» outranks the slot (a logged length outranks both): 4.5 × studyPer10 + studyInPerson.
  s.circles![0].durationMin = 45;
  assert.equal(part(s, 'study'), Math.round(4.5 * LB.studyPer10 + LB.studyInPerson + 4 * LB.studyPer10));
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
  assert.equal(part(s, 'house'), 10 + 3 + 3 + 4, 'iron logged before it had kinds keeps its 4');
  assert.equal(part(s, 'house', Y), 8, 'shopping/big retuned 6 → 8 (owner 2026-11-19: the men\'s points were low)');
  // Owner 2026-11-19 split/levelled the catalog: entries logged before still score as they did.
  const legacy = [
    { chore: 'fold', day: K }, // 3 — was a fixed value
    { chore: 'homework', day: K }, // 5
    { chore: 'repair', day: K }, // 6
    { chore: 'errands', day: K }, // 3
    { chore: 'clean', kind: 'deep', day: K }, // 10 — retired, split into tidy/sweep/mop/deep…
    { chore: 'clean', kind: 'tidy', day: K }, // 3
    { chore: 'scrub', day: K }, // 4 — retired
    { chore: 'kids', day: K }, // 4 — retired
    { chore: 'laundry', kind: 'hand', day: K }, // 6
    { chore: 'fold', kind: 'nope', day: K }, // 0 — an unknown kind earns nothing, `was` or not
  ];
  s.house = legacy;
  assert.equal(part(s, 'house'), 3 + 5 + 6 + 3 + 10 + 3 + 4 + 4 + 6);
  const live = CHORES.filter((c) => !c.retired);
  // Owner 2026-11-16: a man never sees the women's chores; a woman sees every live one but the men's
  // «own side only» (helping his family at home); nobody the retired.
  assert.ok(choresFor('male').length && choresFor('male').every((c) => c.for !== 'female'));
  assert.equal(choresFor('female').length, live.filter((c) => !c.ownSideOnly).length);
  assert.ok(!choresFor('female').some((c) => c.id === 'helpHome') && choresFor('male').some((c) => c.id === 'helpHome'));
  assert.equal(choresFor(null).length, live.length);
  for (const g of ['male', 'female', null] as const) assert.ok(choresFor(g).every((c) => !c.retired), `no retired chore for ${g}`);
  assert.equal(choreOf('clean')?.label, 'تنظيف البيت', 'a retired chore still labels its history');
  // Every chore one id; every live one levelled (2+ kinds, ids unique within it).
  assert.equal(new Set(CHORES.map((c) => c.id)).size, CHORES.length, 'chore ids unique');
  for (const c of live) {
    assert.ok((c.kinds?.length ?? 0) >= 2, `${c.id} has levels`);
    assert.equal(new Set(c.kinds!.map((k) => k.id)).size, c.kinds!.length, `${c.id} kind ids unique`);
  }
  // The men's side reaches the cooking's top.
  const top = (f: 'male' | 'female') => Math.max(...live.filter((c) => c.for === f).flatMap((c) => c.kinds!.map((k) => k.points)));
  assert.ok(top('male') >= top('female'), 'men\'s top points match the women\'s');
}

console.log('leaderboardScore: all checks passed');

// «مختصر» morning / evening: the brief set earns half — the same 5 for both (owner 2026-11-18); the full set 10.
{
  const s = base();
  s.setReps = { morning: 374, evening: 274 };
  s.briefReps = { morning: 78, evening: 78 };
  s.events = [
    { ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', title: '', amount: 78 },
    { ts: 0, dateKey: K, domain: 'dhikr', refId: 'evening', title: '', amount: 78 },
  ] as never;
  assert.equal(part(s, 'morning'), LB.morning / 2, 'brief morning = 5');
  assert.equal(part(s, 'evening'), LB.evening / 2, 'brief evening = 5 — equal to the morning');
  s.events = [{ ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', title: '', amount: 374 }] as never;
  assert.equal(part(s, 'morning'), LB.morning, 'the full set = 10');
  s.events = [{ ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', title: '', amount: 39 }] as never;
  assert.equal(part(s, 'morning'), Math.round(LB.morning / 4), 'half the brief set = a quarter');
  s.events = [{ ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', title: '', amount: 226 }] as never;
  assert.equal(part(s, 'morning'), Math.round(LB.morning * 0.75), 'halfway from brief to full = 7.5 → 8');
  // «لا إله إلا الله وحده لا شريك له» ×100 adds LB.tahlil on top (owner 2026-11-20: 12 in all), pro rata.
  s.events = [
    { ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', title: '', amount: 274 },
    { ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', subId: 'morning-29', title: '', amount: 100 },
  ] as never;
  assert.equal(part(s, 'morning'), LB.morning + LB.tahlil, 'the full set with the tahlil = 12');
  s.events = [{ ts: 0, dateKey: K, domain: 'dhikr', refId: 'evening', subId: 'evening-28', title: '', amount: 50 }] as never;
  // 50 reps < the brief set's 78 → 5 × 50/78, plus half the tahlil's 2
  assert.equal(part(s, 'evening'), Math.round((LB.evening / 2) * (50 / 78) + LB.tahlil / 2), 'half the tahlil = half its 2');
  s.events = [{ ts: 0, dateKey: K, domain: 'dhikr', refId: 'morning', subId: 'morning-30', title: '', amount: 100 }] as never;
  // 100 reps: past the brief set → 5 + 5 × 22/296, and no bonus
  assert.equal(part(s, 'morning'), Math.round(LB.morning / 2 + (LB.morning / 2) * (22 / 296)), 'another ×100 dhikr earns no bonus');
}
