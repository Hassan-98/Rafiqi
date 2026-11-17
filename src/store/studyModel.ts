/**
 * «العلم والمهام» — pure model: types + date/recurrence/reminder math shared by
 * studyStore, tasksStore, studyReminders, widgetBridge and the UI.
 *
 * No store / Capacitor imports here, so scripts/study.test.ts can exercise it
 * under plain node. All date math is LOCAL time built from y/m/d components
 * (never `+ 86_400_000`), so DST shifts can't slide a weekly slot by an hour.
 */
import { toArabicDigits } from '@/utils/arabicFormat';

// ── Circles (حلقات العلم) ────────────────────────────────────────────────────

export type Platform =
  | 'telegram'
  | 'whatsapp'
  | 'youtube'
  | 'zoom'
  | 'meet'
  | 'website'
  | 'inperson'
  | 'other';

export const PLATFORMS: Platform[] = ['telegram', 'whatsapp', 'youtube', 'zoom', 'meet', 'website', 'inperson', 'other'];

export const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: 'تيليجرام',
  whatsapp: 'واتساب',
  youtube: 'يوتيوب',
  zoom: 'زووم',
  meet: 'جوجل ميت',
  website: 'موقع',
  inperson: 'حضوري',
  other: 'أخرى',
};

/** "على تيليجرام" / "حضورياً" — the platform as it reads inside a sentence. */
export function platformPhrase(p: Platform): string {
  if (p === 'inperson') return 'حضورياً';
  if (p === 'website') return 'على الموقع';
  if (p === 'other') return '';
  return `على ${PLATFORM_LABEL[p]}`;
}

export type StudySubject =
  | 'aqeedah'
  | 'fiqh'
  | 'tafsir'
  | 'hadith'
  | 'seerah'
  | 'tajweed'
  | 'arabic'
  | 'tazkiyah'
  | 'other';

export const SUBJECTS: StudySubject[] = ['aqeedah', 'fiqh', 'tafsir', 'hadith', 'seerah', 'tajweed', 'arabic', 'tazkiyah', 'other'];

export const SUBJECT_LABEL: Record<StudySubject, string> = {
  aqeedah: 'عقيدة',
  fiqh: 'فقه',
  tafsir: 'تفسير',
  hadith: 'حديث',
  seerah: 'سيرة',
  tajweed: 'تجويد',
  arabic: 'لغة عربية',
  tazkiyah: 'تزكية',
  other: 'أخرى',
};

/** live = fixed weekly times · series = a course of N recorded lessons · channel = follow new posts. */
export type CircleFormat = 'live' | 'series' | 'channel';

export const FORMAT_LABEL: Record<CircleFormat, string> = {
  live: 'درس مباشر',
  series: 'سلسلة مسجّلة',
  channel: 'قناة أتابعها',
};

/** «مدة الدرس» choices in the circle form — a lesson's points on «الترتيب» follow its minutes. */
export const LESSON_MINUTES = [15, 30, 45, 60, 90, 120, 180];

export interface WeeklySlot {
  /** 0 = Sunday … 6 = Saturday (Date#getDay). */
  weekday: number;
  /** 'HH:mm' 24h, local time. */
  time: string;
  /** Session length, default 60. */
  durationMin?: number;
}

export interface OneOffSession {
  id: string;
  /** Epoch ms of the start. */
  at: number;
  durationMin?: number;
  title?: string;
}

export type LessonStatus = 'attended' | 'watched' | 'missed';

export interface LessonLog {
  id: string;
  /** Lesson number in a series (1-based). */
  n?: number;
  title?: string;
  /** Epoch ms of when it happened. */
  date: number;
  status: LessonStatus;
  notes?: string;
  durationMin?: number;
}

export type CircleStatus = 'active' | 'paused' | 'done';

export interface StudyCircle {
  id: string;
  title: string;
  teacher?: string;
  platform: Platform;
  link?: string;
  subject: StudySubject;
  format: CircleFormat;
  /** A lesson's usual length in minutes («مدة الدرس») — its points on «الترتيب». */
  durationMin?: number;
  slots: WeeklySlot[];
  sessions: OneOffSession[];
  /** Minutes before the start (0 = at the start). */
  reminderOffsets: number[];
  remindersEnabled: boolean;
  soundKey?: import('@/services/notifications/sounds').SoundKey;
  fullScreen?: boolean;
  /** Series only: a daily study nudge at `time` until `lessons` are done today. */
  dailyGoal?: { enabled: boolean; time: string; lessons: number };
  totalLessons?: number;
  /** Newest first. */
  log: LessonLog[];
  status: CircleStatus;
  createdAt: number;
}

