import { notificationService } from '@/services/NotificationService';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import { planStudyReminders, type PlannedNotif } from '@/store/studyModel';

/**
 * «العلم والمهام» reminders — diff-based sync against the public notification API.
 *
 * `planStudyReminders` (pure, studyModel.ts) lists everything that should be
 * armed. We remember what we armed last time (id → signature) and only:
 *  - cancel ids that disappeared from the plan (circle paused, task deleted…),
 *  - (re)schedule ids whose content/time changed.
 * One-shots whose time already passed are dropped from memory WITHOUT a cancel,
 * so a delivered notification isn't yanked from the tray on the next sync.
 *
 * Ids (never dated — see the stable-id rule):
 *  myzikr_study_{circleId}_{slotIdx}_{offsetMin}   weekly repeat per slot × offset
 *  myzikr_study_{circleId}_x{sessionId}_{offset}   one-off session
 *  myzikr_study_{circleId}_goal                    series daily goal (daily)
 *  myzikr_study_task_{taskId}                      one-off task
 *  myzikr_study_task_{taskId}_d | _w{0-6} | _m     recurring task (daily / weekly per weekday / next monthly)
 *  myzikr_study_task_{taskId}_snz                  snooze
 */

const MEMORY_KEY = 'myzikr:study-notif';

interface Armed {
  sig: string;
  at: number;
  repeat: PlannedNotif['repeat'];
}

function load(): Record<string, Armed> {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Record<string, Armed>;
  } catch {
    return {};
  }
}

function save(m: Record<string, Armed>): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* quota — next sync rebuilds */
  }
}

/** Repeating notifs keep a stable signature as their next fire rolls forward. */
function signature(p: PlannedNotif): string {
  const d = new Date(p.at);
  const when = p.repeat === 'none' ? p.at : `${p.repeat}:${p.repeat === 'weekly' ? d.getDay() : ''}:${d.getHours()}:${d.getMinutes()}`;
  return JSON.stringify([p.title, p.body, when, p.soundKey, p.fullScreen ?? false, p.deepLinkPath]);
}

async function run(force: boolean): Promise<void> {
  const now = Date.now();
  const plan = planStudyReminders(useStudyStore.getState().circles, useTasksStore.getState().tasks, now);
  const prev = load();
  const next: Record<string, Armed> = {};
  const wanted = new Set(plan.map((p) => p.id));

  for (const [id, a] of Object.entries(prev)) {
    if (wanted.has(id)) continue;
    if (a.repeat === 'none' && a.at <= now) continue; // already fired — leave it in the tray
    await notificationService.cancelNotification(id);
  }

  for (const p of plan) {
    const sig = signature(p);
    next[p.id] = { sig, at: p.at, repeat: p.repeat };
    if (!force && prev[p.id]?.sig === sig) continue;
    try {
      await notificationService.scheduleNotification({
        id: p.id,
        title: p.title,
        body: p.body,
        triggerTime: new Date(p.at).toISOString(),
        repeatInterval: p.repeat,
        moduleId: p.moduleId,
        deepLinkPath: p.deepLinkPath,
        soundKey: p.soundKey,
        fullScreen: p.fullScreen,
      });
    } catch (e) {
      delete next[p.id]; // retry on the next sync
      console.warn('[studyReminders] schedule failed', p.id, e);
    }
  }
  save(next);
}

// Serialise runs so a cancel can never interleave with a schedule of the same id.
let chain: Promise<void> = Promise.resolve();
function enqueue(force: boolean): Promise<void> {
  chain = chain.then(() => run(force)).catch((e) => console.warn('[studyReminders] sync failed', e));
  return chain;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

/**
 * Re-arm every study/task reminder (force-reschedules, so channel or sound
 * changes take effect) and start following store changes. Call on boot and on
 * resume; safe to call repeatedly.
 */
export function rescheduleAllStudy(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void enqueue(false), 600);
    };
    useStudyStore.subscribe(soon);
    useTasksStore.subscribe(soon);
  }
  return enqueue(true);
}

/**
 * Notification action hook for main.tsx's `localNotificationActionPerformed`:
 * call it FIRST and `return` when it yields true. Without it, «✓ تم» on a study
 * notification falls through to markModuleComplete('study') — a fake module.
 *  - study.task + done → ticks today's occurrence of the task
 *  - study      + done → logs attendance / a watched lesson for the circle
 */
export function handleStudyNotificationAction(
  actionId: string,
  extra: { moduleId?: string; deepLinkPath?: string },
): boolean {
  if (extra.moduleId !== 'study' && extra.moduleId !== 'study.task') return false;
  if (actionId !== 'done') return false; // taps + snooze use the generic path
  const path = extra.deepLinkPath ?? '';
  if (extra.moduleId === 'study.task') {
    const id = path.match(/[?&]task=([^&]+)/)?.[1];
    if (id) useTasksStore.getState().setTaskDone(id, true);
  } else {
    const id = path.match(/\/study\/circle\/([^/?]+)/)?.[1];
    if (id) useStudyStore.getState().markLessonDone(id);
  }
  return true;
}
