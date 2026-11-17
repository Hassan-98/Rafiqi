import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { format } from 'date-fns';
import { prayerTimeService } from './PrayerTimeService';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import { qiyamNightKey, useQiyamStore } from '@/store/qiyamStore';
import { computeNightWindow } from '@/components/qiyam/nightWindow';
import { useQuranStore } from '@/store/quranStore';
import { featuredKhatma, khatmaNextPage, khatmaPct } from '@/store/khatmaModel';
import { useTargetsStore } from '@/store/targetsStore';
import { freshSession, useDhikrSessionStore } from '@/store/dhikrSessionStore';
import { morningAdhkar, eveningAdhkar, postPrayerAdhkar, briefAdhkar } from '@/data/adhkar';
import { SLEEP_ADHKAR } from '@/components/adhkar/adhkarSets';
import {
  calendarDay,
  gregorianLabel,
  HIJRI_MONTHS_AR,
  upcomingEvents,
  useCalendarPrefs,
  weekdayLabel,
} from '@/services/calendarEvents';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import type { DhikrItem, WirdUnit } from '@/types';
import { App as CapacitorApp } from '@capacitor/app';
import {
  compareTasks,
  dayKey,
  hiddenFromWidget,
  isDoneOn,
  nextStudyOverall,
  PLATFORM_LABEL,
  subtaskDone,
  taskCounts,
  type Platform,
  type TaskPriority,
} from '@/store/studyModel';
import type { PrayerName, PrayerTimesResult } from '@/types';

