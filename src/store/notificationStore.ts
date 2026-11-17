import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setHours, setMinutes } from 'date-fns';
import type { ModuleId, NotificationPayload, PrayerName } from '@/types';
import { notificationService } from '@/services/NotificationService';
import { defaultSoundForKey, type SoundKey } from '@/services/notifications/sounds';
import { useSettingsStore } from '@/store/settingsStore';

export interface ModuleReminderConfig {
  moduleId: ModuleId | string;
  enabled: boolean;
  time: string; // HH:mm 24h
  prayerOffsetMinutes?: number; // minutes before prayer time (negative = before, positive = after)
  /** Which ringtone this reminder plays. Defaults per type via defaultSoundForKey. */
  soundKey?: SoundKey;
  /** Native channel id for a user-picked custom sound file (overrides soundKey). */
  customChannelId?: string;
  /** Display label (file name) for the picked custom sound. */
  customLabel?: string;
  /** Legacy loud/quiet flag — superseded by `soundKey`, kept for migration. */
  alarm?: boolean;
  /** Show a full-screen, incoming-call-style alarm screen when this fires (Android). */
  fullScreen?: boolean;
}

/**
 * Extra prayer reminders that apply to ALL prayers: a "prayer approaching"
 * nudge a settable number of minutes BEFORE the adhan (اقتربت الصلاة), and an
 * "iqama approaching" nudge a settable number of minutes AFTER the adhan
 * (اقتربت إقامة الصلاة). Each can independently be a quiet reminder or a loud
 * alarm.
 */
export interface PrayerExtraConfig {
  enabled: boolean;
  minutes: number;
  alarm: boolean;
  /** Ringtone for this pre-adhan / iqama nudge. Defaults to a short takbeer. */
  soundKey?: SoundKey;
  /** Native channel id for a user-picked custom sound file (overrides soundKey). */
  customChannelId?: string;
  /** Display label (file name) for the picked custom sound. */
  customLabel?: string;
  /** Iqama only: minutes after each prayer's adhan — every mosque sets its
   *  own (Fajr ~25, Maghrib ~5). Missing prayers fall back to `minutes`. */
  perPrayer?: Partial<Record<PrayerName, number>>;
}

/** Minutes from the adhan to this prayer's iqama (per-prayer, else the shared value). */
export const iqamaMinutes = (cfg: PrayerExtraConfig, prayer: PrayerName): number => cfg.perPrayer?.[prayer] ?? cfg.minutes;

/** Per-item reminder keys so each prayer / azkar set has its own time + alarm. */
export const PRAYER_REMINDER_KEYS = [
  'prayers.fajr', 'prayers.dhuhr', 'prayers.asr', 'prayers.maghrib', 'prayers.isha',
] as const;
export const AZKAR_REMINDER_KEYS = ['dhikr.morning', 'dhikr.evening'] as const;
export const OTHER_REMINDER_KEYS = ['quran', 'qiyam', 'duha', 'fasting', 'duaa', 'habits'] as const;
/**
 * Keys armed as plain DAILY repeats by scheduleAll. `fasting` is NOT one: its
 * reminders are owned by FastingReminderScheduler (Mon/Thu eves, ayyam al-bid,
 * Arafah/Ashura, and a suhoor alarm at `fasting.time` during Ramadan only) —
 * it used to ring at 03:30 every night of the year once enabled.
 */
export const FIXED_TIME_KEYS = [...AZKAR_REMINDER_KEYS, 'quran', 'qiyam', 'duha', 'duaa', 'habits'] as const;

/**
 * Smart (stats-driven) notifications — see services/smartNotifications.ts.
 * One toggle per kind + quiet hours. Read through `getSmartPrefs()` so fields
 * added later get their defaults on data persisted by older builds.
 */
