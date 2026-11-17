import React from 'react';
import { Button } from '@/components/ui/Button';
import { Medallion } from '@/components/ui/Ornament';

interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; onClick: () => void };
}

/**
 * A composed "getting started" placeholder: an ornamental seal (or a custom
 * illustration), a title, one line of guidance and an optional first action.
 */
export function EmptyState({ illustration, title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
      {illustration ? (
        <div className="w-28 h-28 opacity-70 flex items-center justify-center">{illustration}</div>
      ) : (
        <Medallion size={72} tone="gold">
          <span className="text-gold text-lg">✦</span>
        </Medallion>
      )}
      <h3 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark text-balance">
        {title}
      </h3>
      {description ? (
        <p className="text-sm text-text-muted max-w-xs leading-relaxed text-pretty">{description}</p>
      ) : null}
      {cta ? (
        <div className="mt-2">
          <Button variant="primary" onClick={cta.onClick}>
            {cta.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
