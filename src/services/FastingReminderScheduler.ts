import { Preferences } from '@capacitor/preferences';
import { notificationService } from './NotificationService';
import { hijriService } from './HijriService';
import { useNotificationStore } from '@/store/notificationStore';
import { CHANNEL_VERSION, type SoundKey } from './notifications/sounds';

/** The user-chosen ringtone for fasting reminders (defaults to the warm bell). */
function fastingSound(): SoundKey {
  return useNotificationStore.getState().getConfig('fasting').soundKey ?? 'fasting';
}

/** A user-picked custom sound channel for fasting reminders, if any. */
function fastingCustom(): string | undefined {
  return useNotificationStore.getState().getConfig('fasting').customChannelId;
}

/**
 * Schedules nightly notifications reminding the user about tomorrow's
 * recommended fast. Runs three families of reminders:
 *
 *  1. **Mondays & Thursdays** — schedule a notification at 21:00 the
 *     evening before, since the Prophet ﷺ encouraged fasting these two
 *     weekdays.
 *  2. **Ayyam al-Bid (13, 14, 15 of every Hijri month)** — schedule a
 *     notification the night before each of the three white days.
 *  3. **One-off virtuous days** (Arafah 9 Dhul-Hijjah, Ashura 10 Muharram,
 *     Tasua 9 Muharram, 1 Muharram) — already covered by
 *     `IslamicCalendarScheduler` for the *day*; this scheduler adds an
 *     **evening-before** reminder.
 *
 * All notifications go through `notificationService` so they fire as real
 * OS-level push notifications via Capacitor Local Notifications.
 *
 * Idempotent — tracks the last scheduled month + year in Capacitor
 * Preferences so calling `schedule()` repeatedly is cheap.
 */

const KEY_LAST_MONTH = 'fasting_scheduler:lastMonthKey';
const NOTIF_TIME = { hour: 21, minute: 0 }; // 9 PM the night before

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function nextDateOfWeekday(target: 0 | 1 | 2 | 3 | 4 | 5 | 6): Date {
  // 0 = Sunday … 6 = Saturday. Monday = 1, Thursday = 4.
  const today = new Date();
  const day = today.getDay();
  let delta = (target - day + 7) % 7;
  if (delta === 0) delta = 7;
  const out = new Date(today);
  out.setDate(today.getDate() + delta);
  return out;
}