/**
 * Widget bridge — writes a compact JSON snapshot of the app's live state to
 * Capacitor Preferences (SharedPreferences file "CapacitorStorage", key
 * "widget_snapshot"). The native Android home-screen widgets read this exact
 * key to render next-prayer / prayer-times / daily-progress / tasbeeh.
 *
 * The web side can't push a refresh to the widget host, so we just keep the
 * snapshot fresh (on store changes + a 60s tick + on background). The native
 * side re-reads it on its own update cadence, on app pause, and on tap.
 *
 * ── «العلم والمهام» fields (additive) ──────────────────────────────────────
 *  tasksToday: [{ id, title, done, time?: 'HH:mm', priority: 'low'|'normal'|'high', recurring }]
 *              (legacy key name) the persistent «مهامي» list — EVERY task, open
 *              first, then by due day / time; max 50. Nothing is day-filtered:
 *              a done one-off stays done until cleared; `recurring` tasks' `done`
 *              is their current occurrence, so a stale snapshot shows them open.
 *              Tasks with steps add steps: [{ id, title, done }] (3 in a row, in
 *              order, starting at the first open one; `done` per current occurrence
 *              like the task's) + stepsDone / stepsTotal over ALL the task's steps.
 *              One-offs done more than 24h ago are left out (hiddenFromWidget); a done
 *              one-off carries doneAt (epoch ms) so the native side drops it on time
 *              even when the snapshot is stale.
 *  tasksDone / tasksTotal: counts over the WHOLE (widget-visible) list (not just the 50).
 *  nextStudy:  { circleId, title, platform, at: epoch ms, link?, live } | null
 *              the session in progress (live=true) or the soonest upcoming one.
 *              + platformLabel (Arabic, e.g. 'تيليجرام').
 *  qiyamTonight: { night: 'yyyy-MM-dd' (qiyamNightKey), done, lastThirdAt, fajrAt } | null
 *              (times null without a location).
 *  Deep links for taps: '/#/study?tab=tasks&task=ID', '/#/study/circle/ID'.
 *
 * ── Section widgets (additive) ──────────────────────────────────────────────
 *  calendar: { days: [{ key: 'yyyy-MM-dd', day, month (Arabic name), year, events: string[] }]
 *              for today + the next 6 days (a stale snapshot still dates right for a
 *              week), next: { title, key } | null } — the app's hijriOffset applied.
 *  quran:    { khatma: { name, pct, read, nextPage } | null,
 *              wird: { amount, achieved, unit: Arabic plural } | null }
 *  adhkar:   { key: 'yyyy-MM-dd', sets: { morning|evening|postPrayer|sleep: { done, total } } }
 *  awrad:    { active, done, top: [{ title, current, total }] (≤ 3, unfinished first) }
 *
 * ── Look (additive) ────────────────────────────────────────────────────────
 *  timeFormat: '12h' | '24h' — the app setting; times above stay raw 'HH:mm'
 *              (the widgets compute with them) and are formatted natively.
 *  theme:      the active palette + light/dark as opaque '#RRGGBB' (read from
 *              the CSS tokens), so the widgets are the app's own cards:
 *              { dark, card, text, muted, accent, onAccent, gold, heroFrom,
 *                heroTo, chip, ring, track } — chip/ring/track are
 *              pre-blended over the card (widgets tint with opaque colours).
 *              + raw tokens for the Home-card replicas (native CardPainter):
 *              { rem (root font px, 15 = «عادي»), page (cream / dark-bg), secondary,
 *                goldLight, goldDark, creamSoft, darkSurface }.
 *
 * ── Home-card widgets (additive) ───────────────────────────────────────────
 *  The calendar / next-prayer / prayer-times widgets repaint Home's
 *  CalendarTodayCard and PrayerHero natively, so they carry what those cards show:
 *  calendar.days[i] += { weekday: 'الإثنين', greg: '٢٨ سبتمبر ٢٠٢٦ م',
 *              chips: [{ title, type: 'occasion'|'season'|'fasting'|'friday' }] (≤ 3, card
 *              order), suggestion: the lead occasion's suggestion | null }
 *  calendar.upcoming: [{ title, key }] — the next 3 occasions after today
 *              (upcoming[0] = next), so the card stays right for days with the app closed.
 *  prayerDays: [{ key: 'yyyy-MM-dd', times: [fajr, dhuhr, asr, maghrib, isha] (epoch ms) }]
 *              today + the next 6 days (empty without a location) — the widgets roll the
 *              next prayer / due circles / midnight over by themselves for a week.
 *  prayerLog:  { key: 'yyyy-MM-dd' (today), fard: PrayerName[], adhkar: PrayerName[],
 *              excused: boolean, male: boolean } — the fard logged today, the prayers
 *              followed by their أذكار, an excused day (women), and «الجمعة» for men.
 *
 * ── Pending widget actions (native → JS) ───────────────────────────────────
 *  Native widgets append to Preferences key 'widget_pending_actions' a JSON
 *  array of actions, e.g.
 *    [{ "type": "task.toggle", "id": "<taskId>", "at": 1759000000000,
 *       "done": true, "date": "2026-09-27" }]
 *  `done` (recommended) makes it an idempotent set; without it the task flips.
 *  `date` ('yyyy-MM-dd') picks the occurrence of a recurring task — default is
 *  the day of `at`, else today. The app applies the queue on start and every
 *  resume, then removes exactly what it applied (actions appended meanwhile
 *  survive) and rewrites the snapshot. Unknown types are dropped.
 *    { "type": "task.step.toggle", "id": "<taskId>", "stepId": "<stepId>",
 *      "at": …, "done": true, "date": "2026-09-27" }
 *  ticks one step (subtask) the same way — `done` / `date` as above, the step's
 *  state kept per occurrence for a recurring task. The native widget overlays
 *  both types on the snapshot until the app drains them.
 *    { "type": "prayer.toggle", "id": "fajr"|"dhuhr"|"asr"|"maghrib"|"isha",
 *      "at": …, "done": true, "date": "2026-09-28" }
 *  logs / unlogs that day's fard prayer exactly like tapping it on Home's prayer
 *  card (the prayer-times widget queues it; `done` is required).
 *    { "type": "prayer.adhkar.toggle", "id": "fajr"|…|"isha", "at": …, "done": true,
 *      "date": "2026-11-08" }
 *  marks / unmarks that prayer's أذكار ما بعد الصلاة (the «صلوات اليوم» widget;
 *  `done` required). Marking them also logs the fard, as in the app.
 */

const SNAPSHOT_KEY = 'widget_snapshot';

const PRAYER_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};
const ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const MODULE_LABELS = 7; // prayers, dhikr, quran, qiyam, fasting, duaa, habits

