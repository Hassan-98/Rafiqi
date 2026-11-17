import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns';
import {
  computeInsights,
  collectSnapshot,
  arCount,
  type Insight,
  type InsightsSnapshot,
} from '@/services/insightsService';
import { computeStreakFromActiveDates, toArabicDigits } from '@/services/statsService';
import { notificationService } from '@/services/NotificationService';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { qiyamNightKey, useQiyamStore } from '@/store/qiyamStore';
import { useProgressStore } from '@/store/progressStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQuranStore } from '@/store/quranStore';
import { useMushafiStore, quranTypeStats } from '@/store/mushafiStore';
import { QURAN_TYPE_IDS, quranTypeOf, type QuranType } from '@/data/quranTypes';
import { useSettingsStore } from '@/store/settingsStore';
import {
  useNotificationStore,
  getSmartPrefs,
  defaultReminderTime,
  type SmartNotificationPrefs,
} from '@/store/notificationStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useAttentionStore } from '@/store/attentionStore';
import { KAHF_PAGES } from '@/services/dayAttention';
import { planCompanion, type CompanionInput, type CompanionKind } from '@/services/smartCompanion';
import { currentBadgeMetrics } from '@/services/BadgeEngine';
import { BADGES, badgeVisible } from '@/data/badges';
import { useBadgeStore } from '@/store/badgeStore';
import { remainingMinutes } from '@/components/adhkar/adhkarSets';
import { postPrayerItems } from '@/components/adhkar/postPrayer';
import { morningAdhkar, eveningAdhkar, postPrayerAdhkar, sleepAdhkar, briefAdhkar } from '@/data/adhkar';
import type { SoundKey } from '@/services/notifications/sounds';
import type { PrayerName } from '@/types';

/**
 * SMART NOTIFICATIONS — a handful of stats-driven local notifications, all
 * derived from the insights engine so they say exactly what the app shows.
 *
 *  kind       id                          when
 *  streak     myzikr_smart_streak         21:00 (or 30 min before quiet hours) on the next
 *                                         evening a streak is not yet done that day
 *  qiyam      myzikr_smart_qiyamnight     start of the last third of the next un-logged night
 *  weekly     myzikr_smart_weekly         next Friday 18:00 — real numbers for the week
 *  celebrate  myzikr_smart_celebrate      ~20 min after a new record/milestone insight
 *                                         appears (once per fact, at most one a day)
 *
 * Every id is DATELESS and one-shot: each reschedule overwrites or cancels
 * the same OS notification, so nothing can multiply (see
 * purgeLegacyDatedReminders). The decision is a pure function
 * (`planSmartNotifications`) — checked by scripts/smartNotifications.test.ts.
 */

export const SMART_IDS = {
  streak: 'myzikr_smart_streak',
  qiyam: 'myzikr_smart_qiyamnight',
  weekly: 'myzikr_smart_weekly',
  celebrate: 'myzikr_smart_celebrate',
} as const;

export type SmartKind = keyof typeof SMART_IDS;

export interface SmartNotification {
  id: string;
  kind: SmartKind | CompanionKind;
  title: string;
  body: string;
  at: Date;
  deepLinkPath: string;
  /** `smart.*` → informational action type (no «تم»); 'qiyam' keeps تم = log the night. */
  moduleId: string;
  soundKey: SoundKey;
  /** `prayers` + meta.prayer → the «صلّيت» action logs that prayer. */
  meta?: Record<string, string>;
}

export interface SmartPlanInput {
  snap: InsightsSnapshot;
  now: Date;
  prefs: SmartNotificationPrefs;
  /** Celebrate-once ledger: key → epoch ms delivered (or scheduled). */
  celebrated: Record<string, number>;
  /** False until the ledger is seeded; the first run marks existing facts silently. */
  seeded: boolean;
  /** dateKey → Qur'an pages read (approx., from the wird history). */
  pagesByDay?: Record<string, number>;
  /** Night window for a night key (Maghrib → Fajr); null when location is unknown. */
  nightWindow?: (nightKey: string) => { lastThird: Date } | null;
  /** The «قيام الليل» master switch (notificationStore config) — off silences the smart one too. */
  qiyamEnabled?: boolean;
  /** The user's qiyam ringtone (defaults to 'qiyam'). */
  qiyamSound?: SoundKey;
  /** «رفيقك اليومي» inputs (prayer times, wird, badges…) — absent = companion off. */
  companion?: Omit<CompanionInput, 'snap' | 'now' | 'prefs'>;
}

