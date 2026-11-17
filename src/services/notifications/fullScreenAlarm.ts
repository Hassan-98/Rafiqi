import { registerPlugin, Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Bridge to the native `FullScreenAlarm` plugin (Android only). Schedules an
 * exact alarm that raises a full-screen, incoming-call-style alarm screen at
 * the reminder's time — over other apps, waking a locked device. This runs
 * ALONGSIDE the normal LocalNotification; reminders opt in via their toggle.
 */
export interface FullScreenAlarmStatus {
  sdk: number;
  /** Can schedule exact alarms (Android 12+ gate). */
  exactAlarm: boolean;
  /** Allowed to show full-screen intents (Android 14+ gate). */
  fullScreen: boolean;
  /** Exempt from battery optimization (helps OEMs not kill the alarm). */
  batteryUnrestricted: boolean;
  /** Lower-cased `Build.MANUFACTURER` — used to decide if autostart matters. */
  manufacturer: string;
  /** App notifications switched on in system settings (absent on older native builds). */
  notificationsEnabled?: boolean;
}

/**
 * OEM skins that gate background alarms behind a separate, API-less "Autostart"
 * allowlist. For these we surface a guided deep-link; everyone else can ignore it.
 */
const AUTOSTART_OEMS = [
  'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'oneplus', 'vivo', 'iqoo',
  'huawei', 'honor', 'samsung', 'asus', 'letv', 'leeco', 'meizu',
];

/** Whether this device's manufacturer needs the manual autostart step. */
export function needsAutostart(manufacturer: string | undefined | null): boolean {
  if (!manufacturer) return false;
  const m = manufacturer.toLowerCase();
  return AUTOSTART_OEMS.some((oem) => m.includes(oem));
}

interface FullScreenAlarmPlugin {
  schedule(options: {
    id: number;
    /** Epoch milliseconds as a string (avoids JS float imprecision). */
    atMillis: string;
    durationMs: number;
    title: string;
    body: string;
    repeatDaily: boolean;
    use24h: boolean;
    /**
     * Per-reminder ringtone spec, resolved by the native alarm screen:
     * `raw:<res>` (preset), `channel:<id>` (custom file), `silent`, or '' for
     * the device default alarm tone.
     */
    sound: string;
    /** Channel whose (looping) sound the heads-up uses when the alarm screen can't take over. */
    channelId: string;
    /** Shade slot shared by the reminder's series (a new fire replaces the old heads-up). */
    displayId: number;
  }): Promise<void>;
  cancel(options: { id: number }): Promise<void>;
  openNotificationSettings(): Promise<void>;
  getStatus(): Promise<FullScreenAlarmStatus>;
  requestExactAlarm(): Promise<void>;
  requestFullScreen(): Promise<void>;
  requestIgnoreBattery(): Promise<void>;
  openAutostartSettings(): Promise<void>;
  test(options: { title?: string; body?: string; durationMs?: number; use24h?: boolean }): Promise<void>;
}

const is24h = () => useSettingsStore.getState().timeFormat === '24h';

const plugin = registerPlugin<FullScreenAlarmPlugin>('FullScreenAlarm');

const isAndroid = () => Capacitor.getPlatform() === 'android';

export const fullScreenAlarm = {
  async schedule(args: {
    id: number;
    atMillis: number;
    durationMs?: number;
    title: string;
    body?: string;
    repeatDaily?: boolean;
    /** Ringtone spec — see the plugin interface. Empty = device default. */
    sound?: string;
    channelId?: string;
    displayId?: number;
  }): Promise<boolean> {
    if (!isAndroid()) return false;
    try {
      await plugin.schedule({
        id: args.id,
        atMillis: String(Math.round(args.atMillis)),
        durationMs: args.durationMs ?? 10000,
        title: args.title,
        body: args.body ?? '',
        repeatDaily: args.repeatDaily ?? false,
        use24h: is24h(),
        sound: args.sound ?? '',
        channelId: args.channelId ?? '',
        displayId: args.displayId ?? args.id,
      });
      return true;
    } catch (e) {
      // Typically exact alarms not permitted (Android 12+) — the caller then
      // keeps the regular, sounded notification instead.
      console.warn('[fullScreenAlarm] schedule failed', e);
      return false;
    }
  },

  /** Open this app's system notification settings (the only fix once permission is denied). */
  async openNotificationSettings(): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.openNotificationSettings();
    } catch {
      /* older native build — nothing to open */
    }
  },

  async cancel(id: number): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.cancel({ id });
    } catch (e) {
      console.warn('[fullScreenAlarm] cancel failed', e);
    }
  },

  /** Null when not on Android or the native plugin isn't present (web/old build). */
  async getStatus(): Promise<FullScreenAlarmStatus | null> {
    if (!isAndroid()) return null;
    try {
      return await plugin.getStatus();
    } catch {
      return null;
    }
  },

  async requestExactAlarm(): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.requestExactAlarm();
    } catch {
      /* ignore */
    }
  },

  async requestFullScreen(): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.requestFullScreen();
    } catch {
      /* ignore */
    }
  },

  async requestIgnoreBattery(): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.requestIgnoreBattery();
    } catch {
      /* ignore */
    }
  },

  /** Open the OEM autostart/background-start allowlist screen (best-effort). */
  async openAutostartSettings(): Promise<void> {
    if (!isAndroid()) return;
    try {
      await plugin.openAutostartSettings();
    } catch {
      /* ignore */
    }
  },

  async test(): Promise<boolean> {
    if (!isAndroid()) return false;
    try {
      await plugin.test({ use24h: is24h() });
      return true;
    } catch (e) {
      console.warn('[fullScreenAlarm] test failed', e);
      return false;
    }
  },
};