export interface SmartNotificationPrefs {
  /** Evening nudge when a streak isn't done yet today. */
  streak: boolean;
  /** Last-third-of-the-night qiyam reminder (ignores quiet hours by design). */
  qiyam: boolean;
  /** Friday-evening weekly summary with real numbers. */
  weekly: boolean;
  /** One-time celebration of a new record / milestone. */
  celebrate: boolean;
  /** «رفيقك اليومي» (services/smartCompanion.ts): «هل صلّيت؟» after a fard not yet logged. */
  prayerCheck: boolean;
  /** Morning / evening / sleep / post-prayer adhkar at the user's own times, only while undone.
   *  Replaces the fixed «أذكار الصباح/المساء» daily reminders. */
  adhkarNudges: boolean;
  /** The Qur'an wird and the daily أوراد, only while undone. Replaces the fixed Qur'an reminder. */
  wirdNudges: boolean;
  /** «تحدّي اليوم» one step from complete. */
  challenges: boolean;
  /** «آخر الوقت»: a fard still unlogged shortly before its time ends (loggers only). */
  lateCalls: boolean;
  /** Once a day, a sunnah the user seldom does (الضحى، المسجد…) or Friday's own, at its hour. */
  suggestions: boolean;
  quietEnabled: boolean;
  quietStart: string; // HH:mm
  quietEnd: string; // HH:mm
}

export const SMART_DEFAULTS: SmartNotificationPrefs = {
  streak: true,
  qiyam: true,
  weekly: true,
  celebrate: true,
  prayerCheck: true,
  adhkarNudges: true,
  wirdNudges: true,
  challenges: true,
  lateCalls: true,
  suggestions: true,
  quietEnabled: true,
  quietStart: '23:00',
  quietEnd: '06:00',
};

interface NotificationState {
  configs: Record<string, ModuleReminderConfig>;
  smart: SmartNotificationPrefs;
  /** Celebration key → epoch ms it was (or will be) delivered. Celebrate-once ledger. */
  smartCelebrated: Record<string, number>;
  /** True once the ledger was seeded with facts that pre-date this feature. */
  smartSeeded: boolean;
  setSmart: (patch: Partial<SmartNotificationPrefs>) => void;
  markSmartCelebrated: (entries: Record<string, number>) => void;
  /** Pre-adhan ("اقتربت الصلاة") + post-adhan iqama ("اقتربت الإقامة") reminders. */
  prayerExtras: { pre: PrayerExtraConfig; iqama: PrayerExtraConfig };

  // Actions
  setConfig: (moduleId: ModuleId | string, config: Partial<ModuleReminderConfig>) => void;
  getConfig: (moduleId: ModuleId | string) => ModuleReminderConfig;
  setPrayerExtra: (which: 'pre' | 'iqama', patch: Partial<PrayerExtraConfig>) => void;
  scheduleModule: (moduleId: ModuleId | string, prayerTime?: Date) => void;
  cancelModule: (moduleId: ModuleId | string) => void;
  scheduleAll: (prayerTimes?: Record<string, Date>) => void;
  cancelAll: () => void;
}

const DEFAULTS: Record<string, Partial<ModuleReminderConfig>> = {
  // Per-prayer (fire at the computed adhan time via PrayerTimeNotificationScheduler).
  'prayers.fajr': { enabled: true, alarm: true, prayerOffsetMinutes: 0 },
  'prayers.dhuhr': { enabled: true, alarm: true, prayerOffsetMinutes: 0 },
  'prayers.asr': { enabled: true, alarm: true, prayerOffsetMinutes: 0 },
  'prayers.maghrib': { enabled: true, alarm: true, prayerOffsetMinutes: 0 },
  'prayers.isha': { enabled: true, alarm: true, prayerOffsetMinutes: 0 },
  // Per-azkar-set (fixed daily times).
  'dhikr.morning': { enabled: true, time: '06:30' },
  'dhikr.evening': { enabled: true, time: '17:00' },
  // Other modules.
  quran: { enabled: true, time: '07:00' },
  qiyam: { enabled: true, time: '23:00' },
  // Opt-in: a new reminder must not start ringing for existing users unasked.
  duha: { enabled: false, time: '09:30' },
  fasting: { enabled: false, time: '03:30' },
  duaa: { enabled: false, time: '21:00' },
  habits: { enabled: false, time: '20:00' },
  // Islamic-calendar days (IslamicCalendarScheduler, 09:00 on the day). Always
  // armed before this toggle existed, so it defaults ON.
  special: { enabled: true, time: '09:00' },
};

