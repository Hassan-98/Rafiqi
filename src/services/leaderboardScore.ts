/**
 * «الترتيب» — a day's points, PURE: the badge snapshot (same data the badges
 * read) + a dateKey in, the points and how they were earned out.
 * scripts/leaderboardScore.test.ts checks it.
 *
 * Weighted by the effort of the deed (owner: صيام ٣٠، الصلاة ١٠، المسجد ٥…),
 * most categories capped; the Qur'an in khatmas and sessions and the awrad's
 * nafila are NOT (owner: an app of muhasaba) — the server keeps 600 a day.
 * A session by its pages only — never its length (owner 2026-11-20).
 * A qiyam night belongs to its EVENING (qiyamStore night keys), so a night
 * prayed at 3am raises the score of the day before.
 * An excused day (حيض/نفاس) credits the five fard: the board must not rank a
 * woman down for a day Allah excused her — her breakdown never leaves the device.
 */
import { format } from 'date-fns';
import { adhkarCountOf, duhaRakaatOf, rawatibRakaatOf, PRAYERS_ORDER } from '@/store/prayerLogStore';
import { quranTypeStats, sessionCredit, sessionStats } from '@/store/mushafiStore';
import { QURAN_TYPE_IDS } from '@/data/quranTypes';
import { chorePoints } from '@/data/houseChores';
import { silatPointsOn } from '@/store/silatModel';
import { CONTACT, RECONCILE_POINTS, SILAT_DAY_MAX } from '@/data/silatContent';
import { qadaPointsOn, QADA_POINTS } from '@/services/qadaPlan';
import { programPointsOn, PROGRAM_POINTS } from '@/store/programsModel';
import { fridayReviewPointsOn, REVIEW_POINTS } from '@/services/fridayReview';
import type { BadgeSnapshot } from '@/services/badgeMetrics';
import type { PrayerName } from '@/types';
import type { Target, TargetPeriodRecord, TargetUnit } from '@/store/targetsStore';

export const LB = {
  fard: 15,
  /** Men: in congregation at the mosque; women: «على وقتها» (her prayer at home
   *  is the better one). Fajr and Isha weigh more («أثقل الصلاة على المنافقين»). */
  mosque: 3,
  mosqueHeavy: 5,
  /** أذكار ما بعد كل صلاة. */
  after: 3,
  /** Per rak'ah of the rawatib (12 a day). */
  rawatib: 2,
  /** Per rak'ah of الضحى, up to 12 (the largest option the log offers). */
  duha: 3,
  duhaMax: 12,
  /** Per rak'ah of قيام الليل, up to 13; the witr and the last third on top. */
  qiyam: 3,
  qiyamMax: 13,
  witr: 5,
  lastThird: 5,
  fasting: 30,
  morning: 10,
  evening: 10,
  /** On top of the morning / evening set: «لا إله إلا الله وحده لا شريك له…» ×100 (owner 2026-11-20:
   *  long, takes time, and weighty) — 12 in all, pro rata to its count. */
  tahlil: 2,
  sleep: 2,
  /** Per page of a ختمة read (تلاوة/تفسير) / listened, or of a session in مصحفي (2026-11-20) —
   *  reading outside both earns nothing. A session's page a khatma already counted that day counts once. */
  pageRead: 2,
  pageListen: 1,
  /** Per page reviewed: of a review (hifz) ختمة, a review session, or memorized again (owner 2026-11-20: 3). */
  reviewPage: 3,
  /** A page memorized for the FIRST time in a hifz session (owner 2026-11-20: 15 — was 30 the same day). */
  hifzPage: 15,
  /** A wird completed that day (pro rata): per minute it takes (wirdWeight) — no ceiling
   *  (owner 2026-11-19: a thousand must not weigh the same as two hundred). */
  wirdPerMinute: 1, // halved the same day (owner) — also = a khatma's Qur'an rate (a page ≈ 2 min = 2)
  /** Points per hundred tasbih (owner 2026-11-19: 2, was 1), counted up to tasbihMax hundreds a day. */
  tasbih: 2,
  tasbihMax: 10,
  sadaqah: 10,
  /** حلقات العلم: per 10 minutes of a lesson; attending in person on top, like the mosque
   *  («من سلك طريقاً يلتمس فيه علماً»). A lesson counts up to studyMaxMin (typos). */
  studyPer10: 1,
  studyInPerson: 3,
  studyMaxMin: 180,
  /** A group khatma completed, for each member who read in it (their pages already score via مصحفي). */
  groupKhatma: 5,
} as const;

