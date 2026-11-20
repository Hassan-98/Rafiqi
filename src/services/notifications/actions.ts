/**
 * Notification ACTIONS — which buttons a notification carries, and what they
 * do when tapped. Pure mapping helpers live at the top (checked by
 * scripts/notifications.test.ts); the runtime handler at the bottom is wired
 * once from main.tsx.
 *
 * Action types (registered in CapacitorNotificationService.initialize):
 *  - `reminder` — «ذكّرني بعد ١٠ د» + «✓ تم»      (adhkar, Qur'an, qiyam, du'a, study/tasks)
 *  - `prayer`   — «ذكّرني بعد ١٠ د» + «✓ صلّيت»   (adhan + iqama, logs THAT prayer)
 *  - `snooze`   — «ذكّرني بعد ١٠ د» only           (habits, awrad, custom, fasting, pre-adhan…)
 *  - `info`     — no buttons                       (smart nudges, summaries, آية وحديث, tests)
 *  - `silat_call` / `silat_call_wa` — «اتصل» (+ «واتساب») + «ذكّرني» on a «صلة الرحم»
 *    reminder about someone with a number (meta.person / meta.silat, silatPhone.ts)
 *
 * «تم» used to be on EVERY notification and called markModuleComplete(moduleId)
 * blindly: tapping it on an adhan marked all five prayers done, and on a
 * custom/target/habit/fasting reminder it logged a fake module ('custom',
 * 'targets', …) that inflated active-day stats and streaks.
 */

import type { NotificationPayload } from '@/types';

export type ActionKind = 'reminder' | 'prayer' | 'snooze' | 'info' | 'silat_call' | 'silat_call_wa';

export const ACTION_TYPES: { id: ActionKind; actions: { id: string; title: string }[] }[] = [
  { id: 'reminder', actions: [{ id: 'snooze', title: 'ذكّرني بعد ١٠ د' }, { id: 'done', title: '✓ تم' }] },
  { id: 'prayer', actions: [{ id: 'snooze', title: 'ذكّرني بعد ١٠ د' }, { id: 'done', title: '✓ صلّيت' }] },
  { id: 'snooze', actions: [{ id: 'snooze', title: 'ذكّرني بعد ١٠ د' }] },
  { id: 'info', actions: [] },
  { id: 'silat_call', actions: [{ id: 'silat_call', title: 'اتصل' }, { id: 'snooze', title: 'ذكّرني بعد ١٠ د' }] },
  {
    id: 'silat_call_wa',
    actions: [{ id: 'silat_call', title: 'اتصل' }, { id: 'silat_wa', title: 'واتساب' }, { id: 'snooze', title: 'ذكّرني بعد ١٠ د' }],
  },
];

/** Modules whose «تم» maps to a real, honest completion record. */
const DONE_MODULE: Record<string, string> = {
  'dhikr.morning': 'dhikr',
  'dhikr.evening': 'dhikr',
  dhikr: 'dhikr',
  quran: 'quran',
  qiyam: 'qiyam',
  duaa: 'duaa',
};

export function actionKindFor(p: Pick<NotificationPayload, 'moduleId' | 'meta'>): ActionKind {
  const m = String(p.moduleId ?? '');
  if (m.startsWith('smart') || m === 'test' || m === 'inspiration') return 'info';
  // «تم» handled by studyReminders.handleStudyNotificationAction (lesson / task done).
  if (m === 'study' || m === 'study.task') return 'reminder';
  if (m === 'prayers') return p.meta?.prayer && p.meta.kind !== 'pre' ? 'prayer' : 'snooze';
  if (m === 'silat') return p.meta?.silat === 'call_wa' ? 'silat_call_wa' : p.meta?.silat === 'call' ? 'silat_call' : 'snooze';
  return m in DONE_MODULE ? 'reminder' : 'snooze';
}

/** progressStore module to mark for «تم», or null when «تم» must not log anything. */
export function doneModuleFor(moduleId: string | undefined): string | null {
  return (moduleId && DONE_MODULE[moduleId]) || null;
}

/**
 * Stable snooze id: snoozing twice overwrites instead of stacking, and it
 * lives OUTSIDE the `myzikr_prayer_` family so the prayer re-arm never wipes a
 * pending snooze. `cancelAll(<module>)` still reaches it (same `_<module>` tail).
 */
export function snoozeIdFor(originalId: string): string {
  if (originalId.startsWith('myzikr_snooze_')) return originalId;
  return `myzikr_snooze_${originalId.replace(/^myzikr_/, '')}`;
}

// ── runtime ────────────────────────────────────────────────────────────────

