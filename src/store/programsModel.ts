/**
 * «برامج التدرّج» — PURE engine: a run's schedule, the step of each day,
 * verification against the worship stores, grace (strict / forgiving),
 * pauses, milestones, leaderboard points, Home attention items and the
 * reminder plan. No store state is read here: everything comes in as
 * `ProgramSources` (the same field names as the badge snapshot, so
 * leaderboardScore can pass its input straight through).
 * Checked by scripts/programs.test.ts.
 *
 * A run is re-evaluated from its start day every time — nothing derived is
 * trusted from storage except the `seen` stamps (a closed day's verified
 * amount, written by the store so pruned/other-device logs can't undo a day).
 * Day math is local y/m/d (shiftKey), never `+ 86_400_000`.
 */
import { duhaRakaatOf, rawatibOn, PRAYERS_ORDER, type DuhaEntry, type PrayerDayLog } from '@/store/prayerLogStore';
import { atTime, dayKey, parseKey, shiftKey } from '@/store/studyModel';
import {
  COMPLETION_DUAS,
  WEEKDAY_NAME,
  daysAr,
  pagesAr,
  prayersAr,
  rakaatAr,
  rep,
  templateById,
  timesAr,
  type Curve,
  type Grace,
  type ProgramTemplate,
  type ProgramUnit,
  type ReminderSpec,
  type StepCtx,
  type VerifyKind,
} from '@/data/programsCatalog';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import type { PrayerName } from '@/types';
import type { AttentionIcon, AttentionItem, DayTimes } from '@/services/dayAttention';

// ── persisted shapes ─────────────────────────────────────────────────────────

export interface DayCheck {
  /** Confirmed by hand («تمّ», «سلمتُ اليوم», «أكّدتُها»). */
  ok?: boolean;
  /** A hand count (istighfar: added on top of the linked tasbih). */
  amount?: number;
  /** Ticked items: the prayers whose takbeer was caught, or adhkar sets read from a book. */
  items?: string[];
  /** Prayers whose «في المسجد» flag the takbeer program set (undone with the tick). */
  wrote?: string[];
  /** A closed day's verified amount from the sources (monotonic stamp). */
  seen?: number;
  /** «زللتُ اليوم» (ترك عادة): today closes as missed now. */
  slip?: boolean;
}

export type CustomUnit = 'count' | 'rakaat' | 'pages' | 'check';

export interface CustomSpec {
  title: string;
  days: number;
  unit: CustomUnit;
  start: number;
  end: number;
  curve: Curve;
  /** Pages: verify from مصحفي. */
  autoQuran?: boolean;
}

export interface ProgramRun {
  id: string;
  templateId?: string;
  custom?: CustomSpec;
  /** «ترك عادة»: what is being left. */
  name?: string;
  /** Length override (ترك عادة). */
  days?: number;
  /** Day 1 (yyyy-MM-dd). */
  startDay: string;
  grace: Grace;
  status: 'active' | 'done' | 'stopped';
  /** Pause from (inclusive) → to (inclusive), null = still paused. */
  pauses: Record<string, string | null>;
  checks: Record<string, DayCheck>;
  remindersOn: boolean;
  /** Overrides the template's reminders (same order). */
  reminders?: ReminderSpec[];
  /** الاستغفار: the tasbih counter it reads. */
  linkRef?: string;
  createdAt: number;
  finishedOn?: string;
  endedOn?: string;
  celebrated?: boolean;
}

/** What verification reads — a structural subset of the badge snapshot. */
export interface ProgramSources {
  gender?: 'male' | 'female' | null;
  prayerLog: Record<string, PrayerDayLog>;
  excused: Record<string, true>;
  duha: Record<string, DuhaEntry>;
  qiyam: Record<string, { rakaat: number; witr: boolean }>;
  events: { dateKey: string; domain: string; refId?: string; amount: number }[];
  dailyProgress: Record<string, { modules?: { moduleId: string; completed: boolean }[] } | undefined>;
  mushafi?: { days: Record<string, number[]> };
  readingDays?: Record<string, number>;
}

// ── limits & points ──────────────────────────────────────────────────────────

/** Running (active, paused included) programs allowed at once. */
export const MAX_RUNNING = 5;
/** Starting a program while this many already run asks first. */
export const WARN_RUNNING = 2;
/** Leaderboard: modest — the deeds themselves already score. */
export const PROGRAM_POINTS = { checkIn: 2, milestone: 5, finish: 40 } as const;

