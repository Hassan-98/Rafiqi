import { Preferences } from '@capacitor/preferences';
import { format } from 'date-fns';
import { prayerTimeService } from './PrayerTimeService';
import { notificationService } from './NotificationService';
import { useSettingsStore } from '@/store/settingsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { CHANNEL_VERSION } from './notifications/sounds';
import { arCount } from './insightsEngine';
import type { NotificationPayload, PrayerName, PrayerTimesResult } from '@/types';

/**
 * Per-prayer notifications (pre-adhan · adhan · iqama) at the computed times,
 * armed HORIZON_DAYS ahead with stable day-slot ids (`…_d0`…`_d4`) that simply
 * overwrite on re-arm.
 *
 * Runs are SERIALISED and coalesced: boot, resume and every settings toggle
 * used to start overlapping runs whose cancel/schedule steps interleaved, so a
 * just-disabled prayer could be re-armed by the older run and keep ringing.
 */

const KEY_LAST_SCHEDULED = 'prayer_notif_scheduler:lastDate';

/**
 * Five days keeps a user covered over a long weekend; every open (cold start
 * OR resume, see notifications/rearm.ts) re-arms the full window.
 */
const HORIZON_DAYS = 5;

const PRAYER_TITLES: Record<PrayerName, string> = {
  fajr: 'حان وقت أذان الفجر 🌅',
  dhuhr: 'حان وقت أذان الظهر 🕌',
  asr: 'حان وقت أذان العصر 🕌',
  maghrib: 'حان وقت أذان المغرب 🌇',
  isha: 'حان وقت أذان العشاء 🌙',
};

const PRAYER_BODY: Record<PrayerName, string> = {
  fajr: 'الصلاة خير من النوم — قم إلى صلاتك',
  dhuhr: 'حيّ على الصلاة — استرح بها من شغل النهار',
  asr: 'حيّ على الصلاة — حافظ على الصلاة الوسطى',
  maghrib: 'حيّ على الصلاة — وقت المغرب قصير',
  isha: 'حيّ على الصلاة — واختم يومك بالوتر',
};

/** Short Arabic name used in the pre-adhan / iqama reminder copy. */
export const PRAYER_NAMES_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

