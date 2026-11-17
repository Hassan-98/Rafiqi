import { Capacitor } from '@capacitor/core';
import { notificationService } from '@/services/NotificationService';
import { fullScreenAlarm } from './fullScreenAlarm';

/**
 * ONE place that (re)arms every reminder family (prayers, fasting, Islamic
 * days, module/azkar, awrad, custom, habits, study/tasks, آية وحديث). Called at boot (forced) and
 * on every app resume (throttled).
 *
 * Why resume matters: the Capacitor plugin arms the FIRST occurrence of a
 * repeating reminder with setExactAndAllowWhileIdle, but re-arms every later
 * one with a plain RTC setExact — which Doze defers, often by hours. Re-arming
 * on resume keeps the next occurrence Doze-proof for anyone who opens the app
 * daily, and extends the finite windows (prayers d0..d4, awrad occurrences).
 */

const THROTTLE_MS = 30 * 60 * 1000;
const EXACT_KEY = 'myzikr:notif-exact-ok';
let last = 0;
let running: Promise<void> | null = null;

export function rearmAllReminders(opts: { force?: boolean } = {}): Promise<void> {
  if (running) return running;
  if (!opts.force && Date.now() - last < THROTTLE_MS) {
    // Still catch the one thing that must not wait: prayers for a new day/timezone.
    return (async () => {
      const { prayerTimeNotificationScheduler } = await import('@/services/PrayerTimeNotificationScheduler');
      await prayerTimeNotificationScheduler.schedule(await exactAlarmFlipped());
    })();
  }
  last = Date.now();
  running = run(!!opts.force).finally(() => {
    running = null;
  });
  return running;
}

/**
 * True when exact-alarm access changed since last check (granted in system
 * settings → everything armed inexact before must be re-armed exact).
 */
async function exactAlarmFlipped(): Promise<boolean> {
  const st = await fullScreenAlarm.getStatus();
  if (!st) return false;
  const now = st.exactAlarm ? '1' : '0';
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(EXACT_KEY);
    localStorage.setItem(EXACT_KEY, now);
  } catch {
    /* ignore */
  }
  return prev !== null && prev !== now;
}

async function run(force: boolean): Promise<void> {
  if (!notificationService.isAvailable()) return;
  // Non-persistent services (desktop timers) lose everything on reload, so the
  // per-day idempotency keys must not short-circuit them.
  const hard = force && !Capacitor.isNativePlatform();
  const flipped = await exactAlarmFlipped();

  const step = async (name: string, fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`[rearm] ${name} failed`, e);
    }
  };

  const [{ prayerTimeNotificationScheduler }, { fastingReminderScheduler }, { islamicCalendarScheduler }] =
    await Promise.all([
      import('@/services/PrayerTimeNotificationScheduler'),
      import('@/services/FastingReminderScheduler'),
      import('@/services/IslamicCalendarScheduler'),
    ]);

  await step('prayers', () => prayerTimeNotificationScheduler.schedule(hard || flipped));
  await step('fasting', () => fastingReminderScheduler.schedule(hard || flipped));
  await step('calendar', () => islamicCalendarScheduler.schedule(hard || flipped));

  // Fixed-time module/azkar reminders (also re-points them at the current
  // channel version after a bump).
  await step('modules', async () => {
    const { useNotificationStore } = await import('@/store/notificationStore');
    useNotificationStore.getState().scheduleAll();
  });
  // Awrad: rolls elapsed periods over and extends the capped occurrence window.
  await step('awrad', async () => {
    const { useTargetsStore } = await import('@/store/targetsStore');
    useTargetsStore.getState().rescheduleAll();
  });
  await step('custom', async () => {
    const { useCustomRemindersStore } = await import('@/store/customRemindersStore');
    useCustomRemindersStore.getState().rescheduleAll();
  });
  await step('habits', async () => {
    const [{ useSettingsStore }, { rescheduleAllHabits }] = await Promise.all([
      import('@/store/settingsStore'),
      import('@/services/habitReminders'),
    ]);
    rescheduleAllHabits(useSettingsStore.getState().customHabits);
  });
  // «العلم والمهام» circles + tasks (diff-based; also starts following their stores).
  await step('study', async () => {
    const { rescheduleAllStudy } = await import('@/services/studyReminders');
    await rescheduleAllStudy();
  });
  // «آية وحديث» rolling horizon (fixed slot ids myzikr_insp_0…).
  await step('inspiration', async () => {
    const { rescheduleInspiration } = await import('@/services/inspirationReminders');
    await rescheduleInspiration();
  });
}