interface WidgetPrayer {
  name: string;
  time: string; // HH:mm
  ms: number;
  current: boolean; // the next upcoming prayer
  passed: boolean;
}

interface WidgetSnapshot {
  updatedAt: number;
  location: string;
  nextPrayer: { name: string; time: string; atMs: number } | null;
  prayers: WidgetPrayer[];
  progress: { rate: number; completed: number; total: number };
  tasbeeh: { name: string; count: number; target: number };
  tasksToday: {
    id: string;
    title: string;
    done: boolean;
    time?: string;
    priority: TaskPriority;
    recurring: boolean;
    /** Done one-offs: when (epoch ms) — the widget hides it 24h later. */
    doneAt?: number;
    steps?: { id: string; title: string; done: boolean }[];
    stepsDone?: number;
    stepsTotal?: number;
  }[];
  tasksDone: number;
  tasksTotal: number;
  nextStudy: {
    circleId: string;
    title: string;
    platform: Platform;
    platformLabel: string;
    at: number;
    link?: string;
    live: boolean;
  } | null;
  qiyamTonight: { night: string; done: boolean; lastThirdAt: number | null; fajrAt: number | null };
  timeFormat: '12h' | '24h';
  theme: WidgetTheme | null;
  calendar: {
    days: {
      key: string;
      day: number;
      month: string;
      year: number;
      events: string[];
      weekday: string;
      greg: string;
      chips: { title: string; type: string }[];
      suggestion: string | null;
    }[];
    next: { title: string; key: string } | null;
    upcoming: { title: string; key: string }[];
    /** The user's Hijri sighting offset (days), for the widget's native fallback. */
    offset: number;
  };
  prayerDays: { key: string; times: number[] }[];
  prayerLog: { key: string; fard: PrayerName[]; adhkar: PrayerName[]; excused: boolean; male: boolean };
  quran: {
    khatma: { name: string; pct: number; read: number; nextPage: number } | null;
    wird: { amount: number; achieved: number; unit: string } | null;
  };
  adhkar: { key: string; sets: Record<AdhkarSet, { done: number; total: number }> };
  awrad: { active: number; done: number; top: { title: string; current: number; total: number }[] };
}

type AdhkarSet = 'morning' | 'evening' | 'postPrayer' | 'sleep';
const ADHKAR_SETS: Record<AdhkarSet, DhikrItem[]> = {
  morning: morningAdhkar,
  evening: eveningAdhkar,
  postPrayer: postPrayerAdhkar,
  sleep: SLEEP_ADHKAR,
};
const WIRD_UNIT_AR: Record<WirdUnit, string> = { page: 'صفحات', ayat: 'آيات', juz: 'أجزاء', hizb: 'أحزاب', surah: 'سور' };
/** Religious event types worth a widget line (same set as Home's calendar card). */
const CALENDAR_SHOW = new Set(['occasion', 'season', 'fasting', 'friday']);

/** A week of dates from today (noon), so a stale snapshot keeps the widgets right for days. */
const WEEK = [0, 1, 2, 3, 4, 5, 6];

/** A week of Hijri dates / occasions, and the next occasions (the calendar widgets). */
function buildCalendar(): WidgetSnapshot['calendar'] {
  const offset = useCalendarPrefs.getState().hijriOffset;
  const now = new Date();
  const days = WEEK.map((add) => {
    const d = calendarDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 12), offset);
    const shown = d.events.filter((e) => CALENDAR_SHOW.has(e.type));
    const lead = shown.find((e) => e.major);
    return {
      key: d.key,
      day: d.hijri.day,
      month: HIJRI_MONTHS_AR[d.hijri.month - 1] ?? '',
      year: d.hijri.year,
      events: (lead ? [lead, ...shown.filter((e) => e !== lead)] : shown).slice(0, 2).map((e) => e.title),
      // Exactly what CalendarTodayCard renders for that day.
      weekday: weekdayLabel(d.date),
      greg: gregorianLabel(d.date),
      chips: shown.slice(0, 3).map((e) => ({ title: e.title, type: e.type })),
      suggestion: (lead ?? shown[0])?.suggestion ?? null,
    };
  });
  const upcoming = upcomingEvents(now, 6, 400, offset)
    .filter((u) => u.daysUntil > 0)
    .slice(0, 3)
    .map((u) => ({ title: u.event.title, key: u.day.key }));
  // `offset` lets the widget compute the Hijri date natively when this snapshot is stale.
  return { days, next: upcoming[0] ?? null, upcoming, offset };
}