const ALL_PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const minutesAr = (n: number) => arCount(n, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');

/**
 * Idempotency key: LOCAL date + UTC offset + channel version. The old key was
 * the UTC date, so the daily re-arm happened at 03:00 in UTC+3 instead of
 * midnight, and a timezone/DST change never re-armed at all.
 */
export function prayerScheduleKey(now = new Date()): string {
  return `${format(now, 'yyyy-MM-dd')}|${now.getTimezoneOffset()}|${CHANNEL_VERSION}`;
}

type PrayerPayload = Omit<NotificationPayload, 'repeatInterval' | 'moduleId' | 'deepLinkPath'>;

/**
 * Pure: every prayer notification that should be armed for one day slot.
 * Exported for scripts/notifications.test.ts.
 */
export function planPrayerDay(
  times: Partial<Record<PrayerName, Date>>,
  bucket: string,
  now: number,
  cfgFor: (prayer: PrayerName) => {
    enabled: boolean;
    prayerOffsetMinutes?: number;
    soundKey?: NotificationPayload['soundKey'];
    customChannelId?: string;
    fullScreen?: boolean;
  },
  extras: {
    pre: { enabled: boolean; minutes: number; soundKey?: NotificationPayload['soundKey']; customChannelId?: string };
    iqama: {
      enabled: boolean;
      minutes: number;
      perPrayer?: Partial<Record<PrayerName, number>>;
      soundKey?: NotificationPayload['soundKey'];
      customChannelId?: string;
    };
  },
): PrayerPayload[] {
  const out: PrayerPayload[] = [];
  for (const prayer of ALL_PRAYERS) {
    const t = times[prayer];
    if (!t) continue;
    const cfg = cfgFor(prayer);
    if (!cfg.enabled) continue;
    const adhanMs = t.getTime() + (cfg.prayerOffsetMinutes ?? 0) * 60_000;
    const name = PRAYER_NAMES_AR[prayer];
    const dateKey = format(new Date(adhanMs), 'yyyy-MM-dd');
    const meta = (kind: string) => ({ prayer, name, dateKey, kind });

    if (extras.pre.enabled) {
      const at = adhanMs - extras.pre.minutes * 60_000;
      if (at > now) {
        out.push({
          id: `myzikr_prayer_pre_${prayer}_${bucket}`,
          title: `اقتربت صلاة ${name} 🕰️`,
          body: `بقي على الأذان ${minutesAr(extras.pre.minutes)} — تهيّأ وتوضّأ`,
          triggerTime: new Date(at).toISOString(),
          soundKey: extras.pre.soundKey ?? 'adhan_short',
          customChannelId: extras.pre.customChannelId,
          meta: meta('pre'),
        });
      }
    }

    if (adhanMs > now) {
      out.push({
        id: `myzikr_prayer_time_${prayer}_${bucket}`,
        title: PRAYER_TITLES[prayer],
        body: PRAYER_BODY[prayer],
        triggerTime: new Date(adhanMs).toISOString(),
        soundKey: cfg.soundKey ?? 'adhan_makkah',
        customChannelId: cfg.customChannelId,
        fullScreen: cfg.fullScreen,
        meta: meta('adhan'),
      });
    }

    if (extras.iqama.enabled) {
      const iqamaMin = extras.iqama.perPrayer?.[prayer] ?? extras.iqama.minutes;
      const at = adhanMs + iqamaMin * 60_000;
      if (at > now) {
        out.push({
          id: `myzikr_prayer_iqama_${prayer}_${bucket}`,
          title: `اقتربت إقامة صلاة ${name} 🕌`,
          body: `مضى على الأذان ${minutesAr(iqamaMin)} — توجّه إلى الصلاة`,
          triggerTime: new Date(at).toISOString(),
          soundKey: extras.iqama.soundKey ?? 'iqama',
          customChannelId: extras.iqama.customChannelId,
          meta: meta('iqama'),
        });
      }
    }
  }
  return out;
}

class PrayerTimeNotificationScheduler {
  private tail: Promise<void> = Promise.resolve();
  private queued: Promise<void> | null = null;
  private forceNext = false;

  /**
   * Arm the next HORIZON_DAYS of prayer notifications. Idempotent per local
   * day (+ timezone) unless `force`. Calls made while a run is in flight
   * coalesce into ONE follow-up run that reads the latest settings.
   */
  schedule(force = false): Promise<void> {
    if (force) this.forceNext = true;
    if (this.queued) return this.queued;
    const next = this.tail.then(() => {
      this.queued = null;
      const f = this.forceNext;
      this.forceNext = false;
      return this.run(f);
    });
    this.queued = next;
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Force a re-arm now (per-prayer settings / location / method changed). */
  reschedule(): Promise<void> {
    return this.schedule(true);
  }

  private async run(force: boolean): Promise<void> {
    if (!notificationService.isAvailable()) return;
    const settings = useSettingsStore.getState();

    const key = prayerScheduleKey();
    if (!force) {
      try {
        if ((await Preferences.get({ key: KEY_LAST_SCHEDULED })).value === key) return;
      } catch {
        /* ignore */
      }
    }

    try {
      const armed = new Set<string>();
      if (settings.coords) {
        const notif = useNotificationStore.getState();
        const now = Date.now();
        for (let day = 0; day < HORIZON_DAYS; day++) {
          const date = new Date();
          date.setDate(date.getDate() + day); // calendar days — DST-safe, unlike +24h
          const times: PrayerTimesResult = prayerTimeService.getTimes(
            settings.coords,
            date,
            settings.prayerMethod,
            settings.madhabSchool,
          );
          const plan = planPrayerDay(times, `d${day}`, now, (p) => notif.getConfig(`prayers.${p}`), notif.prayerExtras);
          for (const p of plan) {
            try {
              await notificationService.scheduleNotification({
                ...p,
                repeatInterval: 'none',
                moduleId: 'prayers',
                deepLinkPath: '/#/module/prayers',
              });
              armed.add(p.id);
            } catch (e) {
              console.warn('[PrayerTimeScheduler]', p.id, 'failed', e);
            }
          }
        }
      }
      // Retract only what is still ARMED and no longer wanted (a disabled
      // prayer, pre/iqama switched off, no location). A blanket cancel also
      // dismissed the adhan that was ringing on screen right now.
      await notificationService.cancelByPrefix?.('myzikr_prayer_', armed);

      try {
        await Preferences.set({ key: KEY_LAST_SCHEDULED, value: key });
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.warn('[PrayerTimeScheduler] schedule failed', e);
    }
  }
}

export const prayerTimeNotificationScheduler = new PrayerTimeNotificationScheduler();
