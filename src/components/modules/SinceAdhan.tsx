import { format } from 'date-fns';
import { Timer } from 'lucide-react';
import { useNotificationStore, iqamaMinutes } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { PRAYERS_ORDER } from '@/store/prayerLogStore';
import { prayerName } from '@/components/modules/PrayerDaySheet';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { PrayerTimesResult } from '@/types';

/** m:ss under an hour, h:mm:ss after. */
const mmss = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/**
 * «مضى على أذان الظهر ١٢:٣٤ · الإقامة بعد ٢:٢٦» — the small second timer
 * under the next-prayer countdown, always showing the time since the last
 * adhan (owner: not only the first hour). Many people time the iqama from
 * it; the iqama part uses the per-prayer minutes from the «اقتربت الإقامة»
 * reminder. Re-renders with its parent's one-second countdown.
 */
export function SinceAdhan({ times, onAccent = false }: { times: PrayerTimesResult | null; onAccent?: boolean }) {
  const iqama = useNotificationStore((s) => s.prayerExtras.iqama);
  const male = useSettingsStore((s) => s.gender) === 'male';
  if (!times) return null;
  const now = Date.now();
  const prayer = [...PRAYERS_ORDER].reverse().find((p) => times[p].getTime() <= now);
  if (!prayer) return null;
  const elapsed = Math.floor((now - times[prayer].getTime()) / 1000);
  const toIqama = iqama.enabled ? iqamaMinutes(iqama, prayer) * 60 - elapsed : null;
  const name = prayerName(prayer, format(now, 'yyyy-MM-dd'), male);

  const num = 'font-counter font-bold tabular-nums';
  return (
    <p
      className={[
        'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] leading-tight',
        onAccent ? 'text-on-accent/80' : 'text-text-secondary dark:text-text-on-dark/75',
      ].join(' ')}
      aria-live="off"
    >
      <Timer size={13} aria-hidden className={onAccent ? 'text-gold-light' : 'text-gold-dark dark:text-gold-light'} />
      <span>مضى على أذان {name}</span>
      <span className={num} dir="ltr">
        {toArabicDigits(mmss(elapsed))}
      </span>
      {toIqama != null && toIqama > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>الإقامة بعد</span>
          <span className={[num, onAccent ? 'text-gold-light' : 'text-teal dark:text-teal-light'].join(' ')} dir="ltr">
            {toArabicDigits(mmss(toIqama))}
          </span>
        </>
      ) : toIqama != null && toIqama > -10 * 60 ? (
        <>
          <span aria-hidden>·</span>
          <span className={onAccent ? 'text-gold-light font-bold' : 'text-teal dark:text-teal-light font-bold'}>حان وقت الإقامة</span>
        </>
      ) : null}
    </p>
  );
}
