import { Preferences } from '@capacitor/preferences';
import { hijriService } from './HijriService';
import { notificationService } from './NotificationService';
import { useNotificationStore } from '@/store/notificationStore';
import { SPECIAL_ISLAMIC_DAYS } from '@/data/specialIslamicDays';
import { CHANNEL_VERSION } from './notifications/sounds';

const KEY_LAST_HIJRI_YEAR = 'islamic_scheduler:lastHijriYear';

/**
 * Idempotently schedules one-shot Capacitor LocalNotifications for the major
 * Islamic dates of the current Hijri year. Re-runs only when the year changes
 * (tracked in Capacitor Preferences).
 *
 * Called from App startup; safe to call multiple times.
 */
class IslamicCalendarScheduler {
  async schedule(force = false): Promise<void> {
    if (!notificationService.isAvailable()) return; // dev / browser

    const cfg = useNotificationStore.getState().getConfig('special');
    if (force || !cfg.enabled) {
      try {
        await Preferences.remove({ key: KEY_LAST_HIJRI_YEAR });
      } catch {
        /* ignore */
      }
    }
    // Honour the «المناسبات الإسلامية» toggle (there was none — always armed).
    if (!cfg.enabled) {
      await notificationService.cancelByPrefix?.('myzikr_special_');
      return;
    }

    try {
      const today = await hijriService.gregorianToHijri(new Date());
      const hijriYear = today.hijriYear;

      // CHANNEL_VERSION in the idempotency key: a channel bump must force a
      // re-schedule or pending notifications stay on the DELETED old channels.
      const yearKey = `${hijriYear}:${CHANNEL_VERSION}:${cfg.soundKey ?? ''}:${cfg.customChannelId ?? ''}`;
      let lastYear: string | null = null;
      try {
        const stored = await Preferences.get({ key: KEY_LAST_HIJRI_YEAR });
        lastYear = stored.value;
      } catch {
        /* ignore */
      }
      if (lastYear === yearKey) return;

      const now = Date.now();
      let count = 0;
      for (const day of SPECIAL_ISLAMIC_DAYS) {
        // Skip nights/days that have already passed in the current Hijri year.
        try {
          const g = await hijriService.hijriToGregorian(hijriYear, day.hijriMonth, day.hijriDay);
          const gDate = new Date(g.gregorianYear, g.gregorianMonth - 1, g.gregorianDay, 9, 0, 0);
          if (gDate.getTime() <= now) continue;

          await notificationService.scheduleNotification({
            id: `myzikr_special_${day.id}_${hijriYear}`,
            title: day.nameAr,
            body: day.suggestedAction ?? day.significance,
            triggerTime: gDate.toISOString(),
            repeatInterval: 'none',
            moduleId: 'special',
            deepLinkPath: '/#/calendar',
            soundKey: cfg.soundKey ?? 'special',
            customChannelId: cfg.customChannelId,
          });
          count += 1;
        } catch (e) {
          console.warn('[IslamicScheduler] failed for', day.id, e);
        }
      }

      try {
        await Preferences.set({ key: KEY_LAST_HIJRI_YEAR, value: yearKey });
      } catch {
        /* ignore */
      }
      console.info(`[IslamicScheduler] scheduled ${count} dates for ${hijriYear}H`);
    } catch (e) {
      console.warn('[IslamicScheduler] schedule failed', e);
    }
  }
}

export const islamicCalendarScheduler = new IslamicCalendarScheduler();