function getDefault(moduleId: string): ModuleReminderConfig {
  const def = DEFAULTS[moduleId] ?? {};
  return {
    moduleId,
    enabled: false,
    time: '08:00',
    soundKey: defaultSoundForKey(moduleId),
    ...def,
  };
}

function buildTriggerTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  let trigger = setMinutes(setHours(new Date(), h), m);
  // If time has already passed today, schedule for tomorrow
  if (trigger <= now) {
    trigger = new Date(trigger.getTime() + 24 * 60 * 60 * 1000);
  }
  return trigger.toISOString();
}

/**
 * Stable notification id for a module reminder. MUST NOT contain the date: a
 * daily-repeating reminder has to keep the SAME id across days so each
 * reschedule OVERWRITES the existing OS notification. Older builds appended
 * `_YYYYMMDD`, which minted a brand-new daily repeat every launch while the
 * previous days' repeats kept firing — so the reminder multiplied by one each
 * day (see purgeLegacyDatedReminders).
 */
function notifId(moduleId: string): string {
  return `myzikr_${moduleId}`;
}

function deepLink(key: string): string {
  if (key.startsWith('prayers')) return '/#/module/prayers';
  if (key.startsWith('dhikr')) return '/#/module/dhikr';
  if (key === 'duha') return '/#/module/prayers';
  return `/#/module/${key}`;
}

const TITLE_MAP: Record<string, string> = {
  'prayers.fajr': 'حان وقت أذان الفجر 🌅',
  'prayers.dhuhr': 'حان وقت أذان الظهر 🕌',
  'prayers.asr': 'حان وقت أذان العصر 🕌',
  'prayers.maghrib': 'حان وقت أذان المغرب 🌇',
  'prayers.isha': 'حان وقت أذان العشاء 🌙',
  'dhikr.morning': 'أذكار الصباح 🌅',
  'dhikr.evening': 'أذكار المساء 🌇',
  quran: 'وردك القرآني اليوم 📖',
  qiyam: 'قيام الليل ⭐',
  duha: 'صلاة الضحى ☀️',
  fasting: 'وقت السحور 🌙',
  duaa: 'لا تنسَ دعاءك 🤲',
  habits: 'عاداتك اليومية ✨',
};

/** A short, warm line under each fixed-time reminder (was an empty body). */
const BODY_MAP: Record<string, string> = {
  'dhikr.morning': 'ابدأ يومك بذكر الله — حصنك إلى المساء',
  'dhikr.evening': 'أذكار المساء تحفظك حتى تصبح',
  quran: 'صفحات يسيرة تثبّت وردك اليوم',
  qiyam: 'ركعتان في جوف الليل خير من الدنيا وما فيها',
  duha: 'صلاة الأوّابين — ركعتان تُجزئان عن صدقة كل مَفصِل',
  fasting: 'نيّة الصيام قبل الفجر، وتسحّروا فإن في السحور بركة',
  duaa: 'ادعُ ربك فإنه قريب يجيب',
  habits: 'دقائق لعاداتك الصالحة اليوم',
};

/**
 * The fixed-time qiyam reminder steps aside while the smart «الثلث الأخير»
 * one can run (needs a location). Both used to fire nightly by default —
 * 23:00 AND the last third.
 */
export function fixedQiyamSuperseded(): boolean {
  return getSmartPrefs().qiyam && !!useSettingsStore.getState().coords;
}

/**
 * The fixed daily «أذكار الصباح/المساء» and Qur'an reminders step aside while
 * the smart companion covers them (it needs prayer times → a location). A
 * time the user set by hand isn't lost: the companion uses it as its anchor.
 */
export function fixedReminderSuperseded(id: string): boolean {
  if (!useSettingsStore.getState().coords) return false;
  const p = getSmartPrefs();
  if (id === 'dhikr.morning' || id === 'dhikr.evening') return p.adhkarNudges;
  if (id === 'quran') return p.wirdNudges;
  return false;
}