export interface LbRule {
  label: string;
  /** One short value: «١٥», «+٣», «٢–١٥». */
  points: string;
  /** Caps and extras, a muted line under the label. */
  note?: string;
  /** Shown only to this gender (both when it is unset). */
  for?: 'male' | 'female';
}

const silatPts = Object.values(CONTACT).map((c) => c.points);

/** «كيف تُحتسب النقاط» — grouped like the app's sections, from the same numbers. */
export const LB_RULES: { title: string; rules: LbRule[] }[] = [
  {
    title: 'الصلاة',
    rules: [
      { label: 'كل صلاة مفروضة', points: `${LB.fard}` },
      { label: 'جماعةً في المسجد', points: `+${LB.mosque}`, note: `الفجر والعشاء +${LB.mosqueHeavy}`, for: 'male' },
      { label: 'على وقتها', points: `+${LB.mosque}`, note: `الفجر والعشاء +${LB.mosqueHeavy}`, for: 'female' },
      { label: 'أذكار بعد كل صلاة', points: `${LB.after}` },
      { label: 'السنن الرواتب، لكل ركعة', points: `${LB.rawatib}` },
      { label: 'الضحى، لكل ركعة', points: `${LB.duha}`, note: `حتى ${LB.duhaMax} ركعة` },
      { label: 'قيام الليل، لكل ركعة', points: `${LB.qiyam}`, note: `حتى ${LB.qiyamMax} ركعة` },
      { label: 'الوتر', points: `+${LB.witr}` },
      { label: 'القيام في الثلث الأخير', points: `+${LB.lastThird}` },
      { label: 'قضاء صلاة فائتة', points: `${QADA_POINTS.prayer}`, note: `حتى ${QADA_POINTS.prayerMax} صلوات في اليوم` },
    ],
  },
  {
    title: 'الصيام',
    rules: [
      { label: 'صيام التطوع', points: `${LB.fasting}` },
      { label: 'قضاء يوم صيام', points: `${QADA_POINTS.fast}` },
    ],
  },
  {
    title: 'القرآن',
    rules: [
      { label: 'صفحة من ختماتك قراءةً', points: `${LB.pageRead}`, note: 'تلاوة أو تفسير · بلا حد' },
      { label: 'صفحة من ختماتك استماعاً', points: `${LB.pageListen}`, note: 'بلا حد' },
      { label: 'صفحة من ختمة مراجعة', points: `${LB.reviewPage}`, note: 'بلا حد' },
      { label: 'صفحة في جلسة تلاوة', points: `${LB.pageRead}`, note: 'من مصحفي، ما لم تحسبها ختمة يومها · بلا حد' },
      { label: 'صفحة في جلسة استماع', points: `${LB.pageListen}`, note: 'بلا حد' },
      { label: 'صفحة في جلسة مراجعة', points: `${LB.reviewPage}`, note: 'أو صفحة تعيد حفظها · بلا حد' },
      { label: 'صفحة تحفظها أول مرة', points: `${LB.hifzPage}`, note: 'في جلسة حفظ · بلا حد' },
      { label: 'ختمة جماعية تمّت', points: `${LB.groupKhatma}`, note: 'لكل من قرأ فيها' },
    ],
  },
  {
    title: 'الأذكار والأوراد',
    rules: [
      { label: 'أذكار الصباح', points: `${LB.morning + LB.tahlil}`, note: `منها ${LB.tahlil} لـ«لا إله إلا الله وحده لا شريك له» مئة مرة · المختصرة ${LB.morning / 2}` },
      { label: 'أذكار المساء', points: `${LB.evening + LB.tahlil}`, note: `منها ${LB.tahlil} لـ«لا إله إلا الله وحده لا شريك له» مئة مرة · المختصرة ${LB.evening / 2}` },
      { label: 'أذكار النوم', points: `${LB.sleep}` },
      { label: 'التسبيح، لكل مئة', points: `${LB.tasbih}`, note: `حتى ${LB.tasbihMax * 100} تسبيحة في اليوم` },
      { label: 'الوِرد، لكل دقيقة من وقته', points: `${LB.wirdPerMinute}`, note: 'عدده × طول نصّه، بلا حد' },
      { label: 'نافلة الوِرد (ما زاد على هدفه)', points: 'بميزانه', note: 'بلا حد' },
    ],
  },
  {
    title: 'البرّ والصلة',
    rules: [
      { label: 'الصدقة', points: `${LB.sadaqah}` },
      {
        label: 'صلة الرحم',
        points: `${Math.min(...silatPts)}–${Math.max(...silatPts)}`,
        note: `بحسب العمل: الزيارة ${CONTACT.visit.points}، الاتصال ${CONTACT.call.points}، الدعاء ${CONTACT.dua.points}، الاجتماع العائلي لكل من حضر (الوالدان ٤، الإخوة ٣، غيرهم ١) · أول صلة بعد قطيعة +${RECONCILE_POINTS} · حتى ${SILAT_DAY_MAX} في اليوم`,
      },
      { label: 'مهام المنزل', points: '1–15', note: 'طبخ، غسيل، تنظيف، تسوّق… بحسب المهمة' },
    ],
  },
  {
    title: 'العلم والتزكية',
    rules: [
      { label: 'حلقة العلم، لكل ١٠ دقائق', points: `${LB.studyPer10}`, note: `حتى ${LB.studyMaxMin} دقيقة للدرس` },
      { label: 'حضور الدرس في مجلسه', points: `+${LB.studyInPerson}` },
      { label: 'برامج التدرّج: خطوة اليوم', points: `${PROGRAM_POINTS.checkIn}` },
      { label: 'بلوغ محطة في البرنامج', points: `+${PROGRAM_POINTS.milestone}` },
      { label: 'إتمام البرنامج', points: `+${PROGRAM_POINTS.finish}` },
      { label: 'إتمام محاسبة الجمعة', points: `${REVIEW_POINTS}` },
    ],
  },
];

