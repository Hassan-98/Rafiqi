/**
 * «الترتيب» — a day's points, PURE: the badge snapshot (same data the badges
 * read) + a dateKey in, the points and how they were earned out.
 * scripts/leaderboardScore.test.ts checks it.
 *
 * Weighted by the effort of the deed (owner: صيام ٣٠، الصلاة ١٠، المسجد ٥…),
 * most categories capped; the Qur'an in khatmas and the awrad's nafila are
 * NOT (owner: an app of muhasaba) — the server keeps 600 a day.
 * A qiyam night belongs to its EVENING (qiyamStore night keys), so a night
 * prayed at 3am raises the score of the day before.
 * An excused day (حيض/نفاس) credits the five fard: the board must not rank a
 * woman down for a day Allah excused her — her breakdown never leaves the device.
 */
import { format } from 'date-fns';
import { adhkarCountOf, duhaRakaatOf, rawatibRakaatOf, PRAYERS_ORDER } from '@/store/prayerLogStore';
import { quranTypeStats } from '@/store/mushafiStore';
import { QURAN_TYPE_IDS } from '@/data/quranTypes';
import { chorePoints } from '@/data/houseChores';
import type { BadgeSnapshot } from '@/services/badgeMetrics';
import type { PrayerName } from '@/types';
import type { Target, TargetPeriodRecord, TargetUnit } from '@/store/targetsStore';

export const LB = {
  fard: 10,
  /** Men: in congregation at the mosque; women: «على وقتها» (her prayer at home
   *  is the better one). Fajr and Isha weigh more («أثقل الصلاة على المنافقين»). */
  mosque: 3,
  mosqueHeavy: 5,
  /** أذكار ما بعد كل صلاة. */
  after: 3,
  /** Per rak'ah of the rawatib (12 a day). */
  rawatib: 1,
  /** Per rak'ah of الضحى, up to 8. */
  duha: 2,
  duhaMax: 8,
  /** Per rak'ah of قيام الليل, up to 13; the witr and the last third on top. */
  qiyam: 3,
  qiyamMax: 13,
  witr: 5,
  lastThird: 5,
  fasting: 30,
  morning: 8,
  evening: 8,
  sleep: 2,
  /** Per page of a ختمة read (تلاوة/مراجعة/تفسير) / listened — reading outside الختمات earns nothing. */
  pageRead: 2,
  pageListen: 1,
  /** A wird completed that day (pro rata), weighed by its effort (wirdWeight); all together up to awradMax. */
  wirdMin: 2,
  wirdMax: 15,
  awradMax: 40,
  /** One point per hundred tasbih, up to tasbihMax. */
  tasbihMax: 10,
  sadaqah: 10,
  /** حلقات العلم: per 10 minutes of a lesson; attending in person on top, like the mosque
   *  («من سلك طريقاً يلتمس فيه علماً»). A lesson counts up to studyMaxMin (typos). */
  studyPer10: 2,
  studyInPerson: 3,
  studyMaxMin: 180,
} as const;

