import React from 'react';
import { Check, Clock, X, Circle } from 'lucide-react';

export type BadgeStatus = 'done' | 'pending' | 'missed' | 'neutral';
export type BadgeStyle = 'subtle' | 'solid' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'dot';

interface BadgeProps {
  count?: number;
  status?: BadgeStatus;
  label?: string;
  size?: BadgeSize;
  style?: BadgeStyle;
  className?: string;
}

const STATUS_SUBTLE: Record<BadgeStatus, string> = {
  done: 'bg-teal/12 text-teal dark:bg-teal/25 dark:text-teal-light',
  pending: 'bg-gold/15 text-gold-dark dark:bg-gold/20 dark:text-gold-light',
  missed: 'bg-danger/12 text-danger dark:bg-danger/25',
  neutral: 'bg-cream-dark text-text-secondary dark:bg-dark-card dark:text-text-muted',
};

const STATUS_SOLID: Record<BadgeStatus, string> = {
  done: 'bg-teal text-on-accent',
  pending: 'bg-gold text-text-primary',
  missed: 'bg-danger text-white',
  neutral: 'bg-text-muted text-white',
};

const STATUS_OUTLINE: Record<BadgeStatus, string> = {
  done: 'border border-teal/40 text-teal dark:text-teal-light',
  pending: 'border border-gold/40 text-gold-dark dark:text-gold-light',
  missed: 'border border-danger/40 text-danger',
  neutral: 'border border-text-muted/30 text-text-muted',
};

const STATUS_ICON: Record<BadgeStatus, React.ComponentType<{ className?: string }>> = {
  done: Check,
  pending: Clock,
  missed: X,
  neutral: Circle,
};

const STATUS_DOT: Record<BadgeStatus, string> = {
  done: 'bg-teal',
  pending: 'bg-gold',
  missed: 'bg-danger',
  neutral: 'bg-text-muted',
};

function pickStyles(status: BadgeStatus, style: BadgeStyle): string {
  if (style === 'solid') return STATUS_SOLID[status];
  if (style === 'outline') return STATUS_OUTLINE[status];
  return STATUS_SUBTLE[status];
}

export const Badge = React.memo(function Badge({
  count,
  status,
  label,
  size = 'md',
  style = 'subtle',
  className = '',
}: BadgeProps) {
  if (size === 'dot' && status) {
    return (
      <span
        aria-label={label ?? status}
        className={[
          'inline-block w-2 h-2 rounded-full',
          STATUS_DOT[status],
          className,
        ].join(' ')}
      />
    );
  }

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';

  if (status !== undefined) {
    const Icon = STATUS_ICON[status];
    return (
      <span
        className={[
          'inline-flex items-center rounded-full font-medium leading-none',
          sizeClass,
          pickStyles(status, style),
          className,
        ].join(' ')}
        role="status"
      >
        <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
        {label ? <span>{label}</span> : null}
      </span>
    );
  }

  if (count !== undefined) {
    return (
      <span
        className={[
          'inline-flex items-center justify-center rounded-full font-bold',
          'bg-teal text-on-accent min-w-[1.4em] h-[1.4em] px-1',
          sizeClass,
          className,
        ].join(' ')}
        aria-label={`${count}`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium',
        sizeClass,
        pickStyles('neutral', style),
        className,
      ].join(' ')}
    >
      {label}
    </span>
  );
});
