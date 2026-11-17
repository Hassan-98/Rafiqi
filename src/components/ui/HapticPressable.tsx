import React from 'react';
import { motion, type HTMLMotionProps } from '@/lib/motion';
import { hapticsService, type HapticImpact } from '@/services/HapticsService';

interface HapticPressableProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  haptic?: HapticImpact | 'none';
  pressScale?: number;
}

/**
 * Generic button-like wrapper that adds a small `whileTap` scale and an
 * optional haptic impact. Use anywhere a plain `<button>` feels too flat.
 */
export const HapticPressable = React.forwardRef<HTMLButtonElement, HapticPressableProps>(
  function HapticPressable(
    { children, haptic = 'light', pressScale = 0.97, onClick, className, ...rest },
    ref,
  ) {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: pressScale }}
        transition={{ type: 'spring', stiffness: 480, damping: 28 }}
        onClick={(e) => {
          if (haptic !== 'none') void hapticsService.impact(haptic);
          onClick?.(e);
        }}
        className={['active:outline-none', className ?? ''].join(' ')}
        {...rest}
      >
        {children}
      </motion.button>
    );
  },
);