// ── definitions ──────────────────────────────────────────────────────────────

/** Order the rawatib join the program in (آكدها أولاً). */
export const RAWATIB_ORDER: { prayer: PrayerName; type: 'sunnahBefore' | 'sunnahAfter' }[] = [
  { prayer: 'fajr', type: 'sunnahBefore' },
  { prayer: 'maghrib', type: 'sunnahAfter' },
  { prayer: 'isha', type: 'sunnahAfter' },
  { prayer: 'dhuhr', type: 'sunnahAfter' },
  { prayer: 'dhuhr', type: 'sunnahBefore' },
];

const UNIT_STEP_TEXT: Record<CustomUnit, (n: number) => string> = {
  count: timesAr,
  rakaat: rakaatAr,
  pages: pagesAr,
  check: () => 'تمّ اليوم',
};

/**
 * A custom schedule: `days` targets from `start` to `end`.
 * linear = a little every day · weekly = a step each week · fixed = `start` daily.
 * Rakaat stay in pairs when both ends are even; big counts round to 5/10.
 */
export function buildSteps(curve: Curve, days: number, start: number, end: number, unit: CustomUnit): number[] {
  const n = Math.min(365, Math.max(1, Math.round(days) || 1));
  if (unit === 'check') return rep([1, n]);
  const hi = Math.max(start, end);
  const gran = unit === 'rakaat' && start % 2 === 0 && end % 2 === 0 ? 2 : hi >= 200 ? 10 : hi >= 50 ? 5 : 1;
  const nice = (v: number) => Math.max(gran, Math.round(v / gran) * gran);
  if (curve === 'fixed' || n === 1) return rep([nice(start), n]);
  if (curve === 'weekly') {
    const weeks = Math.ceil(n / 7);
    return Array.from({ length: n }, (_, i) => nice(weeks === 1 ? end : start + ((end - start) * Math.floor(i / 7)) / (weeks - 1)));
  }
  return Array.from({ length: n }, (_, i) => nice(start + ((end - start) * i) / (n - 1)));
}

function customSummary(c: CustomSpec): string {
  if (c.unit === 'check') return daysAr(c.days);
  if (c.curve === 'fixed' || c.start === c.end) return `${UNIT_STEP_TEXT[c.unit](c.start)} كل يوم`;
  return `من ${ar(c.start)} إلى ${UNIT_STEP_TEXT[c.unit](c.end)}`;
}

/** The run's effective definition: its template (length/name applied) or its custom spec. */
export function programDef(run: Pick<ProgramRun, 'templateId' | 'custom' | 'days' | 'name'>): ProgramTemplate {
  const tpl = templateById(run.templateId);
  if (tpl) {
    if (tpl.needsName) {
      const n = Math.max(1, run.days ?? tpl.steps.length);
      return { ...tpl, title: run.name?.trim() ? `ترك ${run.name.trim()}` : tpl.title, steps: rep([1, n]) };
    }
    return tpl;
  }
  const c: CustomSpec = run.custom ?? { title: 'برنامج', days: 30, unit: 'check', start: 1, end: 1, curve: 'fixed' };
  const verify: VerifyKind = c.unit === 'check' ? 'check' : c.unit === 'pages' && c.autoQuran ? 'quran' : 'count';
  return {
    id: 'custom',
    title: c.title.trim() || 'برنامجي',
    short: customSummary(c),
    category: 'nafs',
    icon: 'custom',
    level: 1,
    why: '',
    steps: buildSteps(c.curve, c.days, c.start, c.end, c.unit),
    unit: c.unit,
    verify,
    verifyText:
      verify === 'quran'
        ? 'يتحقّق تلقائياً من صفحات «مصحفي» اليوم، أو تؤكّد قراءتك بنفسك.'
        : verify === 'check'
          ? 'تسجّل بنفسك «تمّ» كل يوم.'
          : 'تسجّل العدد بنفسك كل يوم.',
    grace: 'forgiving',
    stepText: (t) => UNIT_STEP_TEXT[c.unit](t),
    reminders: [{ anchor: 'time', offset: 0, time: '20:00' }],
    remindText: (t) => `خطوتك اليوم في «${c.title.trim() || 'برنامجي'}»: ${UNIT_STEP_TEXT[c.unit](t)}`,
  };
}

/** Kinds whose day can be verified from another store (and so get «تحقّق تلقائياً»). */
export const AUTO_KINDS: ReadonlySet<VerifyKind> = new Set(['mosque', 'onTime', 'rawatib', 'qiyam', 'duha', 'adhkar', 'quran', 'fasting', 'istighfar']);

