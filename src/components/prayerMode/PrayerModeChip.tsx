import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router';
import { BellOff, ChevronLeft } from 'lucide-react';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { usePrayerModeStore } from '@/store/prayerModeStore';

/** Home / prayer-hero entry to «وضع الصلاة» (Android only — nothing to silence elsewhere). */
export function PrayerModeChip({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const enabled = usePrayerModeStore((s) => s.enabled);
  if (Capacitor.getPlatform() !== 'android') return null;
  return (
    <HapticPressable
      type="button"
      onClick={() => navigate('/prayer-mode')}
      className={[
        'flex items-center gap-2.5 min-h-11 rounded-[var(--radius-inner)] px-3.5 py-2 text-start',
        'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)]',
        className,
      ].join(' ')}
    >
      <span className="w-8 h-8 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
        <BellOff size={16} />
      </span>
      <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">وضع الصلاة</span>
      <span className={['text-xs font-bold', enabled ? 'text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
        {enabled ? 'مفعّل' : 'يُسكت الهاتف وقت الصلاة'}
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" />
    </HapticPressable>
  );
}