/** A week of prayer times, and today's logged fard (the prayer-card widgets). */
function buildPrayerCard(): Pick<WidgetSnapshot, 'prayerDays' | 'prayerLog'> {
  const s = useSettingsStore.getState();
  const now = new Date();
  const key = dayKey(now.getTime());
  const pl = usePrayerLogStore.getState();
  const day = pl.log[key];
  const coords = s.coords;
  return {
    prayerDays: coords
      ? WEEK.map((add) => {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 12);
          const t = prayerTimeService.getTimes(coords, d, s.prayerMethod, s.madhabSchool);
          return { key: format(d, 'yyyy-MM-dd'), times: ORDER.map((p) => t[p].getTime()) };
        })
      : [],
    prayerLog: {
      key,
      fard: ORDER.filter((p) => !!day?.[p]?.fard),
      adhkar: ORDER.filter((p) => !!day?.[p]?.adhkar),
      excused: !!pl.excused[key],
      male: s.gender === 'male',
    },
  };
}

/** The khatma the Quran screen features + today's wird (the Quran widget). */
function buildQuran(): WidgetSnapshot['quran'] {
  const q = useQuranStore.getState();
  const k = featuredKhatma(q.khatmas ?? [], q.activeKhatmaId ?? null);
  const today = dayKey(Date.now());
  return {
    khatma: k ? { name: k.name, pct: khatmaPct(k), read: k.read, nextPage: khatmaNextPage(k) } : null,
    wird: q.wird
      ? { amount: q.wird.amount, achieved: q.wirdHistory?.[today]?.achieved ?? 0, unit: WIRD_UNIT_AR[q.wird.unit] ?? '' }
      : null,
  };
}

/** Per-set adhkar progress today — same rule as Home (counted or skipped = done). */
function buildAdhkar(): WidgetSnapshot['adhkar'] {
  const sessions = useDhikrSessionStore.getState().sessions;
  const brief = useSettingsStore.getState().adhkarBrief;
  const sets = {} as WidgetSnapshot['adhkar']['sets'];
  for (const id of Object.keys(ADHKAR_SETS) as AdhkarSet[]) {
    const items = briefAdhkar(ADHKAR_SETS[id], brief && (id === 'morning' || id === 'evening'));
    const s = freshSession(sessions[id]);
    sets[id] = {
      total: items.length,
      done: items.filter((it) => (s.counts[it.id] ?? 0) >= it.count || s.skipped[it.id]).length,
    };
  }
  return { key: dayKey(Date.now()), sets };
}

/** Active أوراد, unfinished first (same as Home's awrad card). */
function buildAwrad(): WidgetSnapshot['awrad'] {
  const active = useTargetsStore.getState().targets.filter((t) => !t.completedAt);
  const isDone = (t: { current: number; total: number }) => t.current >= t.total;
  const top = [...active.filter((t) => !isDone(t)), ...active.filter(isDone)]
    .slice(0, 3)
    .map((t) => ({ title: t.title, current: Math.min(t.current, t.total), total: t.total }));
  return { active: active.length, done: active.filter(isDone).length, top };
}

interface WidgetTheme {
  dark: boolean;
  card: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  gold: string;
  heroFrom: string;
  heroTo: string;
  chip: string;
  ring: string;
  track: string;
  rem: number;
  page: string;
  secondary: string;
  goldLight: string;
  goldDark: string;
  creamSoft: string;
  darkSurface: string;
}

type RGB = [number, number, number];

function parseColor(value: string): RGB | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)?.[1];
  if (rgb) {
    const [r, g, b] = rgb.split(/[\s,/]+/).map(Number);
    if ([r, g, b].every(Number.isFinite)) return [r, g, b];
  }
  return null;
}

const toHex = (c: RGB) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
/** `top` at opacity `a` over `base`, as an opaque colour. */
const mix = (top: RGB, base: RGB, a: number): RGB => top.map((x, i) => x * a + base[i] * (1 - a)) as RGB;

