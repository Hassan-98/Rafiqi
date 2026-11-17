/**
 * «رفيقك اليومي» — the smart companion layer of the notifications. PURE: a
 * snapshot of the worship stores + prayer times + prefs in, a short list of
 * one-shot nudges out. smartNotifications.ts feeds it and arms the result.
 *
 * What makes it smart (not a fixed-time template):
 *  - It only speaks when something is still undone: a fard not yet logged, the
 *    أذكار of a prayer just logged, the morning / evening / sleep adhkar, the
 *    Qur'an wird, the daily أوراد, or a «تحدّي اليوم» one step from complete.
 *  - It learns WHEN: the user's usual minute for each habit (median of the
 *    last three weeks in the activity log) and how long after the adhan they
 *    usually log each prayer; prayer times anchor everything else. A reminder
 *    time the user set by hand wins over the learned one.
 *  - It writes the text from the facts of the moment: the chain at stake, the
 *    badge one step away, the time left in the window, a return after a gap,
 *    the khatma's progress — and rotates its phrasing day by day.
 *  - It delivers with restraint: a daily cap, half an hour between nudges,
 *    never on top of an adhan, quiet hours honoured (except what is bound to
 *    a prayer's own time, and the sleep adhkar at the user's learned bedtime).
 *  - It plans today plus the next two days, so a closed app still gets its
 *    morning and evening nudges; ids are dateless per slot (`…_d1`), so every
 *    re-plan overwrites instead of multiplying (see notif-stable-id-rule).
 */
import { addDays, format } from 'date-fns';
import { QURAN_TYPES, type QuranType } from '@/data/quranTypes';
import type { InsightsSnapshot, SnapshotEvent } from '@/services/insightsEngine';
import type { SmartNotificationPrefs } from '@/store/notificationStore';
import type { SoundKey } from '@/services/notifications/sounds';
import type { PrayerName } from '@/types';
import { habitRates, prayerEnd, RARE, SUNNAH_COPY, type DayTimes, type HabitKey } from '@/services/dayAttention';
import { duhaWindow } from '@/store/prayerLogStore';

export type { DayTimes } from '@/services/dayAttention';

export type CompanionKind = 'pray' | 'late' | 'after' | 'morning' | 'evening' | 'sleep' | 'quran' | 'khatma' | 'invite' | 'awrad' | 'combo' | 'suggest';

/** A today's-challenge as the badge engine reports it (only what the planner reads). */
export interface ComboLike {
  metric: string;
  title: string;
  parts: { id: string; label: string; done: boolean }[];
  doneCount: number;
  done: boolean;
}

export interface CompanionInput {
  snap: InsightsSnapshot;
  now: Date;
  prefs: SmartNotificationPrefs;
  /** Prayer times of a day (null when no location is set). */
  times: (day: Date) => DayTimes | null;
  male?: boolean;
  /** A woman's excused day today: no prayer nudges. */
  excusedToday?: boolean;
  /** Per-reminder master switches the user already has (adhan per prayer, morning, evening, Qur'an). */
  enabled?: Partial<Record<'prayers.fajr' | 'prayers.dhuhr' | 'prayers.asr' | 'prayers.maghrib' | 'prayers.isha' | 'dhikr.morning' | 'dhikr.evening' | 'quran', boolean>>;
  /** Times the user set by hand (HH:mm) — they beat the learned ones. */
  anchors?: Partial<Record<'morning' | 'evening' | 'quran', string>>;
  /** Today's Qur'an wird (null = none configured). */
  quran?: { goal: number; done: number; unit: string } | null;
  /** «مصحفي»'s running khatmas (inside their plan): what EACH owes today — the wird is their sum. */
  khatmas?: { name: string; type: QuranType; owe: number }[];
  /** Days since each running type last advanced (0 = today). */
  typeIdle?: Partial<Record<QuranType, number>>;
  /** Kinds of khatma the user never had — a weekly invitation to have a share in them. */
  noShare?: QuranType[];
  /** Minutes to finish each set at a calm pace (after: per prayer). */
  minutes?: { morning?: number; evening?: number; sleep?: number; after?: Partial<Record<PrayerName, number>> };
  /** A badge the next completion of this habit unlocks, by nudge kind / prayer. */
  nearBadges?: Partial<Record<CompanionKind | `pray:${PrayerName}`, string>>;
  /** «تحديات اليوم» from the badge engine. */
  combos?: ComboLike[];
  /** Suggested sunnah the user muted (attentionStore). */
  muted?: readonly string[];
  /** سورة الكهف already read today (مصحفي pages). */
  kahfRead?: boolean;
}

export interface CompanionNudge {
  id: string;
  kind: CompanionKind;
  title: string;
  body: string;
  at: Date;
  deepLinkPath: string;
  /** `prayers` (with meta.prayer) gets «صلّيت»; `smart.*` is informational. */
  moduleId: string;
  soundKey: SoundKey;
  meta?: Record<string, string>;
  /** The streak domain it covers — the generic evening streak nudge skips it. */
  domain?: string;
}

