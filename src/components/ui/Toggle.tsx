import React from 'react';
import { motion } from '@/lib/motion';

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Accessible name for the switch — REQUIRED whenever there's no visible
   *  label next to it, or screen readers announce an anonymous "switch". */
  label?: string;
  /** Use the label for aria only (the visible text is rendered elsewhere). */
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const Toggle = React.memo(function Toggle({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
  size = 'md',
}: ToggleProps) {
  const trackW = size === 'sm' ? 'w-9' : 'w-12';
  const trackH = size === 'sm' ? 'h-5' : 'h-6';
  const thumbSize = size === 'sm' ? 16 : 20;
  const thumbOff = size === 'sm' ? 2 : 3;
  const thumbOn = size === 'sm' ? 20 : 27;

  return (
    <label
      className={[
        'inline-flex items-center gap-3 select-none',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        dir="ltr"
        onClick={() => !disabled && onChange(!checked)}
        className={[
          `relative inline-flex shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold`,
          trackW, trackH,
          checked ? 'bg-teal' : 'bg-text-muted/30 dark:bg-dark-border',
        ].join(' ')}
      >
        <motion.span
          className="absolute top-0 bottom-0 my-auto rounded-full bg-white shadow"
          style={{ width: thumbSize, height: thumbSize }}
          animate={{ x: checked ? thumbOn : thumbOff }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
      {label && !hideLabel && (
        <span className="text-sm text-text-primary dark:text-gray-200">{label}</span>
      )}
    </label>
  );
});
