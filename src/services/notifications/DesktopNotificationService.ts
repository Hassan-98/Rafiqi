import type { NotificationPayload } from '@/types';
import { nextFireTime, seriesKeyFor, type INotificationService, type PendingItem } from './types';
import { previewUrl, getSoundDef } from './sounds';
import { navigateToDeepLink } from './actions';

/**
 * Desktop notifications: in-process timers + the web Notification API (the
 * Tauri shell's notification plugin backs it with native toasts), with the
 * reminder's own sound from /sounds. The shell has no alarm service, so these
 * only fire while the window is open; everything is re-armed
 * at every launch (rearmAllReminders({ force: true }) bypasses the per-day keys).
 */

// setTimeout overflows past ~24.8 days; farther ones are re-armed at a later launch.
const MAX_DELAY = 2 ** 31 - 1;

interface Entry {
  payload: NotificationPayload;
  at: Date;
  timer: ReturnType<typeof setTimeout>;
}

export class DesktopNotificationService implements INotificationService {
  private entries = new Map<string, Entry>();

  isAvailable(): boolean {
    return typeof Notification !== 'undefined';
  }

  async initialize(): Promise<void> {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
  }

  scheduleNotification(payload: NotificationPayload): void {
    this.cancelNotification(payload.id);
    const d = new Date(payload.triggerTime);
    const at =
      payload.repeatInterval === 'daily' || payload.repeatInterval === 'weekly'
        ? nextFireTime({ repeat: payload.repeatInterval, hour: d.getHours(), minute: d.getMinutes(), weekday: d.getDay() + 1 })
        : d;
    if (!at) return;
    const delay = at.getTime() - Date.now();
    if (delay <= 0 || delay > MAX_DELAY) return;
    const timer = setTimeout(() => this.fire(payload), delay);
    this.entries.set(payload.id, { payload, at, timer });
  }

  private fire(payload: NotificationPayload): void {
    this.entries.delete(payload.id);
    try {
      const def = getSoundDef(payload.soundKey ?? (payload.alarm ? 'adhan_makkah' : 'default'));
      const url = previewUrl(def.key);
      if (url) void new Audio(url).play().catch(() => undefined);
      // Same tag = same series: a new fire replaces the previous one (renotify still alerts).
      const n = new Notification(payload.title, {
        body: payload.body || undefined,
        silent: !!url || def.key === 'silent',
        tag: seriesKeyFor(payload.id),
        renotify: true,
      } as NotificationOptions);
      n.onclick = () => {
        window.focus();
        navigateToDeepLink(payload.deepLinkPath);
        n.close();
      };
    } catch (e) {
      console.warn('[DesktopNotifications] fire failed', e);
    }
    if (payload.repeatInterval === 'daily' || payload.repeatInterval === 'weekly') {
      // Re-arm from the NEXT wall-clock occurrence.
      setTimeout(() => this.scheduleNotification(payload), 1000);
    }
  }

  cancelNotification(id: string): void {
    const e = this.entries.get(id);
    if (e) clearTimeout(e.timer);
    this.entries.delete(id);
  }

  private cancelWhere(pred: (id: string) => boolean): void {
    for (const id of [...this.entries.keys()]) if (pred(id)) this.cancelNotification(id);
  }

  cancelAll(moduleId?: string): void {
    this.cancelWhere((id) => (moduleId ? id.includes(`_${moduleId}_`) || id.endsWith(`_${moduleId}`) : true));
  }

  cancelByPrefix(prefix: string, keep?: ReadonlySet<string>): void {
    this.cancelWhere((id) => id.startsWith(prefix) && !keep?.has(id));
  }

  async getPending(): Promise<PendingItem[]> {
    return [...this.entries.values()]
      .map(({ payload, at }) => ({
        id: payload.id,
        title: payload.title,
        body: payload.body,
        at,
        repeat: (payload.repeatInterval === 'daily' || payload.repeatInterval === 'weekly' ? payload.repeatInterval : 'none') as PendingItem['repeat'],
        moduleId: String(payload.moduleId),
        soundKey: payload.soundKey,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  vibrate(): void {
    /* no-op on desktop */
  }
}
