import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { addDays, format } from 'date-fns';
import { prayerTimeService } from './PrayerTimeService';
import { useSettingsStore } from '@/store/settingsStore';
import { useNotificationStore, iqamaMinutes } from '@/store/notificationStore';
import { usePrayerModeStore } from '@/store/prayerModeStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { PRAYER_ORDER, dayWindows, mergeWindows, planWindows, type DayTimes, type PrayerWindow } from './prayerModePlan';
import type { PrayerName } from '@/types';

/**
 * Bridge to the native `PrayerMode` plugin (Android: PrayerModePlugin.java +
 * PrayerModeReceiver.java). JS computes the silence windows (prayerModePlan.ts)
 * and hands the native side a plan; AlarmManager + the receiver do the rest
 * with the app closed, and AlarmRestoreReceiver re-arms it after boot.
 */

/** Days of windows per sync. Two would do for a daily opener; a week keeps it going if the app stays closed for days. */
const PLAN_DAYS = 7;

export interface PrayerModeStatus {
  /** «الوصول إلى وضع عدم الإزعاج» granted in system settings. */
  policyAccess: boolean;
  /** A window is running right now. */
  active: boolean;
  /** Its end (epoch ms), 0 when idle. */
  activeUntil: number;
  activeLabel: string;
}

export type PrayerModeSupport =
  | { kind: 'android'; status: PrayerModeStatus }
  /** Android APK built before the plugin existed → «حدّث التطبيق». */
  | { kind: 'outdated' }
  /** Web / desktop. */
  | { kind: 'unsupported' };

interface PrayerModePlugin {
  getStatus(): Promise<PrayerModeStatus>;
  openPolicyAccess(): Promise<void>;
  /** JSON {enabled, windows, silence, ask, male, use24h}; enabled:false restores the phone and cancels everything. */
  setPlan(o: { plan: string }): Promise<void>;
  /** A one-minute window starting now. Rejects with code no_policy_access / no_exact_alarm. */
  test(o: { silence: string; use24h: boolean }): Promise<void>;
  endNow(): Promise<void>;
}

const Native = registerPlugin<PrayerModePlugin>('PrayerMode');
const isAndroid = () => Capacitor.getPlatform() === 'android';
const isMale = () => useSettingsStore.getState().gender === 'male';

function iqamaFn(): (p: PrayerName) => number {
  const iq = useNotificationStore.getState().prayerExtras.iqama;
  return (p) => iqamaMinutes(iq, p);
}

function daysFrom(from: Date, n: number): DayTimes[] {
  const { coords, prayerMethod, madhabSchool } = useSettingsStore.getState();
  if (!coords) return [];
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(from, i);
    const t = prayerTimeService.getTimes(coords, d, prayerMethod, madhabSchool);
    return {
      dateKey: format(d, 'yyyy-MM-dd'),
      friday: d.getDay() === 5,
      times: { fajr: +t.fajr, dhuhr: +t.dhuhr, asr: +t.asr, maghrib: +t.maghrib, isha: +t.isha },
    };
  });
}

/** Today's windows, passed ones included (the page's timeline; shown even while the switch is off). */
export function todayWindows(now = new Date()): PrayerWindow[] {
  return mergeWindows(daysFrom(now, 1).flatMap((d) => dayWindows(d, usePrayerModeStore.getState(), iqamaFn(), isMale())));
}

/** What the native side gets: every window not yet over, for the next PLAN_DAYS days. */
export function upcomingWindows(now = new Date()): PrayerWindow[] {
  return planWindows(daysFrom(now, PLAN_DAYS), usePrayerModeStore.getState(), iqamaFn(), isMale(), now.getTime());
}

export async function prayerModeSupport(): Promise<PrayerModeSupport> {
  // Dev-only preview of the Android UI in a browser (set from DevTools / CDP).
  if (import.meta.env.DEV) {
    const fake = (window as { __prayerModeFake?: PrayerModeStatus }).__prayerModeFake;
    if (fake) return { kind: 'android', status: fake };
  }
  if (!isAndroid()) return { kind: 'unsupported' };
  try {
    return { kind: 'android', status: await Native.getStatus() };
  } catch {
    // UNIMPLEMENTED: an APK from before «وضع الصلاة».
    return { kind: 'outdated' };
  }
}

export async function openPolicyAccess(): Promise<void> {
  await Native.openPolicyAccess().catch(() => {});
}

/** null on success, else the native reason ('no_policy_access' | 'no_exact_alarm' | …). */
export async function testPrayerMode(): Promise<string | null> {
  try {
    await Native.test({ silence: usePrayerModeStore.getState().silence, use24h: useSettingsStore.getState().timeFormat === '24h' });
    return null;
  } catch (e) {
    return (e as { code?: string })?.code ?? 'failed';
  }
}

export async function endPrayerModeNow(): Promise<void> {
  await Native.endNow().catch(() => {});
}

let lastSent = '';

/** Send the current plan to the native side (no-op when unchanged since the last send). */
export async function syncPrayerMode(): Promise<void> {
  if (!isAndroid()) return;
  const cfg = usePrayerModeStore.getState();
  const plan = JSON.stringify({
    enabled: cfg.enabled,
    windows: cfg.enabled ? upcomingWindows() : [],
    silence: cfg.silence,
    ask: cfg.ask,
    male: isMale(),
    use24h: useSettingsStore.getState().timeFormat === '24h',
  });
  if (plan === lastSent) return;
  try {
    await Native.setPlan({ plan });
    lastSent = plan;
  } catch {
    /* older APK without the plugin — nothing to arm */
  }
}

/** «في المسجد» taps from the after-prayer notification, queued natively while the app was closed. */
const QUEUE_KEY = 'prayermode_pending';

async function drainPending(): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: QUEUE_KEY });
    if (!value) return;
    let items: { prayer?: string; date?: string }[] = [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      /* corrupt → cleared below */
    }
    for (const a of items) {
      if (PRAYER_ORDER.includes(a.prayer as PrayerName) && /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '')) {
        usePrayerLogStore.getState().setPrayer(a.date!, a.prayer as PrayerName, 'mosque', true);
      }
    }
    // ponytail: no compare-and-swap in Preferences; re-read + drop what we applied, like widgetBridge's drain.
    const { value: after } = await Preferences.get({ key: QUEUE_KEY });
    let rest: unknown[] = [];
    try {
      if (after && after !== value) rest = (JSON.parse(after) as unknown[]).slice(items.length);
    } catch {
      /* drop */
    }
    if (rest.length) await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(rest) });
    else await Preferences.remove({ key: QUEUE_KEY });
  } catch (e) {
    console.warn('[prayerMode] drain failed', e);
  }
}

let started = false;

/**
 * Keep the native plan in step: on start, on resume, and whenever the
 * prayer-mode settings, prayer settings/location or iqama minutes change.
 * Idempotent; Android only.
 */
export function startPrayerModeSync(): void {
  if (started || !isAndroid()) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncPrayerMode(), 400);
  };
  usePrayerModeStore.subscribe(soon);
  useSettingsStore.subscribe(soon);
  useNotificationStore.subscribe(soon);
  void syncPrayerMode();
  void drainPending();
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    soon();
    void drainPending();
  });
}
