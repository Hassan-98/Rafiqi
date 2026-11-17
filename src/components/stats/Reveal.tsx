import type { ReactNode } from 'react';
import { motion } from '@/lib/motion';

/** Staggered fade-up entrance for stats sections (transform/opacity only). */
export function Reveal({ delay = 0, children, className }: { delay?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(delay, 0.4), ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