/** The default time of a fixed reminder (a different stored time = the user's own). */
export const defaultReminderTime = (id: string): string | undefined => DEFAULTS[id]?.time;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      configs: {},
      smart: SMART_DEFAULTS,
      smartCelebrated: {},
      smartSeeded: false,
      setSmart: (patch) => set((s) => ({ smart: { ...SMART_DEFAULTS, ...s.smart, ...patch } })),
      markSmartCelebrated: (entries) =>
        set((s) => {
          // Keep the ledger bounded: the newest 200 keys are plenty for once-only checks.
          const all = Object.entries({ ...s.smartCelebrated, ...entries }).sort((a, b) => b[1] - a[1]);
          return { smartCelebrated: Object.fromEntries(all.slice(0, 200)), smartSeeded: true };
        }),
      prayerExtras: {
        pre: { enabled: false, minutes: 15, alarm: false, soundKey: 'adhan_short' },
        iqama: { enabled: false, minutes: 15, alarm: true, soundKey: 'iqama' },
      },

      setPrayerExtra: (which, patch) =>
        set((s) => ({
          prayerExtras: { ...s.prayerExtras, [which]: { ...s.prayerExtras[which], ...patch } },
        })),

      setConfig: (moduleId, partial) => {
        set((s) => {
          const existing = s.configs[String(moduleId)] ?? getDefault(String(moduleId));
          return {
            configs: {
              ...s.configs,
              [String(moduleId)]: { ...existing, ...partial },
            },
          };
        });
      },

      getConfig: (moduleId) => {
        const id = String(moduleId);
        const cfg = get().configs[id] ?? getDefault(id);
        // Back-compat: configs persisted before per-type sounds existed have no
        // soundKey — fill the sensible default so callers always get one.
        return cfg.soundKey ? cfg : { ...cfg, soundKey: defaultSoundForKey(id) };
      },

      scheduleModule: (moduleId, prayerTime) => {
        const config = get().getConfig(moduleId);
        if (!config.enabled) return;

        const id = String(moduleId);
        // Owned by FastingReminderScheduler (Ramadan-only suhoor + fast eves);
        // a generic daily arm here would ring every night of the year.
        if (id === 'fasting') return;
        if ((id === 'qiyam' && fixedQiyamSuperseded()) || fixedReminderSuperseded(id)) {
          void notificationService.cancelNotification(notifId(id));
          return;
        }
        let triggerTime: string;

        if (prayerTime && config.prayerOffsetMinutes !== undefined) {
          const adjusted = new Date(prayerTime.getTime() + config.prayerOffsetMinutes * 60 * 1000);
          triggerTime = adjusted.toISOString();
        } else {
          triggerTime = buildTriggerTime(config.time);
        }

        const payload: NotificationPayload = {
          id: notifId(id),
          title: TITLE_MAP[id] ?? 'تذكير رَفِيقِي',
          body: BODY_MAP[id] ?? '',
          triggerTime,
          repeatInterval: 'daily',
          moduleId: id,
          deepLinkPath: deepLink(id),
          soundKey: config.soundKey ?? defaultSoundForKey(id),
          customChannelId: config.customChannelId,
          alarm: config.alarm,
          fullScreen: config.fullScreen,
        };

        notificationService.scheduleNotification(payload);
      },

      cancelModule: (moduleId) => {
        notificationService.cancelNotification(notifId(String(moduleId)));
      },

      scheduleAll: () => {
        const { scheduleModule } = get();
        // Clear the date-stamped daily reminders older builds left behind, which
        // accumulated one extra fire per day (see purgeLegacyDatedReminders).
        void notificationService.purgeLegacyDatedReminders?.();
        // Retired reminder: clear any lingering post-prayer azkar notification
        // that an existing user may still have scheduled from a prior version.
        void notificationService.cancelAll('dhikr.postPrayer');
        // Prayers are scheduled at their computed adhan times by the
        // PrayerTimeNotificationScheduler — here we only schedule the
        // fixed-time reminders (azkar sets + other modules).
        FIXED_TIME_KEYS.forEach((id) => scheduleModule(id));
      },

      cancelAll: () => {
        void notificationService.purgeLegacyDatedReminders?.();
        FIXED_TIME_KEYS.forEach((id) =>
          notificationService.cancelNotification(notifId(id)),
        );
      },
    }),
    {
      name: 'myzikr:notifications',
    },
  ),
);

/** Smart-notification prefs with defaults filled in (safe on old persisted data). */
export function getSmartPrefs(): SmartNotificationPrefs {
  return { ...SMART_DEFAULTS, ...useNotificationStore.getState().smart };
}