/** The active palette + mode, read from the same CSS tokens the app's cards use. */
function buildTheme(): WidgetTheme | null {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const token = (name: string, fallback: string): RGB => parseColor(css.getPropertyValue(name)) ?? parseColor(fallback)!;
  const dark = root.classList.contains('dark');
  const card: RGB = dark ? token('--color-dark-card', '#132520') : [255, 255, 255];
  const text = dark ? token('--color-text-on-dark', '#eaf2ef') : token('--color-text-primary', '#13201c');
  const accent = token('--color-teal', '#11725c');
  const gold = token('--color-gold', '#b8923f');
  const onAccent = token('--color-on-accent', '#ffffff');
  const heroFrom = token('--color-teal-dark', '#0c463c');
  return {
    dark,
    card: toHex(card),
    text: toHex(text),
    muted: toHex(token('--color-text-muted', '#7c8f89')),
    accent: toHex(accent),
    onAccent: toHex(onAccent),
    gold: toHex(gold),
    heroFrom: toHex(heroFrom),
    heroTo: toHex(token('--color-teal-light', '#1a7a62')),
    chip: toHex(mix(accent, card, dark ? 0.16 : 0.1)),
    ring: toHex(mix(text, card, dark ? 0.1 : 0.07)),
    track: toHex(mix(gold, card, dark ? 0.22 : 0.26)),
    rem: parseFloat(css.fontSize) || 15,
    page: toHex(dark ? token('--color-dark-bg', '#08120f') : token('--color-cream', '#f4f0e6')),
    secondary: toHex(token('--color-text-secondary', '#455d56')),
    goldLight: toHex(token('--color-gold-light', '#d8ba72')),
    goldDark: toHex(token('--color-gold-dark', '#8a6a24')),
    creamSoft: toHex(token('--color-cream-soft', '#faf7f0')),
    darkSurface: toHex(token('--color-dark-surface', '#0e1c18')),
  };
}

/** The persistent task list (open first, then by due) + the next study session. */
function buildStudy(): Pick<WidgetSnapshot, 'tasksToday' | 'tasksDone' | 'tasksTotal' | 'nextStudy'> {
  const now = Date.now();
  const key = dayKey(now);
  // A one-off done over a day ago leaves the widgets (the app keeps it until cleared).
  const tasks = useTasksStore.getState().tasks.filter((t) => !hiddenFromWidget(t, now));
  const list = [...tasks]
    .sort((a, b) => compareTasks(a, b, key))
    .slice(0, 50)
    .map((t) => {
      const row = {
        id: t.id,
        title: t.title,
        done: isDoneOn(t, key),
        time: t.time,
        priority: t.priority,
        recurring: t.repeat !== 'none',
        // Lets the widget drop it a day after completion even from a stale snapshot.
        doneAt: t.repeat === 'none' && t.done ? t.doneAt ?? t.createdAt : undefined,
      };
      if (!t.subtasks.length) return row;
      const steps = t.subtasks.map((s) => ({ id: s.id, title: s.title, done: subtaskDone(t, s, key) }));
      // The widget row has 3 step slots (+ a «+n» line). The window moves only when the app
      // rewrites the snapshot — never under a finger ticking pending (overlaid) steps.
      const from = Math.max(0, Math.min(steps.findIndex((s) => !s.done), steps.length - 3));
      return { ...row, steps: steps.slice(from, from + 3), stepsDone: steps.filter((s) => s.done).length, stepsTotal: steps.length };
    });
  const counts = taskCounts(tasks, now);
  const next = nextStudyOverall(useStudyStore.getState().circles, now);
  return {
    tasksToday: list,
    tasksDone: counts.done,
    tasksTotal: counts.total,
    nextStudy: next
      ? {
          circleId: next.circle.id,
          title: next.circle.title,
          platform: next.circle.platform,
          platformLabel: PLATFORM_LABEL[next.circle.platform] ?? '',
          at: next.session.at,
          link: next.circle.link,
          live: next.session.live,
        }
      : null,
  };
}

