/**
 * «يحتاج انتباهك» — PURE. What on Home deserves a word at this minute:
 *
 *  missed   a fard whose time has gone and is not logged — today's, and
 *           yesterday's until Dhuhr (the owner forgets to log). Only for users
 *           who log their prayers; for anyone else it would be noise.
 *  closing  something the user USUALLY does, still undone, whose time is
 *           running out: the running prayer, morning/evening adhkar, الضحى,
 *           the night's قيام, the Qur'an wird and the daily أوراد.
 *  suggest  ONE sunnah the user SELDOM does, while its time is open — or a
 *           sunnah of the day itself (Friday's الكهف and last hour, tomorrow's
 *           fast). A habit is either closing or suggested, never both.
 *           For a woman, also her everyday house chores from 2 pm until logged.
 *
 * `habitRates` (how often each sunnah was done lately) and `SUNNAH_COPY` are
 * shared with the notification companion so both speak with one voice.
 * Checked by scripts/dayAttention.test.ts.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { arCount, hijriDay, type InsightsSnapshot } from '@/services/insightsEngine';
import { WEEKDAY_LABELS_AR, toArabicDigits } from '@/services/statsService';
import { duhaWindow, isJumuah, sunnahRakaatOn } from '@/store/prayerLogStore';
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

export type AttentionLevel = 'missed' | 'closing' | 'suggest';
export type AttentionIcon = 'prayer' | 'morning' | 'evening' | 'sleep' | 'duha' | 'qiyam' | 'quran' | 'awrad' | 'fasting' | 'mosque' | 'sadaqah' | 'friday' | 'house';

export type AttentionAction =
  | { kind: 'prayers'; dateKey: string; prayers: PrayerName[] }
  | { kind: 'duha'; dateKey: string }
  | { kind: 'qiyam' }
  | { kind: 'sunnah'; dateKey: string; prayer: PrayerName; type: 'sunnahBefore' | 'sunnahAfter' }
  | { kind: 'chores'; chores: string[] };

export interface AttentionItem {
  /** Stable for the fact (a dismissal hides it for the day). */
  id: string;
  level: AttentionLevel;
  icon: AttentionIcon;
  kicker: string;
  title: string;
  body: string;
  to: string;
  /** Live countdown target («ينتهي بعد …»). */
  deadline?: Date;
  action?: AttentionAction;
  /** Suggestions: the key «لا تقترحها» mutes ('house' = the chores reminder). */
  habit?: HabitKey | 'house';
}

export interface AttentionInput {
  snap: InsightsSnapshot;
  now: Date;
  /** Today's prayer times (null without a location). */
  times: DayTimes | null;
  male?: boolean;
  /** Qur'an pages still owed today (null = no wird). */
  quranOwe?: number | null;
  /** مصحفي pages read today (سورة الكهف on Friday). */
  pagesToday?: number[];
  /** Habits the user muted. */
  muted?: readonly string[];
  /** Item ids dismissed for today (the next suggestion takes a hidden one's place). */
  hidden?: readonly string[];
  /** «مهام المنزل» log — pass it for a woman only. */
  house?: readonly { chore: string; day: string }[];
}

/** The everyday chores Home reminds her of (owner 2026-11-16). */
export const DAILY_CHORES = ['cook', 'dishes', 'clean'];

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

/** Hijri 13–15: الأيام البيض. */
export const isWhiteDay = (d: Date) => {
  const h = hijriDay(d);
  return h != null && h >= 13 && h <= 15;
};

