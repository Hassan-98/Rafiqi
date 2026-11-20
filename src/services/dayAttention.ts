/**
 * «يحتاج انتباهك» — PURE. What on Home deserves a word at this minute:
 *
 *  missed   a fard whose time has gone and is not logged — today's, and
 *           yesterday's until Dhuhr (the owner forgets to log). Only for users
 *           who log their prayers; for anyone else it would be noise.
 *  closing  something the user USUALLY does, still undone, whose time is
 *           running out: the running prayer (earlier on a weekday it is often
 *           missed), morning/evening adhkar, الضحى, the night's قيام, the
 *           Qur'an wird, the daily أوراد, and the سحور of a fast they intend.
 *  suggest  ONE sunnah the user SELDOM does, while its time is open — or a
 *           sunnah of the day itself (Friday's الكهف from Thursday's Maghrib,
 *           its last hour). A habit is either closing or suggested, never both.
 *  prep     tomorrow: a fast to intend (Mon/Thu, white days, Arafah, Ashura and
 *           Tasu'a, Shawwal's six, the first nine of Dhul-Hijjah), and a season
 *           announced ahead (Ramadan, the last ten, the ten of Dhul-Hijjah).
 *  + every registered source (services/attention/registry.ts): house chores,
 *    and whatever features plug in.
 *
 * Each item is scored (importance × urgency × the user's own habit × freshness)
 * and carries its «لماذا؟»; `presentAttention` turns the list into one «الآن»
 * focus and the groups «قبل أن يفوت» / «استعدّ للغد».
 *
 * `habitRates` and `SUNNAH_COPY` are shared with the notification companion
 * so both speak with one voice. Checked by scripts/dayAttention.test.ts.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { arCount, type InsightsSnapshot } from '@/services/insightsEngine';
import { WEEKDAY_LABELS_AR, toArabicDigits } from '@/services/statsService';
import { duhaWindow, isJumuah, sunnahRakaatOn } from '@/store/prayerLogStore';
import { toHijri } from '@/services/HijriService';
import { collectAttention, type SourceContext } from '@/services/attention/registry';
import { fastReason, seasonNotice } from '@/services/attention/occasions';
import { weakWeekdays } from '@/services/attention/learning';
import type { PrayerName } from '@/types';

export interface DayTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export type HabitKey =
  | 'duha'
  | 'qiyam'
  | 'fajrSunnah'
  | 'rawatib'
  | 'morning'
  | 'evening'
  | 'sleep'
  | 'mosque'
  | 'fasting'
  | 'sadaqah'
  | 'kahf'
  | 'fridayHour';

/** missed = it has passed · closing = it's running out · suggest = an open door · prep = tomorrow. */
export type AttentionLevel = 'missed' | 'closing' | 'suggest' | 'prep';
export type AttentionIcon =
  | 'prayer'
  | 'morning'
  | 'evening'
  | 'sleep'
  | 'duha'
  | 'qiyam'
  | 'quran'
  | 'awrad'
  | 'fasting'
  | 'mosque'
  | 'sadaqah'
  | 'friday'
  | 'house'
  | 'season'
  | 'people'
  | 'task';

export type AttentionAction =
  | { kind: 'prayers'; dateKey: string; prayers: PrayerName[] }
  | { kind: 'duha'; dateKey: string }
  | { kind: 'qiyam' }
  | { kind: 'sunnah'; dateKey: string; prayer: PrayerName; type: 'sunnahBefore' | 'sunnahAfter' }
  | { kind: 'chores'; chores: string[] }
  /** «سأصومه بإذن الله» — remembers the intent (the suhoor reminder follows it). */
  | { kind: 'intent'; dateKey: string }
  /** A source's own one-tap chip: `run` does the deed (log it, mark it…); the card refreshes after. */
  | { kind: 'run'; label: string; run: () => void };

/** How much the deed weighs. */
export type AttentionWeight = 'fard' | 'sunnah' | 'extra';

/**
 * One line on Home. A source fills the content fields; the engine fills
 * `score` (unless given) and completes `why` with the streak and time left.
 */
