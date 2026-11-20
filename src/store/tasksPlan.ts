import {
  compareTasks, completionOn, dayKey, isDoneOn, nextOccurrence, occursOn, shiftKey, TASK_LISTS,
  type Task, type TaskList,
} from '@/store/studyModel';

/**
 * «المهام» organised — PURE (tested: scripts/tasksPlan.test.ts). The page's
 * four views read from here: today laid out around the prayers, the days
 * ahead, the lists, and the suggestions for planning the day.
 */

// ── the day around the prayers ─────────────────────────────────────────────
export type Slot = 'night' | 'fajr' | 'duha' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const SLOT_ORDER: Slot[] = ['night', 'fajr', 'duha', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const SLOT_LABEL: Record<Slot, string> = {
  night: 'قبل الفجر',
  fajr: 'بعد الفجر',
  duha: 'الضحى',
  dhuhr: 'بعد الظهر',
  asr: 'بعد العصر',
  maghrib: 'بعد المغرب',
  isha: 'بعد العشاء',
};
/** The prayer that opens each slot (null: the night before Fajr). */
export const SLOT_PRAYER: Record<Slot, 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | null> = {
  night: null,
  fajr: 'fajr',
  duha: 'sunrise',
  dhuhr: 'dhuhr',
  asr: 'asr',
  maghrib: 'maghrib',
  isha: 'isha',
};

export interface DayTimesLite {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** The prayer period an 'HH:mm' falls in. */
export function slotOf(hhmm: string, t: DayTimesLite): Slot {
  const [h, m] = hhmm.split(':').map(Number);
  const x = h * 60 + m;
  if (x < minutes(t.fajr)) return 'night';
  if (x < minutes(t.sunrise)) return 'fajr';
  if (x < minutes(t.dhuhr)) return 'duha';
  if (x < minutes(t.asr)) return 'dhuhr';
  if (x < minutes(t.maghrib)) return 'asr';
  if (x < minutes(t.isha)) return 'maghrib';
  return 'isha';
}

/** Ticked today (a one-off finished today, or today's occurrence of a recurring one). */
export function doneToday(t: Task, key: string): boolean {
  return t.repeat === 'none' ? t.done && !!t.doneAt && dayKey(t.doneAt) === key : occursOn(t, key) && !!t.history?.[key];
}

export interface TodayPlan {
  /** One-offs whose day has passed. */
  overdue: Task[];
  /** Today's timed tasks by prayer period; without prayer times one group (`slot: null`). */
  timed: { slot: Slot | null; tasks: Task[] }[];
  /** Today's tasks with no time. */
  anytime: Task[];
  done: Task[];
  /** Today's occurrences: scheduled vs ticked (completionOn). */
  progress: { done: number; total: number };
}

export function todayPlan(tasks: readonly Task[], now: number, times: DayTimesLite | null): TodayPlan {
  const key = dayKey(now);
  const overdue: Task[] = [];
  const timed: Task[] = [];
  const anytime: Task[] = [];
  const done: Task[] = [];
  for (const t of tasks) {
    if (doneToday(t, key)) {
      done.push(t);
      continue;
    }
    if (isDoneOn(t, key)) continue;
    if (t.repeat === 'none') {
      if (!t.due) continue;
      if (t.due < key) overdue.push(t);
      else if (t.due === key) (t.time ? timed : anytime).push(t);
    } else if (occursOn(t, key)) (t.time ? timed : anytime).push(t);
  }
  const byOrder = (a: Task, b: Task) => compareTasks(a, b, key);
  overdue.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || byOrder(a, b));
  anytime.sort(byOrder);
  timed.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || byOrder(a, b));
  const groups: TodayPlan['timed'] = [];
  for (const t of timed) {
    const slot = times ? slotOf(t.time!, times) : null;
    const last = groups[groups.length - 1];
    if (last && last.slot === slot) last.tasks.push(t);
    else groups.push({ slot, tasks: [t] });
  }
  return { overdue, timed: groups, anytime, done: done.sort((a, b) => doneAt(b, key) - doneAt(a, key)), progress: completionOn([...tasks], key) };
}

