import { motion, AnimatePresence } from '@/lib/motion';

interface SparkleProps {
  show: boolean;
  count?: number;
  size?: number;
  color?: string;
}

/**
 * Particle burst effect for completion moments (e.g. finishing dhikr,
 * marking a prayer, unlocking a badge). Render conditionally; the
 * AnimatePresence handles enter/exit.
 */
export function Sparkle({ show, count = 8, size = 8, color = '#C9A84C' }: SparkleProps) {
  if (!show) return null;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dx = Math.cos(angle) * 60;
    const dy = Math.sin(angle) * 60;
    return { i, dx, dy };
  });

  return (
    <AnimatePresence>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {particles.map(({ i, dx, dy }) => (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1] }}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: 9999,
              background: color,
              boxShadow: `0 0 ${size}px ${color}`,
            }}
          />
        ))}
      </div>
    </AnimatePresence>
  );
}