class FastingReminderScheduler {
  /**
   * Schedule the upcoming month's worth of fast reminders. Safe to call
   * on every app start; only runs the heavy work when the Hijri month or
   * Gregorian month changes.
   */
  async schedule(force = false): Promise<void> {
    if (!notificationService.isAvailable()) return; // browser / dev
    if (force) {
      try {
        await Preferences.remove({ key: KEY_LAST_MONTH });
      } catch {
        /* ignore */
      }
    }

    // Honour the user's fasting-reminders toggle (default OFF). This scheduler
    // used to run unconditionally at boot, so Monday/Thursday/ayyam reminders
    // fired even with the toggle off — and could not be disabled from the UI.
    if (!useNotificationStore.getState().getConfig('fasting').enabled) {
      try {
        // Retract anything armed while the toggle was on, and clear the
        // idempotency key so re-enabling reschedules immediately.
        await notificationService.cancelByPrefix?.('myzikr_fast_');
        await notificationService.cancelNotification('myzikr_fasting');
        await Preferences.remove({ key: KEY_LAST_MONTH });
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const today = await hijriService.gregorianToHijri(new Date());
      // CHANNEL_VERSION is part of the idempotency key: bumping it (new
      // notification channels) must force a full re-schedule, otherwise the
      // pending notifications keep pointing at the DELETED old channels and
      // fire silently (or not at all).
      // The ringtone is part of it too: a sound change used to be ignored
      // until the next month.
      const monthKey = `${today.hijriYear}-${today.hijriMonth}-${new Date().getMonth()}:${CHANNEL_VERSION}:${fastingSound()}:${fastingCustom() ?? ''}:${useNotificationStore.getState().getConfig('fasting').time}`;

      let last: string | null = null;
      try {
        const stored = await Preferences.get({ key: KEY_LAST_MONTH });
        last = stored.value;
      } catch {
        /* ignore */
      }
      if (last === monthKey) return;

      await this.scheduleWeekdays();
      await this.scheduleSuhoor(today.hijriMonth === 9);
      await this.scheduleAyyamAlBid(today.hijriYear, today.hijriMonth);
      await this.scheduleOneOffs(today.hijriYear);

      try {
        await Preferences.set({ key: KEY_LAST_MONTH, value: monthKey });
      } catch {
        /* ignore */
      }
      console.info('[FastingScheduler] reminders refreshed for', monthKey);
    } catch (e) {
      console.warn('[FastingScheduler] schedule failed', e);
    }
  }

  /**
   * Daily suhoor alarm at the user's `fasting.time` — during Ramadan only (the
   * month key re-evaluates this at every Hijri month change). Same stable id
   * the old every-night-of-the-year reminder used, so this also retires it.
   */
  private async scheduleSuhoor(isRamadan: boolean): Promise<void> {
    if (!isRamadan) {
      await notificationService.cancelNotification('myzikr_fasting');
      return;
    }
    const [h, m] = (useNotificationStore.getState().getConfig('fasting').time || '03:30').split(':').map(Number);
    const at = new Date();
    at.setHours(h || 0, m || 0, 0, 0);
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
    await notificationService.scheduleNotification({
      id: 'myzikr_fasting',
      title: 'وقت السحور 🌙',
      body: 'تسحّروا فإن في السحور بركة — ولا تنسَ نية الصيام',
      triggerTime: at.toISOString(),
      repeatInterval: 'daily',
      moduleId: 'fasting',
      deepLinkPath: '/#/module/fasting',
      soundKey: fastingSound(),
      customChannelId: fastingCustom(),
    });
  }

  /**
   * Recurring Sunday 21:00 reminder for Monday, and Wednesday 21:00 for
   * Thursday. Uses Capacitor's `repeats: true` so we only need one entry
   * per weekday and the OS handles the weekly cycle.
   */
  private async scheduleWeekdays(): Promise<void> {
    // Sunday evening → Monday fast
    const sundayEve = nextDateOfWeekday(0);
    sundayEve.setHours(NOTIF_TIME.hour, NOTIF_TIME.minute, 0, 0);
    await notificationService.scheduleNotification({
      id: `myzikr_fast_weekday_monday`,
      title: 'صيام يوم الإثنين 🌙',
      body: 'يستحب صيام يومي الإثنين والخميس — لا تنسَ نية الصيام قبل الفجر',
      triggerTime: sundayEve.toISOString(),
      repeatInterval: 'weekly',
      moduleId: 'fasting',
      deepLinkPath: '/#/module/fasting',
      soundKey: fastingSound(),
      customChannelId: fastingCustom(),
    });

    // Wednesday evening → Thursday fast
    const wedEve = nextDateOfWeekday(3);
    wedEve.setHours(NOTIF_TIME.hour, NOTIF_TIME.minute, 0, 0);
    await notificationService.scheduleNotification({
      id: `myzikr_fast_weekday_thursday`,
      title: 'صيام يوم الخميس 🌙',
      body: 'تُعرض الأعمال على الله يومي الإثنين والخميس — استعد لصيام الغد',
      triggerTime: wedEve.toISOString(),
      repeatInterval: 'weekly',
      moduleId: 'fasting',
      deepLinkPath: '/#/module/fasting',
      soundKey: fastingSound(),
      customChannelId: fastingCustom(),
    });
  }

  /**
   * Schedule three one-shot reminders for the *night before* each ayyam
   * al-bid day in the current Hijri month (12, 13, 14 in Hijri terms
   * map to "the night before 13, 14, 15").
   */
  private async scheduleAyyamAlBid(hijriYear: number, hijriMonth: number): Promise<void> {
    for (const targetDay of [13, 14, 15]) {
      try {
        const g = await hijriService.hijriToGregorian(hijriYear, hijriMonth, targetDay);
        const gDate = new Date(
          g.gregorianYear,
          g.gregorianMonth - 1,
          g.gregorianDay,
          NOTIF_TIME.hour,
          NOTIF_TIME.minute,
          0,
        );
        // Subtract 1 day to send "the night before" — 21:00 on day (target - 1).
        gDate.setDate(gDate.getDate() - 1);
        if (gDate.getTime() <= Date.now()) continue; // already passed

        await notificationService.scheduleNotification({
          id: `myzikr_fast_ayyam_${hijriYear}_${hijriMonth}_${targetDay}`,
          title: `أيام البيض — يوم ${pad(targetDay)} 🌕`,
          body: 'غداً من الأيام البيض، يستحب صيامه. عن أبي ذر: «صيام ثلاث من كل شهر صيام الدهر»',
          triggerTime: gDate.toISOString(),
          repeatInterval: 'none',
          moduleId: 'fasting',
          deepLinkPath: '/#/module/fasting',
          soundKey: fastingSound(),
          customChannelId: fastingCustom(),
        });
      } catch (e) {
        console.warn('[FastingScheduler] ayyam', targetDay, 'failed', e);
      }
    }
  }

  /**
   * Schedule "night before" reminders for the major virtuous fast days of
   * the Hijri year — Arafah (9 Dhul-Hijjah), Ashura (10 Muharram),
   * Tasua (9 Muharram). Idempotent + skips days already past.
   */
  private async scheduleOneOffs(hijriYear: number): Promise<void> {
    const targets: { id: string; hijriMonth: number; hijriDay: number; title: string; body: string }[] = [
      {
        id: `arafah_${hijriYear}`,
        hijriMonth: 12,
        hijriDay: 9,
        title: 'يوم عرفة المبارك 🕋',
        body: 'غداً يوم عرفة — صيامه يكفر السنة الماضية والباقية لغير الحاج',
      },
      {
        id: `tasua_${hijriYear}`,
        hijriMonth: 1,
        hijriDay: 9,
        title: 'تاسوعاء 🌙',
        body: 'غداً يوم تاسوعاء — يستحب صيامه مع عاشوراء',
      },
      {
        id: `ashura_${hijriYear}`,
        hijriMonth: 1,
        hijriDay: 10,
        title: 'عاشوراء 🌙',
        body: 'غداً يوم عاشوراء — صيامه يكفّر السنة الماضية',
      },
    ];

    for (const target of targets) {
      try {
        const g = await hijriService.hijriToGregorian(hijriYear, target.hijriMonth, target.hijriDay);
        const gDate = new Date(
          g.gregorianYear,
          g.gregorianMonth - 1,
          g.gregorianDay,
          NOTIF_TIME.hour,
          NOTIF_TIME.minute,
          0,
        );
        gDate.setDate(gDate.getDate() - 1);
        if (gDate.getTime() <= Date.now()) continue;

        await notificationService.scheduleNotification({
          id: `myzikr_fast_${target.id}`,
          title: target.title,
          body: target.body,
          triggerTime: gDate.toISOString(),
          repeatInterval: 'none',
          moduleId: 'fasting',
          deepLinkPath: '/#/module/fasting',
          soundKey: fastingSound(),
          customChannelId: fastingCustom(),
        });
      } catch (e) {
        console.warn('[FastingScheduler]', target.id, 'failed', e);
      }
    }
  }
}

export const fastingReminderScheduler = new FastingReminderScheduler();
