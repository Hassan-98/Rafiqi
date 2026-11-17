import { notificationService } from '@/services/NotificationService';
import type { CustomHabit } from '@/types';

/**
 * Per-habit daily reminders.
 *
 * Each habit can have several daily fire times (e.g. 00:00 + 12:00). Every
 * time becomes its own repeating daily notification, so we mint a stable id
 * per (habit, time). The `_habits_` infix lets `cancelAll('habits')` sweep
 * them all, and routes them onto the `habits` ringtone channel (or a custom
 * user-picked one) — mirroring how `customRemindersStore` schedules.
 */

const DEEP_LINK = '/#/habits';

/** Stable notification id for a habit's reminder at a given time. */
function reminderId(habitId: string, time: string): string {
  return `myzikr_habits_${habitId}_${time.replace(':', '')}`;
}

/** Next occurrence of "HH:mm" — today if still ahead, else tomorrow. */
function nextOccurrenceIso(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const t = new Date();
  t.setHours(h || 0, m || 0, 0, 0);
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  return t.toISOString();
}

/** Cancel every reminder previously scheduled for these times. */
function cancelTimes(habitId: string, times: string[]): void {
  for (const time of times) {
    void notificationService.cancelNotification(reminderId(habitId, time));
  }
}

/**
 * (Re)schedule a habit's reminders. Cancels any previously-known times first
 * (pass `prevTimes` when editing so removed times are cleared), then schedules
 * one repeating daily notification per current time when the reminder is on.
 */
export function scheduleHabit(habit: CustomHabit, prevTimes: string[] = []): void {
  // Clear stale schedules (old times that were removed/renamed, or all of them
  // when the reminder is being turned off).
  const stale = prevTimes.filter((t) => !habit.reminder?.enabled || !habit.reminder.times.includes(t));
  cancelTimes(habit.id, stale);

  const reminder = habit.reminder;
  if (!reminder?.enabled || reminder.times.length === 0) return;

  for (const time of reminder.times) {
    void notificationService.scheduleNotification({
      id: reminderId(habit.id, time),
      title: `${habit.icon ?? '⭐'} ${habit.nameAr}`,
      body: 'حان وقت عادتك اليومية 🌿',
      triggerTime: nextOccurrenceIso(time),
      repeatInterval: 'daily',
      moduleId: 'habits',
      deepLinkPath: DEEP_LINK,
      soundKey: reminder.customChannelId ? undefined : (reminder.soundKey ?? 'habits'),
      customChannelId: reminder.customChannelId,
    });
  }
}

/** Cancel all reminders for a habit (used on delete). */
export function cancelHabit(habit: CustomHabit): void {
  cancelTimes(habit.id, habit.reminder?.times ?? []);
}

/** Re-arm all habit reminders. Call on boot to refresh repeating schedules. */
export function rescheduleAllHabits(habits: CustomHabit[]): void {
  for (const habit of habits) {
    if (habit.reminder?.enabled) scheduleHabit(habit);
  }
}