/** Tomorrow's voluntary fast (Monday / Thursday / a white day), with its line — or null. */
export function fastTomorrow(now: Date): { title: string; body: string } | null {
  const t = addDays(now, 1);
  if (isWhiteDay(t)) {
    return { title: 'غداً من الأيام البيض', body: '«صيام ثلاثة أيام من كل شهر صيام الدهر كله» — انوِ وتسحّر' };
  }
  const wd = t.getDay();
  if (wd === 1 || wd === 4) return { title: `غداً ${WEEKDAY_LABELS_AR[wd]} — صيام مستحب`, body: SUNNAH_COPY.fasting.body };
  return null;
}

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
  const rates = habitRates(snap, now, input.male);
  const rare = (h: HabitKey) => (rates[h] ?? 0) < RARE;
  const out: AttentionItem[] = [];
  const dhikrToday = (ref: string) => events.some((e) => e.domain === 'dhikr' && e.refId === ref && e.dateKey === today);
  const within = (a: Date, b: Date) => at >= a.getTime() && at < b.getTime();
  const fard = (k: string, p: PrayerName) => !!log[k]?.[p]?.fard;

  // Logs prayers: three of the last seven days, or any of today.
  const lastWeek = Array.from({ length: 7 }, (_, i) => dk(addDays(now, -(i + 1))));
  const logger = lastWeek.filter((k) => PRAYERS.some((p) => fard(k, p))).length >= 3 || PRAYERS.some((p) => fard(today, p));
  const prayToday = logger && !excused[today];

  // ── missed: yesterday's (until Dhuhr) ──
  if (logger && !excused[yesterday] && (!T || at < T.dhuhr.getTime())) {
    // Before Fajr, yesterday's Isha is still in its time (below).
    const list = PRAYERS.filter((p) => !fard(yesterday, p) && !(p === 'isha' && T && at < T.fajr.getTime()));
    if (list.length) {
      out.push({
        id: `missed.yesterday.${list.join('-')}`,
        level: 'missed',
        icon: 'prayer',
        kicker: 'من صلوات أمس',
        title: list.length === 1 ? `لم تُسجَّل ${NAME[list[0]]} أمس` : `لم تُسجَّل ${arCount(list.length, 'صلاة', 'صلاتان', 'صلوات', 'صلاة')} من أمس`,
        body: 'إن كنت صلّيتها فسجّلها لتصدق أرقامك، وما فاتك فاقضِه — «فليصلّها إذا ذكرها»',
        to: '/module/prayers',
        action: { kind: 'prayers', dateKey: yesterday, prayers: list },
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
          icon: 'prayer',
          kicker: 'خرج وقتها',
          title: list.length === 1 ? `لم تُسجَّل صلاة ${NAME[list[0]]}` : `لم تُسجَّل ${arCount(list.length, 'صلاة', 'صلاتان', 'صلوات', 'صلاة')} اليوم`,
          body: 'إن صلّيتها فسجّلها بلمسة، وإن فاتتك فاقضِها الآن — «فليصلّها إذا ذكرها»',
          to: '/module/prayers',
          action: { kind: 'prayers', dateKey: today, prayers: list },
        });
      }

      // ── closing: the running prayer in its last 40 minutes ──
      const cur = [...PRAYERS].reverse().find((p) => T[p].getTime() <= at);
      if (cur && !fard(today, cur)) {
        const end = prayerEnd(T, cur);
        if (end.getTime() > at && end.getTime() - at <= 40 * MIN) {
          out.push({
            id: `closing.prayer.${cur}`,
            level: 'closing',
            icon: 'prayer',
            kicker: 'يوشك وقتها أن يخرج',
            title: `صلاة ${NAME[cur]}`,
            body: cur === 'asr' ? 'لم تُسجَّل بعد — ولا تؤخّرها حتى تصفرّ الشمس' : `يخرج وقتها ب${END_NAME[cur]} ولم تُسجَّل بعد`,
            to: '/module/prayers',
            deadline: end,
            action: { kind: 'prayers', dateKey: today, prayers: [cur] },
          });
        }
      }
    }

    // ── closing: last night's Isha before Fajr ──
    if (logger && !excused[yesterday] && at < T.fajr.getTime() && !fard(yesterday, 'isha')) {
      out.push({
        id: 'closing.prayer.isha-night',
        level: 'closing',
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
    const habitClosing = (h: HabitKey, from: Date, end: Date, kicker: string, body: string, action?: AttentionAction) => {
      if (rare(h) || !within(from, end)) return;
      out.push({ id: `closing.${h}`, level: 'closing', icon: SUNNAH_COPY[h].icon, kicker, title: SUNNAH_COPY[h].title, body, to: SUNNAH_COPY[h].to, deadline: end, action });
    };
    if (!dhikrToday('morning')) {
      habitClosing('morning', new Date(T.dhuhr.getTime() - 90 * MIN), T.dhuhr, 'قبل الظهر', 'لم تقرأها اليوم بعد، وحصنك ليومك قبل أن ينتصف');
    }
    if (!dhikrToday('evening')) {
      habitClosing('evening', new Date(T.maghrib.getTime() - 60 * MIN), T.maghrib, 'قبل الغروب', 'لم تقرأها اليوم بعد، وأفضل وقتها قبل الغروب');
    }
    const duhaWin = duhaWindow(T);
    if (!excused[today] && !snap.duha?.[today]) {
      habitClosing('duha', new Date(duhaWin.end.getTime() - 45 * MIN), duhaWin.end, 'يوشك وقتها أن ينتهي', 'قبل أن يقوم قائم الظهيرة — ركعتان تكفيان', {
        kind: 'duha',
        dateKey: today,
      });
    }
    // The night belongs to its evening: before noon that is yesterday.
    if (!excused[yesterday] && at < T.fajr.getTime() && !snap.qiyamNights[yesterday]) {
      habitClosing('qiyam', new Date(T.fajr.getTime() - 60 * MIN), T.fajr, 'آخر الليل', 'قبل أن يطلع الفجر — ولو ركعة الوتر', { kind: 'qiyam' });
    }
    const midnight = new Date(`${dk(addDays(now, 1))}T00:00:00`);
    if (input.quranOwe && at >= T.isha.getTime()) {
      out.push({
        id: 'closing.quran',
        level: 'closing',
        icon: 'quran',
        kicker: 'قبل أن ينتهي يومك',
        title: `بقي من وردك ${arCount(input.quranOwe, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة')}`,
        body: '«أحبّ الأعمال إلى الله أدومها وإن قلّ»',
        to: '/quran',
        deadline: midnight,
      });
    }
    const awrad = (snap.targets ?? []).filter((t) => t.recurrence === 'daily' && !t.completedAt && t.current < t.total);
    if (awrad.length && at >= T.isha.getTime()) {
      out.push({
        id: 'closing.awrad',
        level: 'closing',
        icon: 'awrad',
        kicker: 'قبل أن ينتهي يومك',
        title: awrad.length === 1 ? `وِردك: ${awrad[0].title}` : `بقي ${arCount(awrad.length, 'وِرد', 'وِردان', 'أوراد', 'وِرداً')} لم تكتمل`,
        body: awrad
          .slice(0, 3)
          .map((t) => `${t.title} ${ar(t.total - t.current)}`)
          .join('، '),
        to: awrad.length === 1 ? `/targets/${awrad[0].id}` : '/targets',
        deadline: midnight,
      });
    }

    // ── suggest: one sunnah, while its time is open ──
    const cands: { h: HabitKey; rank: number; end?: Date; item?: Partial<AttentionItem> }[] = [];
    const seldom = (h: HabitKey, end: Date | undefined, item?: Partial<AttentionItem>) => {
      if (rare(h)) cands.push({ h, rank: rates[h] ?? 0, end, item });
    };
    const prayOk = !excused[today];
    if (prayOk && !snap.duha?.[today] && within(duhaWin.start, duhaWin.end)) {
      seldom('duha', duhaWin.end, { action: { kind: 'duha', dateKey: today } });
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
      const sun = sunnahRakaatOn(cur, today, !!input.male);
      const type = sun.before && !e?.fard && !e?.sunnahBefore ? 'sunnahBefore' : sun.after && !e?.sunnahAfter ? 'sunnahAfter' : null;
      if (type) {
        const n = sun[type === 'sunnahBefore' ? 'before' : 'after'];
        const jumuah = cur === 'dhuhr' && isJumuah(today, !!input.male);
        seldom('rawatib', undefined, {
          title: `${type === 'sunnahBefore' ? 'قبلية' : 'بعدية'} ${jumuah ? 'الجمعة' : NAME[cur]} — ${arCount(n, 'ركعة', 'ركعتان', 'ركعات', 'ركعة')}`,
          action: { kind: 'sunnah', dateKey: today, prayer: cur, type },
        });
      }
    }
    if (!dhikrToday('morning') && within(T.fajr, T.dhuhr)) seldom('morning', T.dhuhr);
    if (!dhikrToday('evening') && within(T.asr, T.isha)) seldom('evening', T.isha);
    if (!dhikrToday('sleep') && lateNight) seldom('sleep', undefined);
    if (input.male && rates.mosque != null && prayOk) {
      const next = PRAYERS.find((p) => T[p].getTime() > at && T[p].getTime() - at <= 30 * MIN);
      if (next) seldom('mosque', T[next], { title: `صلِّ ${NAME[next]} في المسجد` });
    }
    if (within(T.dhuhr, T.maghrib)) seldom('sadaqah', undefined);

    // The day's own sunnah: for everyone, ahead of the habits.
    const friday = now.getDay() === 5;
    const kahfRead = (input.pagesToday ?? []).some((p) => p >= KAHF_PAGES[0] && p <= KAHF_PAGES[1]);
    const lastHour = new Date(T.maghrib.getTime() - 60 * MIN);
    if (friday && within(lastHour, T.maghrib)) cands.push({ h: 'fridayHour', rank: -3, end: T.maghrib, item: { kicker: 'آخر ساعة من الجمعة' } });
    if (friday && !kahfRead && within(T.sunrise, lastHour)) cands.push({ h: 'kahf', rank: -2, item: { kicker: 'يوم الجمعة' } });
    const fast = at >= T.asr.getTime() ? fastTomorrow(now) : null;
    if (fast) cands.push({ h: 'fasting', rank: -1, item: { kicker: 'انوِ من الليل', ...fast } });

    const pick = cands.filter((c) => !muted.has(c.h) && !hidden.has(`suggest.${c.h}`)).sort((a, b) => a.rank - b.rank)[0];
    if (pick) {
      const c = SUNNAH_COPY[pick.h];
      out.push({ id: `suggest.${pick.h}`, level: 'suggest', icon: c.icon, kicker: 'سنّة تغيب عنك', title: c.title, body: c.body, to: c.to, deadline: pick.end, habit: pick.h, ...pick.item });
    }
  }

  // ── her everyday chores, from the afternoon until logged ──
  if (input.house && now.getHours() >= 14 && !muted.has('house')) {
    const done = new Set(input.house.filter((e) => e.day === today).map((e) => e.chore));
    const left = DAILY_CHORES.filter((c) => !done.has(c));
    if (left.length) {
      out.push({
        id: 'house.today',
        level: 'suggest',
        icon: 'house',
        kicker: 'مهام المنزل',
        title: 'سجّلي ما أنجزتِه في بيتك اليوم',
        body: '«كان النبي ﷺ يكون في مهنة أهله» — بنيّةٍ صالحة تصير عبادة، ولها نقاطها في الترتيب',
        to: '/study?tab=house',
        habit: 'house',
        action: { kind: 'chores', chores: left },
      });
    }
  }

  const order: Record<AttentionLevel, number> = { missed: 0, closing: 1, suggest: 2 };
  const due = (i: AttentionItem) => i.deadline?.getTime() ?? Infinity;
  return out.filter((i) => !hidden.has(i.id)).sort((a, b) => order[a.level] - order[b.level] || due(a) - due(b));
}
