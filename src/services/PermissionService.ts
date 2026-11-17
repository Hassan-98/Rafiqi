import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

const KEY_REQUESTED_AT = 'permissions:notifications-requested-at';

export interface PermissionStatus {
  notifications: 'granted' | 'denied' | 'prompt' | 'unsupported';
  exactAlarm: 'granted' | 'denied' | 'prompt' | 'unsupported';
}

class PermissionService {
  /** Returns current notification + exact-alarm status without requesting. */
  async getStatus(): Promise<PermissionStatus> {
    if (!Capacitor.isNativePlatform()) {
      return { notifications: 'unsupported', exactAlarm: 'unsupported' };
    }

    let notif: PermissionStatus['notifications'] = 'prompt';
    try {
      const r = await LocalNotifications.checkPermissions();
      notif =
        r.display === 'granted'
          ? 'granted'
          : r.display === 'denied'
            ? 'denied'
            : 'prompt';
    } catch {
      /* ignore */
    }

    let exact: PermissionStatus['exactAlarm'] = 'prompt';
    try {
      // Capacitor 7+: checkExactNotificationSetting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (LocalNotifications as any).checkExactNotificationSetting;
      if (typeof fn === 'function') {
        const r = await fn.call(LocalNotifications);
        exact = r?.exact_alarm === 'granted' ? 'granted' : r?.exact_alarm === 'denied' ? 'denied' : 'prompt';
      } else {
        exact = 'unsupported';
      }
    } catch {
      exact = 'unsupported';
    }

    return { notifications: notif, exactAlarm: exact };
  }

  /** Returns true if notifications are granted after the request. */
  async requestNotifications(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const r = await LocalNotifications.requestPermissions();
      await Preferences.set({ key: KEY_REQUESTED_AT, value: new Date().toISOString() });
      return r.display === 'granted';
    } catch {
      return false;
    }
  }

  /** Opens system settings for exact-alarm permission (Android 12+). */
  async requestExactAlarm(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (LocalNotifications as any).changeExactNotificationSetting;
      if (typeof fn === 'function') {
        await fn.call(LocalNotifications);
      }
    } catch {
      /* ignore */
    }
  }

  async hasBeenAsked(): Promise<boolean> {
    try {
      const r = await Preferences.get({ key: KEY_REQUESTED_AT });
      return !!r.value;
    } catch {
      return false;
    }
  }
}

export const permissionService = new PermissionService();