// ── Tasks (مهامي) ────────────────────────────────────────────────────────────

export type TaskRepeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';

export const REPEAT_LABEL: Record<TaskRepeat, string> = {
  none: 'مرّة واحدة',
  daily: 'يومياً',
  weekdays: 'أيام العمل',
  weekly: 'أسبوعياً',
  monthly: 'شهرياً',
  custom: 'أيام محدّدة',
};

export type TaskPriority = 'low' | 'normal' | 'high';

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'منخفضة', normal: 'عادية', high: 'مهمّة' };

export type TaskList = 'today' | 'worship' | 'study' | 'home' | 'work' | 'personal';

export const TASK_LISTS: TaskList[] = ['today', 'worship', 'study', 'home', 'work', 'personal'];

export const LIST_LABEL: Record<TaskList, string> = {
  today: 'عام',
  worship: 'العبادة',
  study: 'العلم',
  home: 'البيت',
  work: 'العمل',
  personal: 'شخصي',
};

export interface Subtask {
  id: string;
  title: string;
  /** One-off tasks. */
  done: boolean;
  /** Recurring tasks: the day-key it was ticked on (resets every occurrence). */
  doneKey?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  /** 'yyyy-MM-dd'. One-off: the due day. Recurring: the first occurrence. */
  due?: string;
  /** 'HH:mm'. */
  time?: string;
  /** Minutes before `time`; undefined = no reminder. Needs `time`. */
  reminderOffset?: number;
  repeat: TaskRepeat;
  /** Weekdays (0=Sun) for repeat 'custom'. */
  days?: number[];
  priority: TaskPriority;
  list: TaskList;
  subtasks: Subtask[];
  /** One-off completion. */
  done: boolean;
  doneAt?: number;
  /** Recurring completion history: day-key → epoch ms ticked. */
  history?: Record<string, number>;
  /** A one-shot "remind me again" time. */
  snoozedUntil?: number;
  circleId?: string;
  soundKey?: import('@/services/notifications/sounds').SoundKey;
  createdAt: number;
}

// ── date helpers (local) ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Local midnight of `d` shifted by `n` calendar days (DST-safe). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function shiftKey(key: string, n: number): string {
  return dayKey(addDays(parseKey(key), n));
}

/** `day` (any time) at local HH:mm. */
export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0, 0, 0);
}

export function hhmm(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "٩:٣٠ م" — 12h Arabic clock. */
export function clockAr(time: string | number | Date): string {
  const t = typeof time === 'string' ? time : hhmm(time);
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${toArabicDigits(h12)}:${toArabicDigits(pad(m))} ${h < 12 ? 'ص' : 'م'}`;
}

/** Arabic duration phrase with correct number agreement: "١٠ دقائق", "ساعتين", "يوم". */
export function durationAr(min: number): string {
  const n = Math.max(0, Math.round(min));
  const unit = (v: number, one: string, two: string, few: string, many: string) =>
    v === 1 ? one : v === 2 ? two : v <= 10 ? `${toArabicDigits(v)} ${few}` : `${toArabicDigits(v)} ${many}`;
  if (n > 0 && n % 1440 === 0) return unit(n / 1440, 'يوم', 'يومين', 'أيام', 'يوماً');
  if (n > 0 && n % 60 === 0) return unit(n / 60, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  return unit(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
}

/** Countdown label: "بعد ٣ ساعات" / "بعد ٢٠ دقيقة" / "بعد يومين". */
export function inAr(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `بعد ${durationAr(min)}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 3 && m >= 5) return `بعد ${durationAr(h * 60)} و${durationAr(m)}`;
  if (min < 24 * 60) return `بعد ${durationAr(Math.round(min / 60) * 60)}`;
  return `بعد ${durationAr(Math.round(min / 1440) * 1440)}`;
}

// ── links ────────────────────────────────────────────────────────────────────

