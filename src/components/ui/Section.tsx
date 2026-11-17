import React from 'react';
import { SectionTitle } from '@/components/ui/Ornament';

interface SectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standardized section: the shared ornamental header (gold star · title ·
 * optional subtitle · trailing action) over a vertical stack. `icon` is
 * accepted for backwards compatibility but the star replaces it.
 */
export function Section({ title, subtitle, action, children, className }: SectionProps) {
  return (
    <section className={['flex flex-col gap-2.5', className ?? ''].join(' ')}>
      <SectionTitle title={title} subtitle={subtitle} action={action} />
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
