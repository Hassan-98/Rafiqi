import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bell, BatteryCharging, Power, AlarmClock, Smartphone, Check, ChevronLeft } from 'lucide-react';
import {
  fullScreenAlarm,
  needsAutostart,
  type FullScreenAlarmStatus,
} from '@/services/notifications/fullScreenAlarm';
import { permissionService, type PermissionStatus } from '@/services/PermissionService';

/**
 * Guided "make reminders reliable" checklist (Android sideload build).
 *
 * Surfaces the exact gates that otherwise stop reminders from firing and lets
 * the user clear each in one tap:
 *  - Notifications  → runtime permission dialog (Android 13+)
 *  - Battery        → one-tap "ignore battery optimizations" system dialog
 *  - Exact alarms   → only shown if not already auto-granted (USE_EXACT_ALARM)
 *  - Full-screen    → only shown on Android 14+ if not granted
 *  - Autostart      → only on aggressive OEMs (MIUI/ColorOS/…); no API to read
 *                     status, so it self-confirms once the user opens it.
 *
 * Status auto-refreshes when the app returns to the foreground (i.e. after the
 * user grants something in a system settings screen).
 */
export function ReliabilitySetup({ onChange }: { onChange?: () => void }) {
  const [notif, setNotif] = useState<PermissionStatus['notifications']>('prompt');
  const [fsa, setFsa] = useState<FullScreenAlarmStatus | null>(null);
  const [autostartOpened, setAutostartOpened] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const p = await permissionService.getStatus();
      setNotif(p.notifications);
    } catch {
      /* ignore */
    }
    try {
      setFsa(await fullScreenAlarm.getStatus());
    } catch {
      /* ignore */
    }
    onChange?.();
  }, [onChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-check whenever the app comes back to the foreground — the user has just
  // returned from a system dialog/settings screen and may have granted access.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (Capacitor.getPlatform() !== 'android') return null;

  const sdk = fsa?.sdk ?? 0;
  const showExact = !!fsa && !fsa.exactAlarm;
  const showFullScreen = !!fsa && sdk >= 34 && !fsa.fullScreen;
  const showAutostart = !!fsa && needsAutostart(fsa.manufacturer);

  return (
    <div className="flex flex-col gap-2 w-full">
      <Row
        icon={<Bell size={17} />}
        title="الإشعارات"
        desc="للسماح بظهور تنبيهات الصلاة والأذكار"
        ok={notif === 'granted'}
        onFix={async () => {
          await permissionService.requestNotifications();
          void refresh();
        }}
      />

      <Row
        icon={<BatteryCharging size={17} />}
        title="استثناء من توفير البطارية"
        desc="يمنع النظام من إيقاف التطبيق فتصلك التنبيهات في وقتها"
        ok={!!fsa?.batteryUnrestricted}
        onFix={() => void fullScreenAlarm.requestIgnoreBattery()}
      />

      {showExact ? (
        <Row
          icon={<AlarmClock size={17} />}
          title="المنبّهات الدقيقة"
          desc="لإطلاق التنبيه في توقيته بالضبط"
          ok={false}
          onFix={() => void fullScreenAlarm.requestExactAlarm()}
        />
      ) : null}

      {showFullScreen ? (
        <Row
          icon={<Smartphone size={17} />}
          title="التنبيه بملء الشاشة"
          desc="لعرض المنبّه فوق التطبيقات وإيقاظ الشاشة"
          ok={false}
          onFix={() => void fullScreenAlarm.requestFullScreen()}
        />
      ) : null}

      {showAutostart ? (
        <Row
          icon={<Power size={17} />}
          title="التشغيل التلقائي (مهم لجهازك)"
          desc="جهازك يوقف التطبيقات في الخلفية — فعّل «التشغيل التلقائي» ليبقى التنبيه يعمل"
          ok={autostartOpened}
          actionLabel="فتح الإعداد"
          onFix={() => {
            setAutostartOpened(true);
            void fullScreenAlarm.openAutostartSettings();
          }}
        />
      ) : null}
    </div>
  );
}

function Row({
  icon,
  title,
  desc,
  ok,
  onFix,
  actionLabel = 'تفعيل',
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  ok: boolean;
  onFix: () => void;
  actionLabel?: string;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-[var(--radius-inner)] px-3.5 py-3 ring-1 transition-colors',
        ok
          ? 'bg-teal/8 dark:bg-teal/12 ring-teal/25'
          : 'bg-white/70 dark:bg-dark-card/70 ring-black/[0.05] dark:ring-white/[0.07]',
      ].join(' ')}
    >
      <span
        className={[
          'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
          ok ? 'bg-teal/15 text-teal dark:text-teal-light' : 'bg-gold/15 text-gold-dark dark:text-gold-light',
        ].join(' ')}
      >
        {ok ? <Check size={18} strokeWidth={2.4} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</p>
        <p className="text-[11px] text-text-muted leading-snug">{desc}</p>
      </div>
      {ok ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal dark:text-teal-light shrink-0"><Check size={12} strokeWidth={3} /> تم</span>
      ) : (
        <button
          type="button"
          onClick={onFix}
          className="inline-flex items-center gap-0.5 min-h-9 text-[12px] font-bold text-on-accent bg-[image:var(--gradient-teal)] hover:brightness-105 px-3 rounded-xl shrink-0"
        >
          {actionLabel}
          <ChevronLeft size={14} />
        </button>
      )}
    </div>
  );
}
