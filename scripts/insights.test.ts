/**
 * Executable check for the pure insights engine (src/services/insightsEngine.ts):
 * streaks, at-risk nudges, milestone ladders, comparisons and records on a
 * synthetic snapshot with a fixed "now".
 *
 * Run: npx esbuild scripts/insights.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/insights.test.mjs
 *      node .tmp-test/insights.test.mjs
 */
import { format, subDays } from 'date-fns';
import { computeInsights, computeRecords, type InsightsSnapshot, type SnapshotEvent } from '@/services/insightsEngine';
import type { DailyProgress } from '@/types';
import { dayStreak, eachPrayerStreak } from '@/store/prayerLogStore';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Fixed clock: 2026-09-27 (Sunday) 19:30 local.
const NOW = new Date(2026, 8, 27, 19, 30);
const k = (daysAgo: number) => format(subDays(NOW, daysAgo), 'yyyy-MM-dd');
const at = (daysAgo: number, h: number) => {
  const d = subDays(NOW, daysAgo);
  d.setHours(h, 10, 0, 0);
  return d.getTime();
};

function day(key: string, modules: [string, boolean][]): DailyProgress {
  return {
    dateKey: key,
    modules: modules.map(([moduleId, completed]) => ({ moduleId, completed, completionRate: completed ? 1 : 0 })),
    overallRate: modules.filter(([, c]) => c).length / modules.length,
  };
}

// Dhikr module done the last 6 days (NOT today) → streak 6 + at-risk nudge.
const dailyProgress: Record<string, DailyProgress> = {};
for (let i = 1; i <= 6; i++) dailyProgress[k(i)] = day(k(i), [['dhikr', true], ['fasting', i === 3]]);
dailyProgress[k(0)] = day(k(0), [['prayers', true]]);

// Five prayers: 9 full days incl. today; asr missed on older days.
const prayerLog: InsightsSnapshot['prayerLog'] = {};
const prayerFardDays: Record<string, number> = {};
for (let i = 0; i < 14; i++) {
  const full = i < 9;
  prayerLog[k(i)] = {
    fajr: { fard: true, sunnahBefore: i < 7 },
    dhuhr: { fard: true },
    asr: { fard: full },
    maghrib: { fard: true },
    isha: { fard: true, witr: i % 2 === 0 },
  };
  prayerFardDays[k(i)] = full ? 5 : 4;
}

// Qiyam: 4 nights ending last night (night key of 19:30 today = today).
const qiyamNights: InsightsSnapshot['qiyamNights'] = {};
for (let i = 1; i <= 4; i++) qiyamNights[k(i)] = { nightKey: k(i), rakaat: 4 + i, witr: i !== 2, loggedAt: at(i - 1, 3) };

// Activity: morning adhkar 5 days incl. today, evening 3 days (not today), tasbih.
const activity: SnapshotEvent[] = [];
for (let i = 0; i < 5; i++) activity.push({ ts: at(i, 6), dateKey: k(i), domain: 'dhikr', refId: 'morning', subId: 'm1', title: 'أذكار الصباح', detail: 'سبحان الله وبحمده', amount: 100 });
for (let i = 1; i <= 3; i++) activity.push({ ts: at(i, 17), dateKey: k(i), domain: 'dhikr', refId: 'evening', subId: 'e1', title: 'أذكار المساء', detail: 'أستغفر الله', amount: 10 });
for (let i = 0; i < 7; i++) activity.push({ ts: at(i, 21), dateKey: k(i), domain: 'tasbih', refId: 'subhanallah', title: 'سبحان الله', amount: 200 });
activity.push({ ts: at(2, 5), dateKey: k(2), domain: 'prayer', refId: 'fajr', title: 'صلاة الفجر', amount: 1 });

const snap: InsightsSnapshot = {
  dailyProgress,
  prayerFardDays,
  qiyamNights,
  prayerLog,
  activity,
  // 10,100 lifetime; 1,400 of it this week → crossed 10,000 within 7 days.
  tasbih: [{ id: 'subhanallah', name: 'سبحان الله', total: 10100 }],
  wirdHistory: {
    [k(0)]: { unit: 'page', amount: 5, achieved: 2 },
    [k(1)]: { unit: 'page', amount: 5, achieved: 5 },
    [k(2)]: { unit: 'page', amount: 5, achieved: 7 },
  },
  // Started mid-mushaf (p. 302) and read 40 pages → 7٪, not 50٪.
  khatma: { name: 'ختمة التلاوة', read: 40 },
  targets: [
    { id: 't1', title: 'الاستغفار', current: 40, total: 100, streak: 12, recurrence: 'daily' },
    { id: 't2', title: 'الصلاة على النبي', current: 100, total: 100, streak: 3, recurrence: 'daily' },
  ],
  targetHistory: Array.from({ length: 6 }, (_, i) => ({
    targetId: 't1', title: 'الاستغفار', endedAt: at(i + 1, 23), goal: 100, done: 100, extra: i === 0 ? 20 : 0, completed: i !== 4,
  })),
  habits: [{ id: 'walk', nameAr: 'المشي' }],
  sadaqah: [{ date: k(20), amount: 50, currency: 'EGP' }],
};

const out = computeInsights(snap, NOW);
const by = (id: string) => out.find((i) => i.id === id);

console.log('computeInsights');
check('sorted by priority desc', out.every((x, i) => i === 0 || out[i - 1].priority >= x.priority));
check('ids unique', new Set(out.map((i) => i.id)).size === out.length);
check('all numbers Arabic-Indic', out.every((i) => !/[0-9]/.test(`${i.title}${i.body}${i.value ?? ''}`)), out.find((i) => /[0-9]/.test(i.body))?.body);