// ── small helpers ──────────────────────────────────────────────────────────
const MIN = 60_000;
const DAY_MS = 86_400_000;
const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const NAME: Record<PrayerName, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);
const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const route = (path: string) => `/#${path}`;
const minuteOf = (ts: number) => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};
const at = (day: Date, minute: number) => {
  const t = new Date(day);
  t.setHours(0, 0, 0, 0);
  return new Date(t.getTime() + minute * MIN);
};
const hhmm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const clampDate = (t: Date, lo: Date, hi: Date) => new Date(Math.min(Math.max(t.getTime(), lo.getTime()), hi.getTime()));

/** Arabic counted noun: ١ يوم واحد / يومان / ٣ أيام / ١١ يوماً. */
function count(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const mod = n % 100;
  return `${ar(n)} ${mod >= 3 && mod <= 10 ? few : many}`;
}
const days = (n: number) => count(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');
const mins = (n: number) => count(n, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');
/** «ساعة و٢٠ دقيقة» / «٤٥ دقيقة». */
function span(ms: number): string {
  const total = Math.max(1, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return mins(m);
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${ar(h)} ساعات`;
  return m ? `${hs} و${mins(m)}` : hs;
}

/** Two clauses as one line: a full stop unless the first already closes itself. */
const sentence = (a: string, b: string) => (/[.؟]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`);

/** Deterministic rotation: consecutive days never repeat the same line. */
function pick<T>(pool: T[], seed: number): T {
  return pool[((seed % pool.length) + pool.length) % pool.length];
}
const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

// ── learning from the activity log ─────────────────────────────────────────
/**
 * The user's usual minute of the day for events matching `match` — the median
 * of each day's FIRST such event over the last `window` days (≥3 days needed).
 * `night`: minutes after midnight count as late evening (sleep adhkar at 00:30).
 */
export function usualMinute(events: SnapshotEvent[], match: (e: SnapshotEvent) => boolean, now: Date, night = false, window = 21): number | null {
  const from = dk(addDays(now, -window));
  const today = dk(now);
  const first = new Map<string, number>();
  for (const e of events) {
    if (!match(e) || e.dateKey < from || e.dateKey >= today) continue;
    let m = minuteOf(e.ts);
    if (night && m < 12 * 60) m += 24 * 60;
    const cur = first.get(e.dateKey);
    if (cur === undefined || m < cur) first.set(e.dateKey, m);
  }
  const xs = [...first.values()].sort((a, b) => a - b);
  if (xs.length < 3) return null;
  return xs[Math.floor(xs.length / 2)];
}

/** Consecutive days in `set` ending YESTERDAY (today is still open). */
function chainBefore(set: Set<string>, now: Date): number {
  let n = 0;
  for (let i = 1; i < 800; i++) {
    if (set.has(dk(addDays(now, -i)))) n++;
    else break;
  }
  return n;
}
/** Had a chain of ≥3 that broke recently (a «return» is worth naming). */
function brokeRecently(set: Set<string>, now: Date): boolean {
  if (set.has(dk(addDays(now, -1)))) return false;
  for (let gap = 2; gap <= 6; gap++) {
    const end = addDays(now, -gap);
    if (set.has(dk(end)) && set.has(dk(addDays(end, -1))) && set.has(dk(addDays(end, -2)))) return true;
  }
  return false;
}

// ── the phrasebook ─────────────────────────────────────────────────────────
// Each kind picks the ONE most telling fact; the plain lines rotate daily.
const PRAYER_LINES = [
  '«أحبّ الأعمال إلى الله: الصلاة على وقتها»',
  '«أوّل ما يُحاسَب عليه العبد يوم القيامة الصلاة»',
  '«أرأيتم لو أن نهراً بباب أحدكم يغتسل منه كل يوم خمساً، هل يبقى من درنه شيء؟»',
  '«الصلوات الخمس كفّارة لما بينهن ما اجتُنبت الكبائر»',
];
const AFTER_LINES = [
  '«معقّبات لا يخيب قائلهن دبر كل صلاة مكتوبة»',
  'ثلاث وثلاثون تسبيحة وتحميدة وتكبيرة — «غُفرت خطاياه وإن كانت مثل زبد البحر»',
  'آية الكرسي دبر كل صلاة — «لم يمنعه من دخول الجنة إلا أن يموت»',
];
const MORNING_LINES = [
  'سيّد الاستغفار: «من قالها من النهار موقناً بها فمات من يومه قبل أن يمسي فهو من أهل الجنة»',
  '«بسم الله الذي لا يضرّ مع اسمه شيء» ثلاثاً — لم تصبه فجأة بلاء حتى يمسي',
  'حصنك لهذا اليوم — «فاذكروني أذكركم»',
];
const EVENING_LINES = [
  '«أمسينا وأمسى الملك لله» — حصنك حتى تصبح',
  '«بسم الله الذي لا يضرّ مع اسمه شيء» ثلاثاً — لم تصبه فجأة بلاء حتى يصبح',
  '«فسبحان الله حين تُمسون وحين تُصبحون»',
];
const SLEEP_LINES = [
  'آية الكرسي قبل النوم — «لا يزال عليك من الله حافظ، ولا يقربك شيطان حتى تصبح»',
  '«باسمك ربي وضعت جنبي وبك أرفعه» — نَم على ذكر',
  'التسبيح والتحميد والتكبير قبل النوم — «خيرٌ لكما من خادم»',
];
const QURAN_LINES = [
  '«اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه»',
  '«أحبّ الأعمال إلى الله أدومها وإن قلّ»',
  '«الماهر بالقرآن مع السفرة الكرام البررة»',
];
/** «منذ يومين / ٣ أيام / ١١ يوماً». */
const since = (n: number) => (n === 1 ? 'منذ أمس' : n === 2 ? 'منذ يومين' : n <= 10 ? `منذ ${ar(n)} أيام` : `منذ ${ar(n)} يوماً`);
const pagesOf = (n: number) => count(n, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة');

/** A stalled khatma, in the words of its own kind. */
const KHATMA_LAPSE: Record<QuranType, (name: string, idle: number, owe: number) => [string, string[]]> = {
  tilawa: (name, idle, owe) => [
    `تلاوتك في «${name}» متوقّفة ${since(idle)}`,
    [`بقي من وردها اليوم ${pagesOf(owe)}`, 'عُد ولو بصفحة — «أحبّ الأعمال إلى الله أدومها وإن قلّ»', '«من قرأ حرفاً من كتاب الله فله به حسنة»'],
  ],
  listen: (name, idle) => [
    `لم تستمع إلى «${name}» ${since(idle)}`,
    ['اجعله رفيق طريقك أو عملك اليوم', '﴿وَإِذَا قُرِئَ الْقُرْآنُ فَاسْتَمِعُوا لَهُ وَأَنصِتُوا لَعَلَّكُمْ تُرْحَمُونَ﴾', 'جزءٌ في نحو نصف ساعة، وأنت في طريقك'],
  ],
  tafsir: (name, idle) => [
    `«${name}» ينتظر تدبّرك ${since(idle)}`,
    ['صفحتان بتأنٍّ تكفي الليلة', '﴿أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ﴾', 'آيةٌ تفهمها خيرٌ من صفحات تمرّ بها'],
  ],
  hifz: (name, idle) => [
    `مراجعتك في «${name}» متوقّفة ${since(idle)}`,
    ['ربعٌ اليوم يثبّت ما حفظت', '«تعاهدوا هذا القرآن، فوالذي نفس محمد بيده لهو أشدّ تفلّتاً من الإبل في عُقُلها»', 'المحفوظ يتفلّت بالترك، ويثبت بالقليل الدائم'],
  ],
};
/** «اجعل للاستماع نصيباً». */
const TYPE_WITH_LAM: Record<QuranType, string> = { tilawa: 'للتلاوة', listen: 'للاستماع', tafsir: 'للتفسير', hifz: 'للمراجعة' };

const AWRAD_LINES = ['«أحبّ الأعمال إلى الله أدومها وإن قلّ»', '«سبق المفرِّدون» — الذاكرون الله كثيراً', '«ألا أنبئكم بخير أعمالكم… ذكر الله»'];

const UNIT_AR: Record<string, [string, string, string, string]> = {
  page: ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  juz: ['جزء واحد', 'جزءان', 'أجزاء', 'جزءاً'],
  hizb: ['حزب واحد', 'حزبان', 'أحزاب', 'حزباً'],
  ayat: ['آية واحدة', 'آيتان', 'آيات', 'آية'],
  surah: ['سورة واحدة', 'سورتان', 'سور', 'سورة'],
};
const unitCount = (n: number, unit: string) => {
  const f = UNIT_AR[unit] ?? UNIT_AR.page;
  return count(n, f[0], f[1], f[2], f[3]);
};

// ── the planner ────────────────────────────────────────────────────────────
interface Draft extends CompanionNudge {
  priority: number;
  /** Copy that depends on the final minute (elapsed / time left). */
  compose?: (at: Date) => { title: string; body: string };
  /** May slide later up to here to keep its distance from others. */
  latest: Date;
  /** Allowed inside quiet hours (learned bedtime). */
  quietOk?: boolean;
}

const PRIORITY: Record<CompanionKind, number> = { pray: 1, late: 1.5, after: 2, morning: 3, evening: 3, combo: 4, quran: 5, khatma: 6, awrad: 6, sleep: 7, invite: 8, suggest: 9 };
/** Bound to a prayer's own time: outside the daily cap. */
const UNCAPPED = new Set<CompanionKind>(['pray', 'late']);
/** Nudges per day besides the prayer checks. */
export const COMPANION_DAILY_CAP = 5;
const GAP = 30 * MIN;
const ADHAN_GUARD = 8 * MIN;

export function planCompanion(input: CompanionInput): CompanionNudge[] {
  const { snap, now, prefs } = input;
  const events = snap.activity ?? [];
  const log = snap.prayerLog ?? {};
  const today = dk(now);
  const on = (k: keyof NonNullable<CompanionInput['enabled']>) => input.enabled?.[k] !== false;
  const drafts: Draft[] = [];
  const seedFor = (kind: string, day: Date) => Math.floor(day.getTime() / DAY_MS) + hashOf(kind);

  // ── learned facts ──
  const setDays = (ref: string) => new Set(events.filter((e) => e.domain === 'dhikr' && e.refId === ref).map((e) => e.dateKey));
  const morningDays = setDays('morning');
  const eveningDays = setDays('evening');
  const sleepDays = setDays('sleep');
  const usual = {
    morning: usualMinute(events, (e) => e.domain === 'dhikr' && e.refId === 'morning', now),
    evening: usualMinute(events, (e) => e.domain === 'dhikr' && e.refId === 'evening', now),
    sleep: usualMinute(events, (e) => e.domain === 'dhikr' && e.refId === 'sleep', now, true),
    awrad: usualMinute(events, (e) => e.domain === 'awrad', now),
  };
  const lastWeek = Array.from({ length: 7 }, (_, i) => dk(addDays(now, -(i + 1))));
  const logger = lastWeek.filter((k) => PRAYERS.some((p) => log[k]?.[p]?.fard)).length >= 4;
  const afterHabit = lastWeek.reduce((n, k) => n + PRAYERS.filter((p) => log[k]?.[p]?.adhkar).length, 0) >= 3;
  const sleepHabit = [...sleepDays].filter((k) => k >= dk(addDays(now, -14)) && k < today).length >= 2;
  const rates = habitRates(snap, now, input.male);
  const muted = new Set(input.muted ?? []);

  /** How long after the adhan this prayer is usually logged (minutes), from timed logs. */
  const usualDelay = (p: PrayerName): number | null => {
    const xs: number[] = [];
    for (const e of events) {
      if (e.domain !== 'prayer' || e.refId !== p || e.dateKey >= today || e.dateKey < dk(addDays(now, -21))) continue;
      const t = input.times(new Date(`${e.dateKey}T12:00:00`));
      if (!t) continue;
      const d = (e.ts - t[p].getTime()) / MIN;
      if (d >= 0 && d <= 240) xs.push(d);
    }
    if (xs.length < 3) return null;
    xs.sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  };
  const prayerChain = (p: PrayerName) => chainBefore(new Set(Object.keys(log).filter((k) => log[k]?.[p]?.fard)), now);

  const quietStartOn = (day: Date) => at(day, hhmm(prefs.quietStart));

  /** Push a nudge timed inside [start, end]; today's that already passed move to "half an hour from now". */
  const push = (d: Omit<Draft, 'at' | 'latest' | 'priority'> & { anchor: Date; start: Date; end: Date; dayIndex: number }) => {
    if (d.end <= d.start) return;
    let t = clampDate(d.anchor, d.start, d.end);
    if (t.getTime() <= now.getTime() + MIN) {
      if (d.dayIndex > 0) return;
      t = new Date(now.getTime() + 30 * MIN);
      if (t >= d.end) return;
    }
    const { anchor: _a, start: _s, end, dayIndex: _d, ...rest } = d;
    drafts.push({ ...rest, at: t, latest: end, priority: PRIORITY[d.kind] });
  };

  for (let dayIndex = 0; dayIndex <= 2; dayIndex++) {
    const day = addDays(now, dayIndex);
    const key = dk(day);
    const T = input.times(day);
    if (!T) continue;
    const sfx = dayIndex === 0 ? '' : `_d${dayIndex}`;
    const seed = (kind: string) => seedFor(kind, day);
    const isToday = dayIndex === 0;

    // ── 1) «هل صلّيت؟» — today and tomorrow, for users who log their prayers ──
    if (prefs.prayerCheck && logger && dayIndex <= 1 && !(isToday && input.excusedToday)) {
      PRAYERS.forEach((p, i) => {
        if (!on(`prayers.${p}`)) return;
        if (isToday && log[key]?.[p]?.fard) return;
        const adhan = T[p];
        const next = p === 'fajr' ? T.sunrise : p === 'isha' ? new Date(T.isha.getTime() + 150 * MIN) : T[PRAYERS[i + 1]];
        const end = new Date(next.getTime() - (p === 'fajr' ? 10 : 15) * MIN);
        const delay = Math.min(80, Math.max(30, (usualDelay(p) ?? 25) + 15));
        let anchor = new Date(adhan.getTime() + delay * MIN);
        if (p === 'fajr') anchor = new Date(Math.max(adhan.getTime() + 15 * MIN, Math.min(anchor.getTime(), T.sunrise.getTime() - 30 * MIN)));
        const name = NAME[p];
        const chain = isToday ? prayerChain(p) : 0;
        const badge = isToday ? input.nearBadges?.[`pray:${p}`] : undefined;
        const nextName = p === 'fajr' ? 'الشروق' : p === 'isha' ? null : NAME[PRAYERS[i + 1]];
        const fact = (when: Date) => {
          const left = next.getTime() - when.getTime();
          if (badge) return `صلِّها وسجّلها، وبها تنال وسام «${badge}»`;
          if (chain >= 3) return `سلسلة ${name} ${days(chain)} — لا تدعها تنقطع اليوم`;
          if (nextName && left < 50 * MIN) return `بقي على ${nextName} ${span(left)}`;
          return pick(PRAYER_LINES, seed(`pray${p}`));
        };
        push({
          id: `myzikr_smart_pray_${p}${sfx}`,
          kind: 'pray',
          domain: 'prayers',
          title: '',
          body: '',
          // Written for the minute it is finally sent (it may slide to keep its distance).
          compose: (t) => ({
            title: pick([`هل صلّيت ${name}؟`, `${name} — مضى على الأذان ${span(t.getTime() - adhan.getTime())}`], seed(`prayT${p}`)),
            body: sentence(fact(t), 'وإن كنت صلّيتها فسجّلها بلمسة'),
          }),
          deepLinkPath: route('/module/prayers'),
          moduleId: 'prayers',
          soundKey: 'default',
          meta: { prayer: p, dateKey: key, name, kind: 'check' },
          // Bound to the prayer's own time, like the adhan: quiet hours don't hold it.
          quietOk: true,
          anchor,
          start: new Date(adhan.getTime() + 15 * MIN),
          end,
          dayIndex,
        });
      });
    }

    // ── 1b) «آخر الوقت» — a fard still unlogged as its time runs out ──
    // (Isha runs to the middle of the night; its check is enough.)
    if (prefs.lateCalls && logger && dayIndex <= 1 && !(isToday && input.excusedToday)) {
      (['fajr', 'dhuhr', 'asr', 'maghrib'] as const).forEach((p) => {
        if (!on(`prayers.${p}`) || (isToday && log[key]?.[p]?.fard)) return;
        const end = prayerEnd(T, p);
        const anchor = new Date(end.getTime() - (p === 'asr' ? 35 : p === 'maghrib' ? 20 : 25) * MIN);
        const name = NAME[p];
        const endName = p === 'fajr' ? 'الشروق' : NAME[PRAYERS[PRAYERS.indexOf(p) + 1]];
        push({
          id: `myzikr_smart_late_${p}${sfx}`,
          kind: 'late',
          domain: 'prayers',
          title: '',
          body: '',
          compose: (t) => ({
            title: `بقي على ${endName} ${span(end.getTime() - t.getTime())}`,
            body: sentence(
              p === 'asr' ? `لم تُسجَّل ${name} بعد — صلّها قبل أن تصفرّ الشمس` : `لم تُسجَّل ${name} بعد — أدركها قبل خروج وقتها`,
              'وإن كنت صلّيتها فسجّلها بلمسة',
            ),
          }),
          deepLinkPath: route('/module/prayers'),
          moduleId: 'prayers',
          soundKey: 'default',
          meta: { prayer: p, dateKey: key, name, kind: 'late' },
          quietOk: true,
          anchor,
          start: new Date(anchor.getTime() - 10 * MIN),
          end: new Date(end.getTime() - 8 * MIN),
          dayIndex,
        });
      });
    }

    // ── 2) أذكار ما بعد الصلاة — right after a prayer is logged (today) ──
    if (prefs.adhkarNudges && afterHabit && isToday && !input.excusedToday) {
      for (const p of PRAYERS) {
        const e = log[key]?.[p];
        if (!e?.fard || e.adhkar) continue;
        const loggedAt = events.find((x) => x.domain === 'prayer' && x.refId === p && x.dateKey === key)?.ts;
        if (!loggedAt || now.getTime() - loggedAt > 40 * MIN) continue;
        const m = input.minutes?.after?.[p];
        const t = new Date(Math.max(now.getTime() + 8 * MIN, loggedAt + 12 * MIN));
        drafts.push({
          id: 'myzikr_smart_after',
          kind: 'after',
          title: pick([`أذكار بعد ${NAME[p]}`, `تقبّل الله ${NAME[p]} — وأذكارها`], seed(`after${p}`)),
          body: `${m ? `نحو ${mins(m)} — ` : ''}${pick(AFTER_LINES, seed(`afterB${p}`))}`,
          at: t,
          latest: new Date(t.getTime() + 30 * MIN),
          priority: PRIORITY.after,
          deepLinkPath: route(`/adhkar?set=postPrayer-${p}`),
          moduleId: 'smart.after',
          soundKey: 'default',
        });
        break;
      }
    }

    // ── 3) أذكار الصباح / المساء ──
    const adhkarNudge = (which: 'morning' | 'evening') => {
      if (!prefs.adhkarNudges || !on(`dhikr.${which}`)) return;
      const doneSet = which === 'morning' ? morningDays : eveningDays;
      if (isToday && doneSet.has(key)) return;
      const start = which === 'morning' ? new Date(T.fajr.getTime() + 10 * MIN) : new Date(T.asr.getTime() + 10 * MIN);
      const end = which === 'morning' ? new Date(T.dhuhr.getTime() - 20 * MIN) : new Date(T.isha.getTime() - 10 * MIN);
      const hand = input.anchors?.[which];
      const learned = usual[which];
      const anchor = hand
        ? at(day, hhmm(hand))
        : learned != null
          ? at(day, learned + 15)
          : new Date((which === 'morning' ? T.fajr : T.asr).getTime() + (which === 'morning' ? 35 : 45) * MIN);
      const label = which === 'morning' ? 'الصباح' : 'المساء';
      const chain = isToday ? chainBefore(doneSet, now) : 0;
      const badge = isToday ? input.nearBadges?.[which] : undefined;
      const m = input.minutes?.[which];
      const tail = m ? ` — نحو ${mins(m)}` : '';
      const body = badge
        ? `تُتمّ بها سلسلة ${days(chain + 1)} وتنال وسام «${badge}»`
        : chain >= 2
          ? `سلسلة أذكار ${label} ${days(chain)}${tail}، فلا تقطعها`
          : isToday && brokeRecently(doneSet, now)
            ? `فاتتك أياماً، واليوم بداية سلسلة جديدة${tail}`
            : `${pick(which === 'morning' ? MORNING_LINES : EVENING_LINES, seed(which))}${tail}`;
      push({
        id: `myzikr_smart_${which}${sfx}`,
        kind: which,
        domain: 'dhikr',
        title: pick(
          which === 'morning' ? ['أذكار الصباح', 'صباحك بذكر الله', 'حصنك لهذا اليوم'] : ['أذكار المساء', 'مساؤك بذكر الله', 'قبل أن يدخل الليل'],
          seed(`${which}T`),
        ),
        body,
        deepLinkPath: route(`/adhkar?set=${which}`),
        moduleId: 'smart.dhikr',
        soundKey: 'azkar',
        anchor,
        start,
        end,
        dayIndex,
      });
    };
    adhkarNudge('morning');
    adhkarNudge('evening');

    // ── 4) أذكار النوم — only at a bedtime the user actually keeps ──
    if (prefs.adhkarNudges && sleepHabit && usual.sleep != null && dayIndex <= 1 && !(isToday && sleepDays.has(key))) {
      const anchor = at(day, usual.sleep - 10);
      const m = input.minutes?.sleep;
      push({
        id: `myzikr_smart_sleep${sfx}`,
        kind: 'sleep',
        title: pick(['أذكار النوم', 'قبل أن تنام'], seed('sleepT')),
        body: `${pick(SLEEP_LINES, seed('sleep'))}${m ? ` — نحو ${mins(m)}` : ''}`,
        deepLinkPath: route('/adhkar?set=sleep'),
        moduleId: 'smart.dhikr',
        soundKey: 'azkar',
        quietOk: true,
        anchor,
        start: new Date(T.isha.getTime() + 20 * MIN),
        end: new Date(anchor.getTime() + 45 * MIN),
        dayIndex,
      });
    }

    // ── 5) وِرد القرآن ──
    const q = input.quran;
    // With مصحفي khatmas, what is left today = what they owe (overdue pages included).
    const owed = input.khatmas?.length ? input.khatmas.reduce((n, x) => n + x.owe, 0) : null;
    if (prefs.wirdNudges && q && q.goal > 0 && on('quran') && !(isToday && (owed ?? q.goal - q.done) <= 0)) {
      const left = isToday ? (owed ?? q.goal - q.done) : q.goal;
      const hand = input.anchors?.quran;
      const anchor = hand ? at(day, hhmm(hand)) : new Date(T.maghrib.getTime() + 40 * MIN);
      const chain = isToday ? chainBefore(new Set(Object.keys(snap.wirdHistory ?? {}).filter((x) => (snap.wirdHistory?.[x]?.achieved ?? 0) >= (snap.wirdHistory?.[x]?.amount ?? 1))), now) : 0;
      const badge = isToday ? input.nearBadges?.quran : undefined;
      push({
        id: `myzikr_smart_quran${sfx}`,
        kind: 'quran',
        domain: 'quran',
        title: isToday && q.done > 0 ? `بقي من وردك ${unitCount(left, q.unit)}` : `وردك اليوم: ${unitCount(q.goal, q.unit)}`,
        body: (() => {
          const why = badge
            ? `وبه تنال وسام «${badge}»`
            : chain >= 3
              ? `${days(chain)} لم ينقطع فيها وردك — أتمّه اليوم`
              : pick(QURAN_LINES, seed('quran'));
          const owing = isToday ? (input.khatmas ?? []).filter((x) => x.owe > 0) : (input.khatmas ?? []);
          if (owing.length > 1) {
            // Each khatma's share by its kind (its name when two share a kind) — the sum belongs to none of them.
            const dup = (ty: QuranType) => owing.filter((x) => x.type === ty).length > 1;
            const each = owing.map((x) => `${dup(x.type) ? x.name : QURAN_TYPES[x.type].label} ${ar(x.owe)}`).join('، ');
            return sentence(isToday ? `${each} ص` : `من ${ar(owing.length)} ختمات`, why);
          }
          if (owing.length === 1 && !badge && chain < 3) return sentence(`${QURAN_TYPES[owing[0].type].label} «${owing[0].name}»`, why);
          return why;
        })(),
        deepLinkPath: route('/quran'),
        moduleId: 'smart.quran',
        soundKey: 'quran',
        anchor,
        start: new Date(T.fajr.getTime() + 30 * MIN),
        end: new Date(quietStartOn(day).getTime() - 20 * MIN),
        dayIndex,
      });
    }

    // ── 5b) a stalled kind of khatma — in its own words, at its own hour ──
    // Today only: whether it moved is known only as of the last مصحفي pull.
    let stalledToday = false;
    if (prefs.wirdNudges && isToday && input.khatmas?.length) {
      const stalled = input.khatmas
        .map((x) => ({ x, idle: input.typeIdle?.[x.type] ?? 0 }))
        .filter((s) => s.idle >= 2)
        .sort((a, b) => b.idle - a.idle)[0];
      if (stalled) {
        stalledToday = true;
        const { x, idle } = stalled;
        const [title, lines] = KHATMA_LAPSE[x.type](x.name, idle, x.owe);
        // Listening fits the day, review the fresh morning, تفسير the calm of night, تلاوة after Asr (the wird nudge has Maghrib).
        const anchor =
          x.type === 'listen'
            ? new Date(T.dhuhr.getTime() + 60 * MIN)
            : x.type === 'hifz'
              ? new Date(T.fajr.getTime() + 40 * MIN)
              : x.type === 'tafsir'
                ? new Date(T.isha.getTime() + 40 * MIN)
                : new Date(T.asr.getTime() + 40 * MIN);
        push({
          id: 'myzikr_smart_khatma',
          kind: 'khatma',
          domain: 'quran',
          title,
          body: pick(lines, seed(`khatma_${x.type}`)),
          deepLinkPath: route('/quran'),
          moduleId: 'smart.quran',
          soundKey: 'quran',
          anchor,
          start: new Date(T.fajr.getTime() + 30 * MIN),
          end: new Date(quietStartOn(day).getTime() - 20 * MIN),
          dayIndex,
        });
      }
    }

    // ── 5c) once a week (Saturday): a share in a kind never tried ──
    // Not on a day a khatma already stands still — that comes first.
    if (prefs.wirdNudges && input.noShare?.length && day.getDay() === 6 && !stalledToday) {
      const ty = input.noShare[Math.floor(day.getTime() / (7 * 86_400_000)) % input.noShare.length];
      push({
        id: `myzikr_smart_invite${sfx}`,
        kind: 'invite',
        domain: 'quran',
        title: `اجعل ${TYPE_WITH_LAM[ty]} نصيباً`,
        body: sentence(QURAN_TYPES[ty].benefit, `ختمة ${QURAN_TYPES[ty].label} في مصحفي، بالمدة التي تناسبك`),
        deepLinkPath: route('/quran'),
        moduleId: 'smart.quran',
        soundKey: 'quran',
        anchor: new Date(T.asr.getTime() + 60 * MIN),
        start: new Date(T.dhuhr.getTime() + 30 * MIN),
        end: new Date(quietStartOn(day).getTime() - 30 * MIN),
        dayIndex,
      });
    }

    // ── 6) الأوراد اليومية — one nudge for all that remain ──
    const daily = (snap.targets ?? []).filter((t) => t.recurrence === 'daily' && !t.completedAt && !t.reminderEnabled);
    const pending = daily
      .map((t) => ({ title: t.title, total: t.total, left: isToday ? Math.max(0, t.total - t.current) : t.total, streak: t.streak ?? 0 }))
      .filter((t) => t.left > 0);
    if (prefs.wirdNudges && pending.length) {
      const anchor = usual.awrad != null ? at(day, usual.awrad + 30) : new Date(T.isha.getTime() + 60 * MIN);
      const top = [...pending].sort((a, b) => b.streak - a.streak)[0];
      const one = pending.length === 1;
      const what = one
        ? isToday && pending[0].left < pending[0].total
          ? `بقي ${ar(pending[0].left)} من ${ar(pending[0].total)}`
          : `${ar(pending[0].total)} اليوم`
        : `${isToday ? 'بقي' : 'اليوم'}: ${pending.slice(0, 2).map((t) => `${t.title} ${ar(t.left)}`).join('، ')}${pending.length > 2 ? ' وغيرها' : ''}`;
      const why =
        isToday && top.streak >= 2
          ? one
            ? `سلسلته ${days(top.streak)}، فلا تقطعها`
            : `سلسلة «${top.title}» ${days(top.streak)}`
          : pick(AWRAD_LINES, seed('awrad'));
      push({
        id: `myzikr_smart_awrad${sfx}`,
        kind: 'awrad',
        domain: 'awrad',
        title: one ? `وِردك: ${pending[0].title}` : 'أورادك اليوم',
        body: `${what} — ${why}`,
        deepLinkPath: route('/targets'),
        moduleId: 'smart.awrad',
        soundKey: 'target',
        anchor,
        start: new Date(T.dhuhr.getTime()),
        end: new Date(quietStartOn(day).getTime() - 15 * MIN),
        dayIndex,
      });
    }

    // ── 7) «تحدّي اليوم» one step from complete (today) ──
    if (prefs.challenges && isToday && input.combos?.length) {
      const near = input.combos
        .filter((c) => !c.done && c.parts.length >= 3 && c.doneCount === c.parts.length - 1)
        .sort((a, b) => b.parts.length - a.parts.length)[0];
      const missing = near?.parts.find((p) => !p.done);
      if (near && missing) {
        push({
          id: 'myzikr_smart_combo',
          kind: 'combo',
          title: `بقي «${missing.label}» ليكتمل «${near.title}»`,
          body: `أتممت ${ar(near.doneCount)} من ${ar(near.parts.length)} اليوم — خطوة واحدة ويُكتب لك يومٌ كامل في أوسمتك`,
          deepLinkPath: route('/badges'),
          moduleId: 'smart.combo',
          soundKey: 'default',
          anchor: new Date(T.isha.getTime() + 50 * MIN),
          start: new Date(T.asr.getTime()),
          end: new Date(quietStartOn(day).getTime() - 10 * MIN),
          dayIndex,
        });
      }
    }

    // ── 8) a sunnah the user seldom does — one a day, at its own hour ──
    // Friday's own sunnah first, else a rotation of the seldom ones. قيام,
    // fasting and the adhkar have reminders of their own, so they aren't repeated.
    if (prefs.suggestions) {
      type Cand = { h: HabitKey; anchor: Date; start: Date; end: Date; title?: string };
      const free = (h: HabitKey) => !muted.has(h);
      const seldom = (h: HabitKey) => free(h) && rates[h] != null && rates[h]! < RARE;
      let c: Cand | undefined;
      if (day.getDay() === 5) {
        if (free('kahf') && !(isToday && input.kahfRead)) {
          c = { h: 'kahf', anchor: new Date(T.sunrise.getTime() + 150 * MIN), start: new Date(T.sunrise.getTime() + 30 * MIN), end: new Date(T.maghrib.getTime() - 90 * MIN) };
        } else if (free('fridayHour')) {
          c = { h: 'fridayHour', anchor: new Date(T.maghrib.getTime() - 65 * MIN), start: new Date(T.maghrib.getTime() - 65 * MIN), end: new Date(T.maghrib.getTime() - 20 * MIN) };
        }
      }
      if (!c) {
        const pool: Cand[] = [];
        const dw = duhaWindow(T);
        if (seldom('duha') && !(isToday && (snap.duha?.[key] || input.excusedToday))) {
          pool.push({ h: 'duha', anchor: dw.best, start: dw.start, end: new Date(dw.end.getTime() - 10 * MIN) });
        }
        if (seldom('sleep') && !sleepHabit && !(isToday && sleepDays.has(key))) {
          const bed = prefs.quietEnabled ? quietStartOn(day) : at(day, 23 * 60);
          pool.push({
            h: 'sleep',
            anchor: new Date(Math.min(T.isha.getTime() + 120 * MIN, bed.getTime() - 20 * MIN)),
            start: new Date(T.isha.getTime() + 60 * MIN),
            end: new Date(bed.getTime() - 5 * MIN),
          });
        }
        if (input.male && seldom('mosque')) {
          const p = pick<'maghrib' | 'isha'>(['maghrib', 'isha'], seed('mosque'));
          pool.push({
            h: 'mosque',
            anchor: new Date(T[p].getTime() - 25 * MIN),
            start: new Date(T[p].getTime() - 35 * MIN),
            end: new Date(T[p].getTime() - 12 * MIN),
            title: `صلِّ ${NAME[p]} في المسجد`,
          });
        }
        if (seldom('sadaqah')) {
          pool.push({ h: 'sadaqah', anchor: new Date(T.dhuhr.getTime() + 90 * MIN), start: new Date(T.dhuhr.getTime() + 30 * MIN), end: new Date(T.maghrib.getTime() - 30 * MIN) });
        }
        if (pool.length) c = pick(pool, seed('suggest'));
      }
      if (c) {
        const copy = SUNNAH_COPY[c.h];
        push({
          id: `myzikr_smart_suggest${sfx}`,
          kind: 'suggest',
          title: c.title ?? copy.title,
          body: copy.body,
          deepLinkPath: route(copy.to),
          moduleId: 'smart.suggest',
          soundKey: 'default',
          anchor: c.anchor,
          start: c.start,
          end: c.end,
          dayIndex,
        });
      }
    }
  }

  return arrange(drafts, input);
}

/**
 * Delivery: by priority, each nudge takes the first slot from its time up to
 * its latest that keeps half an hour from the others, stays clear of every
 * adhan, and sits outside quiet hours — within the daily cap (prayer checks
 * apart). What finds no slot is dropped, never crammed.
 */
function arrange(drafts: Draft[], input: CompanionInput): CompanionNudge[] {
  const { now, prefs } = input;
  const adhans: number[] = [];
  for (let i = 0; i <= 2; i++) {
    const T = input.times(addDays(now, i));
    if (T) for (const p of PRAYERS) adhans.push(T[p].getTime());
  }
  const quiet = (t: number) => {
    if (!prefs.quietEnabled) return false;
    const d = new Date(t);
    const m = d.getHours() * 60 + d.getMinutes();
    const s = hhmm(prefs.quietStart);
    const e = hhmm(prefs.quietEnd);
    if (s === e) return false;
    return s < e ? m >= s && m < e : m >= s || m < e;
  };
  const taken: number[] = [];
  const perDay = new Map<string, number>();
  const out: CompanionNudge[] = [];
  const sorted = [...drafts].sort((a, b) => a.priority - b.priority || a.at.getTime() - b.at.getTime());
  for (const d of sorted) {
    const dayKey = dk(d.at);
    if (!UNCAPPED.has(d.kind) && (perDay.get(dayKey) ?? 0) >= COMPANION_DAILY_CAP) continue;
    let slot: number | null = null;
    for (let t = d.at.getTime(); t <= d.latest.getTime(); t += 5 * MIN) {
      if (t <= now.getTime()) continue;
      if (!d.quietOk && quiet(t)) continue;
      if (adhans.some((a) => Math.abs(a - t) < ADHAN_GUARD)) continue;
      if (taken.some((x) => Math.abs(x - t) < GAP)) continue;
      slot = t;
      break;
    }
    if (slot == null) continue;
    taken.push(slot);
    if (!UNCAPPED.has(d.kind)) perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
    const { priority: _p, latest: _l, quietOk: _q, compose, ...n } = d;
    const when = new Date(slot);
    out.push({ ...n, ...(compose ? compose(when) : null), at: when });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
