import { notificationService } from '@/services/NotificationService';
import { useSilatStore } from '@/store/silatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { planSilatReminders, type SilatNotif } from '@/store/silatModel';
import type { PlannedNotif } from '@/store/studyModel';

/**
 * «صلة الرحم» reminders — diff-based, like studyReminders: remember what was
 * armed (id → signature), cancel ids that left the plan, (re)schedule changed
 * ones. A one-shot whose time passed is forgotten WITHOUT a cancel so it stays
 * in the tray. Ids are stable (see planSilatReminders).
 *
 * The memory key has no `myzikr:` prefix on purpose: it is this device's
 * alarm list and must not sync to the cloud.
 */
const MEMORY_KEY = 'silat-notif';

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
    /* quota — the next sync rebuilds */
  }
}

/** A daily repeat keeps its signature while its next fire rolls forward. */
function signature(p: SilatNotif): string {
  const d = new Date(p.at);
  const when = p.repeat === 'none' ? p.at : `${p.repeat}:${d.getHours()}:${d.getMinutes()}`;
  return JSON.stringify([p.title, p.body, when, p.deepLinkPath, p.meta ?? null]);
}

async function run(force: boolean): Promise<void> {
  const now = Date.now();
  const { people, entries, prefs } = useSilatStore.getState();
  const plan = planSilatReminders(people, entries, prefs, now, useSettingsStore.getState().gender);
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
        meta: p.meta,
      });
    } catch (e) {
      delete next[p.id]; // retry on the next sync
      console.warn('[silatReminders] schedule failed', p.id, e);
    }
  }
  save(next);
}

let chain: Promise<void> = Promise.resolve();
function enqueue(force: boolean): Promise<void> {
  chain = chain.then(() => run(force)).catch((e) => console.warn('[silatReminders] sync failed', e));
  return chain;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

/**
 * Re-arm every «صلة الرحم» reminder and start following the store. Call on
 * boot and on resume (the digest's names are for the next fire day, so a new
 * day needs a fresh plan); safe to call repeatedly. The first call also starts
 * the opt-in call-log import (Android, on start + every resume).
 */
export function rescheduleAllSilat(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    void import('@/services/silatPhone').then((m) => m.startCallLogSync());
    useSilatStore.subscribe((s, p) => {
      if (s.people === p.people && s.entries === p.entries && s.prefs === p.prefs) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void enqueue(false), 600);
    });
  }
  return enqueue(true);
}