check('dhikr.streak = 6 days', by('dhikr.streak')?.metric === 6, JSON.stringify(by('dhikr.streak')));
check('dhikr.streak-at-risk fires (not done today)', !!by('dhikr.streak-at-risk'));
check('dhikr.milestone-near → 7', by('dhikr.milestone-near')?.metric === 7);
check('prayers.streak = 9 (today counted)', by('prayers.streak')?.metric === 9, JSON.stringify(by('prayers.streak')));
check('no prayers at-risk when today complete', !by('prayers.streak-at-risk'));
check('prayers.today-complete', !!by('prayers.today-complete'));
check('prayers.weakest = asr', by('prayers.weakest')?.body.includes('العصر') === true, by('prayers.weakest')?.body);
check('prayers.fajr-streak ≥ 14', (by('prayers.fajr-streak')?.metric ?? 0) >= 14);
check('prayers.fajr-early needs ≥3 → absent with 1', !by('prayers.fajr-early'));
check('prayers.sunnah-week counted', (by('prayers.sunnah-week')?.metric ?? 0) >= 7);

check('dhikr.morning-streak = 5', by('dhikr.morning-streak')?.metric === 5);
check('no morning-pending (done today)', !by('dhikr.morning-pending'));
check('evening-pending at 19:30 (streak 3, not today)', by('dhikr.evening-pending')?.metric === 3);
check('dhikr.most-recited = سبحان الله', by('dhikr.most-recited')?.body.includes('سبحان الله') === true);
check('tasbih crossed 10,000 this week', !!by('tasbih.lifetime.reached-10000'));
check('no premature 25,000 near (10,100 < 85%)', !by('tasbih.lifetime.near-25000'));

check('qiyam.streak = 4 nights', by('qiyam.streak')?.metric === 4, JSON.stringify(by('qiyam.streak')));
check('qiyam at-risk says الليلة', by('qiyam.streak-at-risk')?.body.includes('الليلة') === true);
check('qiyam.witr-rate 75%', by('qiyam.witr-rate')?.metric === 75);

check('quran.wird-remaining = 3 pages', by('quran.wird-remaining')?.body.includes('٣ صفحات') === true, by('quran.wird-remaining')?.body);
check('quran.khatma eta present', by('quran.khatma')?.body.includes('تختم خلال') === true, by('quran.khatma')?.body);
check('quran.khatma counts pages covered, not the page number', by('quran.khatma')?.value === '٧٪', by('quran.khatma')?.value);

check('awrad.target-streak = 12', by('awrad.target-streak')?.metric === 12);
check('awrad.pending names the unfinished wird', by('awrad.pending')?.body.includes('الاستغفار') === true);
check('awrad.rate 83%', by('awrad.rate')?.metric === 83, JSON.stringify(by('awrad.rate')));
check('awrad.extra +20', by('awrad.extra')?.metric === 20);

check('habits.pending at 19:30', !!by('habits.pending'));
check('sadaqah.gap ≥ 14 days', (by('sadaqah.gap')?.metric ?? 0) === 20);

// Domain filter integrity.
check('every insight has a known domain', out.every((i) => ['overall', 'prayers', 'dhikr', 'quran', 'awrad', 'qiyam', 'habits', 'fasting', 'sadaqah'].includes(i.domain)));

// Empty snapshot → welcome only (no crashes on missing optional sources).
const empty = computeInsights({ dailyProgress: {}, prayerFardDays: {}, qiyamNights: {} }, NOW);
check('empty snapshot → welcome + calendar-only nudges', empty.some((i) => i.id === 'overall.welcome') && empty.every((i) => i.id === 'overall.welcome' || i.id.startsWith('fasting.')), JSON.stringify(empty.map((i) => i.id)));

console.log('computeRecords');
const rec = computeRecords(snap, NOW);
const r = (id: string) => rec.find((x) => x.id === id);
check('qiyam.best-night = 8 rakaat', r('qiyam.best-night')?.metric === 8);
check('dhikr.best-day = 310 (morning 100 + evening 10 + tasbih 200)', r('dhikr.best-day')?.metric === 310, String(r('dhikr.best-day')?.metric));
check('quran.best-day = 7 pages', r('quran.best-day')?.metric === 7);
check('records omit zero values', rec.every((x) => x.metric > 0));

// ── per-prayer streaks (prayerLogStore.dayStreak) ──────────────────────────
{
  const now = new Date('2026-10-12T10:00:00');
  const k = (back: number) => format(subDays(now, back), 'yyyy-MM-dd');
  check('today not yet done does not break', dayStreak([k(1), k(2), k(3)], {}, now).current === 3);
  check('today done extends', dayStreak([k(0), k(1)], {}, now).current === 2);
  check('a missed day breaks', dayStreak([k(1), k(3), k(4)], {}, now).current === 1);
  check('excused days bridge', dayStreak([k(1), k(3)], { [k(2)]: true }, now).current === 2);
  check('longest survives a break', dayStreak([k(1), k(3), k(4), k(5)], {}, now).longest === 3);
  const log = { [k(1)]: { fajr: { fard: true }, isha: { fard: true } }, [k(2)]: { fajr: { fard: true } } };
  const each = eachPrayerStreak(log, {}, { [k(0)]: true }, now);
  check('each prayer keeps its own chain', each.fajr.current === 2 && each.isha.current === 1 && each.asr.current === 0);
  check('duha chain', each.duha.current === 1);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall insights checks passed');
