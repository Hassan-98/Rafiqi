import { Capacitor } from '@capacitor/core';
import type { NotificationPayload } from '@/types';
import type { INotificationService } from './notifications/types';
import { CapacitorNotificationService } from './notifications/CapacitorNotificationService';
import { BrowserNotificationService } from './notifications/BrowserNotificationService';
import { DesktopNotificationService } from './notifications/DesktopNotificationService';

export type { INotificationService } from './notifications/types';

/** Desktop shell — its bridge (src-tauri/src/shell.js) exists before any page script runs (data-shell is only set at DOMContentLoaded). */
export const isDesktopShell = (): boolean => typeof window !== 'undefined' && !!window.desktopShell;

function createNotificationService(): INotificationService {
  if (Capacitor.isNativePlatform()) return new CapacitorNotificationService();
  // Desktop used to be a console no-op: no adhan, no reminders at all.
  if (isDesktopShell()) return new DesktopNotificationService();
  return new BrowserNotificationService();
}

export const notificationService: INotificationService = createNotificationService();

export type { NotificationPayload };