/** قيام: a night belongs to its evening — before noon the open day is still yesterday. */
export function openDayKey(verify: VerifyKind, now: Date): string {
  return verify === 'qiyam' && now.getHours() < 12 ? shiftKey(dayKey(now), -1) : dayKey(now);
}

export const weekdayOf = (key: string) => parseKey(key).getDay();

export function pausedOn(run: Pick<ProgramRun, 'pauses'>, key: string): boolean {
  for (const [from, to] of Object.entries(run.pauses ?? {})) if (key >= from && (to === null || key <= to)) return true;
  return false;
}

/** The open pause's start, if the run is paused now. */
export function openPause(run: Pick<ProgramRun, 'pauses'>): string | null {
  return Object.entries(run.pauses ?? {}).find(([, to]) => to === null)?.[0] ?? null;
}

/** The rawatib of step k (1–5 slots) on a day — a man's Friday has no قبلية الظهر and four after. */
export function rawatibSlotsOn(key: string, male: boolean, k: number) {
  const avail = rawatibOn(key, male);
  return RAWATIB_ORDER.slice(0, Math.max(1, k)).flatMap((o) => avail.filter((a) => a.prayer === o.prayer && a.type === o.type));
}

export const adhkarSets = (target: number) => (target >= 2 ? ['morning', 'evening'] : ['morning']);
export const ADHKAR_LABEL: Record<string, string> = { morning: 'أذكار الصباح', evening: 'أذكار المساء' };

/** The text of a step on a day («٦ ركعات: سنة الفجر، بعدية المغرب، بعدية العشاء»). */
export function stepTextOn(def: ProgramTemplate, target: number, key: string, male: boolean, name?: string, rawStep?: number): string {
  const ctx: StepCtx = { male, name, weekday: weekdayOf(key) };
  if (def.verify === 'rawatib') ctx.slots = rawatibSlotsOn(key, male, rawStep ?? target);
  return def.stepText(target, ctx);
}

export function tipOf(def: ProgramTemplate, step: number): string | undefined {
  let tip: string | undefined;
  for (const [from, t] of def.tips ?? []) if (step >= from) tip = t;
  return tip;
}

/** Consecutive equal targets → «الأيام ١–٥: ركعتان». 1-based step numbers. */
export function phasesOf(steps: number[]): { from: number; to: number; target: number }[] {
  const out: { from: number; to: number; target: number }[] = [];
  steps.forEach((t, i) => {
    const last = out[out.length - 1];
    if (last && last.target === t) last.to = i + 1;
    else out.push({ from: i + 1, to: i + 1, target: t });
  });
  return out;
}

const ORDINAL = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

export interface Milestone {
  step: number;
  kind: 'week' | 'half' | 'final';
  label: string;
}

/** Week ends (daily programs), the halfway mark and the end. */
export function milestonesOf(def: Pick<ProgramTemplate, 'steps' | 'dueOn'>): Milestone[] {
  const n = def.steps.length;
  const out = new Map<number, Milestone>();
  if (!def.dueOn) {
    for (let w = 7; w < n; w += 7) {
      const i = w / 7;
      out.set(w, { step: w, kind: 'week', label: i <= ORDINAL.length ? `الأسبوع ${ORDINAL[i - 1]}` : `${daysAr(w)}` });
    }
  }
  const half = Math.ceil(n / 2);
  if (half > 1 && half < n) out.set(half, { step: half, kind: 'half', label: 'نصف الطريق' });
  out.set(n, { step: n, kind: 'final', label: 'الختام' });
  return [...out.values()].sort((a, b) => a.step - b.step);
}

// ── sources ──────────────────────────────────────────────────────────────────

interface SourceIndex {
  src: ProgramSources;
  male: boolean;
  /** day → adhkar sets read (activity log refIds). */
  dhikr: Map<string, Set<string>>;
  /** `${day}|${counterId}` → tasbih reps. */
  tasbih: Map<string, number>;
}

const indexCache = new WeakMap<ProgramSources, SourceIndex>();

