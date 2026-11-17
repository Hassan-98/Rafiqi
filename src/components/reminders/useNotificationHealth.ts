import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { fullScreenAlarm, needsAutostart, type FullScreenAlarmStatus } from '@/services/notifications/fullScreenAlarm';
import { permissionService, type PermissionStatus } from '@/services/PermissionService';
import { isDesktopShell } from '@/services/NotificationService';

export type HealthId = 'permission' | 'exact' | 'battery' | 'fullscreen' | 'autostart';

export interface HealthCheck {
  id: HealthId;
  ok: boolean;
  /** Blocking = reminders will not arrive (or arrive late) until fixed. */
  blocking: boolean;
  title: string;
  desc: string;
  action: string;
  fix: () => void | Promise<void>;
}

export type NotifPlatform = 'android' | 'desktop' | 'web';

const AUTOSTART_KEY = 'myzikr:autostart-opened';

/**
 * The OS gates that decide whether reminders actually arrive, each with a
 * one-tap fix (same checks as the onboarding ReliabilitySetup). Re-checks when
 * the app returns to the foreground — i.e. right after the user granted
 * something in a system screen.
 */
export function useNotificationHealth(opts: { needFullScreen: boolean }) {
  const platform: NotifPlatform =
    Capacitor.getPlatform() === 'android' ? 'android' : isDesktopShell() ? 'desktop' : 'web';
  const [perm, setPerm] = useState<PermissionStatus['notifications']>('prompt');
  const [fsa, setFsa] = useState<FullScreenAlarmStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [autostartOpened, setAutostartOpened] = useState(() => {
    try {
      return localStorage.getItem(AUTOSTART_KEY) === '1';
    } catch {
      return false;
    }
  });

  const refresh = useCallback(async () => {
    if (platform === 'desktop') {
      setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt');
    } else {
      try {
        setPerm((await permissionService.getStatus()).notifications);
      } catch {
        /* ignore */
      }
      setFsa(await fullScreenAlarm.getStatus());
    }
    setLoaded(true);
  }, [platform]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const checks: HealthCheck[] = [];
  if (platform === 'android' || platform === 'desktop') {
    // Switched off in system settings also counts as denied (areNotificationsEnabled).
    const denied = perm === 'denied' || fsa?.notificationsEnabled === false;
    checks.push({
      id: 'permission',
      ok: perm === 'granted' && fsa?.notificationsEnabled !== false,
      blocking: true,
      title: denied ? 'الإشعارات مقفلة' : 'إذن الإشعارات',
      desc: !denied
        ? 'ليظهر الأذان والتذكير في وقته'
        : platform === 'android'
          ? 'لن يصلك أي تنبيه — افتح إعدادات التطبيق وفعّل الإشعارات'
          : 'لن يصلك أي تنبيه — اسمح للتطبيق بالإشعارات من إعدادات النظام',
      action: denied && platform === 'android' ? 'فتح الإعدادات' : 'السماح',
      fix: async () => {
        if (platform === 'desktop') {
          if (typeof Notification !== 'undefined') await Notification.requestPermission();
        } else if (denied) {
          // Android stops showing the dialog after a denial — settings is the only way.
          await fullScreenAlarm.openNotificationSettings();
        } else {
          const ok = await permissionService.requestNotifications();
          if (!ok) await fullScreenAlarm.openNotificationSettings();
        }
        void refresh();
      },
    });
  }
  if (platform === 'android' && fsa) {
    checks.push({
      id: 'exact',
      ok: fsa.exactAlarm,
      blocking: true,
      title: 'المنبّهات الدقيقة',
      desc: 'بدونها يؤخّر النظام الأذان دقائق أو أكثر',
      action: 'السماح',
      fix: () => fullScreenAlarm.requestExactAlarm(),
    });
    checks.push({
      id: 'battery',
      ok: fsa.batteryUnrestricted,
      blocking: false,
      title: 'استثناء من توفير البطارية',
      desc: 'يمنع النظام من إسكات التطبيق في الخلفية',
      action: 'استثناء',
      fix: () => fullScreenAlarm.requestIgnoreBattery(),
    });
    if (opts.needFullScreen && fsa.sdk >= 34) {
      checks.push({
        id: 'fullscreen',
        ok: fsa.fullScreen,
        blocking: false,
        title: 'التنبيه بملء الشاشة',
        desc: 'لتظهر شاشة المنبّه فوق القفل كمكالمة واردة',
        action: 'السماح',
        fix: () => fullScreenAlarm.requestFullScreen(),
      });
    }
    if (needsAutostart(fsa.manufacturer)) {
      checks.push({
        id: 'autostart',
        ok: autostartOpened,
        blocking: false,
        title: 'التشغيل التلقائي',
        desc: 'جهازك يوقف التطبيقات المغلقة — فعّله ليبقى الأذان يعمل',
        action: 'فتح',
        fix: () => {
          setAutostartOpened(true);
          try {
            localStorage.setItem(AUTOSTART_KEY, '1');
          } catch {
            /* ignore */
          }
          void fullScreenAlarm.openAutostartSettings();
        },
      });
    }
  }

  return {
    platform,
    loaded,
    /** Native plugin missing (web assets newer than the installed APK). */
    nativeMissing: platform === 'android' && loaded && fsa === null,
    checks,
    blockingIssues: checks.filter((c) => !c.ok && c.blocking).length,
    advisories: checks.filter((c) => !c.ok && !c.blocking).length,
    refresh,
  };
}
