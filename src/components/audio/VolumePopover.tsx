import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { VolumeControl } from '@/components/audio/ListenControls';

/**
 * One-tap volume right in the player: the button shows the current level;
 * tapping it opens a compact slider (with mute) just above the bar. Closes on
 * outside tap / Escape. Shared by the Quran player bar and adhkar listening.
 */
export function VolumePopover({
  volume,
  muted,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number, muted: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Anchored to the button but rendered in a portal on <body>: the player
  // bars use overflow:hidden, which clipped an in-place popover.
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(256, window.innerWidth * 0.8);
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
      setPos({ bottom: window.innerHeight - r.top + 8, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  const pct = Math.round(volume * 100);
  const silent = muted || pct === 0;
  const Icon = silent ? VolumeX : pct < 50 ? Volume1 : Volume2;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="مستوى الصوت"
        aria-expanded={open}
        className={[
          'w-10 h-11 inline-flex items-center justify-center rounded-xl transition-colors',
          silent ? 'text-danger' : 'text-text-muted hover:text-teal dark:hover:text-teal-light',
          open ? 'bg-teal/10' : '',
        ].join(' ')}
      >
        <Icon size={18} />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label="مستوى صوت التلاوة"
              dir="rtl"
              className="fixed z-[60] w-64 max-w-[80vw] rounded-2xl bg-white dark:bg-dark-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[var(--shadow-lg)] p-2.5"
              style={{ bottom: pos.bottom, left: pos.left }}
            >
              <VolumeControl volume={volume} muted={muted} onChange={onChange} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