const LINK_RE =
  /https?:\/\/[^\s]+|(?:www\.)?(?:t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com|youtu\.be|youtube\.com|m\.youtube\.com|[\w-]*\.?zoom\.us|meet\.google\.com)\/[^\s]*/i;

/** Pull the first link out of pasted text and guess its platform. */
export function detectPlatform(text: string): { platform: Platform; link: string } | null {
  const m = text.match(LINK_RE);
  if (!m) return null;
  const link = /^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`;
  let host = '';
  try {
    host = new URL(link).hostname.toLowerCase().replace(/^(www|m)\./, '');
  } catch {
    return null;
  }
  const is = (...hosts: string[]) => hosts.some((h) => host === h || host.endsWith(`.${h}`));
  const platform: Platform = is('t.me', 'telegram.me', 'telegram.org')
    ? 'telegram'
    : is('wa.me', 'whatsapp.com')
      ? 'whatsapp'
      : is('youtube.com', 'youtu.be')
        ? 'youtube'
        : is('zoom.us')
          ? 'zoom'
          : host === 'meet.google.com'
            ? 'meet'
            : 'website';
  return { platform, link };
}

// ── circle computations ──────────────────────────────────────────────────────

const DEFAULT_DUR = 60;

/** First start of `slot` at or after `from`. */
export function nextSlotStart(slot: WeeklySlot, from: number): number {
  const base = new Date(from);
  const delta = (slot.weekday - base.getDay() + 7) % 7;
  let d = atTime(addDays(base, delta), slot.time);
  if (d.getTime() < from) d = atTime(addDays(base, delta + 7), slot.time);
  return d.getTime();
}

export interface NextSession {
  at: number;
  endAt: number;
  /** Currently in progress. */
  live: boolean;
  slotIdx?: number;
  sessionId?: string;
}

/** The session happening now, or the next one to come. Null when unscheduled. */
export function nextSession(c: StudyCircle, now: number): NextSession | null {
  let best: NextSession | null = null;
  const take = (s: NextSession) => {
    if (!best || s.at < best.at) best = s;
  };
  c.slots.forEach((slot, slotIdx) => {
    const dur = (slot.durationMin ?? DEFAULT_DUR) * 60000;
    // Search from now-dur so a session that already started is still "next".
    const at = nextSlotStart(slot, now - dur + 1);
    take({ at, endAt: at + dur, live: at <= now, slotIdx });
  });
  for (const s of c.sessions) {
    const dur = (s.durationMin ?? DEFAULT_DUR) * 60000;
    if (s.at + dur > now) take({ at: s.at, endAt: s.at + dur, live: s.at <= now, sessionId: s.id });
  }
  return best;
}

export const lessonsDone = (c: StudyCircle): number => c.log.filter((l) => l.status !== 'missed').length;

/** 0–1 for a series with a known total, else null. */
export function completion(c: StudyCircle): number | null {
  if (!c.totalLessons) return null;
  return Math.min(1, lessonsDone(c) / c.totalLessons);
}

/** Sessions that should have happened between creation and now (for attendance). */
export function expectedSessions(c: StudyCircle, now: number): number {
  let n = 0;
  for (const slot of c.slots) {
    const dur = (slot.durationMin ?? DEFAULT_DUR) * 60000;
    let at = nextSlotStart(slot, c.createdAt);
    // ponytail: counts paused weeks too; track pause spans if users complain.
    for (let k = 0; k < 520 && at + dur <= now; k++) {
      n++;
      at = nextSlotStart(slot, at + 60000);
    }
  }
  n += c.sessions.filter((s) => s.at >= c.createdAt && s.at + (s.durationMin ?? DEFAULT_DUR) * 60000 <= now).length;
  return n;
}

/** Attended ÷ sessions held (live circles). Null before the first session. */
export function attendanceRate(c: StudyCircle, now: number): number | null {
  const attended = c.log.filter((l) => l.status === 'attended').length;
  const missed = c.log.filter((l) => l.status === 'missed').length;
  const held = Math.max(expectedSessions(c, now), attended + missed);
  return held > 0 ? Math.min(1, attended / held) : null;
}

/** Consecutive days (ending today, or yesterday if today is still open) in `keys`. */
export function dayStreak(keys: Set<string>, now: number): number {
  let d = new Date(now);
  if (!keys.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (keys.has(dayKey(d)) && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Study streak across every circle: days with a lesson attended/watched. */
export function studyStreak(circles: StudyCircle[], now: number): number {
  const keys = new Set<string>();
  for (const c of circles) for (const l of c.log) if (l.status !== 'missed') keys.add(dayKey(l.date));
  return dayStreak(keys, now);
}

export function lessonsOnDay(c: StudyCircle, key: string): number {
  return c.log.filter((l) => l.status !== 'missed' && dayKey(l.date) === key).length;
}

// ── task computations ────────────────────────────────────────────────────────

export const isRecurring = (t: Task): boolean => t.repeat !== 'none';

function startKey(t: Task): string {
  return t.due ?? dayKey(t.createdAt);
}

/** Does task `t` have an occurrence on day `key`? */
export function occursOn(t: Task, key: string): boolean {
  if (t.repeat === 'none') return t.due === key;
  const start = startKey(t);
  if (key < start) return false;
  const d = parseKey(key);
  const wd = d.getDay();
  switch (t.repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd <= 4; // الأحد–الخميس
    case 'weekly':
      return wd === parseKey(start).getDay();
    case 'custom':
      return (t.days ?? []).includes(wd);
    case 'monthly': {
      const want = parseKey(start).getDate();
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(want, last);
    }
  }
  return false;
}

/**
 * The occurrence a tick on day `key` refers to: the day itself for one-offs,
 * the next occurrence ≥ `key` for recurring tasks (a weekly task seen on a
 * non-occurrence day shows / ticks its coming occurrence, not a phantom day).
 */
export function occurrenceKey(t: Task, key: string): string {
  return t.repeat === 'none' ? key : nextOccurrence(t, key) ?? key;
}

export function isDoneOn(t: Task, key: string): boolean {
  return t.repeat === 'none' ? t.done : !!t.history?.[occurrenceKey(t, key)];
}

export function subtaskDone(t: Task, s: Subtask, key: string): boolean {
  return t.repeat === 'none' ? s.done : s.doneKey === occurrenceKey(t, key);
}

/**
 * `t`'s steps with step `subId` set done / undone (flipped when `done` is
 * omitted) for the occurrence day `key` refers to — the one rule the list, the
 * sheet and widget `task.step.toggle` actions all share.
 */
export function withSubtaskDone(t: Task, subId: string, key: string, done?: boolean): Subtask[] {
  return t.subtasks.map((s) => {
    if (s.id !== subId) return s;
    const cur = subtaskDone(t, s, key);
    const next = done ?? !cur;
    if (next === cur) return s;
    return t.repeat === 'none' ? { ...s, done: next } : { ...s, doneKey: next ? occurrenceKey(t, key) : undefined };
  });
}

/** First day ≥ fromKey with an occurrence (recurring), within ~13 months. */
export function nextOccurrence(t: Task, fromKey: string): string | null {
  if (t.repeat === 'none') return t.due && t.due >= fromKey ? t.due : null;
  let key = fromKey < startKey(t) ? startKey(t) : fromKey;
  for (let i = 0; i < 400; i++) {
    if (occursOn(t, key)) return key;
    key = shiftKey(key, 1);
  }
  return null;
}

/** Due time passed and still open. */
export function isOverdue(t: Task, now: number): boolean {
  const today = dayKey(now);
  if (t.repeat !== 'none') {
    return !!t.time && occursOn(t, today) && !isDoneOn(t, today) && atTime(new Date(now), t.time).getTime() < now;
  }
  if (t.done || !t.due) return false;
  if (t.due < today) return true;
  return t.due === today && !!t.time && atTime(parseKey(t.due), t.time).getTime() < now;
}

/**
 * «مهامي» is a persistent list: every task stays on it until deleted — nothing
 * is filtered by day. Done one-offs stay (struck through) until «حذف المكتملة».
 */
export function taskCounts(tasks: Task[], now: number): { done: number; total: number } {
  const today = dayKey(now);
  return { done: tasks.filter((t) => isDoneOn(t, today)).length, total: tasks.length };
}

const PRI_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** List order: open first, then by next due day (undated last), time, priority. */
export function compareTasks(a: Task, b: Task, key: string): number {
  const due = (t: Task) => (t.repeat === 'none' ? t.due : nextOccurrence(t, key)) ?? '9';
  return (
    Number(isDoneOn(a, key)) - Number(isDoneOn(b, key)) ||
    due(a).localeCompare(due(b)) ||
    (a.time ?? '99').localeCompare(b.time ?? '99') ||
    PRI_RANK[a.priority] - PRI_RANK[b.priority]
  );
}

/** Occurrences scheduled vs done on each of `keys` (for the weekly stats bar). */
export function completionOn(tasks: Task[], key: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.repeat === 'none') {
      const doneHere = t.done && !!t.doneAt && dayKey(t.doneAt) === key;
      if (t.due === key || doneHere) {
        total++;
        if (doneHere || (t.due === key && t.done)) done++;
      }
    } else if (occursOn(t, key)) {
      total++;
      if (t.history?.[key]) done++;
    }
  }
  return { done, total };
}

/** "اليوم ٩:٠٠ م" / "غداً" / "الخميس ٥ أكتوبر" for a task's current occurrence. */
export function dueLabel(t: Task, now: number): string | null {
  const today = dayKey(now);
  const key = t.repeat === 'none' ? t.due : nextOccurrence(t, today);
  if (!key) return null;
  const tomorrow = shiftKey(today, 1);
  const yesterday = shiftKey(today, -1);
  const d = parseKey(key);
  const day =
    key === today ? 'اليوم' : key === tomorrow ? 'غداً' : key === yesterday ? 'أمس' : `${WEEKDAY_AR[d.getDay()]} ${toArabicDigits(d.getDate())}/${toArabicDigits(d.getMonth() + 1)}`;
  return t.time ? `${day} ${clockAr(t.time)}` : day;
}

// ── quick-add parsing ────────────────────────────────────────────────────────

const toLatin = (s: string) =>
  s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));

export interface QuickAdd {
  title: string;
  due?: string;
  time?: string;
  priority?: TaskPriority;
  repeat?: TaskRepeat;
}

/**
 * Light natural parsing of a quick-add line: «راجع الدرس غداً الساعة ٩ مساءً مهم».
 * Understands اليوم / غداً / بعد غد / weekday names, «الساعة ٩[:٣٠] [ص|م|صباحاً|مساءً]»,
 * يومياً / أسبوعياً, and «مهم» / «!». Matched words are stripped from the title.
 */
export function parseQuickAdd(input: string, now: number): QuickAdd {
  // Same length as input (each digit is one UTF-16 unit), so indices line up.
  let s = toLatin(input);
  const out: QuickAdd = { title: '' };
  const cut = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (m) s = s.replace(re, (x) => ' '.repeat(x.length));
    return m;
  };
  const W = '(?=\\s|$)';
  const P = '(?:^|\\s)';
  const today = new Date(now);

  if (cut(new RegExp(`${P}بعد\\s+(?:غد|بكر[ةه])${W}`))) out.due = dayKey(addDays(today, 2));
  else if (cut(new RegExp(`${P}(?:غد[اًا]?|غدًا|غداً|بكر[ةه])${W}`))) out.due = dayKey(addDays(today, 1));
  else if (cut(new RegExp(`${P}(?:اليوم|الليلة)${W}`))) out.due = dayKey(today);
  else {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const alt = days.map((d) => d.replace('الأ', 'ال[أا]')).join('|');
    const m = cut(new RegExp(`${P}(?:يوم\\s+)?(${alt})${W}`));
    if (m) {
      const idx = days.findIndex((d) => new RegExp(`^${d.replace('الأ', 'ال[أا]')}$`).test(m[1]));
      const delta = (idx - today.getDay() + 7) % 7 || 7;
      out.due = dayKey(addDays(today, delta));
    }
  }

  if (cut(new RegExp(`${P}(?:كل\\s+يوم|يومي[اًا]?)${W}`))) out.repeat = 'daily';
  else if (cut(new RegExp(`${P}(?:كل\\s+أسبوع|أسبوعي[اًا]?)${W}`))) out.repeat = 'weekly';

  const tm = cut(
    new RegExp(
      `${P}(?:الساعة|الساعه|س)\\s*(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*(صباح[اًا]?|ص|فجر[اًا]?|مساء[اًا]?|م|ليل[اًا]?|عصر[اًا]?|ظهر[اًا]?))?${W}`,
    ),
  );
  if (tm) {
    let h = Number(tm[1]);
    const min = Number(tm[2] ?? 0);
    const mark = tm[3] ?? '';
    const pm = /^(مساء|م$|ليل|عصر)/.test(mark) || (/^ظهر/.test(mark) && h < 11);
    if (pm && h < 12) h += 12;
    // ponytail: bare 1–6 with no ص/م is read as afternoon (nobody books 5 am by default).
    if (!mark && h >= 1 && h <= 6) h += 12;
    if (h <= 23 && min <= 59) {
      out.time = `${pad(h)}:${pad(min)}`;
      if (!out.due) {
        const passed = atTime(today, out.time).getTime() <= now;
        out.due = dayKey(addDays(today, passed ? 1 : 0));
      }
    }
  }

  if (cut(new RegExp(`${P}(?:مهم[ةه]?|عاجل[ةه]?)${W}`)) || cut(/!+/)) out.priority = 'high';

  // Title: take the ORIGINAL text at the surviving positions (keeps Arabic digits the user typed).
  let title = '';
  for (let i = 0; i < input.length; i++) title += s[i] === ' ' && input[i] !== ' ' ? ' ' : input[i];
  out.title = title.replace(/\s+/g, ' ').trim();
  return out;
}

// ── reminder planning ────────────────────────────────────────────────────────

/** A notification the reminder sync should have armed. Ids never carry a date. */
export interface PlannedNotif {
  id: string;
  title: string;
  body: string;
  at: number;
  repeat: 'none' | 'daily' | 'weekly';
  moduleId: string;
  deepLinkPath: string;
  soundKey?: import('@/services/notifications/sounds').SoundKey;
  fullScreen?: boolean;
}

export const circleLink = (id: string) => `/#/study/circle/${id}`;
export const taskLink = (id: string) => `/#/study?tab=tasks&task=${id}`;

function circleNotifs(c: StudyCircle, now: number): PlannedNotif[] {
  if (c.status !== 'active') return [];
  const out: PlannedNotif[] = [];
  const title = `📚 ${c.title}${c.teacher ? ` · ${c.teacher}` : ''}`;
  const where = platformPhrase(c.platform);
  const what = c.format === 'channel' ? 'موعد متابعة' : 'يبدأ درس';
  const base = {
    title,
    moduleId: 'study',
    deepLinkPath: circleLink(c.id),
    soundKey: c.soundKey ?? 'target',
    fullScreen: c.fullScreen,
  };
  const phrase = (o: number) =>
    o > 0
      ? `${what} «${c.title}» ${where} بعد ${durationAr(o)}`.replace(/\s+/g, ' ')
      : `${c.format === 'channel' ? 'حان موعد متابعة' : 'بدأ الآن درس'} «${c.title}» ${where}`.trim();

  if (c.remindersEnabled) {
    const offsets = [...new Set(c.reminderOffsets)].filter((o) => o >= 0 && o <= 1440);
    c.slots.forEach((slot, i) => {
      for (const o of offsets) {
        // First fire ≥ now: the slot start that is at least `o` minutes away.
        const start = nextSlotStart(slot, now + o * 60000);
        out.push({
          ...base,
          id: `myzikr_study_${c.id}_${i}_${o}`,
          body: `${phrase(o)} · ${clockAr(slot.time)}`,
          at: start - o * 60000,
          repeat: 'weekly',
        });
      }
    });
    for (const s of c.sessions) {
      for (const o of offsets) {
        const at = s.at - o * 60000;
        if (at <= now) continue;
        out.push({ ...base, id: `myzikr_study_${c.id}_x${s.id}_${o}`, body: phrase(o), at, repeat: 'none' });
      }
    }
  }

  const g = c.dailyGoal;
  if (g?.enabled && c.format === 'series') {
    const todayK = dayKey(now);
    const doneToday = lessonsOnDay(c, todayK);
    const total = c.totalLessons;
    const progress = total ? ` · أنجزت ${toArabicDigits(lessonsDone(c))} من ${toArabicDigits(total)}` : '';
    const todayFire = atTime(new Date(now), g.time).getTime();
    const tomorrowFire = atTime(addDays(new Date(now), 1), g.time).getTime();
    // Goal already met today → skip today's nudge: arm tomorrow once (same id);
    // the next sync (boot / resume / any edit) switches it back to a daily repeat.
    const skipToday = doneToday >= g.lessons && todayFire > now;
    out.push({
      ...base,
      id: `myzikr_study_${c.id}_goal`,
      body: `هدفك اليوم: ${g.lessons === 1 ? 'درس واحد' : `${toArabicDigits(g.lessons)} دروس`} من «${c.title}»${progress}`,
      at: skipToday || todayFire <= now ? tomorrowFire : todayFire,
      repeat: skipToday ? 'none' : 'daily',
    });
  }
  return out;
}

/** Fire time for task occurrence on day `key`. */
function fireOf(t: Task, key: string): number {
  return atTime(parseKey(key), t.time!).getTime() - (t.reminderOffset ?? 0) * 60000;
}

function taskNotifs(t: Task, now: number, circleTitle?: string): PlannedNotif[] {
  const out: PlannedNotif[] = [];
  const subs = t.subtasks.length;
  const todayK = dayKey(now);
  const base = {
    title: `${t.priority === 'high' ? '❗' : '⏰'} ${t.title}`,
    moduleId: 'study.task',
    deepLinkPath: taskLink(t.id),
    soundKey: t.soundKey ?? 'target',
  };
  const bodyFor = (key: string) => {
    const lead = t.reminderOffset ? `بعد ${durationAr(t.reminderOffset)} · ${clockAr(t.time!)}` : `حان وقت مهمتك · ${clockAr(t.time!)}`;
    const steps = subs ? ` · ${toArabicDigits(t.subtasks.filter((s) => subtaskDone(t, s, key)).length)}/${toArabicDigits(subs)} خطوات` : '';
    return `${lead}${circleTitle ? ` · ${circleTitle}` : ''}${steps}`;
  };

  if (t.snoozedUntil && t.snoozedUntil > now && !(t.repeat === 'none' && t.done)) {
    out.push({ ...base, id: `myzikr_study_task_${t.id}_snz`, body: 'تذكير مؤجَّل بمهمتك', at: t.snoozedUntil, repeat: 'none' });
  }
  if (!t.time || t.reminderOffset === undefined) return out;

  if (t.repeat === 'none') {
    if (t.done || !t.due) return out;
    const at = fireOf(t, t.due);
    if (at > now) out.push({ ...base, id: `myzikr_study_task_${t.id}`, body: bodyFor(t.due), at, repeat: 'none' });
    return out;
  }

  const valid = (key: string) => occursOn(t, key) && !t.history?.[key];
  /** First occurrence day ≥ `key`, stepping `step` days, whose fire is in the future. */
  const firstFrom = (key: string, step: number, pred: (k: string) => boolean): string | null => {
    let k = key;
    for (let i = 0; i < 60; i++) {
      if (fireOf(t, k) > now && pred(k)) return k;
      k = shiftKey(k, step);
    }
    return null;
  };
  // Start the scan a day back: a 23:50 occurrence with a 30-min lead fires "yesterday".
  const scanStart = shiftKey(todayK, -1);

  if (t.repeat === 'monthly') {
    const k = firstFrom(scanStart, 1, valid);
    if (k) out.push({ ...base, id: `myzikr_study_task_${t.id}_m`, body: bodyFor(k), at: fireOf(t, k), repeat: 'none' });
    return out;
  }

  if (t.repeat === 'daily') {
    // The natural next daily fire; if that occurrence is before the start or
    // already ticked, arm the next valid one as a one-shot under the SAME id.
    const natural = firstFrom(scanStart, 1, () => true);
    if (!natural) return out;
    const k = valid(natural) ? natural : firstFrom(natural, 1, valid);
    if (k) out.push({ ...base, id: `myzikr_study_task_${t.id}_d`, body: bodyFor(k), at: fireOf(t, k), repeat: k === natural ? 'daily' : 'none' });
    return out;
  }

  // weekdays / weekly / custom → one weekly repeat per occurrence weekday.
  const days =
    t.repeat === 'weekdays' ? [0, 1, 2, 3, 4] : t.repeat === 'weekly' ? [parseKey(startKey(t)).getDay()] : (t.days ?? []);
  for (const wd of new Set(days)) {
    let sample = scanStart;
    while (parseKey(sample).getDay() !== wd) sample = shiftKey(sample, 1);
    const natural = firstFrom(sample, 7, () => true);
    if (!natural) continue;
    const k = valid(natural) ? natural : firstFrom(natural, 7, valid);
    if (k) out.push({ ...base, id: `myzikr_study_task_${t.id}_w${wd}`, body: bodyFor(k), at: fireOf(t, k), repeat: k === natural ? 'weekly' : 'none' });
  }
  return out;
}

/** Everything «العلم والمهام» wants armed right now. Pure — the sync diffs it. */
export function planStudyReminders(circles: StudyCircle[], tasks: Task[], now: number): PlannedNotif[] {
  const titles = new Map(circles.map((c) => [c.id, c.title]));
  return [
    ...circles.flatMap((c) => circleNotifs(c, now)),
    ...tasks.flatMap((t) => taskNotifs(t, now, t.circleId ? titles.get(t.circleId) : undefined)),
  ];
}

/** The soonest session across active circles (widget + hero). */
export function nextStudyOverall(circles: StudyCircle[], now: number): { circle: StudyCircle; session: NextSession } | null {
  let best: { circle: StudyCircle; session: NextSession } | null = null;
  for (const c of circles) {
    if (c.status !== 'active') continue;
    const s = nextSession(c, now);
    if (s && (!best || s.at < best.session.at)) best = { circle: c, session: s };
  }
  return best;
}

// ── task organisation (the «مهامي» screen + widgets) ─────────────────────────

/** A finished one-off leaves the widgets a day after it was done (the app keeps it until cleared). */
export const WIDGET_DONE_TTL_MS = 24 * 60 * 60 * 1000;

export function hiddenFromWidget(t: Task, now: number): boolean {
  return t.repeat === 'none' && t.done && now - (t.doneAt ?? t.createdAt) > WIDGET_DONE_TTL_MS;
}

export type OpenGroup = 'overdue' | 'today' | 'tomorrow' | 'later' | 'undated';

export const OPEN_GROUP_LABEL: Record<OpenGroup, string> = {
  overdue: 'متأخرة',
  today: 'اليوم',
  tomorrow: 'غداً',
  later: 'القادمة',
  undated: 'بلا موعد',
};

/** Where an OPEN task sits on the list (done ones go to the completion log). */
export function openGroupOf(t: Task, now: number): OpenGroup {
  const today = dayKey(now);
  if (isOverdue(t, now) || (t.repeat === 'none' && !!t.due && t.due < today)) return 'overdue';
  const key = t.repeat === 'none' ? t.due : nextOccurrence(t, today);
  if (!key) return 'undated';
  if (key === today) return 'today';
  return key === shiftKey(today, 1) ? 'tomorrow' : 'later';
}

export interface DoneEntry {
  t: Task;
  /** Epoch ms it was ticked. */
  at: number;
  /** The occurrence day it closed (recurring) — undefined for one-offs. */
  occ?: string;
}

/**
 * Every completion — finished one-offs and each tick of a recurring task —
 * grouped by the LOCAL day it was done, newest day and time first.
 */
export function completionLog(tasks: Task[]): { key: string; items: DoneEntry[] }[] {
  const byDay = new Map<string, DoneEntry[]>();
  const push = (e: DoneEntry) => {
    const k = dayKey(e.at);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  };
  for (const t of tasks) {
    if (t.repeat === 'none') {
      if (t.done) push({ t, at: t.doneAt ?? t.createdAt });
    } else {
      for (const [occ, at] of Object.entries(t.history ?? {})) push({ t, at, occ });
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, items: items.sort((a, b) => b.at - a.at) }));
}

/** «اليوم» / «أمس» / «الثلاثاء ٢٧ أكتوبر» (+ year when not this year). */
export function dayHeadingAr(key: string, now: number): string {
  const today = dayKey(now);
  if (key === today) return 'اليوم';
  if (key === shiftKey(today, -1)) return 'أمس';
  const d = parseKey(key);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

/** «أمس ٩:١٠ م» / «٢٧ أكتوبر ٩:١٠ م» — a short stamp for when a task was registered. */
export function stampAr(at: number, now: number): string {
  const key = dayKey(at);
  const today = dayKey(now);
  const day =
    key === today
      ? 'اليوم'
      : key === shiftKey(today, -1)
        ? 'أمس'
        : new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(at);
  return `${day} ${clockAr(at)}`;
}