export interface ActionExtra {
  deepLinkPath?: string;
  moduleId?: string;
  originalId?: string;
  soundKey?: import('./sounds').SoundKey;
  customChannelId?: string;
  meta?: Record<string, string>;
}

let lastDeepLinkAt = 0;
/** When a notification / deep link last opened a screen (the mindful reminder stays quiet that session). */
export const lastDeepLinkTime = (): number => lastDeepLinkAt;

/** Hash-router navigation for a `/#/…` deep link (cold + warm start). */
export function navigateToDeepLink(path?: string | null): void {
  if (!path || typeof path !== 'string') return;
  lastDeepLinkAt = Date.now();
  const normalized = path.startsWith('/#') ? path : `/#${path.startsWith('/') ? '' : '/'}${path}`;
  const hash = normalized.slice(1); // '#/module/x'
  if (window.location.hash !== hash) window.location.hash = hash;
}

export async function handleNotificationAction(event: {
  actionId: string;
  notification?: { title?: string; body?: string; extra?: unknown };
}): Promise<void> {
  const extra = (event.notification?.extra ?? {}) as ActionExtra;

  // Study circles / tasks own their «تم» (attendance, task tick) — must run
  // before the generic path, which would otherwise log a fake 'study' module.
  if (extra.moduleId === 'study' || extra.moduleId === 'study.task') {
    const { handleStudyNotificationAction } = await import('@/services/studyReminders');
    if (handleStudyNotificationAction(event.actionId, extra)) return;
  }

  if (event.actionId === 'silat_call' || event.actionId === 'silat_wa') {
    const { handleSilatNotificationAction } = await import('@/services/silatPhone');
    await handleSilatNotificationAction(event.actionId, extra.meta);
    return;
  }

  if (event.actionId === 'snooze' && extra.originalId) {
    const { notificationService } = await import('@/services/NotificationService');
    const snoozeAt = new Date(Date.now() + 10 * 60 * 1000);
    try {
      await notificationService.scheduleNotification({
        id: snoozeIdFor(extra.originalId),
        title: event.notification?.title ?? 'تذكير',
        body: event.notification?.body ?? '',
        triggerTime: snoozeAt.toISOString(),
        repeatInterval: 'none',
        moduleId: extra.moduleId ?? 'snooze',
        deepLinkPath: extra.deepLinkPath ?? '/#/',
        soundKey: extra.soundKey,
        customChannelId: extra.customChannelId,
        meta: extra.meta,
      });
      const { toast } = await import('@/store/toastStore');
      toast.info('سنذكّرك بعد ١٠ دقائق');
    } catch (e) {
      console.warn('[notif] snooze failed', e);
    }
    return;
  }

  if (event.actionId === 'done') {
    try {
      await markDone(extra);
    } catch (e) {
      console.warn('[notif] mark done failed', e);
    }
    return;
  }

  // Default tap (or any unknown action) → open the related screen.
  navigateToDeepLink(extra.deepLinkPath);
}

async function markDone(extra: ActionExtra): Promise<void> {
  const { toast } = await import('@/store/toastStore');
  const prayer = extra.meta?.prayer as import('@/types').PrayerName | undefined;
  if (extra.moduleId === 'prayers' && prayer) {
    const [{ usePrayerLogStore }, { dateKeyOf }] = await Promise.all([
      import('@/store/prayerLogStore'),
      import('@/services/statsService'),
    ]);
    const dateKey = extra.meta?.dateKey || dateKeyOf(new Date());
    // The store keeps the day's aggregate record (streaks/badges) in step.
    usePrayerLogStore.getState().setPrayer(dateKey, prayer, 'fard', true);
    toast.success('تقبّل الله', `سُجّلت صلاة ${extra.meta?.name ?? ''}`.trim());
    return;
  }
  const mod = doneModuleFor(extra.moduleId);
  if (!mod) {
    navigateToDeepLink(extra.deepLinkPath);
    return;
  }
  if (mod === 'qiyam') {
    // Night-keyed + keeps the rakaat record (see qiyamStore).
    const q = await import('@/store/qiyamStore');
    const last = Object.values(q.useQiyamStore.getState().nights).sort((x, y) => y.loggedAt - x.loggedAt)[0];
    q.useQiyamStore.getState().logNight({ rakaat: last?.rakaat ?? 2, witr: last?.witr ?? true });
  } else {
    const { useProgressStore } = await import('@/store/progressStore');
    useProgressStore.getState().markModuleComplete(mod);
  }
  toast.success('تقبّل الله', 'سُجّل في يومك');
}