/** «كيف تُحتسب النقاط» — the table the page shows, from the same numbers. */
export const LB_RULES: { label: string; points: string }[] = [
  { label: 'الصيام (تطوعاً)', points: `${LB.fasting}` },
  { label: 'كل صلاة مفروضة', points: `${LB.fard}` },
  { label: 'جماعةً في المسجد (للرجال)', points: `+${LB.mosque} (الفجر والعشاء +${LB.mosqueHeavy})` },
  { label: 'على وقتها (للنساء)', points: `+${LB.mosque} (الفجر والعشاء +${LB.mosqueHeavy})` },
  { label: 'أذكار بعد كل صلاة', points: `${LB.after}` },
  { label: 'قيام الليل، لكل ركعة', points: `${LB.qiyam} (والوتر +${LB.witr}، والثلث الأخير +${LB.lastThird})` },
  { label: 'الضحى، لكل ركعة', points: `${LB.duha}` },
  { label: 'السنن الرواتب، لكل ركعة', points: `${LB.rawatib}` },
  { label: 'أذكار الصباح / المساء / النوم', points: `${LB.morning} / ${LB.evening} / ${LB.sleep}` },
  { label: 'القرآن في ختماتك، لكل صفحة', points: `${LB.pageRead} (استماعاً ${LB.pageListen})، بلا حد` },
  { label: 'كل وِرد يكتمل، بحسب طوله وعدده', points: `${LB.wirdMin} إلى ${LB.wirdMax}، حتى ${LB.awradMax}` },
  { label: 'نافلة الوِرد (ما زاد على هدفه)', points: 'بميزان الوِرد، بلا حد' },
  { label: 'الصدقة', points: `${LB.sadaqah}` },
  { label: 'حلقة العلم، لكل ١٠ دقائق من مدة الدرس', points: `${LB.studyPer10}، وحضورياً +${LB.studyInPerson}` },
  { label: 'مهام المنزل (طبخ، غسيل، تنظيف، تسوّق…)', points: 'من ٣ إلى ١٥ بحسب المهمة' },
  { label: 'التسبيح، لكل مئة', points: `١، حتى ${LB.tasbihMax}` },
];

export type ScoreInput = Pick<
  BadgeSnapshot,
  'prayerLog' | 'excused' | 'duha' | 'qiyam' | 'lastThirdNights' | 'events' | 'dailyProgress' | 'mushafi' | 'sadaqah'
> &
  Partial<Pick<BadgeSnapshot, 'circles' | 'house'>> & {
  /** Men: Friday's sunnah is Jumu'ah's (no قبلية, four after). */
  gender?: BadgeSnapshot['gender'];
  targets: WirdInput[];
  /** Closed periods of the awrad (targetsStore.history): yesterday's daily wird is read from here. */
  periods?: Pick<TargetPeriodRecord, 'targetId' | 'endedAt' | 'goal' | 'done' | 'base' | 'extra'>[];
  /** Reps of a full morning / evening / sleep set — partial sets earn pro rata. Absent = any reading counts whole. */
  setReps?: Partial<Record<'morning' | 'evening' | 'sleep', number>>;
};

export interface ScorePart {
  id: string;
  label: string;
  points: number;
}

export interface DayScore {
  total: number;
  parts: ScorePart[];
}

const HEAVY: PrayerName[] = ['fajr', 'isha'];
const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
const dk = (ts: number) => format(new Date(ts), 'yyyy-MM-dd');

export type WirdInput = Pick<Target, 'id' | 'title' | 'unit' | 'total' | 'current' | 'deadline' | 'recurrence' | 'baseTotal' | 'note' | 'items' | 'rescue' | 'extra'>;

/** Seconds one unit takes when its text isn't known (a page of Qur'an ≈ 2 minutes). */
const UNIT_SECONDS: Record<TargetUnit, number> = { dhikr: 2, times: 2, duaa: 10, ayah: 10, page: 120, surah: 180, juz: 2400 };
const wordsOf = (x: string) => x.split(/\s+/).filter(Boolean).length;

/**
 * A wird's weight is its effort (owner: a longer dhikr or a bigger count weighs
 * more): the minutes one day's share takes — reps × the recited text (≈ 2.5
 * words a second; otherwise a per-unit guess) — on a square-root curve between
 * LB.wirdMin and LB.wirdMax. 100 × «أستغفر الله» ≈ 4, a page of Qur'an ≈ 4,
 * 100 × «لا إله إلا الله وحده…» ≈ 10, a juz' a day = 15.
 */
export function wirdWeight(t: WirdInput): number {
  const per = PERIOD_DAYS[t.recurrence ?? ''] ?? 1;
  const texts = [t.note, ...(t.items ?? [])].filter((x): x is string => !!x?.trim());
  const recited = t.unit === 'dhikr' || t.unit === 'duaa' || t.unit === 'times';
  const words = t.note?.trim() ? wordsOf(t.note) : texts.reduce((n, x) => n + wordsOf(x), 0) / Math.max(1, texts.length);
  const secs = recited && words ? Math.max(1, words / 2.5) : UNIT_SECONDS[t.unit];
  const minutes = (((t.baseTotal ?? t.total) / per) * secs) / 60;
  return Math.min(LB.wirdMax, Math.max(LB.wirdMin, Math.round(3 * Math.sqrt(minutes))));
}