function indexSources(src: ProgramSources): SourceIndex {
  const hit = indexCache.get(src);
  if (hit) return hit;
  const dhikr = new Map<string, Set<string>>();
  const tasbih = new Map<string, number>();
  for (const e of src.events ?? []) {
    if (e.domain === 'dhikr' && e.refId && e.amount > 0) {
      let s = dhikr.get(e.dateKey);
      if (!s) dhikr.set(e.dateKey, (s = new Set()));
      s.add(e.refId);
    } else if (e.domain === 'tasbih' && e.refId) {
      const k = `${e.dateKey}|${e.refId}`;
      tasbih.set(k, (tasbih.get(k) ?? 0) + e.amount);
    }
  }
  const ix: SourceIndex = { src, male: src.gender === 'male', dhikr, tasbih };
  indexCache.set(src, ix);
  return ix;
}

const countFlag = (day: PrayerDayLog | undefined, flag: 'mosque' | 'onTime') => PRAYERS_ORDER.filter((p) => day?.[p]?.[flag]).length;

export const fastedOn = (src: ProgramSources, key: string) =>
  !!src.dailyProgress[key]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed);

export const quranPagesOn = (src: ProgramSources, key: string) => Math.max(src.mushafi?.days[key]?.length ?? 0, src.readingDays?.[key] ?? 0);

/** qiyam units: rakaat + the witr as one; a night logged before counts were kept = 2. */
export const qiyamUnitsOn = (src: ProgramSources, key: string) => {
  const n = src.qiyam[key];
  return n ? (n.rakaat || 2) + (n.witr ? 1 : 0) : 0;
};

export function targetOn(def: ProgramTemplate, step: number, key: string, male: boolean): number {
  const raw = def.steps[Math.min(step, def.steps.length - 1)];
  return def.verify === 'rawatib' ? rawatibSlotsOn(key, male, raw).length : raw;
}

export interface Measure {
  amount: number;
  /** The part read from the worship stores (stamped as `seen`). */
  autoAmount: number;
  auto: boolean;
}

/** How much of `target` the day holds: the stores, the stamp and the hand entries. */
export function measureDay(def: ProgramTemplate, run: ProgramRun, src: ProgramSources, key: string, step: number, target: number): Measure {
  const ix = indexSources(src);
  const c = run.checks?.[key] ?? {};
  const manualOk = c.ok ? target : 0;
  const seen = c.seen ?? 0;
  let auto = 0;
  let manual = 0;
  switch (def.verify) {
    case 'check':
      manual = c.ok ? 1 : 0;
      break;
    case 'count':
      manual = c.amount ?? 0;
      break;
    case 'takbeer':
      manual = (c.items ?? []).filter((p) => (PRAYERS_ORDER as string[]).includes(p)).length;
      break;
    case 'mosque':
    case 'onTime':
      auto = countFlag(src.prayerLog[key], def.verify);
      break;
    case 'rawatib': {
      const day = src.prayerLog[key];
      auto = rawatibSlotsOn(key, ix.male, def.steps[Math.min(step, def.steps.length - 1)]).filter((s) => day?.[s.prayer]?.[s.type]).length;
      break;
    }
    case 'qiyam':
      auto = qiyamUnitsOn(src, key);
      break;
    case 'duha':
      auto = duhaRakaatOf(src.duha[key]);
      break;
    case 'adhkar': {
      const read = ix.dhikr.get(key);
      const sets = adhkarSets(target);
      auto = sets.filter((s) => read?.has(s)).length;
      manual = sets.filter((s) => read?.has(s) || c.items?.includes(s)).length;
      break;
    }
    case 'quran':
      auto = quranPagesOn(src, key);
      manual = c.amount ?? 0;
      break;
    case 'fasting':
      auto = fastedOn(src, key) ? 1 : 0;
      break;
    case 'istighfar': {
      const a = Math.max(run.linkRef ? (ix.tasbih.get(`${key}|${run.linkRef}`) ?? 0) : 0, seen);
      return { autoAmount: a, amount: Math.max(a + (c.amount ?? 0), manualOk), auto: a >= target };
    }
  }
  const a = Math.max(auto, seen);
  return { autoAmount: a, amount: Math.max(a, manual, manualOk), auto: AUTO_KINDS.has(def.verify) && a >= target };
}

// ── evaluation ───────────────────────────────────────────────────────────────

export type DayState = 'done' | 'missed' | 'pending' | 'rest' | 'paused' | 'excused';

export interface DayEval {
  key: string;
  state: DayState;
  /** The step (0-based) the day aimed at. */
  step: number;
  target: number;
  amount: number;
  auto: boolean;
  /** Strict: this miss restarted the count. */
  reset?: boolean;
  /** A milestone first reached on this day (its step count). */
  milestone?: number;
}

