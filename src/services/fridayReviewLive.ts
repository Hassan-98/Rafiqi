/**
 * «محاسبة الجمعة» — the store-reading side: the review input, the week's
 * leaderboard points and the weekly reminder. The logic is in fridayReview.ts.
 */
import { collectBadgeSnapshot } from '@/services/BadgeEngine';
import { localScore } from '@/services/leaderboard';
import { notificationService } from '@/services/NotificationService';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { nextReminderAt, type ReviewInput } from '@/services/fridayReview';
import { MUHASABA_VERSE } from '@/services/fridayReviewContent';
// Registers صلة الرحم / برامج التدرّج / القضاء before any review is computed.
import '@/services/fridayReviewSections';
import { useFridayReviewStore } from '@/store/fridayReviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useTasksStore } from '@/store/tasksStore';

export function collectReviewInput(): ReviewInput {
  const s = collectBadgeSnapshot();
  return {
    gender: s.gender,
    prayerLog: s.prayerLog,
    excused: s.excused,
    duha: s.duha,
    qiyam: s.qiyam,
    events: s.events,
    dailyProgress: s.dailyProgress,
    mushafiDays: s.mushafi.days,
    awradHistory: s.awradHistory,
    targets: useTargetsStore.getState().targets,
    sadaqah: s.sadaqah,
    tasks: useTasksStore.getState().tasks,
  };
}

/** «الترتيب» points of these days (local scoring; nothing of the review is uploaded). */
export const pointsOver = (days: string[]): number => days.reduce((t, k) => t + localScore(k).total, 0);

// ── reminder ───────────────────────────────────────────────────────────────
/** Stable id, weekly repeat (never dated — the stable-id rule). */
export const FRIDAY_REVIEW_NOTIF_ID = 'myzikr_friday_review';

function asrOn(day: Date): Date | null {
  const { coords, prayerMethod, madhabSchool } = useSettingsStore.getState();
  if (!coords) return null;
  try {
    return prayerTimeService.getTimes(coords, day, prayerMethod, madhabSchool).asr;
  } catch {
    return null;
  }
}

async function sync(): Promise<void> {
  const r = useFridayReviewStore.getState().reminder;
  if (!r.on) {
    await notificationService.cancelNotification(FRIDAY_REVIEW_NOTIF_ID);
    return;
  }
  // «بعد العصر» follows Asr through the year: every boot/resume re-arms it at the coming week's time.
  await notificationService.scheduleNotification({
    id: FRIDAY_REVIEW_NOTIF_ID,
    title: 'محاسبة الجمعة',
    body: `﴿${MUHASABA_VERSE.text}﴾ — دقائق مع نفسك قبل أن يمضي الأسبوع`,
    triggerTime: nextReminderAt(r, new Date(), asrOn).toISOString(),
    repeatInterval: 'weekly',
    moduleId: 'friday-review',
    deepLinkPath: '/#/friday-review',
    soundKey: 'default',
  });
}

let chain: Promise<void> = Promise.resolve();
let subscribed = false;

/** Arm (or cancel) the weekly reminder and follow its settings. Boot + resume; idempotent. */
export function rescheduleFridayReview(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    useFridayReviewStore.subscribe((s, prev) => {
      if (s.reminder !== prev.reminder) void rescheduleFridayReview();
    });
  }
  chain = chain.then(sync).catch((e) => console.warn('[fridayReview] reminder failed', e));
  return chain;
}
