import React from 'react';
import { motion } from '@/lib/motion';

/**
 * Card surfaces (redesign 2026-09).
 *  - plain      default container: soft white/card, hairline ring, tinted shadow
 *  - elevated   plain + deeper shadow (hover lift)
 *  - inset      recessed well inside a page or card (no shadow)
 *  - glass      translucent over imagery
 *  - hero       the palette's accent surface with the etched lattice
 *  - gradient-edge  warm ornate panel with a gold ring + lattice (module heroes)
 *  - gold-rim   plain with a gold top keyline (highlighted item)
 *  - night      deep night surface
 * On `hero`, text must use text-on-accent (never text-white).
 */
export type CardVariant =
  | 'plain'
  | 'elevated'
  | 'inset'
  | 'glass'
  | 'hero'
  | 'gradient-edge'
  | 'gold-rim'
  | 'night';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** @deprecated Use variant="gold-rim" */
  goldAccent?: boolean;
  variant?: CardVariant;
  onClick?: () => void;
  animate?: boolean;
  pressable?: boolean;
  as?: 'div' | 'article' | 'section';
}

const RING = 'ring-1 ring-black/[0.04] dark:ring-white/[0.06]';

const VARIANT_STYLES: Record<CardVariant, string> = {
  plain: `bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ${RING}`,
  elevated: `bg-white dark:bg-dark-card shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transition-shadow duration-300 ${RING}`,
  inset: 'bg-cream-dark/55 dark:bg-dark-surface ring-1 ring-black/[0.03] dark:ring-white/[0.04]',
  glass: 'glass shadow-[var(--shadow-md)]',
  hero: 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-md)]',
  'gradient-edge':
    'bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ' +
    'ring-1 ring-gold/30 dark:ring-gold/20 shadow-[var(--shadow-sm)]',
  'gold-rim': `bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ${RING} border-t-2 border-t-gold`,
  night: 'bg-[image:var(--gradient-night)] text-text-on-dark ring-1 ring-white/[0.06] shadow-[var(--shadow-lg)]',
};

/** Variants that carry the etched girih lattice, and its colour. */
const LATTICE: Partial<Record<CardVariant, string>> = {
  hero: 'text-on-accent',
  'gradient-edge': 'text-gold',
  night: 'text-gold',
};

export const Card = React.memo(function Card({
  children,
  className = '',
  goldAccent = false,
  variant,
  onClick,
  animate = false,
  pressable = false,
  as: Tag = 'div',
}: CardProps) {
  const resolvedVariant: CardVariant = variant ?? (goldAccent ? 'gold-rim' : 'plain');
  const lattice = LATTICE[resolvedVariant];
  const base = [
    'relative isolate rounded-[var(--radius-card)] overflow-hidden',
    VARIANT_STYLES[resolvedVariant],
    onClick || pressable ? 'cursor-pointer' : '',
    className,
  ].join(' ');
  const content = (
    <>
      {lattice ? <span aria-hidden className={`lattice lattice-fade ${lattice}`} /> : null}
      {children}
    </>
  );

  if (animate || pressable) {
    return (
      <motion.div
        initial={animate ? { opacity: 0, y: 12 } : undefined}
        animate={animate ? { opacity: 1, y: 0 } : undefined}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        whileTap={pressable ? { scale: 0.985 } : undefined}
        className={base}
        onClick={onClick}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <Tag className={base} onClick={onClick}>
      {content}
    </Tag>
  );
});