export interface RunEval {
  def: ProgramTemplate;
  total: number;
  /** Steps completed in the current attempt. */
  step: number;
  days: DayEval[];
  /** The day still open for verification (today; for قيام before noon, last night). */
  openKey: string;
  /** The open day's entry (null: not started, or finished on an earlier day). */
  today: DayEval | null;
  started: boolean;
  paused: boolean;
  finishedOn?: string;
  restarts: number;
  lastReset?: string;
  /** Consecutive missed closed days at the end. */
  missStreak: number;
  /** Consecutive done days (rest/paused/excused days neither count nor break). */
  chain: number;
  doneCount: number;
  /** The best step count ever reached (across restarts). */
  best: number;
  /** Next day carrying a step after a rest/paused open day. */
  nextDue?: string;
}

/** Re-walk the run from its first day. */
export function evaluateRun(run: ProgramRun, src: ProgramSources, now: Date = new Date()): RunEval {
  const def = programDef(run);
  const male = src.gender === 'male';
  const total = def.steps.length;
  const openKey = openDayKey(def.verify, now);
  const endKey = run.status === 'stopped' ? run.endedOn : run.status === 'done' ? run.finishedOn : undefined;
  const lastKey = endKey && endKey < openKey ? endKey : openKey;
  const marks = new Set(milestonesOf(def).map((m) => m.step));
  const days: DayEval[] = [];
  let step = 0;
  let best = 0;
  let restarts = 0;
  let missStreak = 0;
  let chain = 0;
  let doneCount = 0;
  let finishedOn: string | undefined;
  let lastReset: string | undefined;

  for (let key = run.startDay, guard = 0; key <= lastKey && guard < 3000; key = shiftKey(key, 1), guard++) {
    const base = { key, step, target: 0, amount: 0, auto: false };
    if (pausedOn(run, key)) {
      days.push({ ...base, state: 'paused' });
      continue;
    }
    if (def.excusable && src.excused?.[key]) {
      days.push({ ...base, state: 'excused' });
      continue;
    }
    if (def.dueOn && !def.dueOn(weekdayOf(key), step)) {
      days.push({ ...base, state: 'rest' });
      continue;
    }
    const target = targetOn(def, step, key, male);
    const m = measureDay(def, run, src, key, step, target);
    const d = { ...base, target, amount: m.amount, auto: m.auto };
    if (m.amount >= target) {
      const reached = step + 1;
      days.push({ ...d, state: 'done', milestone: marks.has(reached) && reached > best ? reached : undefined });
      step = reached;
      best = Math.max(best, step);
      doneCount++;
      chain++;
      missStreak = 0;
      if (step >= total) {
        finishedOn = key;
        break;
      }
    } else if (key === openKey && !run.checks?.[key]?.slip) {
      days.push({ ...d, state: 'pending' });
    } else {
      missStreak++;
      chain = 0;
      const reset = run.grace === 'strict' && step > 0;
      if (reset) {
        restarts++;
        lastReset = key;
        step = 0;
      }
      days.push({ ...d, state: 'missed', reset: reset || undefined });
    }
  }

  // A finished run stays finished even if a source record is later removed.
  if (!finishedOn && run.status === 'done' && run.finishedOn) finishedOn = run.finishedOn;
  const today = days.find((d) => d.key === openKey) ?? null;
  let nextDue: string | undefined;
  if (!finishedOn && run.status === 'active' && (!today || today.state === 'rest' || today.state === 'paused')) {
    for (let i = 1, k = shiftKey(openKey, 1); i <= 21; i++, k = shiftKey(k, 1)) {
      if (k < run.startDay || pausedOn(run, k)) continue;
      if (!def.dueOn || def.dueOn(weekdayOf(k), step)) {
        nextDue = k;
        break;
      }
    }
  }
  const pause = openPause(run);
  return {
    def,
    total,
    step,
    days,
    openKey,
    today,
    started: run.startDay <= openKey,
    paused: !!pause && pause <= openKey,
    finishedOn,
    restarts,
    lastReset,
    missStreak,
    chain,
    doneCount,
    best,
    nextDue,
  };
}

/** The day number to show — «اليوم ١٢ من ٤٠» (today's step, done or not). */
export const dayNumber = (ev: RunEval) => (ev.finishedOn ? ev.total : Math.min(ev.total, (ev.today?.state === 'done' ? ev.today.step : ev.step) + 1));

