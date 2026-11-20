import { notificationService } from '@/services/NotificationService';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { useQadaStore } from '@/store/qadaStore';
import { QADA_NOTIF_IDS, QADA_NOTIF_PREFIX, planQadaReminders, type QadaNotif } from '@/services/qadaPlan';

/**
 * «قضاء ما فات» reminders: the daily plan, the eve of the next planned fast,
 * and the pre-Ramadan alerts (30 / 7 days). Fixed stable ids (qadaPlan.ts).
 * Schedules what changed, then cancels the qada ids no longer wanted (pending
 * only — a delivered one-shot stays in the tray).
 */

/** id → signature of what we armed this session (boot forces a full re-arm). */
const armed = new Map<string, string>();

function signature(n: QadaNotif): string {
  const d = new Date(n.at);
  return JSON.stringify([n.body, n.repeat === 'daily' ? `${d.getHours()}:${d.getMinutes()}` : n.at]);
}

async function run(force: boolean): Promise<void> {
  if (!notificationService.isAvailable()) return;
  const plan = planQadaReminders(useQadaStore.getState(), new Date(), useCalendarPrefs.getState().hijriOffset);
  const wanted = new Set(plan.map((n) => n.id));

  for (const n of plan) {
    const sig = signature(n);
    if (!force && armed.get(n.id) === sig) continue;
    try {
      await notificationService.scheduleNotification({
        id: n.id,
        title: n.title,
        body: n.body,
        triggerTime: new Date(n.at).toISOString(),
        repeatInterval: n.repeat,
        moduleId: 'qada',
        deepLinkPath: n.id === 'myzikr_qada_daily' ? '/#/qada' : '/#/qada?tab=fasts',
        soundKey: 'target',
      });
      armed.set(n.id, sig);
    } catch (e) {
      armed.delete(n.id);
      console.warn('[qadaReminders] schedule failed', n.id, e);
    }
  }

  if (notificationService.cancelByPrefix) {
    await notificationService.cancelByPrefix(QADA_NOTIF_PREFIX, wanted);
  } else {
    for (const id of QADA_NOTIF_IDS) if (!wanted.has(id)) await notificationService.cancelNotification(id);
  }
  for (const id of [...armed.keys()]) if (!wanted.has(id)) armed.delete(id);
}

let chain: Promise<void> = Promise.resolve();
const enqueue = (force: boolean) => {
  chain = chain.then(() => run(force)).catch((e) => console.warn('[qadaReminders] sync failed', e));
  return chain;
};

let subscribed = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Re-arm the qada reminders (forced) and follow the store from now on.
 * Call on boot / resume (rearm.ts); safe to call repeatedly.
 */
export function rescheduleQada(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    useQadaStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void enqueue(false), 600);
    });
  }
  return enqueue(true);
}
