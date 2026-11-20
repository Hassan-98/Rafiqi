import { Check, History } from 'lucide-react';
import { useProgressStore } from '@/store/progressStore';
import { setQadaFast, useQadaStore } from '@/store/qadaStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { blockedReason, dateOf, fastStatus, keyOf } from '@/services/qadaPlan';
import { toast } from '@/store/toastStore';

/**
 * «صيام قضاء» chip under a logged fast (fasting module, calendar day sheet).
 * Shows only when that day's fast is logged, the user owes fasts (or the day
 * is already marked), and the day can hold a qada fast.
 */
export function QadaFastToggle({ dayKey }: { dayKey: string }) {
  const fasted = useProgressStore(
    (s) => s.dailyProgress[dayKey]?.modules.some((m) => m.moduleId === 'fasting' && m.completed) ?? false,
  );
  const on = useQadaStore((s) => (s.paid[dayKey]?.fast ?? 0) > 0);
  const debts = useQadaStore((s) => s.debts);
  const paid = useQadaStore((s) => s.paid);
  const offset = useCalendarPrefs((s) => s.hijriOffset);

  if (!fasted || dayKey > keyOf(new Date()) || blockedReason(dateOf(dayKey), offset)) return null;
  if (!on && fastStatus({ debts, paid }, new Date(), offset).remaining === 0) return null;

  const flip = () => {
    setQadaFast(dayKey, !on, false);
    if (!on) toast.success('سُجّل قضاءً، تقبّل الله');
  };

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={flip}
      className={[
        'mt-2.5 w-full min-h-11 rounded-xl inline-flex items-center justify-center gap-2 text-sm font-semibold transition-colors duration-200 ease-out-soft',
        on
          ? 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light'
          : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10',
      ].join(' ')}
    >
      {on ? <Check size={15} strokeWidth={2.6} /> : <History size={15} />}
      {on ? 'صيام قضاء' : 'هذا الصيام قضاء عمّا فات'}
    </button>
  );
}