/** Closed days whose store-verified amount should be stamped (`seen`). */
export function stampsFor(run: ProgramRun, src: ProgramSources, now: Date = new Date()): Record<string, number> {
  const def = programDef(run);
  if (!AUTO_KINDS.has(def.verify)) return {};
  const ev = evaluateRun(run, src, now);
  const out: Record<string, number> = {};
  for (const d of ev.days) {
    if (d.key >= ev.openKey || (d.state !== 'done' && d.state !== 'missed')) continue;
    const m = measureDay(def, run, src, d.key, d.step, d.target);
    if (m.autoAmount > (run.checks?.[d.key]?.seen ?? 0)) out[d.key] = m.autoAmount;
  }
  return out;
}

// ── points ───────────────────────────────────────────────────────────────────

export interface ProgramPointPart {
  id: string;
  label: string;
  points: number;
}

/**
 * «الترتيب»: a verified step day +2, a milestone first reached +5, finishing +40.
 * Qiyam days are night-keyed (the evening), like the leaderboard's qiyam.
 */
export function programPointsOn(
  runs: ProgramRun[],
  key: string,
  src: ProgramSources,
  now: Date = new Date(),
): { total: number; parts: ProgramPointPart[] } {
  const parts: ProgramPointPart[] = [];
  for (const run of runs) {
    if (key < run.startDay) continue;
    const ev = evaluateRun(run, src, now);
    const d = ev.days.find((x) => x.key === key && x.state === 'done');
    if (!d) continue;
    let points: number = PROGRAM_POINTS.checkIn;
    if (d.milestone && d.milestone < ev.total) points += PROGRAM_POINTS.milestone;
    if (ev.finishedOn === key) points += PROGRAM_POINTS.finish;
    parts.push({ id: `program:${run.id}`, label: `برنامج «${ev.def.title}»`, points });
  }
  return { total: parts.reduce((n, p) => n + p.points, 0), parts };
}

// ── Home «يحتاج انتباهك» ─────────────────────────────────────────────────────

const ICON_OF: Partial<Record<VerifyKind, AttentionIcon>> = {
  qiyam: 'qiyam',
  duha: 'duha',
  quran: 'quran',
  adhkar: 'morning',
  fasting: 'fasting',
  mosque: 'mosque',
  takbeer: 'mosque',
  onTime: 'prayer',
  rawatib: 'prayer',
};

const endOfDay = (key: string) => new Date(parseKey(shiftKey(key, 1)).getTime() - 1);
const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

/**
 * Items for Home's «يحتاج انتباهك»:
 *  closing  today's step still open while its time runs out
 *  suggest  two missed days in a row (forgiving: keep going or pause),
 *           a strict restart yesterday, tomorrow's fast (from Maghrib).
 */
