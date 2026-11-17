import type { NotificationPayload } from '@/types';

/**
 * Concrete notification service contract.
 *
 * Two implementations exist:
 *  - `CapacitorNotificationService` — real local notifications on Android via
 *    `@capacitor/local-notifications`. Uses `AlarmManager.setExactAndAllowWhileIdle`
 *    underneath for alarm-clock-grade reliability that wakes from doze.
 *  - `BrowserNotificationService` — dev-mode no-op that logs to the console.
 */
export interface INotificationService {
  scheduleNotification(payload: NotificationPayload): Promise<void> | void;
  cancelNotification(id: string): Promise<void> | void;
  cancelAll(moduleId?: string): Promise<void> | void;
  /** Cancel every ARMED notification whose original id starts with `prefix`, except those in `keep`. */
  cancelByPrefix?(prefix: string, keep?: ReadonlySet<string>): Promise<void> | void;
  /**
   * One-shot migration: cancel daily reminders armed by older builds that
   * stamped the DATE into the id (`myzikr_<key>_YYYYMMDD`). Those were
   * scheduled as daily repeats, so each new day left the prior day's repeat
   * still firing and the reminder appeared to multiply. Safe to call on every
   * boot — a no-op once the historical pile-up is cleared.
   */
  purgeLegacyDatedReminders?(): Promise<void> | void;
  requestPermission(): Promise<boolean> | boolean;
  isAvailable(): boolean;
  vibrate(durationMs?: number): Promise<void> | void;
  /** Idempotent setup — registers action types, channels, etc. */
  initialize?(): Promise<void> | void;
  /** What is armed right now, soonest first (for the «القادم» timeline). */
  getPending?(): Promise<PendingItem[]>;
}

/**
 * SERIES of a notification id — every occurrence of one reminder (each 30-min
 * wird nudge, each day's adhan for Fajr, a snooze of it…) shares a series.
 * The patched plugin posts under the series' DISPLAY id, so a new fire
 * REPLACES the previous one in the shade instead of stacking. Alarm ids stay
 * unique per occurrence (hashIdToInt(id)) so scheduling is untouched.
 */
export function seriesKeyFor(id: string): string {
  const s = id.replace(/^myzikr_snooze_/, 'myzikr_');
  let m: RegExpExecArray | null;
  if ((m = /^myzikr_prayer_(?:pre|time|iqama)_([a-z]+)_d\d+$/.exec(s))) return `prayer_${m[1]}`;
  if ((m = /^myzikr_target_(.+)_\d+$/.exec(s))) return `target_${m[1]}`;
  if ((m = /^myzikr_habits_(.+)_\d{4}$/.exec(s))) return `habits_${m[1]}`;
  if ((m = /^myzikr_study_task_([a-z0-9]+)/.exec(s))) return `study_task_${m[1]}`;
  if ((m = /^myzikr_study_([a-z0-9]+)_/.exec(s))) return `study_${m[1]}`;
  if (s.startsWith('myzikr_insp_')) return 'insp';
  if (s.startsWith('myzikr_fast_') || s === 'myzikr_fasting') return 'fasting';
  if (s.startsWith('myzikr_special_')) return 'special';
  if (s === 'myzikr_smart_qiyamnight') return 'qiyam'; // only one of fixed/smart qiyam is armed
  return s.replace(/^myzikr_/, '');
}

/** Android display id (shade slot) shared by a whole series. */
export function displayIdFor(id: string): number {
  return hashIdToInt(`series:${seriesKeyFor(id)}`);
}

/** One armed notification, normalised for display. */
export interface PendingItem {
  /** Original string id (`myzikr_…`). */
  id: string;
  title: string;
  body: string;
  /** Next fire time (repeats resolved to their next occurrence). */
  at: Date;
  repeat: 'none' | 'daily' | 'weekly';
  moduleId: string;
  soundKey?: string;
}

/** Next fire time of a stored schedule — pure, shared by the services + tests. */
export function nextFireTime(
  s: { at?: number; repeat?: string; hour?: number; minute?: number; weekday?: number },
  now: Date = new Date(),
): Date | null {
  if (s.repeat === 'daily' || s.repeat === 'weekly') {
    if (s.hour == null || s.minute == null) return null;
    const t = new Date(now);
    t.setHours(s.hour, s.minute, 0, 0);
    if (s.repeat === 'weekly' && s.weekday != null) {
      // weekday is Capacitor-style: 1 = Sunday … 7 = Saturday.
      t.setDate(t.getDate() + ((s.weekday - 1 - t.getDay() + 7) % 7));
      if (t <= now) t.setDate(t.getDate() + 7);
    } else if (t <= now) {
      t.setDate(t.getDate() + 1);
    }
    return t;
  }
  return typeof s.at === 'number' && Number.isFinite(s.at) ? new Date(s.at) : null;
}

/**
 * Convert an arbitrary stable string ID (e.g. `myzikr_quran_20260526`)
 * into a deterministic non-negative 31-bit integer for the Capacitor /
 * Android side. Uses a simple FNV-1a-like fold; collisions are vanishingly
 * unlikely within our small set of module IDs.
 */
export function hashIdToInt(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) & 0x7fffffff;
}
