import { useEffect } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Sparkle } from './Sparkle';
import { springBouncy } from '@/utils/motion';

interface CompletionBlessingProps {
  open: boolean;
  /** Arabic blessing — defaults to "تقبّل الله". */
  message?: string;
  /** Secondary line (e.g. what was completed). */
  detail?: string;
  onDone: () => void;
}

/**
 * A light, reverent completion moment any module/tool can fire — a centered
 * gold medallion that pops in with a sparkle burst and a blessing
 * (تقبّل الله / ما شاء الله / الحمد لله), then auto-dismisses. The lighter
 * counterpart to the full-screen Quran WirdCompletionRitual, so every act of
 * worship gets a small, calm acknowledgement (not gamified confetti).
 */
export function CompletionBlessing({
  open,
  message = 'تقبّل الله',
  detail,
  onDone,
}: CompletionBlessingProps) {
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [open, onDone]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
          className="fixed inset-0 z-[60] flex items-center justify-center p-8"
          style={{ background: 'rgba(10, 25, 20, 0.45)', backdropFilter: 'blur(2px)' }}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={springBouncy}
            className="relative flex flex-col items-center gap-3"
          >
            <div className="relative w-24 h-24 flex items-center justify-center">
              <Sparkle show={open} count={10} />
              <span
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl shadow-[var(--shadow-glow-gold)]"
                style={{ backgroundImage: 'var(--gradient-gold)' }}
              >
                ﷽
              </span>
            </div>
            <p className="font-display text-2xl font-bold text-gold-light drop-shadow-[0_2px_10px_rgba(201,168,76,0.5)]">
              {message}
            </p>
            {detail ? <p className="text-sm text-white/80">{detail}</p> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