export function programAttention(runs: ProgramRun[], src: ProgramSources, now: Date, times: DayTimes | null): AttentionItem[] {
  const out: AttentionItem[] = [];
  const today = dayKey(now);
  for (const run of runs) {
    if (run.status !== 'active') continue;
    const ev = evaluateRun(run, src, now);
    if (!ev.started || ev.finishedOn || ev.paused) continue;
    const title = ev.def.title;
    const to = `/programs?run=${run.id}`;
    const icon = ICON_OF[ev.def.verify] ?? 'awrad';
    const kicker = `برامج التدرّج · اليوم ${ar(dayNumber(ev))} من ${ar(ev.total)}`;
    const t = ev.today;

    if (run.grace === 'forgiving' && ev.missStreak >= 2 && t?.state !== 'done') {
      const lastMiss = [...ev.days].reverse().find((d) => d.state === 'missed')?.key ?? today;
      out.push({
        id: `program.miss.${run.id}.${lastMiss}`,
        level: 'suggest',
        icon,
        kicker,
        title: `فاتتك ${daysAr(ev.missStreak)} في «${title}»`,
        body: 'تكمل من خطوتك نفسها، أو أوقفه مؤقتاً إن كنت مسافراً أو مريضاً.',
        to,
      });
    }
    if (run.grace === 'strict' && ev.lastReset && ev.lastReset === shiftKey(ev.openKey, -1)) {
      out.push({
        id: `program.reset.${run.id}.${ev.lastReset}`,
        level: 'suggest',
        icon,
        kicker: 'برامج التدرّج',
        title: `بدأ «${title}» من جديد`,
        body: '«خير الخطّائين التوّابون». خطوة اليوم الأولى بانتظارك.',
        to,
      });
    }
    if (ev.def.verify === 'fasting') {
      const tomorrow = shiftKey(today, 1);
      const evening = times?.maghrib ?? at(now, 18);
      if (ev.nextDue === tomorrow || (t?.state === 'done' && ev.def.dueOn?.(weekdayOf(tomorrow), ev.step))) {
        if (now >= evening)
          out.push({
            id: `program.fast.${run.id}.${tomorrow}`,
            level: 'suggest',
            icon: 'fasting',
            kicker,
            title: `غداً ${WEEKDAY_NAME[weekdayOf(tomorrow)]}: صومك في البرنامج`,
            body: 'انوِ الصيام من الليل، وتسحّر ولو بشيء يسير.',
            to,
          });
      }
      continue;
    }
    if (t?.state !== 'pending') continue;

    const step = stepTextOn(ev.def, t.target, t.key, src.gender === 'male', run.name, ev.def.steps[t.step]);
    const item = (deadline: Date | undefined, body: string): AttentionItem => ({
      id: `program.today.${run.id}.${t.key}`,
      level: 'closing',
      icon,
      kicker,
      title: `خطوة اليوم: ${step}`,
      body,
      to,
      deadline,
    });
    const h = now.getHours();
    switch (ev.def.verify) {
      case 'duha': {
        const from = times ? new Date(times.sunrise.getTime() + 150 * 60_000) : at(now, 9);
        const end = times ? new Date(times.dhuhr.getTime() - 10 * 60_000) : at(now, 11, 45);
        if (now >= from && now < end) out.push(item(end, `«${title}»: وقت الضحى يوشك أن ينتهي.`));
        break;
      }
      case 'qiyam': {
        if (t.key !== today) out.push(item(at(now, 12), 'إن قمتَ الليلة الماضية فسجّلها قبل الظهر.'));
        else if (now >= new Date((times?.isha ?? at(now, 19, 30)).getTime() + 60 * 60_000)) out.push(item(undefined, `«${title}»: ليلتك ما زالت مفتوحة.`));
        break;
      }
      case 'adhkar': {
        if (h >= 16) out.push(item(endOfDay(t.key), `«${title}»: ما زال في اليوم متّسع.`));
        break;
      }
      case 'takbeer':
      case 'mosque':
      case 'onTime': {
        if (now >= new Date((times?.isha ?? at(now, 19, 30)).getTime() + 45 * 60_000))
          out.push(item(endOfDay(t.key), 'سجّل الصلوات التي أدركتها اليوم.'));
        break;
      }
      default:
        if (h >= 19) out.push(item(endOfDay(t.key), `«${title}»: ما زال في اليوم متّسع.`));
    }
  }
  return out;
}

// ── reminders ────────────────────────────────────────────────────────────────

export interface PlannedProgramNotif {
  id: string;
  title: string;
  body: string;
  at: number;
  repeat: 'none';
  moduleId: 'programs';
  deepLinkPath: string;
  soundKey: 'target' | 'qiyam' | 'quran' | 'azkar' | 'fasting';
}

const FALLBACK: Record<Exclude<ReminderSpec['anchor'], 'time'>, string> = {
  fajr: '04:45',
  sunrise: '06:15',
  dhuhr: '12:00',
  asr: '15:30',
  maghrib: '18:00',
  isha: '19:30',
};

/** When a reminder fires on `key`: a clock time, or a prayer ± minutes (fallback times without a location). */
export function fireTime(spec: ReminderSpec, key: string, timesFor: (d: Date) => DayTimes | null): number {
  const day = parseKey(key);
  if (spec.anchor === 'time') return atTime(day, spec.time || '20:00').getTime();
  const base = timesFor(atTime(day, '12:00'))?.[spec.anchor] ?? atTime(day, FALLBACK[spec.anchor]);
  return base.getTime() + spec.offset * 60_000;
}

const SOUND: Partial<Record<VerifyKind, PlannedProgramNotif['soundKey']>> = {
  qiyam: 'qiyam',
  quran: 'quran',
  adhkar: 'azkar',
  istighfar: 'azkar',
  fasting: 'fasting',
};

/**
 * A rolling week of one-shot reminders per run. Ids are stable and dateless:
 * myzikr_prog_{runId}_{reminderIdx}_d{weekday} — the same weekday keeps its id
 * from sync to sync, so only real changes reschedule. The steps ahead are
 * projected assuming each day succeeds (re-planned on every sync).
 */
