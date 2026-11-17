import type { NotificationPayload } from '@/types';
import type { INotificationService } from './types';

/**
 * Dev-mode notification service. Logs intended actions to the console so we
 * can still develop in `npm run dev` without a native Android shell.
 */
export class BrowserNotificationService implements INotificationService {
  isAvailable(): boolean {
    return false;
  }

  initialize(): void {
    console.info('[NotificationService] Browser mode — notifications are no-ops.');
  }

  scheduleNotification(payload: NotificationPayload): void {
    console.warn('[NotificationService] (browser) would have scheduled:', payload);
  }

  cancelNotification(id: string): void {
    console.warn(`[NotificationService] (browser) would have cancelled: ${id}`);
  }

  cancelAll(moduleId?: string): void {
    console.warn(`[NotificationService] (browser) cancelAll${moduleId ? ` for ${moduleId}` : ''}`);
  }

  purgeLegacyDatedReminders(): void {
    console.warn('[NotificationService] (browser) purgeLegacyDatedReminders is a no-op.');
  }

  requestPermission(): boolean {
    console.warn('[NotificationService] (browser) requestPermission is a no-op.');
    return false;
  }

  vibrate(durationMs = 50): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  }
}
