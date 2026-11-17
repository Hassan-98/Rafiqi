import React from 'react';
import { motion } from '@/lib/motion';

interface StreakBadgeProps {
  streak: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StreakBadge = React.memo(function StreakBadge({ streak, label, size = 'md' }: StreakBadgeProps) {
  const sizes = {
    sm: { flame: 20, text: 'text-lg', sub: 'text-xs', wrap: 'gap-1 px-3 py-1.5' },
    md: { flame: 28, text: 'text-2xl', sub: 'text-sm', wrap: 'gap-2 px-4 py-2.5' },
    lg: { flame: 36, text: 'text-4xl', sub: 'text-base', wrap: 'gap-2.5 px-5 py-3' },
  }[size];

  const isActive = streak > 0;

  return (
    <div className={`inline-flex items-center rounded-full ${sizes.wrap} ${isActive ? 'bg-gold/15 dark:bg-gold/20' : 'bg-cream-dark dark:bg-dark-card'}`}>
      <motion.span
        aria-hidden="true"
        animate={isActive ? { scale: [1, 1.15, 1], rotate: [-5, 5, -3, 0] } : {}}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3 }}
        style={{ fontSize: sizes.flame }}
      >
        {isActive ? '🔥' : '💤'}
      </motion.span>

      <div className="flex flex-col leading-none">
        <span className={`font-bold font-counter ${sizes.text} ${isActive ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted'}`}>
          {streak}
        </span>
        {label && (
          <span className={`${sizes.sub} text-text-secondary dark:text-gray-400`}>{label}</span>
        )}
      </div>
    </div>
  );
});
