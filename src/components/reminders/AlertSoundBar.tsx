import { useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { stopAlertSound, useAlertSound } from '@/services/notifications/DesktopNotificationService';

/** While a reminder's sound (an adhan…) plays on the desktop/web: «إيقاف» on top of every page, and Esc. */
export function AlertSoundBar() {
  const title = useAlertSound((s) => s.title);
  useEffect(() => {
    if (!title) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stopAlertSound();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [title]);
  if (!title) return null;
  return (
    <div role="status" className="fixed top-3 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none" dir="rtl">
      <div className="pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-full bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-lg)] ps-4 pe-1.5 py-1.5">
        <Volume2 size={18} className="shrink-0 motion-safe:animate-pulse" aria-hidden />
        <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold">{title}</span>
        <button
          type="button"
          onClick={stopAlertSound}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-9 px-4 rounded-full bg-white/95 text-teal font-bold text-[13px]"
        >
          <VolumeX size={16} aria-hidden />
          إيقاف
        </button>
      </div>
    </div>
  );
}