export interface SmartPlan {
  notifications: SmartNotification[];
  /** Ledger entries to add (new celebration and/or first-run seeds). */
  celebrated: Record<string, number>;
}

// ── time helpers ───────────────────────────────────────────────────────────
const MIN = 60 * 1000;
const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
function atTime(day: Date, hhmm: string): Date {
  const t = new Date(day);
  const m = toMin(hhmm);
  t.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return t;
}
export function inQuietHours(t: Date, p: SmartNotificationPrefs): boolean {
  if (!p.quietEnabled) return false;
  const m = t.getHours() * 60 + t.getMinutes();
  const s = toMin(p.quietStart);
  const e = toMin(p.quietEnd);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
/** First moment ≥ t outside quiet hours. */
function afterQuiet(t: Date, p: SmartNotificationPrefs): Date {
  if (!inQuietHours(t, p)) return t;
  let end = atTime(t, p.quietEnd);
  if (end <= t) end = addDays(end, 1);
  return end;
}

const days = (n: number) => arCount(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');
const nights = (n: number) => arCount(n, 'ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة');
const pages = (n: number) => arCount(n, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة');

/** Where a streak nudge should take the user — the place to ACT, not the chart. */
const ACTION_ROUTE: Record<string, string> = {
  prayers: '/module/prayers',
  overall: '/',
  dhikr: '/adhkar',
  quran: '/quran',
  awrad: '/targets',
  habits: '/habits',
  fasting: '/module/fasting',
};
const STREAK_ORDER = ['prayers', 'overall', 'dhikr', 'quran', 'awrad', 'habits', 'fasting'];
const route = (path: string) => `/#${path.startsWith('/') ? '' : '/'}${path}`;

// ── the pure planner ───────────────────────────────────────────────────────
export function planSmartNotifications(input: SmartPlanInput): SmartPlan {
  const { snap, now, prefs } = input;
  const out: SmartNotification[] = [];
  const celebrated: Record<string, number> = {};
  const insightsNow = computeInsights(snap, now);

  // 0) «رفيقك اليومي» — prayers, adhkar, wird and challenges at the user's own times.
  const companion = input.companion ? planCompanion({ ...input.companion, snap, now, prefs }) : [];
  for (const n of companion) out.push(n);
  /** A companion nudge already speaks for this streak on that day. */
  const covered = (domain: string, day: Date) =>
    companion.some((n) => dk(n.at) === dk(day) && (n.domain === domain || (domain === 'overall' && n.kind === 'combo')));

  // 1) Streak at risk — the evening of today, or tomorrow once today is safe.
  if (prefs.streak) {
    const atRisk = (list: Insight[]) =>
      list.filter((i) => i.id.endsWith('.streak-at-risk') && i.domain !== 'qiyam');
    const riskToday = new Set(atRisk(insightsNow).map((i) => i.domain));
    for (const offset of [0, 1]) {
      let at = atTime(addDays(now, offset), '21:00');
      if (inQuietHours(at, prefs)) at = new Date(atTime(at, prefs.quietStart).getTime() - 30 * MIN);
      if (at <= now || inQuietHours(at, prefs) || at.getHours() < 17) continue;
      // Tomorrow's nudge is only honest for streaks already secured today —
      // an at-risk streak that isn't logged tonight will be broken by then.
      const risks = atRisk(computeInsights(snap, at))
        .filter((i) => offset === 0 || !riskToday.has(i.domain))
        .filter((i) => !covered(i.domain, at))
        .sort((a, b) => rank(a.domain) - rank(b.domain));
      if (risks.length === 0) continue;
      const top = risks[0];
      out.push({
        id: SMART_IDS.streak,
        kind: 'streak',
        title: top.title,
        body: top.body,
        at,
        deepLinkPath: route(ACTION_ROUTE[top.domain] ?? top.to ?? '/'),
        moduleId: 'smart.streak',
        soundKey: 'default',
      });
      break;
    }
  }

  // 2) Qiyam — start of the last third of the next night not yet logged.
  //    Deliberately NOT bound by quiet hours: the night is its whole point.
  if (prefs.qiyam && input.qiyamEnabled !== false && input.nightWindow) {
    const tonight = qiyamNightKey(now);
    for (const k of [tonight, dk(addDays(parseISO(`${tonight}T12:00:00`), 1))]) {
      if (snap.qiyamNights[k]) continue;
      const w = input.nightWindow(k);
      if (!w || w.lastThird <= now) continue;
      const streak = computeInsights(snap, w.lastThird).find((i) => i.id === 'qiyam.streak');
      const hasHistory = Object.keys(snap.qiyamNights).length > 0;
      out.push({
        id: SMART_IDS.qiyam,
        kind: 'qiyam',
        title: 'بدأ الثلث الأخير من الليل',
        body: streak?.value
          ? `سلسلة قيامك ${streak.value} — ركعتان الليلة تحفظانها`
          : hasHistory
            ? 'ركعتان في جوف الليل تبدأ بهما سلسلة جديدة'
            : 'ينزل ربنا إلى السماء الدنيا حين يبقى ثلث الليل الآخر — ركعتان تكفيان',
        at: w.lastThird,
        deepLinkPath: route('/targets?tab=qiyam'),
        moduleId: 'qiyam',
        soundKey: input.qiyamSound ?? 'qiyam',
      });
      break;
    }
  }

  // 3) Weekly summary — next Friday at 18:00 (after Jumu'ah and Asr).
  if (prefs.weekly) {
    let at = atTime(now, '18:00');
    while (at.getDay() !== 5 || at <= now) at = addDays(at, 1);
    at = afterQuiet(at, prefs);
    const body = weeklyBody(snap, at, input.pagesByDay ?? {});
    if (body) {
      out.push({
        id: SMART_IDS.weekly,
        kind: 'weekly',
        title: 'حصاد أسبوعك',
        body,
        at,
        deepLinkPath: route('/stats'),
        moduleId: 'smart.weekly',
        soundKey: 'default',
      });
    }
  }

  // 4) Celebrate a new record / milestone — once per fact.
  const facts = insightsNow.filter(
    (i) => i.tone === 'celebrate' && (i.kind === 'record' || i.kind === 'milestone'),
  );
  const keyOf = (i: Insight) => `${i.id}|${i.value ?? i.body}`;
  if (!input.seeded) {
    // First run: whatever is already true pre-dates the feature — mark it, don't announce it.
    for (const i of facts) celebrated[keyOf(i)] = now.getTime();
  } else if (prefs.celebrate) {
    const pending = facts.find((i) => (input.celebrated[keyOf(i)] ?? 0) > now.getTime());
    const fresh = facts.find((i) => !(keyOf(i) in input.celebrated));
    const pick = pending ?? fresh;
    if (pick) {
      const at = pending
        ? new Date(input.celebrated[keyOf(pick)])
        : afterQuiet(new Date(now.getTime() + 20 * MIN), prefs);
      // Cap: one celebration per calendar day.
      const sameDay = Object.entries(input.celebrated).some(
        ([k, t]) => k !== keyOf(pick) && dk(new Date(t)) === dk(at),
      );
      if (pending || !sameDay) {
        if (!pending) celebrated[keyOf(pick)] = at.getTime();
        out.push({
          id: SMART_IDS.celebrate,
          kind: 'celebrate',
          title: `بارك الله فيك — ${pick.title}`,
          body: pick.body,
          at,
          deepLinkPath: route(pick.to ?? '/stats'),
          moduleId: 'smart.celebrate',
          soundKey: 'default',
        });
      }
    }
  }

  return { notifications: out, celebrated };
}

function rank(domain: string): number {
  const i = STREAK_ORDER.indexOf(domain);
  return i === -1 ? STREAK_ORDER.length : i;
}

/** "أيام العبادة: ٥ من ٧ · الصلوات كاملة: ٤ أيام · القيام: ليلتان · …" */
function weeklyBody(snap: InsightsSnapshot, at: Date, pagesByDay: Record<string, number>): string | null {
  const week = new Set(Array.from({ length: 7 }, (_, i) => dk(addDays(at, -i))));
  const activeKeys = Object.values(snap.dailyProgress)
    .filter((d) => d.modules.some((m) => m.completed))
    .map((d) => d.dateKey);
  if (activeKeys.length === 0) return null; // brand-new user: nothing to summarise yet
  const active = activeKeys.filter((k) => week.has(k)).length;
  if (active === 0) return 'أسبوع جديد بين يديك — ورد قصير أو ركعتان تكفيان لتعود';
  const fullPrayers = Object.entries(snap.prayerFardDays).filter(([k, n]) => n >= 5 && week.has(k)).length;
  const qiyam = Object.keys(snap.qiyamNights).filter((k) => week.has(k)).length;
  const read = Math.round([...week].reduce((s, k) => s + (pagesByDay[k] ?? 0), 0));
  const streak = computeStreakFromActiveDates(activeKeys).current;
  const parts = [`أيام العبادة: ${toArabicDigits(active)} من ٧`];
  if (fullPrayers > 0) parts.push(`الصلوات كاملة: ${days(fullPrayers)}`);
  if (qiyam > 0) parts.push(`القيام: ${nights(qiyam)}`);
  if (read > 0) parts.push(`القراءة: ${pages(read)}`);
  if (streak >= 2) parts.push(`سلسلتك: ${days(streak)}`);
  return parts.join(' · ');
}

// ── runtime ────────────────────────────────────────────────────────────────
/** Pages read per day, approximated from the wird history's unit. */
export function wirdPagesByDay(): Record<string, number> {
  // ponytail: unit→pages uses mushaf averages (juz≈20, hizb≈10, ~10.3 ayat/page; surah uncounted).
  const PER: Record<string, number> = { page: 1, juz: 20, hizb: 10, ayat: 1 / 10.3, surah: 0 };
  const out: Record<string, number> = {};
  for (const [k, e] of Object.entries(useQuranStore.getState().wirdHistory)) {
    out[k] = (e.achieved ?? 0) * (PER[e.unit] ?? 0);
  }
  return out;
}

/** Maghrib of the night's evening → Fajr next morning (mirrors QiyamModule). */
export function nightWindow(nightKey: string): { lastThird: Date } | null {
  const { coords, prayerMethod, madhabSchool } = useSettingsStore.getState();
  if (!coords) return null;
  try {
    const evening = parseISO(`${nightKey}T12:00:00`);
    const maghrib = prayerTimeService.getTimes(coords, evening, prayerMethod, madhabSchool).maghrib;
    const fajr = prayerTimeService.getTimes(coords, addDays(evening, 1), prayerMethod, madhabSchool).fajr;
    return { lastThird: new Date(fajr.getTime() - (fajr.getTime() - maghrib.getTime()) / 3) };
  } catch {
    return null;
  }
}

/** Prayer times of any day (null without a location). */
function dayTimes(day: Date) {
  const { coords, prayerMethod, madhabSchool } = useSettingsStore.getState();
  if (!coords) return null;
  try {
    return prayerTimeService.getTimes(coords, day, prayerMethod, madhabSchool);
  } catch {
    return null;
  }
}

type NearSlot = keyof NonNullable<CompanionInput['nearBadges']>;
/** Badge metric → the companion nudge it rides on. */
const NEAR_METRICS: [NearSlot, string][] = [
  ['morning', 'dhikr_morning_streak'],
  ['evening', 'dhikr_evening_streak'],
  ['sleep', 'dhikr_sleep_streak'],
  ['quran', 'quran_streak'],
  ['awrad', 'wird_streak'],
  ['pray:fajr', 'fajr_streak'],
  ['pray:dhuhr', 'dhuhr_streak'],
  ['pray:asr', 'asr_streak'],
  ['pray:maghrib', 'maghrib_streak'],
  ['pray:isha', 'isha_streak'],
];

/** The live inputs of «رفيقك اليومي». */
function companionInput(now: Date): SmartPlanInput['companion'] {
  const st = useNotificationStore.getState();
  const settings = useSettingsStore.getState();
  const today = format(now, 'yyyy-MM-dd');
  const cfg = (k: string) => st.getConfig(k);
  const own = (k: string) => {
    const c = cfg(k);
    return c.time && c.time !== defaultReminderTime(k) ? c.time : undefined;
  };
  const quran = useQuranStore.getState();
  const wird = quran.wird;

  // «مصحفي»: each running khatma's share of today, how long each kind has stood still, kinds never tried.
  const m = useMushafiStore.getState();
  const types = m.code ? quranTypeStats(m.days, m.khatmas, m.marks, today, m.tops) : null;
  const running = types
    ? QURAN_TYPE_IDS.flatMap((ty) => types[ty].running).filter((x) => x.live && x.day >= 0 && x.day < x.days)
    : [];
  const typeIdle: Partial<Record<QuranType, number>> = {};
  for (const x of running) {
    if (typeIdle[x.type] != null) continue;
    const moved = Object.keys(types![x.type].days).filter((k) => k <= today).sort().pop();
    const since = moved ?? running.filter((y) => y.type === x.type).map((y) => y.started).sort()[0];
    typeIdle[x.type] = Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(since)));
  }
  const noShare = m.code && m.khatmas.length ? QURAN_TYPE_IDS.filter((ty) => !m.khatmas.some((k) => !k.del && quranTypeOf(k.ty) === ty)) : [];

  // Badges one completion away (streak tiers whose target is the run + 1).
  const near: NonNullable<CompanionInput['nearBadges']> = {};
  let combos: CompanionInput['combos'] = [];
  try {
    const m = currentBadgeMetrics();
    combos = m.today;
    const unlocked = new Set(useBadgeStore.getState().unlocked);
    for (const [slot, metric] of NEAR_METRICS) {
      const v = m.value[metric as keyof typeof m.value] ?? 0;
      const b = BADGES.find((x) => x.metric === metric && !unlocked.has(x.id) && badgeVisible(x, settings.gender) && x.target === v + 1);
      if (b) near[slot] = b.titleAr;
    }
  } catch {
    /* badges are a garnish — the nudges stand without them */
  }

  const after: Partial<Record<PrayerName, number>> = {};
  for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as PrayerName[]) after[p] = remainingMinutes(postPrayerItems(p, postPrayerAdhkar), {}, {});

  return {
    times: dayTimes,
    male: settings.gender === 'male',
    excusedToday: !!usePrayerLogStore.getState().excused[today],
    enabled: {
      'prayers.fajr': cfg('prayers.fajr').enabled,
      'prayers.dhuhr': cfg('prayers.dhuhr').enabled,
      'prayers.asr': cfg('prayers.asr').enabled,
      'prayers.maghrib': cfg('prayers.maghrib').enabled,
      'prayers.isha': cfg('prayers.isha').enabled,
      'dhikr.morning': cfg('dhikr.morning').enabled,
      'dhikr.evening': cfg('dhikr.evening').enabled,
      quran: cfg('quran').enabled,
    },
    anchors: { morning: own('dhikr.morning'), evening: own('dhikr.evening'), quran: own('quran') ?? wird?.reminderTime },
    quran: wird ? { goal: wird.amount, done: quran.wirdHistory[today]?.achieved ?? 0, unit: wird.unit } : null,
    khatmas: running.map((x) => ({ name: x.name, type: x.type, owe: x.owe })),
    typeIdle,
    noShare,
    minutes: {
      morning: remainingMinutes(briefAdhkar(morningAdhkar, settings.adhkarBrief), {}, {}),
      evening: remainingMinutes(briefAdhkar(eveningAdhkar, settings.adhkarBrief), {}, {}),
      sleep: remainingMinutes(sleepAdhkar, {}, {}),
      after,
    },
    nearBadges: near,
    combos,
    muted: useAttentionStore.getState().muted,
    kahfRead: (m.days[today] ?? []).some((p) => p >= KAHF_PAGES[0] && p <= KAHF_PAGES[1]),
  };
}