type CircleInput = NonNullable<ScoreInput['circles']>[number];

/** A lesson's minutes: as logged, else the circle's «مدة الدرس», else its weekly slot that weekday, else a live hour / a recorded half-hour. */
function lessonPoints(c: CircleInput, l: CircleInput['log'][number]): number {
  const wd = new Date(l.date).getDay();
  const mins = l.durationMin || c.durationMin || c.slots?.find((x) => x.weekday === wd)?.durationMin || (c.format === 'live' ? 60 : 30);
  const inPerson = c.platform === 'inperson' && l.status === 'attended' ? LB.studyInPerson : 0;
  return (Math.min(mins, LB.studyMaxMin) / 10) * LB.studyPer10 + inPerson;
}

export function scoreDay(s: ScoreInput, k: string): DayScore {
  const parts: ScorePart[] = [];
  const add = (id: string, label: string, points: number) => {
    const p = Math.round(points);
    if (p > 0) parts.push({ id, label, points: p });
  };
  const day = s.prayerLog[k];

  // ── الصلاة ──
  if (s.excused[k]) add('fard', 'الفروض (يوم عذر)', 5 * LB.fard);
  else add('fard', 'الصلوات المفروضة', PRAYERS_ORDER.filter((p) => day?.[p]?.fard).length * LB.fard);
  // Men: the mosque; women: «على وقتها» — the same weights, the same ceiling.
  const male = s.gender === 'male';
  const bonus = (p: PrayerName) => (male ? day?.[p]?.mosque : day?.[p]?.onTime);
  add(
    male ? 'mosque' : 'onTime',
    male ? 'الجماعة في المسجد' : 'الصلاة على وقتها',
    PRAYERS_ORDER.reduce((n, p) => n + (bonus(p) ? (HEAVY.includes(p) ? LB.mosqueHeavy : LB.mosque) : 0), 0),
  );
  add('after', 'أذكار بعد الصلاة', adhkarCountOf(day) * LB.after);
  add('rawatib', 'السنن الرواتب', rawatibRakaatOf(day, k, s.gender === 'male') * LB.rawatib);
  add('duha', 'الضحى', Math.min(duhaRakaatOf(s.duha[k]), LB.duhaMax) * LB.duha);

  // ── قيام الليل (the night of this evening) ──
  const night = s.qiyam[k];
  if (night) {
    // rakaat 0 = logged before the count was kept → the minimum, two.
    const rak = Math.min(night.rakaat || 2, LB.qiyamMax);
    add('qiyam', 'قيام الليل', rak * LB.qiyam + (night.witr ? LB.witr : 0) + (s.lastThirdNights.includes(k) ? LB.lastThird : 0));
  }

  // ── الصيام ──
  if (s.dailyProgress[k]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed)) add('fasting', 'الصيام', LB.fasting);

  // ── الأذكار والتسبيح والأوراد (activity log) ──
  const reps = new Map<string, number>();
  const bump = (id: string, n: number) => reps.set(id, (reps.get(id) ?? 0) + n);
  for (const e of s.events) {
    if (e.dateKey !== k) continue;
    if (e.domain === 'dhikr' && e.refId) bump(`dhikr:${e.refId}`, e.amount);
    else if (e.domain === 'tasbih') bump('tasbih', e.amount);
    else if (e.domain === 'awrad' && e.refId) bump(`awrad:${e.refId}`, e.amount);
  }
  // By repetitions — the 100× tasbihat carry most of the morning/evening set
  // (owner, 2026-11-15: that is fair, they are most of the effort).
  const set = (id: 'morning' | 'evening' | 'sleep', label: string) => {
    const n = reps.get(`dhikr:${id}`) ?? 0;
    const full = s.setReps?.[id];
    add(id, label, n > 0 ? LB[id] * (full ? Math.min(1, n / full) : 1) : 0);
  };
  set('morning', 'أذكار الصباح');
  set('evening', 'أذكار المساء');
  set('sleep', 'أذكار النوم');

  // A DAILY wird is read from its own record — the counter, «أتممته», manual
  // entry and another device all land there. Weekly/monthly ones have no
  // per-day record: the day's logged reps against its daily share.
  // ponytail: those miss reps logged on another device (the log isn't synced).
  // Its نافلة (beyond the goal) weighs like the wird itself and is NOT capped
  // (owner: an app of muhasaba, not a contest to game) — only the server's 600/day.
  let room: number = LB.awradMax;
  for (const t of s.targets) {
    const per = PERIOD_DAYS[t.recurrence ?? ''];
    if (!per) continue;
    let frac = 0;
    let extra = 0;
    if (per === 1) {
      const goal = t.total - (t.rescue?.surcharge ?? 0);
      const base = t.baseTotal ?? goal;
      const h = dk(t.deadline) === k ? null : s.periods?.find((x) => x.targetId === t.id && dk(x.endedAt) === k);
      if (dk(t.deadline) === k) {
        frac = goal > 0 ? t.current / goal : 0;
        extra = base > 0 ? (t.extra ?? 0) / base : 0;
      } else if (h) {
        frac = h.goal > 0 ? h.done / h.goal : 0;
        extra = h.base > 0 ? (h.extra ?? 0) / h.base : 0;
      }
    } else {
      const share = (t.baseTotal ?? t.total) / per;
      const n = share > 0 ? (reps.get(`awrad:${t.id}`) ?? 0) / share : 0;
      frac = Math.min(1, n);
      extra = Math.max(0, n - 1); // beyond the day's share
    }
    const w = wirdWeight(t);
    const points = Math.min(room, Math.round(w * Math.min(1, frac)));
    add(`awrad:${t.id}`, `وِرد «${t.title.trim() || 'بلا اسم'}»`, points);
    room -= Math.max(0, points);
    add(`nafl:${t.id}`, `نافلة «${t.title.trim() || 'بلا اسم'}»`, w * extra);
  }
  add('tasbih', 'التسبيح', Math.min(Math.floor((reps.get('tasbih') ?? 0) / 100), LB.tasbihMax));

  // ── القرآن: only the pages a ختمة carries (owner — reading outside الأوراد and
  // الختمات earns nothing; a Qur'an wird scores as a wird). Each page counts once,
  // on the day مصحفي first logged it inside its khatma (quranTypeStats).
  if (s.mushafi.khatmas.length) {
    const qt = quranTypeStats(s.mushafi.days, s.mushafi.khatmas, s.mushafi.marks, k, s.mushafi.tops);
    const heard = qt.listen.days[k] ?? 0;
    const read = QURAN_TYPE_IDS.filter((t) => t !== 'listen').reduce((n, t) => n + (qt[t].days[k] ?? 0), 0);
    // Uncapped, like the awrad's nafila (owner): only the server's 600/day remains.
    add('quran', 'القرآن في ختماتك', read * LB.pageRead + heard * LB.pageListen);
  }

  // ── الصدقة ──
  if (s.sadaqah.some((e) => e.date.slice(0, 10) === k)) add('sadaqah', 'الصدقة', LB.sadaqah);

  // ── حلقات العلم: each lesson attended/watched that day, by length × level ──
  let study = 0;
  for (const c of s.circles ?? []) {
    for (const l of c.log) {
      if (l.status === 'missed' || dk(l.date) !== k) continue;
      study += lessonPoints(c, l);
    }
  }
  add('study', 'حلقات العلم', study);

  // ── مهام المنزل ──
  add('house', 'مهام المنزل', (s.house ?? []).reduce((n, e) => n + (e.day === k ? chorePoints(e) : 0), 0));

  return { total: parts.reduce((n, p) => n + p.points, 0), parts: parts.sort((a, b) => b.points - a.points) };
}