export interface AttentionItem {
  /** Stable for the fact through the day: «ليس الآن» hides this id until tomorrow. */
  id: string;
  /** The tone (red / gold / teal / sage) and the group: 'prep' → «استعدّ للغد», the rest → «قبل أن يفوت». */
  level: AttentionLevel;
  icon: AttentionIcon;
  /** The small line above the title: «يوشك وقتها أن يخرج». */
  kicker: string;
  title: string;
  /** One or two lines — an authentic text or the facts; no guilt. */
  body: string;
  /** In-app route opened by tapping the title. */
  to: string;
  /** When it stops being possible — drives urgency and «بقي …». */
  deadline?: Date;
  /** The one-tap chips. */
  action?: AttentionAction;
  /** The mute key «لا تقترحها» stores (a HabitKey, 'house', 'seasons', or a source's own). Absent = no mute button. */
  habit?: string;
  /** Importance: fard > sunnah > extra (default 'extra'). */
  weight?: AttentionWeight;
  /** «لماذا؟»: the reason, e.g. «لأنك تصليها عادةً» — the engine appends the streak and the time left. */
  why?: string;
  /** The user's own share of recent days doing this (0–1): personal relevance. */
  rate?: number;
  /** Days in a row at stake. */
  streak?: number;
  /** When it became true (its window opened, its time ran out) — fresher scores a little higher. */
  since?: Date;
  /** Higher = more deserving. Computed by the engine unless a source sets it. */
  score?: number;
}

export interface AttentionInput {
  snap: InsightsSnapshot;
  now: Date;
  /** Today's prayer times (null without a location). */
  times: DayTimes | null;
  /** Prayer times of any day, for the sources (defaults to today's only). */
  timesOf?: (day: Date) => DayTimes | null;
  male?: boolean;
  gender?: 'male' | 'female' | null;
  /** Qur'an pages still owed today (null = no wird). */
  quranOwe?: number | null;
  /** مصحفي pages read today (سورة الكهف on Friday). */
  pagesToday?: number[];
  /** Habits the user muted. */
  muted?: readonly string[];
  /** Item ids dismissed for today (the next suggestion takes a hidden one's place). */
  hidden?: readonly string[];
  /** The user's Hijri sighting offset (calendar settings). */
  hijriOffset?: number;
  /** The day the user said they will fast («سأصومه»). */
  fastIntent?: string | null;
}

// ── helpers ────────────────────────────────────────────────────────────────
const MIN = 60_000;
const ar = toArabicDigits;
const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const NAME: Record<PrayerName, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
/** What ends each prayer's time. */
const END_NAME: Record<PrayerName, string> = { fajr: 'الشروق', dhuhr: 'العصر', asr: 'المغرب', maghrib: 'العشاء', isha: 'منتصف الليل' };
/** Surat al-Kahf in the Madinah mushaf. */
export const KAHF_PAGES: [number, number] = [293, 304];