function currentInput(now = new Date()): SmartPlanInput {
  const st = useNotificationStore.getState();
  const qiyamCfg = st.getConfig('qiyam');
  return {
    companion: companionInput(now),
    qiyamEnabled: qiyamCfg.enabled,
    qiyamSound: qiyamCfg.soundKey,
    snap: collectSnapshot(),
    now,
    prefs: getSmartPrefs(),
    celebrated: st.smartCelebrated ?? {},
    seeded: !!st.smartSeeded,
    pagesByDay: wirdPagesByDay(),
    nightWindow,
  };
}

/** What would be armed right now — for the settings screen's «القادم» preview. No side effects. */
export function previewSmartNotifications(): SmartNotification[] {
  return planSmartNotifications(currentInput()).notifications.sort((a, b) => a.at.getTime() - b.at.getTime());
}

let chain: Promise<void> = Promise.resolve();

/** Re-plan and (re)arm every smart notification. Safe to call often; runs serially. */
export function rescheduleSmartNotifications(): Promise<void> {
  chain = chain.then(run, run);
  return chain;
}

async function run(): Promise<void> {
  if (!notificationService.isAvailable()) return;
  try {
    const st = useNotificationStore.getState();
    const plan = planSmartNotifications(currentInput());
    if (!st.smartSeeded || Object.keys(plan.celebrated).length > 0) st.markSmartCelebrated(plan.celebrated);

    const qiyamCustom = st.getConfig('qiyam').customChannelId;
    for (const n of plan.notifications) {
      await notificationService.scheduleNotification({
        id: n.id,
        title: n.title,
        body: n.body,
        triggerTime: n.at.toISOString(),
        repeatInterval: 'none',
        moduleId: n.moduleId,
        deepLinkPath: n.deepLinkPath,
        soundKey: n.soundKey,
        customChannelId: n.kind === 'qiyam' ? qiyamCustom : undefined,
        meta: n.meta,
      });
    }
    // Retract only ARMED smart ids that are no longer planned — cancelling a
    // delivered one would also yank it off the screen.
    await notificationService.cancelByPrefix?.('myzikr_smart_', new Set(plan.notifications.map((n) => n.id)));
  } catch (e) {
    console.warn('[smartNotifications] reschedule failed', e);
  }
}

