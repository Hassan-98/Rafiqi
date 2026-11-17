import React from 'react';
import { motion } from '@/lib/motion';
import { hapticsService, type HapticImpact } from '@/services/HapticsService';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'soft' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  haptic?: HapticImpact | 'none';
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-glow-teal),var(--shadow-inset-soft)] ' +
    'hover:brightness-[1.06] active:translate-y-px',
  secondary:
    'bg-white text-teal ring-1 ring-teal/20 shadow-[var(--shadow-xs)] hover:bg-teal/5 ' +
    'dark:bg-dark-card dark:text-teal-light dark:ring-white/10 dark:hover:bg-dark-surface',
  ghost: 'bg-transparent text-teal hover:bg-teal/10 dark:text-teal-light dark:hover:bg-teal/15',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95 shadow-[var(--shadow-sm)]',
  gold:
    'bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-sm),var(--shadow-inset-soft)] ' +
    'hover:shadow-[var(--shadow-glow-gold)]',
  soft: 'bg-teal/10 text-teal hover:bg-teal/15 dark:bg-teal/15 dark:text-teal-light dark:hover:bg-teal/25',
  icon:
    'bg-transparent text-teal hover:bg-teal/10 dark:text-teal-light dark:hover:bg-teal/15 ' +
    'w-10 h-10 p-0 rounded-xl inline-flex items-center justify-center',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-sm rounded-xl gap-1.5 min-h-9',
  md: 'px-5 py-2.5 text-[15px] rounded-[var(--radius-btn)] gap-2 min-h-12',
  lg: 'px-7 py-3.5 text-base rounded-2xl gap-2.5 min-h-14',
};

export const Button = React.memo(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  haptic = 'light',
  children,
  disabled,
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  const isIcon = variant === 'icon';
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.96 }}
      transition={{ type: 'spring', stiffness: 480, damping: 26 }}
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={(e) => {
        if (!disabled && !loading && haptic !== 'none') {
          void hapticsService.impact(haptic);
        }
        onClick?.(e);
      }}
      className={[
        'inline-flex items-center justify-center font-semibold select-none whitespace-nowrap',
        'transition-[filter,box-shadow,background-color,transform] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream dark:focus-visible:ring-offset-dark-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        isIcon ? '' : sizeStyles[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {children ? <span>{children}</span> : null}
      {!loading && rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </motion.button>
  );
});