/** Tonight's قيام: logged yet + the last-third / Fajr times. */
function buildQiyam(): WidgetSnapshot['qiyamTonight'] {
  const s = useSettingsStore.getState();
  const night = qiyamNightKey(new Date());
  const w = computeNightWindow(s.coords, s.prayerMethod, s.madhabSchool, night);
  return {
    night,
    done: !!useQiyamStore.getState().nights[night],
    lastThirdAt: w?.lastThird.getTime() ?? null,
    fajrAt: w?.fajr.getTime() ?? null,
  };
}

function hhmm(d: Date): string {
  return format(d, 'HH:mm');
}

/** Build the next-24h prayer list + the next upcoming prayer. */
function buildPrayers(): { list: WidgetPrayer[]; next: { name: string; time: string; atMs: number } | null } {
  const s = useSettingsStore.getState();
  if (!s.coords) return { list: [], next: null };

  const now = Date.now();
  const today: PrayerTimesResult = prayerTimeService.getTimes(s.coords, new Date(), s.prayerMethod, s.madhabSchool);
  const tomorrow: PrayerTimesResult = prayerTimeService.getTimes(
    s.coords,
    new Date(now + 24 * 60 * 60 * 1000),
    s.prayerMethod,
    s.madhabSchool,
  );

  // The "next" prayer can be tomorrow's fajr once today's isha has passed.
  let next: { name: string; time: string; atMs: number } | null = null;
  for (const p of ORDER) {
    const t = today[p];
    if (t && t.getTime() > now) {
      next = { name: PRAYER_AR[p], time: hhmm(t), atMs: t.getTime() };
      break;
    }
  }
  if (!next) {
    const t = tomorrow.fajr;
    next = { name: PRAYER_AR.fajr, time: hhmm(t), atMs: t.getTime() };
  }

  const list: WidgetPrayer[] = ORDER.map((p) => {
    const t = today[p];
    return {
      name: PRAYER_AR[p],
      time: t ? hhmm(t) : '--:--',
      ms: t ? t.getTime() : 0,
      current: !!next && next.name === PRAYER_AR[p] && next.atMs === t?.getTime(),
      passed: !!t && t.getTime() <= now,
    };
  });

  return { list, next };
}

/** Exported for checks (scripts / dev console); the app only writes it via updateWidgets. */
export function buildSnapshot(): WidgetSnapshot {
  const settings = useSettingsStore.getState();
  const { list, next } = buildPrayers();

  // Daily progress over the enabled worship modules.
  const today = useProgressStore.getState().getTodayProgress();
  const completed = today?.modules.filter((m) => m.completed).length ?? 0;
  const total = Math.max(MODULE_LABELS, today?.modules.length ?? 0);
  const rate = today?.overallRate ?? 0;

  // Active tasbeeh counter (name + target) for the tasbeeh widget label.
  const tasbih = useTasbihStore.getState();
  const active = tasbih.counters.find((c) => c.id === tasbih.activeId) ?? tasbih.counters[0];

  return {
    updatedAt: Date.now(),
    location: [settings.city, settings.country].filter(Boolean).join('، '),
    nextPrayer: next,
    prayers: list,
    progress: { rate, completed, total },
    tasbeeh: { name: active?.name ?? 'سبحان الله', count: active?.sessionCount ?? 0, target: active?.target ?? 33 },
    ...buildStudy(),
    qiyamTonight: buildQiyam(),
    timeFormat: settings.timeFormat,
    theme: buildTheme(),
    calendar: buildCalendar(),
    ...buildPrayerCard(),
    quran: buildQuran(),
    adhkar: buildAdhkar(),
    awrad: buildAwrad(),
  };
}

let lastWrite = 0;
let pending = false;

async function writeSnapshot(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const snap = buildSnapshot();
    await Preferences.set({ key: SNAPSHOT_KEY, value: JSON.stringify(snap) });
    lastWrite = Date.now();
  } catch (e) {
    console.warn('[widgetBridge] write failed', e);
  }
}

/** Debounced public update — safe to call on every store change. */
export function updateWidgets(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (pending) return;
  pending = true;
  // Coalesce bursts of store updates into a single write on the next tick.
  setTimeout(() => {
    pending = false;
    void writeSnapshot();
  }, 250);
}