/** Subscribe to one slice of a zustand store; `onChange` fires only when it changes (by reference). */
export function watchSlice<S, T>(
  store: { getState: () => S; subscribe: (l: (s: S) => void) => () => void },
  pick: (s: S) => T,
  onChange: () => void,
): () => void {
  let prev = pick(store.getState());
  return store.subscribe((s) => {
    const next = pick(s);
    if (next === prev) return;
    prev = next;
    onChange();
  });
}

let started = false;

function reFixed(): void {
  const n = useNotificationStore.getState();
  for (const id of ['dhikr.morning', 'dhikr.evening', 'quran']) {
    n.cancelModule(id);
    n.scheduleModule(id);
  }
}

function reQiyam(): void {
  const n = useNotificationStore.getState();
  n.cancelModule('qiyam');
  n.scheduleModule('qiyam');
}

/**
 * Keep smart notifications in step with the data: re-plan (debounced) when
 * worship is logged, prefs or location change, and on app resume. Call once
 * at boot; returns an unsubscribe.
 */
export function startSmartNotificationSync(debounceMs = 1500): () => void {
  if (started) return () => undefined;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rescheduleSmartNotifications(), debounceMs);
  };
  const watch = <S, T>(store: Parameters<typeof watchSlice<S, T>>[0], pick: (s: S) => T) => watchSlice(store, pick, kick);
  const unsubs = [
    watch(useProgressStore, (s) => s.dailyProgress),
    watch(useQiyamStore, (s) => s.nights),
    watch(usePrayerLogStore, (s) => s.log),
    watch(useQuranStore, (s) => s.wirdHistory),
    // A مصحفي pull can move a khatma without changing the wird total.
    watch(useMushafiStore, (s) => s.syncedAt),
    watch(useNotificationStore, (s) => s.smart),
    watch(useNotificationStore, (s) => s.configs),
    watch(useActivityLogStore, (s) => s.events),
    watch(useTargetsStore, (s) => s.targets),
    watch(useAttentionStore, (s) => s.muted),
    watch(usePrayerLogStore, (s) => s.duha),
    watch(useSettingsStore, (s) => s.coords),
    // The fixed adhkar / Quran reminders yield to the companion (and return
    // when it is switched off or the location is cleared).
    watchSlice(
      useNotificationStore,
      (s) => `${s.smart?.adhkarNudges !== false}|${s.smart?.wirdNudges !== false}`,
      reFixed,
    ),
    watchSlice(useSettingsStore, (s) => !!s.coords, reFixed),
    // The fixed 23:00 qiyam reminder yields to the smart one (and returns when
    // it's switched off or the location is cleared) — see fixedQiyamSuperseded.
    watchSlice(useNotificationStore, (s) => `${s.smart?.qiyam !== false}|${s.configs.qiyam?.enabled ?? true}`, reQiyam),
    watchSlice(useSettingsStore, (s) => !!s.coords, reQiyam),
  ];
  if (Capacitor.isNativePlatform()) {
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) kick();
    });
    unsubs.push(() => void handle.then((h) => h.remove()));
  }
  void rescheduleSmartNotifications();
  return () => {
    unsubs.forEach((u) => u());
    if (timer) clearTimeout(timer);
    started = false;
  };
}