const minutes = (n: number) => arCount(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');
const daysN = (n: number) => arCount(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');
/** «٢٥ دقيقة» / «ساعة و١٠ دقائق». */
export function leftLabel(ms: number): string {
  const total = Math.max(1, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return minutes(m);
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${ar(h)} ساعات`;
  return m ? `${hs} و${minutes(m)}` : hs;
}

/** When each fard's time ends: the next adhan, sunrise for Fajr, the night's middle for Isha. */
export function prayerEnd(t: DayTimes, p: PrayerName): Date {
  if (p === 'fajr') return t.sunrise;
  if (p === 'isha') {
    const nextFajr = t.fajr.getTime() + 24 * 60 * MIN;
    return new Date(t.maghrib.getTime() + (nextFajr - t.maghrib.getTime()) / 2);
  }
  return t[PRAYERS[PRAYERS.indexOf(p) + 1]];
}

/** Consecutive days in `set` ending YESTERDAY (today is still open). */
export function chainBefore(set: Set<string>, now: Date): number {
  let n = 0;
  for (let i = 1; i < 800; i++) {
    if (set.has(dk(addDays(now, -i)))) n++;
    else break;
  }
  return n;
}

// ── how often each sunnah is done ─────────────────────────────────────────
/** Below this share of recent days a habit is "seldom" — suggested, not chased. */
export const RARE = 0.3;

/**
 * Share (0–1) of recent days each sunnah was done: the last 30 days, or since
 * the user began (at least a week, so a newcomer isn't judged on one day).
 * Today is left out — it's still open. Excused days don't count against the
 * prayer-bound ones. `mosque` is absent until ten fard are logged in the window.
 */
export function habitRates(snap: InsightsSnapshot, now: Date, male = false): Partial<Record<HabitKey, number>> {
  const today = dk(now);
  const log = snap.prayerLog ?? {};
  const excused = snap.excused ?? {};
  const events = snap.activity ?? [];
  let first = today;
  for (const k of [...Object.keys(snap.dailyProgress), ...Object.keys(log), ...Object.keys(snap.qiyamNights)]) if (k < first) first = k;
  for (const e of events) if (e.dateKey < first) first = e.dateKey;
  const span = Math.min(30, Math.max(7, differenceInCalendarDays(now, new Date(`${first}T12:00:00`))));
  const win = Array.from({ length: span }, (_, i) => dk(addDays(now, -(i + 1))));
  const from = win[win.length - 1];
  const inWin = (k: string) => k >= from && k < today;
  const prayDays = Math.max(1, win.filter((k) => !excused[k]).length);
  const share = (n: number, of: number) => Math.min(1, n / of);

  const dhikrDays = (ref: string) => new Set(events.filter((e) => e.domain === 'dhikr' && e.refId === ref && inWin(e.dateKey)).map((e) => e.dateKey)).size;
  let fard = 0;
  let mosque = 0;
  let fajrSunnah = 0;
  let rawatib = 0;
  for (const k of win) {
    const day = log[k];
    if (!day) continue;
    if (day.fajr?.sunnahBefore) fajrSunnah++;
    if (PRAYERS.some((p) => day[p]?.sunnahBefore || day[p]?.sunnahAfter)) rawatib++;
    for (const p of PRAYERS) {
      if (day[p]?.fard) fard++;
      if (day[p]?.mosque) mosque++;
    }
  }
  const fasting = Object.values(snap.dailyProgress).filter((d) => inWin(d.dateKey) && d.modules.some((m) => m.moduleId === 'fasting' && m.completed)).length;
  const sadaqah = (snap.sadaqah ?? []).filter((s) => inWin(s.date)).length;

  return {
    duha: share(Object.keys(snap.duha ?? {}).filter(inWin).length, prayDays),
    qiyam: share(Object.keys(snap.qiyamNights).filter(inWin).length, prayDays),
    fajrSunnah: share(fajrSunnah, prayDays),
    rawatib: share(rawatib, prayDays),
    morning: share(dhikrDays('morning'), span),
    evening: share(dhikrDays('evening'), span),
    sleep: share(dhikrDays('sleep'), span),
    // Mondays and Thursdays: about eight a month.
    fasting: share(fasting, (span * 8) / 30),
    // About once a week.
    sadaqah: share(sadaqah, span / 7),
    ...(male && fard >= 10 ? { mosque: mosque / fard } : {}),
  };
}

// ── one voice for each sunnah (Home and the notifications) ────────────────
export const SUNNAH_COPY: Record<HabitKey, { title: string; body: string; to: string; icon: AttentionIcon }> = {
  duha: {
    title: 'صلاة الضحى',
    body: '«يُصبح على كل سُلامى من أحدكم صدقة… ويُجزئ من ذلك ركعتان يركعهما من الضحى»',
    to: '/module/prayers',
    icon: 'duha',
  },
  qiyam: {
    title: 'قيام الليل، ولو ركعتين',
    body: '«عليكم بقيام الليل فإنه دأب الصالحين قبلكم» — وأقلّه ركعتان ثم الوتر',
    to: '/targets?tab=qiyam',
    icon: 'qiyam',
  },
  fajrSunnah: {
    title: 'سنة الفجر',
    body: '«ركعتا الفجر خيرٌ من الدنيا وما فيها»',
    to: '/module/prayers',
    icon: 'prayer',
  },
  rawatib: {
    title: 'السنن الرواتب',
    body: '«من صلّى اثنتي عشرة ركعة في يوم وليلة بُني له بهنّ بيت في الجنة»',
    to: '/module/prayers',
    icon: 'prayer',
  },
  morning: { title: 'أذكار الصباح', body: 'حصنك لهذا اليوم، في دقائق — «فاذكروني أذكركم»', to: '/adhkar?set=morning', icon: 'morning' },
  evening: { title: 'أذكار المساء', body: '«بسم الله الذي لا يضرّ مع اسمه شيء» ثلاثاً — لم تصبه فجأة بلاء حتى يصبح', to: '/adhkar?set=evening', icon: 'evening' },
  sleep: {
    title: 'أذكار النوم',
    body: 'آية الكرسي قبل النوم — «لا يزال عليك من الله حافظ، ولا يقربك شيطان حتى تصبح»',
    to: '/adhkar?set=sleep',
    icon: 'sleep',
  },
  mosque: { title: 'صلِّها في المسجد', body: '«صلاة الجماعة أفضل من صلاة الفذّ بسبع وعشرين درجة»', to: '/mosques', icon: 'mosque' },
  fasting: {
    title: 'صيام مستحب غداً',
    body: '«تُعرض الأعمال يوم الاثنين والخميس، فأحبّ أن يُعرض عملي وأنا صائم»',
    to: '/module/fasting',
    icon: 'fasting',
  },
  sadaqah: { title: 'صدقة اليوم', body: '«اتقوا النار ولو بشقّ تمرة» — وما نقصت صدقة من مال', to: '/sadaqah', icon: 'sadaqah' },
  kahf: {
    title: 'سورة الكهف',
    body: '«من قرأ سورة الكهف يوم الجمعة أضاء له من النور ما بين الجمعتين»',
    to: '/quran/read/18',
    icon: 'friday',
  },
  fridayHour: {
    title: 'ساعة الإجابة',
    body: '«فيها ساعة لا يوافقها عبد مسلم يسأل الله شيئاً إلا أعطاه إياه» — التمسها آخر ساعة بعد العصر',
    to: '/duaa-library',
    icon: 'friday',
  },
};

/** What «لا تقترحها» muted, in words (settings). */
export function muteLabel(h: string): string {
  if (h === 'house') return 'تذكير مهام المنزل';
  if (h === 'seasons') return 'مواسم الطاعة';
  if (h === 'silat') return 'تذكير صلة الرحم';
  if (h === 'qada') return 'تذكير القضاء';
  return SUNNAH_COPY[h as HabitKey]?.title ?? h;
}

/** The six of Shawwal already fasted this Shawwal. */
function sixOfShawwalDone(snap: InsightsSnapshot, now: Date, offset: number): boolean {
  const h = toHijri(now, offset);
  if (h.month !== 10) return false;
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(now, -i);
    const t = toHijri(d, offset);
    if (t.month !== 10 || t.year !== h.year) break;
    if (snap.dailyProgress[dk(d)]?.modules.some((m) => m.moduleId === 'fasting' && m.completed)) n++;
  }
  return n >= 6;
}

const habitWhy = (r: number) => (r >= 0.8 ? 'لأنك لا تكاد تتركها' : r >= 0.5 ? 'لأنك تحافظ عليها في أغلب أيامك' : 'لأنك اعتدتها مؤخراً');

// ── the list ───────────────────────────────────────────────────────────────
export function dayAttention(input: AttentionInput): AttentionItem[] {
  const { snap, now, times: T } = input;
  const at = now.getTime();
  const today = dk(now);
  const yesterday = dk(addDays(now, -1));
  const log = snap.prayerLog ?? {};
  const excused = snap.excused ?? {};
  const events = snap.activity ?? [];
  const muted = new Set(input.muted ?? []);
  const hidden = new Set(input.hidden ?? []);
  const offset = input.hijriOffset ?? 0;
  const male = input.gender ? input.gender === 'male' : !!input.male;
  const rates = habitRates(snap, now, male);
  const rare = (h: HabitKey) => (rates[h] ?? 0) < RARE;
  const out: AttentionItem[] = [];
  const dhikrToday = (ref: string) => events.some((e) => e.domain === 'dhikr' && e.refId === ref && e.dateKey === today);
  const dhikrDays = (ref: string) => new Set(events.filter((e) => e.domain === 'dhikr' && e.refId === ref).map((e) => e.dateKey));
  const within = (a: Date, b: Date) => at >= a.getTime() && at < b.getTime();
  const fard = (k: string, p: PrayerName) => !!log[k]?.[p]?.fard;
  const prayerChain = (p: PrayerName) => chainBefore(new Set(Object.keys(log).filter((k) => log[k]?.[p]?.fard)), now);

  // Logs prayers: three of the last seven days, or any of today.
  const lastWeek = Array.from({ length: 7 }, (_, i) => dk(addDays(now, -(i + 1))));
  const logger = lastWeek.filter((k) => PRAYERS.some((p) => fard(k, p))).length >= 3 || PRAYERS.some((p) => fard(today, p));
  const prayToday = logger && !excused[today];
  const loggerWhy = 'لأنك تسجّل صلواتك عادةً';

  // ── missed: yesterday's (until Dhuhr) ──
  if (logger && !excused[yesterday] && (!T || at < T.dhuhr.getTime())) {
    // Before Fajr, yesterday's Isha is still in its time (below).
    const list = PRAYERS.filter((p) => !fard(yesterday, p) && !(p === 'isha' && T && at < T.fajr.getTime()));
    if (list.length) {
      out.push({
        id: `missed.yesterday.${list.join('-')}`,
        level: 'missed',
        weight: 'fard',
        icon: 'prayer',
        kicker: 'من صلوات أمس',
        title: list.length === 1 ? `لم تُسجَّل ${NAME[list[0]]} أمس` : `لم تُسجَّل ${arCount(list.length, 'صلاة', 'صلاتان', 'صلوات', 'صلاة')} من أمس`,
        body: 'إن كنت صلّيتها فسجّلها لتصدق أرقامك، وما فاتك فاقضِه — «فليصلّها إذا ذكرها»',
        to: '/module/prayers',
        action: { kind: 'prayers', dateKey: yesterday, prayers: list },
        why: loggerWhy,
      });
    }
  }

  if (T) {
    // ── missed: today's whose time is over ──
    if (prayToday) {
      const list = PRAYERS.filter((p) => !fard(today, p) && prayerEnd(T, p).getTime() <= at);
      if (list.length) {
        out.push({
          id: `missed.today.${list.join('-')}`,
          level: 'missed',
          weight: 'fard',
          icon: 'prayer',
          kicker: 'خرج وقتها',
          title: list.length === 1 ? `لم تُسجَّل صلاة ${NAME[list[0]]}` : `لم تُسجَّل ${arCount(list.length, 'صلاة', 'صلاتان', 'صلوات', 'صلاة')} اليوم`,
          body: 'إن صلّيتها فسجّلها بلمسة، وإن فاتتك فاقضِها الآن — «فليصلّها إذا ذكرها»',
          to: '/module/prayers',
          action: { kind: 'prayers', dateKey: today, prayers: list },
          why: loggerWhy,
          since: prayerEnd(T, list[list.length - 1]),
        });
      }

      // ── closing: the running prayer in its last 40 minutes (75 on a weekday it is often missed) ──
      const cur = [...PRAYERS].reverse().find((p) => T[p].getTime() <= at);
      if (cur && !fard(today, cur)) {
        const end = prayerEnd(T, cur);
        const weak = weakWeekdays(log, excused, now, cur).has(now.getDay());
        if (end.getTime() > at && end.getTime() - at <= (weak ? 75 : 40) * MIN) {
          out.push({
            id: `closing.prayer.${cur}`,
            level: 'closing',
            weight: 'fard',
            icon: 'prayer',
            kicker: 'يوشك وقتها أن يخرج',
            title: `صلاة ${NAME[cur]}`,
            body: cur === 'asr' ? 'لم تُسجَّل بعد — ولا تؤخّرها حتى تصفرّ الشمس' : `يخرج وقتها ب${END_NAME[cur]} ولم تُسجَّل بعد`,
            to: '/module/prayers',
            deadline: end,
            action: { kind: 'prayers', dateKey: today, prayers: [cur] },
            why: weak ? `لأنها قد تفوتك يوم ${WEEKDAY_LABELS_AR[now.getDay()]}` : undefined,
            streak: prayerChain(cur),
          });
        }
      }
    }

    // ── closing: last night's Isha before Fajr ──
    if (logger && !excused[yesterday] && at < T.fajr.getTime() && !fard(yesterday, 'isha')) {
      out.push({
        id: 'closing.prayer.isha-night',
        level: 'closing',
        weight: 'fard',
        icon: 'prayer',
        kicker: 'لم تُسجَّل بعد',
        title: 'صلاة العشاء',
        body: 'يمتدّ وقتها إلى الفجر، وأفضله قبل منتصف الليل',
        to: '/module/prayers',
        deadline: T.fajr,
        action: { kind: 'prayers', dateKey: yesterday, prayers: ['isha'] },
      });
    }

    // ── closing: what the user usually does, in its last stretch ──
    const habitClosing = (h: HabitKey, from: Date, end: Date, kicker: string, body: string, streak: number, action?: AttentionAction) => {
      if (rare(h) || !within(from, end)) return;
      const c = SUNNAH_COPY[h];
      out.push({ id: `closing.${h}`, level: 'closing', weight: 'sunnah', icon: c.icon, kicker, title: c.title, body, to: c.to, deadline: end, action, why: habitWhy(rates[h] ?? 0), rate: rates[h], streak, since: from });
    };
    // Morning / evening adhkar: on Home for EVERYONE through their time until read
    // (owner 2026-11-18) — «وقتها الآن», then closing in the last stretch.
    const setItem = (h: 'morning' | 'evening', from: Date, end: Date, closeFrom: Date, kicker: string, closingBody: string) => {
      if (dhikrToday(h) || !within(from, end)) return;
      const c = SUNNAH_COPY[h];
      const closing = at >= closeFrom.getTime() && at < end.getTime();
      out.push({
        id: `adhkar.${h}`,
        level: closing ? 'closing' : 'suggest',
        weight: 'sunnah',
        icon: c.icon,
        kicker: closing ? kicker : 'وقتها الآن',
        title: c.title,
        body: closing ? closingBody : c.body,
        to: c.to,
        deadline: end,
        why: closing ? 'لأن وقتها يوشك أن ينتهي' : 'لأنها حصنك في يومك',
        rate: rates[h],
        streak: chainBefore(dhikrDays(h), now),
        since: from,
      });
    };
    setItem('morning', T.fajr, T.dhuhr, new Date(T.dhuhr.getTime() - 90 * MIN), 'قبل الظهر', 'لم تقرأها اليوم بعد، وحصنك ليومك قبل أن ينتصف');
    if (at < T.maghrib.getTime()) {
      setItem('evening', T.asr, T.maghrib, new Date(T.maghrib.getTime() - 60 * MIN), 'قبل الغروب', 'لم تقرأها اليوم بعد، وأفضل وقتها قبل الغروب');
    } else {
      setItem('evening', T.maghrib, T.isha, T.isha, 'قبل العشاء', '');
    }
    const duhaWin = duhaWindow(T);
    if (!excused[today] && !snap.duha?.[today]) {
      habitClosing('duha', new Date(duhaWin.end.getTime() - 45 * MIN), duhaWin.end, 'يوشك وقتها أن ينتهي', 'قبل أن يقوم قائم الظهيرة — ركعتان تكفيان', chainBefore(new Set(Object.keys(snap.duha ?? {})), now), {
        kind: 'duha',
        dateKey: today,
      });
    }
    // The night belongs to its evening: before noon that is yesterday.
    if (!excused[yesterday] && at < T.fajr.getTime() && !snap.qiyamNights[yesterday]) {
      const nights = new Set(Object.keys(snap.qiyamNights));
      // The night of «yesterday» is still running: its chain ends the night before.
      habitClosing('qiyam', new Date(T.fajr.getTime() - 60 * MIN), T.fajr, 'آخر الليل', 'قبل أن يطلع الفجر — ولو ركعة الوتر', chainBefore(nights, addDays(now, -1)), { kind: 'qiyam' });
    }
    const midnight = new Date(`${dk(addDays(now, 1))}T00:00:00`);
    if (input.quranOwe && at >= T.isha.getTime()) {
      const wh = snap.wirdHistory ?? {};
      out.push({
        id: 'closing.quran',
        level: 'closing',
        weight: 'sunnah',
        icon: 'quran',
        kicker: 'قبل أن ينتهي يومك',
        title: `بقي من وردك ${arCount(input.quranOwe, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة')}`,
        body: '«أحبّ الأعمال إلى الله أدومها وإن قلّ»',
        to: '/quran',
        deadline: midnight,
        why: 'لأنه وِردٌ التزمته',
        streak: chainBefore(new Set(Object.keys(wh).filter((k) => (wh[k]?.achieved ?? 0) >= (wh[k]?.amount ?? 1))), now),
      });
    }
    const awrad = (snap.targets ?? []).filter((t) => t.recurrence === 'daily' && !t.completedAt && t.current < t.total);
    if (awrad.length && at >= T.isha.getTime()) {
      out.push({
        id: 'closing.awrad',
        level: 'closing',
        weight: 'extra',
        icon: 'awrad',
        kicker: 'قبل أن ينتهي يومك',
        title: awrad.length === 1 ? `وِردك: ${awrad[0].title}` : `بقي ${arCount(awrad.length, 'وِرد', 'وِردان', 'أوراد', 'وِرداً')} لم تكتمل`,
        body: awrad
          .slice(0, 3)
          .map((t) => `${t.title} ${ar(t.total - t.current)}`)
          .join('، '),
        to: awrad.length === 1 ? `/targets/${awrad[0].id}` : '/targets',
        deadline: midnight,
        why: 'لأنها أورادٌ التزمتها',
        streak: Math.max(0, ...awrad.map((t) => t.streak ?? 0)),
      });
    }

    // ── a fast: intend it tonight, take the suhoor before Fajr ──
    const fastOn = (d: Date) => fastReason(d, offset, sixOfShawwalDone(snap, now, offset));
    const fasts = !rare('fasting');
    const intended = (k: string) => input.fastIntent === k;
    if (!excused[today] && !muted.has('fasting')) {
      const tomorrow = dk(addDays(now, 1));
      const r = at >= T.asr.getTime() ? fastOn(addDays(now, 1)) : null;
      if (r) {
        const sure = intended(tomorrow);
        out.push({
          id: `prep.fast.${tomorrow}`,
          level: 'prep',
          weight: 'sunnah',
          icon: 'fasting',
          kicker: sure ? 'نويتَ صيامه، تقبّل الله' : 'انوِ من الليل',
          title: r.eve,
          body: sure ? 'تسحّر ولو بجرعة ماء — «تسحّروا فإن في السحور بركة»' : r.body,
          to: '/module/fasting',
          habit: 'fasting',
          action: sure ? undefined : { kind: 'intent', dateKey: tomorrow },
          why: sure ? 'نذكّرك بالسحور قبل الفجر' : fasts ? 'لأنك تصوم أمثاله' : r.major ? 'لفضل صيامه' : 'لأن النية تُبيَّت من الليل',
          rate: rates.fasting,
        });
      }
      // The fast day itself, before dawn: its suhoor.
      const todayFast = intended(today) || (fasts && fastOn(now));
      if (todayFast && within(new Date(T.fajr.getTime() - 90 * MIN), T.fajr)) {
        out.push({
          id: 'closing.suhoor',
          level: 'closing',
          weight: 'sunnah',
          icon: 'fasting',
          kicker: 'قبل أذان الفجر',
          title: 'السحور',
          body: '«تسحّروا فإن في السحور بركة» — وتعجيل الفطر وتأخير السحور من السنة',
          to: '/module/fasting',
          deadline: T.fajr,
          habit: 'fasting',
          why: intended(today) ? 'لأنك نويت صيام اليوم' : 'لأنك تصوم أمثاله',
        });
      }
    }

    // ── suggest: one sunnah, while its time is open ──
    const open = 'لأنها تغيب عنك مؤخراً، ووقتها مفتوح الآن';
    const cands: { h: HabitKey; rank: number; end?: Date; item?: Partial<AttentionItem> }[] = [];
    const seldom = (h: HabitKey, end: Date | undefined, item?: Partial<AttentionItem>) => {
      if (rare(h)) cands.push({ h, rank: rates[h] ?? 0, end, item: { why: end ? open : 'لأنها تغيب عنك مؤخراً', ...item } });
    };
    const prayOk = !excused[today];
    if (prayOk && !snap.duha?.[today] && within(duhaWin.start, duhaWin.end)) {
      seldom('duha', duhaWin.end, { action: { kind: 'duha', dateKey: today }, since: duhaWin.start });
    }
    const nightKey = at < new Date(`${today}T12:00:00`).getTime() ? yesterday : today;
    const nightEnd = at < T.fajr.getTime() ? T.fajr : new Date(T.fajr.getTime() + 24 * 60 * MIN);
    const lateNight = at < T.fajr.getTime() || at >= T.isha.getTime() + 60 * MIN;
    if (!excused[nightKey] && !snap.qiyamNights[nightKey] && lateNight) seldom('qiyam', nightEnd, { action: { kind: 'qiyam' } });
    if (prayOk && within(T.fajr, T.sunrise) && !log[today]?.fajr?.sunnahBefore) {
      seldom('fajrSunnah', T.sunrise, { action: { kind: 'sunnah', dateKey: today, prayer: 'fajr', type: 'sunnahBefore' } });
    }
    const cur = [...PRAYERS].reverse().find((p) => T[p].getTime() <= at);
    if (prayOk && cur && cur !== 'fajr' && at - T[cur].getTime() < 60 * MIN) {
      const e = log[today]?.[cur];
      const sun = sunnahRakaatOn(cur, today, male);
      const type = sun.before && !e?.fard && !e?.sunnahBefore ? 'sunnahBefore' : sun.after && !e?.sunnahAfter ? 'sunnahAfter' : null;
      if (type) {
        const n = sun[type === 'sunnahBefore' ? 'before' : 'after'];
        const jumuah = cur === 'dhuhr' && isJumuah(today, male);
        seldom('rawatib', undefined, {
          title: `${type === 'sunnahBefore' ? 'قبلية' : 'بعدية'} ${jumuah ? 'الجمعة' : NAME[cur]} — ${arCount(n, 'ركعة', 'ركعتان', 'ركعات', 'ركعة')}`,
          action: { kind: 'sunnah', dateKey: today, prayer: cur, type },
          since: T[cur],
        });
      }
    }
    // (morning/evening adhkar are their own items above — never competing for the one suggestion)
    if (!dhikrToday('sleep') && lateNight) seldom('sleep', undefined);
    if (male && rates.mosque != null && prayOk) {
      const next = PRAYERS.find((p) => T[p].getTime() > at && T[p].getTime() - at <= 30 * MIN);
      if (next) seldom('mosque', T[next], { title: `صلِّ ${NAME[next]} في المسجد` });
    }
    if (within(T.dhuhr, T.maghrib)) seldom('sadaqah', undefined);

    // The day's own sunnah: for everyone, ahead of the habits. Friday's night
    // begins at Thursday's Maghrib — الكهف from then.
    const friday = now.getDay() === 5;
    const fridayEve = now.getDay() === 4 && at >= T.maghrib.getTime();
    const kahfRead = (input.pagesToday ?? []).some((p) => p >= KAHF_PAGES[0] && p <= KAHF_PAGES[1]);
    const lastHour = new Date(T.maghrib.getTime() - 60 * MIN);
    if (friday && within(lastHour, T.maghrib)) cands.push({ h: 'fridayHour', rank: -3, end: T.maghrib, item: { kicker: 'آخر ساعة من الجمعة', why: 'لأنها آخر ساعة من يوم الجمعة' } });
    if (friday && !kahfRead && within(T.sunrise, lastHour)) cands.push({ h: 'kahf', rank: -2, item: { kicker: 'يوم الجمعة', why: 'لأن اليوم جمعة' } });
    if (fridayEve && !kahfRead) {
      cands.push({
        h: 'kahf',
        rank: -2,
        item: { kicker: 'ليلة الجمعة', why: 'لأن ليلة الجمعة دخلت بالمغرب', body: '«من قرأ سورة الكهف ليلة الجمعة أضاء له من النور فيما بينه وبين البيت العتيق»' },
      });
    }

    const pick = cands.filter((c) => !muted.has(c.h) && !hidden.has(`suggest.${c.h}`)).sort((a, b) => a.rank - b.rank)[0];
    if (pick) {
      const c = SUNNAH_COPY[pick.h];
      out.push({
        id: `suggest.${pick.h}`,
        level: 'suggest',
        weight: 'sunnah',
        icon: c.icon,
        kicker: 'سنّة تغيب عنك',
        title: c.title,
        body: c.body,
        to: c.to,
        deadline: pick.end,
        habit: pick.h,
        ...pick.item,
      });
    }
  }

  // ── a season ahead ──
  const season = muted.has('seasons') ? null : seasonNotice(now, offset);
  if (season) {
    out.push({ id: season.id, level: 'prep', weight: 'sunnah', icon: 'season', kicker: 'استعدّ', title: season.title, body: season.body, to: season.to, habit: 'seasons', why: 'لتستقبله وقد استعددت' });
  }

  // ── the registered sources ──
  const ctx: SourceContext = {
    now,
    today,
    times: T,
    timesOf: input.timesOf ?? ((d) => (dk(d) === today ? T : null)),
    gender: input.gender ?? (input.male ? 'male' : null),
    excused: !!excused[today],
    hijri: toHijri(now, offset),
    hijriOffset: offset,
  };
  out.push(...collectAttention(ctx).filter((i) => !i.habit || !muted.has(i.habit)));

  return rankAttention(
    out.filter((i) => !hidden.has(i.id)),
    now,
  );
}

// ── ranking ────────────────────────────────────────────────────────────────
const WEIGHT: Record<AttentionWeight, number> = { fard: 100, sunnah: 50, extra: 30 };
/** A suggestion is an invitation, tomorrow can wait: they sit below what is due today. */
const SHELF: Record<AttentionLevel, number> = { missed: 45, closing: 0, suggest: -15, prep: -25 };

/**
 * importance (fard 100 · sunnah 50 · extra 30) + urgency (up to 60% of the
 * importance as the deadline nears over its last three hours; a missed fard
 * +45) + the user's own habit (up to 25) and streak at stake (up to 20) +
 * freshness (up to 10 in the first two hours). So a fard about to end outranks
 * logging missed ones (what can still be prayed on time comes first), and a
 * missed fard outranks any sunnah running out.
 */
export function scoreOf(i: AttentionItem, now: Date): number {
  if (i.score != null) return i.score;
  const w = WEIGHT[i.weight ?? 'extra'];
  const left = i.deadline ? (i.deadline.getTime() - now.getTime()) / MIN : null;
  const urgency = left != null && left > 0 ? 0.6 * w * Math.max(0, 1 - left / 180) : 0;
  const relevance = 25 * (i.rate ?? 0) + Math.min(20, 2 * (i.streak ?? 0));
  const fresh = i.since ? 10 * Math.max(0, 1 - (now.getTime() - i.since.getTime()) / (120 * MIN)) : 0;
  return Math.round(w + SHELF[i.level] + urgency + relevance + fresh);
}

/** «لأنك تصليها عادةً، وسلسلتك ٧ أيام، وبقي ٢٥ دقيقة». */
export function whyLine(i: AttentionItem, now: Date): string | undefined {
  const parts: string[] = [];
  if (i.why) parts.push(i.why);
  if ((i.streak ?? 0) >= 2) parts.push(`سلسلتك ${daysN(i.streak!)}`);
  const left = i.deadline ? i.deadline.getTime() - now.getTime() : 0;
  if (left > 0) parts.push(`بقي ${leftLabel(left)}`);
  return parts.length ? parts.map((p, n) => (n === 0 ? p : `و${p}`)).join('، ') : undefined;
}

/** Score, explain and order (best first; a nearer deadline breaks ties). */
export function rankAttention(items: AttentionItem[], now: Date): AttentionItem[] {
  const due = (i: AttentionItem) => i.deadline?.getTime() ?? Infinity;
  return items
    .map((i) => ({ ...i, score: scoreOf(i, now), why: whyLine(i, now) }))
    .sort((a, b) => b.score - a.score || due(a) - due(b));
}

export interface AttentionView {
  /** «الآن»: the one thing to do first (never tomorrow's). */
  focus?: AttentionItem;
  /** «قبل أن يفوت»: the rest of today. */
  today: AttentionItem[];
  /** «استعدّ للغد». */
  tomorrow: AttentionItem[];
}

export function presentAttention(ranked: AttentionItem[]): AttentionView {
  const focus = ranked.find((i) => i.level !== 'prep');
  const rest = ranked.filter((i) => i !== focus);
  return { focus, today: rest.filter((i) => i.level !== 'prep'), tomorrow: rest.filter((i) => i.level === 'prep') };
}