export function planProgramReminders(
  runs: ProgramRun[],
  src: ProgramSources,
  now: Date,
  timesFor: (d: Date) => DayTimes | null,
  horizon = 7,
): PlannedProgramNotif[] {
  const out: PlannedProgramNotif[] = [];
  const nowMs = now.getTime();
  const male = src.gender === 'male';
  for (const run of runs) {
    if (run.status !== 'active' || !run.remindersOn) continue;
    const ev = evaluateRun(run, src, now);
    if (ev.finishedOn) continue;
    const def = ev.def;
    const specs = run.reminders?.length ? run.reminders : def.reminders;
    let s = ev.step;
    const today = dayKey(now);
    for (let i = 0; i < horizon && s < ev.total; i++) {
      const key = shiftKey(today, i);
      if (key < run.startDay || pausedOn(run, key)) continue;
      if (def.excusable && src.excused?.[key]) continue;
      const wd = weekdayOf(key);
      if (def.dueOn && !def.dueOn(wd, s)) continue;
      const doneToday = key === ev.openKey && ev.today?.state === 'done';
      // Today's step already done → its reminder is moot (s already counts it).
      if (!doneToday) {
        const target = targetOn(def, s, key, male);
        const ctx: StepCtx = { male, name: run.name, weekday: wd };
        if (def.verify === 'rawatib') ctx.slots = rawatibSlotsOn(key, male, def.steps[s]);
        specs.forEach((spec, ri) => {
          if (spec.minTarget && target < spec.minTarget) return;
          const fireKey = spec.eve ? shiftKey(key, -1) : key;
          const atMs = fireTime(spec, fireKey, timesFor);
          if (atMs <= nowMs) return;
          out.push({
            id: `myzikr_prog_${run.id}_${ri}_d${wd}`,
            title: `${def.title} · اليوم ${ar(s + 1)} من ${ar(ev.total)}`,
            body: def.remindText ? def.remindText(target, ctx, spec) : `خطوتك اليوم: ${def.stepText(target, ctx)}`,
            at: atMs,
            repeat: 'none',
            moduleId: 'programs',
            deepLinkPath: `/#/programs?run=${run.id}`,
            soundKey: SOUND[def.verify] ?? 'target',
          });
        });
        s++;
      }
    }
  }
  return out;
}

// ── summaries ────────────────────────────────────────────────────────────────

const UNIT_NOUN: Partial<Record<ProgramUnit, (n: number) => string>> = { rakaat: rakaatAr, pages: pagesAr, count: timesAr, prayers: prayersAr };

/** «من ٢ إلى ١١ ركعة» — a schedule in one line. */
export function rangeText(def: ProgramTemplate): string {
  const a = def.steps[0];
  const b = def.steps[def.steps.length - 1];
  if (def.verify === 'rawatib') return 'من ركعتين إلى ١٢ ركعة';
  if (def.verify === 'adhkar') return 'الصباح، ثم الصباح والمساء';
  const noun = UNIT_NOUN[def.unit];
  if (!noun) return lengthText(def);
  return a === b ? `${noun(a)} كل يوم` : `من ${ar(a)} إلى ${noun(b)}`;
}

export function lengthText(def: ProgramTemplate): string {
  return def.lengthLabel ?? daysAr(def.steps.length);
}

/** navigator.share text for a finished run. */
export function shareText(ev: RunEval): string {
  const dua = COMPLETION_DUAS[0];
  const days = ev.days.filter((d) => d.state === 'done' || d.state === 'missed').length;
  return [
    `أتممتُ بفضل الله برنامج «${ev.def.title}»: ${lengthText(ev.def)}${days > ev.total ? ` في ${daysAr(days)}` : ''}.`,
    `﴿${dua.text}﴾`,
    'رفيقي · برامج التدرّج',
  ].join('\n');
}

/** Badge facts over every run (see the integration notes). */
export function programBadgeFacts(runs: ProgramRun[], src: ProgramSources, now: Date = new Date()) {
  let stepsDone = 0;
  let comebacks = 0;
  let longestChain = 0;
  const finishedIds: string[] = [];
  for (const run of runs) {
    const ev = evaluateRun(run, src, now);
    stepsDone += ev.doneCount;
    longestChain = Math.max(longestChain, ev.best);
    if (ev.finishedOn) {
      finishedIds.push(run.templateId ?? 'custom');
      if (ev.restarts > 0 || ev.days.some((d) => d.state === 'missed')) comebacks++;
    }
  }
  return { finished: finishedIds.length, finishedIds, stepsDone, comebacks, longestChain };
}

export { WEEKDAY_NAME };
