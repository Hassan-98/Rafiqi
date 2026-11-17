import React, { useCallback } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/motion';
import { toArabicDigits } from '@/utils/arabicFormat';

interface CounterButtonProps {
  current: number;
  max: number;
  label?: string;        // Arabic dhikr short label
  onIncrement: () => void;
  onComplete?: () => void;
  disabled?: boolean;
  /** Diameter in px (default 112). */
  size?: number;
}

/**
 * The round tally: a gold progress ring around the count, a check once the
 * target is reached. All colours are palette tokens (currentColor + text-*).
 */
export const CounterButton = React.memo(function CounterButton({
  current,
  max,
  label,
  onIncrement,
  onComplete,
  disabled = false,
  size = 112,
}: CounterButtonProps) {
  const isDone = current >= max;
  const progress = max > 0 ? Math.min(1, current / max) : 0;

  const handleTap = useCallback(() => {
    if (disabled || isDone) return;
    onIncrement();
    if (current + 1 >= max) onComplete?.();
  }, [current, max, disabled, isDone, onIncrement, onComplete]);

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        type="button"
        onTap={handleTap}
        disabled={disabled || isDone}
        whileTap={isDone ? {} : { scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        aria-label={`عدّاد: ${toArabicDigits(current)} من ${toArabicDigits(max)}`}
        style={{ width: size, height: size }}
        className={[
          'relative rounded-full flex flex-col items-center justify-center shrink-0',
          'select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream dark:focus-visible:ring-offset-dark-bg',
          'transition-[background-color,box-shadow] duration-300',
          isDone
            ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-glow-teal)] cursor-default'
            : 'bg-white dark:bg-dark-card text-teal dark:text-teal-light shadow-[var(--shadow-md)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] cursor-pointer',
        ].join(' ')}
      >
        {/* viewBox is essential: without it the ring didn't scale on some WebViews. */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            strokeWidth="4"
            stroke="currentColor"
            className={isDone ? 'text-on-accent/25' : 'text-cream-dark dark:text-dark-surface'}
          />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            strokeWidth="4"
            stroke="currentColor"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - 100 * progress}
            opacity={progress === 0 ? 0 : 1}
            className={[
              'transition-[stroke-dashoffset] duration-300 ease-out-soft motion-reduce:transition-none',
              isDone ? 'text-on-accent/85' : 'text-gold',
            ].join(' ')}
          />
        </svg>

        <AnimatePresence mode="popLayout">
          <motion.span
            key={isDone ? 'done' : current}
            className="relative font-bold font-counter tabular-nums leading-none"
            style={{ fontSize: size * 0.3 }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.15 }}
          >
            {isDone ? <Check size={size * 0.34} strokeWidth={2.6} /> : toArabicDigits(current)}
          </motion.span>
        </AnimatePresence>

        {!isDone && (
          <span className="relative text-xs text-text-muted mt-1 font-counter">
            من {toArabicDigits(max)}
          </span>
        )}
      </motion.button>

      {label && (
        <p className="text-sm text-text-secondary dark:text-text-on-dark/70 text-center font-arabic max-w-[10rem]">
          {label}
        </p>
      )}
    </div>
  );
});
