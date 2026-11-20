import { notificationService } from '@/services/NotificationService';
import { useProgramsStore } from '@/store/programsStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { useProgressStore } from '@/store/progressStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useMushafiStore } from '@/store/mushafiStore';
import { planProgramReminders, type PlannedProgramNotif } from '@/store/programsModel';
import { prayerTimesFor, readProgramSources, reconcilePrograms } from '@/services/programsSources';

/**
 * «برامج التدرّج» reminders — a rolling week of one-shots per running program
 * (planProgramReminders), synced by diff like studyReminders: cancel ids that
 * left the plan, (re)schedule only changed ones. A step done today drops
 * today's reminder; a paused run drops all of its own.
 *
 * Ids: myzikr_prog_{runId}_{reminderIdx}_d{weekday} — stable, never dated.
 */

const MEMORY_KEY = 'myzikr:programs-notif';

interface Armed {
  sig: string;
  at: number;
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

const signature = (p: PlannedProgramNotif) => JSON.stringify([p.title, p.body, p.at, p.soundKey, p.deepLinkPath]);

async function run(force: boolean): Promise<void> {
  const now = new Date();
  reconcilePrograms(now);
  const plan = planProgramReminders(useProgramsStore.getState().runs, readProgramSources(), now, prayerTimesFor);
  const prev = load();
  const next: Record<string, Armed> = {};
  const wanted = new Set(plan.map((p) => p.id));

  for (const [id, a] of Object.entries(prev)) {
    if (wanted.has(id)) continue;
    if (a.at <= now.getTime()) continue; // already fired — leave it in the tray
    await notificationService.cancelNotification(id);
  }

  for (const p of plan) {
    const sig = signature(p);
    next[p.id] = { sig, at: p.at };
    if (!force && prev[p.id]?.sig === sig) continue;
    try {
      await notificationService.scheduleNotification({
        id: p.id,
        title: p.title,
        body: p.body,
        triggerTime: new Date(p.at).toISOString(),
        repeatInterval: 'none',
        moduleId: p.moduleId,
        deepLinkPath: p.deepLinkPath,
        soundKey: p.soundKey,
      });
    } catch (e) {
      delete next[p.id]; // retry on the next sync
      console.warn('[programsReminders] schedule failed', p.id, e);
    }
  }
  save(next);
}

let chain: Promise<void> = Promise.resolve();
function enqueue(force: boolean): Promise<void> {
  chain = chain.then(() => run(force)).catch((e) => console.warn('[programsReminders] sync failed', e));
  return chain;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

/**
 * Re-arm every program reminder (forced) and start following the programs and
 * the worship stores that verify them (a step done → today's reminder goes).
 * Call on boot and on resume; safe to call repeatedly.
 */
export function rescheduleAllPrograms(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void enqueue(false), 1500);
    };
    useProgramsStore.subscribe(soon);
    usePrayerLogStore.subscribe(soon);
    useQiyamStore.subscribe(soon);
    useProgressStore.subscribe(soon);
    useActivityLogStore.subscribe(soon);
    useMushafiStore.subscribe(soon);
  }
  return enqueue(true);
}