let started = false;

/** Wire the bridge: initial write, store subscriptions, and a 60s refresh. */
export function startWidgetBridge(): void {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;

  void writeSnapshot();

  // Refresh when worship progress, tasbeeh, or prayer settings change.
  useProgressStore.subscribe(() => updateWidgets());
  useTasbihStore.subscribe(() => updateWidgets());
  useSettingsStore.subscribe(() => updateWidgets());
  useTasksStore.subscribe(() => updateWidgets());
  useStudyStore.subscribe(() => updateWidgets());
  useQiyamStore.subscribe(() => updateWidgets());
  useQuranStore.subscribe(() => updateWidgets());
  useTargetsStore.subscribe(() => updateWidgets());
  useDhikrSessionStore.subscribe(() => updateWidgets());
  useCalendarPrefs.subscribe(() => updateWidgets());
  usePrayerLogStore.subscribe(() => updateWidgets());

  // Apply taps the native widgets queued while we were closed/backgrounded.
  void applyPendingWidgetActions();
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void applyPendingWidgetActions();
  });

  // Keep "next prayer" / "current" fresh as time passes. 60s is plenty since
  // the native countdown ticks on its own between writes.
  setInterval(() => {
    // Avoid redundant writes if something just wrote in the last ~5s.
    if (Date.now() - lastWrite > 5000) void writeSnapshot();
  }, 60 * 1000);
}

const ACTIONS_KEY = 'widget_pending_actions';

interface WidgetAction {
  type: string;
  id?: string;
  stepId?: string;
  at?: number;
  done?: boolean;
  date?: string;
}

/** Apply one queued widget action to the tasks store (protocol at the top). Malformed / unknown → ignored. */
export function applyWidgetAction(a: WidgetAction | null): void {
  if (typeof a?.id !== 'string') return;
  const key =
    typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : dayKey(typeof a.at === 'number' ? a.at : Date.now());
  const done = typeof a.done === 'boolean' ? a.done : undefined;
  const tasks = useTasksStore.getState();
  if (a.type === 'task.toggle') {
    if (done === undefined) tasks.toggleTask(a.id, key);
    else tasks.setTaskDone(a.id, done, key);
  } else if (a.type === 'task.step.toggle' && typeof a.stepId === 'string') {
    if (done === undefined) tasks.toggleSubtask(a.id, a.stepId, key);
    else tasks.setSubtaskDone(a.id, a.stepId, done, key);
  } else if ((a.type === 'prayer.toggle' || a.type === 'prayer.adhkar.toggle') && done !== undefined && (ORDER as string[]).includes(a.id)) {
    // The store keeps the day's aggregate record (streaks/badges) in step; adhkar ⇒ fard there too.
    usePrayerLogStore.getState().setPrayer(key, a.id as PrayerName, a.type === 'prayer.toggle' ? 'fard' : 'adhkar', done);
  }
}

/**
 * Drain the native → JS action queue (see protocol at the top). Removes only
 * the entries it applied, so an action the widget appends mid-drain survives.
 */
export async function applyPendingWidgetActions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { value } = await Preferences.get({ key: ACTIONS_KEY });
    if (!value) return;
    let actions: WidgetAction[] = [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) actions = parsed as WidgetAction[];
    } catch {
      /* corrupt → cleared below */
    }
    for (const a of actions) applyWidgetAction(a);
    // ponytail: Preferences has no compare-and-swap; re-read + subtract is the best available.
    const { value: after } = await Preferences.get({ key: ACTIONS_KEY });
    if (after === value || !after) {
      await Preferences.remove({ key: ACTIONS_KEY });
    } else {
      try {
        const rest = (JSON.parse(after) as unknown[]).slice(actions.length);
        if (rest.length) await Preferences.set({ key: ACTIONS_KEY, value: JSON.stringify(rest) });
        else await Preferences.remove({ key: ACTIONS_KEY });
      } catch {
        await Preferences.remove({ key: ACTIONS_KEY });
      }
    }
    updateWidgets();
  } catch (e) {
    console.warn('[widgetBridge] pending actions failed', e);
  }
}