export type ScoreInput = Pick<
  BadgeSnapshot,
  'prayerLog' | 'excused' | 'duha' | 'qiyam' | 'lastThirdNights' | 'events' | 'dailyProgress' | 'mushafi' | 'sadaqah'
> &
  Partial<Pick<BadgeSnapshot, 'circles' | 'house' | 'silat' | 'qada' | 'programs' | 'fridayReview' | 'groupKhatmas'>> & {
  /** Men: Friday's sunnah is Jumu'ah's (no قبلية, four after). */
  gender?: BadgeSnapshot['gender'];
  targets: WirdInput[];
  /** Closed periods of the awrad (targetsStore.history): yesterday's daily wird is read from here. */
  periods?: Pick<TargetPeriodRecord, 'targetId' | 'endedAt' | 'goal' | 'done' | 'base' | 'extra'>[];
  /** Reps of a full morning / evening / sleep set — partial sets earn pro rata. Absent = any reading counts whole. */
  setReps?: Partial<Record<'morning' | 'evening' | 'sleep', number>>;
  /** Reps of the «مختصر» morning / evening set — finishing it earns half (owner 2026-11-18: ٥ each). */
  briefReps?: Partial<Record<'morning' | 'evening', number>>;
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
/** The ×100 «لا إله إلا الله وحده لا شريك له…» of each set (src/data/adhkar.ts ids). */
const TAHLIL: Record<string, string> = { morning: 'morning-29', evening: 'evening-28' };
const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
const dk = (ts: number) => format(new Date(ts), 'yyyy-MM-dd');

export type WirdInput = Pick<Target, 'id' | 'title' | 'unit' | 'total' | 'current' | 'deadline' | 'recurrence' | 'baseTotal' | 'note' | 'items' | 'rescue' | 'extra'>;

/** Seconds one unit takes when its text isn't known (a page of Qur'an ≈ 2 minutes). */
const UNIT_SECONDS: Record<TargetUnit, number> = { dhikr: 2, times: 2, duaa: 10, ayah: 10, page: 120, surah: 180, juz: 2400 };
/** Arabic letters as recited (no harakat) — «ﷺ» is said in full. */
const lettersOf = (x: string) => (x.replace(/ﷺ/g, ' صلى الله عليه وسلم ').match(/[ء-ي]/g) ?? []).length;
const plain = (x: string) => x.replace(/[ً-ٰٟـ]/g, '');
/**
 * A recited wird with no text of its own: the dhikr its name says.
 * ponytail: a fixed list of the common names; anything else falls back to its title
 * when that is the phrase itself (it has «الله»), else UNIT_SECONDS.
 */
const NAMED: [RegExp, string][] = [
  [/(صلاة|الصلوات|صل) على (النبي|الرسول|الحبيب|محمد)/, 'اللهم صل وسلم على نبينا محمد'],
  [/استغفار/, 'أستغفر الله وأتوب إليه'],
  [/تسبيح/, 'سبحان الله'],
  [/تحميد/, 'الحمد لله'],
  [/تهليل/, 'لا إله إلا الله'],
  [/تكبير/, 'الله أكبر'],
  [/حوقلة/, 'لا حول ولا قوة إلا بالله'],
];

/** Seconds one repetition takes, from its text (≈ 10 letters a second); null = no text to go by. */
function repSeconds(t: WirdInput): number | null {
  const items = (t.items ?? []).filter((x) => x.trim());
  const title = plain(t.title ?? '');
  const named = NAMED.find(([re]) => re.test(title))?.[1] ?? (/الله/.test(title) ? title : '');
  const texts = t.note?.trim() ? [t.note] : items.length ? items : [named];
  const letters = texts.reduce((n, x) => n + lettersOf(x), 0) / texts.length;
  return letters ? letters / 10 : null;
}

/**
 * A wird's points are its effort (owner): the minutes one day's share takes —
 * reps × how long its text is to say (a per-unit guess for Qur'an units) — at
 * LB.wirdPerMinute, with NO ceiling (owner 2026-11-19: 1000 must outweigh 200,
 * and «الصلاة على النبي» outweigh «الاستغفار»). 100 × «أستغفر الله وأتوب إليه» = 3,
 * 100 × «اللهم صلِّ وسلِّم على نبيّنا محمد» = 4, 1000 istighfar = 32, a page = 2, a juz = 40.
 */
export function wirdWeight(t: WirdInput): number {
  const per = PERIOD_DAYS[t.recurrence ?? ''] ?? 1;
  const recited = t.unit === 'dhikr' || t.unit === 'duaa' || t.unit === 'times';
  const secs = (recited && repSeconds(t)) || UNIT_SECONDS[t.unit];
  const minutes = (((t.baseTotal ?? t.total) / per) * secs) / 60;
  return Math.max(1, Math.round(minutes * LB.wirdPerMinute));
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
    if (e.domain === 'dhikr' && e.refId) {
      bump(`dhikr:${e.refId}`, e.amount);
      if (e.subId && e.subId === TAHLIL[e.refId]) bump(`tahlil:${e.refId}`, e.amount);
    }
    else if (e.domain === 'tasbih') bump('tasbih', e.amount);
    else if (e.domain === 'awrad' && e.refId) bump(`awrad:${e.refId}`, e.amount);
  }
  // By repetitions — the 100× tasbihat carry most of the morning/evening set
  // (owner, 2026-11-15: that is fair, they are most of the effort).
  // Always against the FULL set (owner 2026-11-18: «المختصرة تُحتسب ٨ كاملة والكاملة
  // أقل إن تركت جزءاً منها») — the brief set earns its share of the reps.
  const set = (id: 'morning' | 'evening' | 'sleep', label: string) => {
    const n = reps.get(`dhikr:${id}`) ?? 0;
    const full = s.setReps?.[id];
    const brief = id === 'sleep' ? undefined : s.briefReps?.[id];
    const half = LB[id] / 2;
    const tahlil = id === 'sleep' ? 0 : LB.tahlil * Math.min(1, (reps.get(`tahlil:${id}`) ?? 0) / 100);
    add(
      id,
      label,
      tahlil +
      (n <= 0
        ? 0
        : !full
          ? LB[id]
          : brief && brief < full
            ? // the brief set → half (the same for morning and evening); on to the full set → all of it
              n >= full
              ? LB[id]
              : n >= brief
                ? half + (half * (n - brief)) / (full - brief)
                : (half * n) / brief
            : LB[id] * Math.min(1, n / full)),
    );
  };
  set('morning', 'أذكار الصباح');
  set('evening', 'أذكار المساء');
  set('sleep', 'أذكار النوم');

  // A DAILY wird is read from its own record — the counter, «أتممته», manual
  // entry and another device all land there. Weekly/monthly ones have no
  // per-day record: the day's logged reps against its daily share.
  // ponytail: those miss reps logged on another device (the log isn't synced).
  // No ceiling, the wird or its نافلة (beyond the goal, weighed like the wird):
  // owner — an app of muhasaba, not a contest to game.
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
    add(`awrad:${t.id}`, `وِرد «${t.title.trim() || 'بلا اسم'}»`, w * Math.min(1, frac));
    add(`nafl:${t.id}`, `نافلة «${t.title.trim() || 'بلا اسم'}»`, w * extra);
  }
  add('tasbih', 'التسبيح', Math.min(Math.floor((reps.get('tasbih') ?? 0) / 100), LB.tasbihMax) * LB.tasbih);

  // ── القرآن: only the pages a ختمة or a session carries (owner — reading outside
  // الأوراد, الختمات and الجلسات earns nothing; a Qur'an wird scores as a wird). Each khatma page
  // counts once, on the day مصحفي first logged it inside its khatma (quranTypeStats).
  const qt = s.mushafi.khatmas.length
    ? quranTypeStats(s.mushafi.days, s.mushafi.khatmas, s.mushafi.marks, k, s.mushafi.tops)
    : undefined;
  if (qt) {
    const heard = qt.listen.days[k] ?? 0;
    const reviewed = qt.hifz.days[k] ?? 0; // a «hifz» khatma = review
    const read = QURAN_TYPE_IDS.filter((t) => t !== 'listen' && t !== 'hifz').reduce((n, t) => n + (qt[t].days[k] ?? 0), 0);
    // Uncapped, like the awrad's nafila (owner): only the server's 600/day remains.
    add('quran', 'القرآن في ختماتك', read * LB.pageRead + heard * LB.pageListen + reviewed * LB.reviewPage);
  }
  // Sessions (مصحفي «جلسة»): their pages beyond the day's khatmas, each session within its length.
  const sessions = s.mushafi.sessions?.length ? sessionStats(s.mushafi.sessions).byDay.get(k) : undefined;
  if (sessions) {
    const sum = { quran: 0, hifz: 0, review: 0 };
    for (const x of sessions) {
      const c = sessionCredit(x, qt);
      sum.quran += c.tilawa * LB.pageRead + c.listen * LB.pageListen;
      sum.hifz += c.hifz * LB.hifzPage;
      sum.review += c.review * LB.reviewPage;
    }
    add('quranSessions', 'تلاوة واستماع في جلساتك', sum.quran);
    add('hifz', 'الحفظ الجديد', sum.hifz);
    add('review', 'مراجعة المحفوظ', sum.review);
  }

  // ── الصدقة ──
  if (s.sadaqah.some((e) => e.date.slice(0, 10) === k)) add('sadaqah', 'الصدقة', LB.sadaqah);

  // ── حلقات العلم: each lesson attended/watched that day, by length × level ──
  let study = 0;
  for (const c of s.circles ?? []) {
    for (const l of c.log) {
      // «وصلت إلى الدرس …» marks lessons watched before: no points for them today.
      if (l.status === 'missed' || l.backfill || dk(l.date) !== k) continue;
      study += lessonPoints(c, l);
    }
  }
  add('study', 'حلقات العلم', study);

  // ── مهام المنزل ──
  add('house', 'مهام المنزل', (s.house ?? []).reduce((n, e) => n + (e.day === k ? chorePoints(e) : 0), 0));

  // ── the newer chapters — each module owns its rules (pure, tested there) ──
  if (s.silat) add('silat', 'صلة الرحم', silatPointsOn(s.silat.entries, s.silat.people, k).points);
  if (s.qada) {
    // A made-up fast is logged as a fast too: don't pay it twice.
    const fasted = !!s.dailyProgress[k]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed);
    add('qada', 'القضاء', qadaPointsOn(s.qada, k, { fastCredited: fasted }));
  }
  if (s.programs?.length) for (const p of programPointsOn(s.programs, k, s).parts) add(p.id, p.label, p.points);
  if (s.fridayReview) add('fridayReview', 'محاسبة الجمعة', fridayReviewPointsOn(s.fridayReview, k));
  add('groupKhatma', 'ختمة جماعية تمّت', (s.groupKhatmas?.[k] ?? 0) * LB.groupKhatma);

  return { total: parts.reduce((n, p) => n + p.points, 0), parts: parts.sort((a, b) => b.points - a.points) };
}