const doneAt = (t: Task, key: string) => (t.repeat === 'none' ? (t.doneAt ?? 0) : (t.history?.[key] ?? 0));

// ── the days ahead ─────────────────────────────────────────────────────────
export interface Upcoming {
  /** The next seven days after today, each with what falls on it (empty days left out). */
  days: { key: string; tasks: Task[] }[];
  /** Further on. */
  later: Task[];
  undated: Task[];
  count: number;
}

/** Each open task once, at its next occurrence after today. */
export function upcoming(tasks: readonly Task[], now: number): Upcoming {
  const key = dayKey(now);
  const tomorrow = shiftKey(key, 1);
  const horizon = shiftKey(key, 7);
  const byDay = new Map<string, Task[]>();
  const later: Task[] = [];
  const undated: Task[] = [];
  for (const t of tasks) {
    if (t.repeat === 'none') {
      if (t.done) continue;
      if (!t.due) {
        undated.push(t);
        continue;
      }
      if (t.due <= key) continue;
    }
    const next = t.repeat === 'none' ? t.due! : nextOccurrence(t, tomorrow);
    if (!next) continue;
    if (next <= horizon) byDay.set(next, [...(byDay.get(next) ?? []), t]);
    else later.push(t);
  }
  const days = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, ts]) => ({ key: k, tasks: ts.sort((a, b) => compareTasks(a, b, k)) }));
  later.sort((a, b) => compareTasks(a, b, key));
  undated.sort((a, b) => compareTasks(a, b, key) || b.createdAt - a.createdAt);
  return { days, later, undated, count: days.reduce((n, d) => n + d.tasks.length, 0) + later.length + undated.length };
}

// ── planning the day ───────────────────────────────────────────────────────
/**
 * «خطّط يومك»: what could be brought into today — undated one-offs and the
 * ones due within three days, the important first. At most `max`.
 */
export function suggestForToday(tasks: readonly Task[], now: number, max = 3): Task[] {
  const key = dayKey(now);
  const soon = shiftKey(key, 3);
  const rank = { high: 0, normal: 1, low: 2 } as const;
  return tasks
    .filter((t) => t.repeat === 'none' && !t.done && (!t.due || (t.due > key && t.due <= soon)))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.due ?? '9').localeCompare(b.due ?? '9') || a.createdAt - b.createdAt)
    .slice(0, max);
}

// ── the lists ──────────────────────────────────────────────────────────────
export interface ListStat {
  list: TaskList;
  open: number;
  overdue: number;
  /** Ticked today. */
  doneToday: number;
}

export function listStats(tasks: readonly Task[], now: number): ListStat[] {
  const key = dayKey(now);
  return TASK_LISTS.map((list) => {
    const mine = tasks.filter((t) => t.list === list);
    return {
      list,
      open: mine.filter((t) => !isDoneOn(t, key)).length,
      overdue: mine.filter((t) => t.repeat === 'none' && !t.done && !!t.due && t.due < key).length,
      doneToday: mine.filter((t) => doneToday(t, key)).length,
    };
  });
}

// ── search ─────────────────────────────────────────────────────────────────
/** Arabic-tolerant: no harakat or tatweel, one alef, ى = ي, ة = ه. */
export function normalizeAr(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .trim();
}

/** Tasks whose title, notes or steps contain every word of `q` — open first. */
export function searchTasks(tasks: readonly Task[], q: string, now: number): Task[] {
  const words = normalizeAr(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const key = dayKey(now);
  return tasks
    .filter((t) => {
      const hay = normalizeAr([t.title, t.notes ?? '', ...t.subtasks.map((s) => s.title)].join(' '));
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => compareTasks(a, b, key));
}
