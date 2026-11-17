import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/motion';
import { useCloseOnBack } from '@/lib/overlayBack';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}

const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

export function Modal({ open, onClose, title, children, size = 'md', hideClose = false }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useCloseOnBack(open, onClose);

  // Focus trap + body scroll lock
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    const prev = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();
    return () => {
      document.body.classList.remove('modal-open');
      prev?.focus();
    };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          aria-modal="true"
          role="dialog"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-dark-bg/60 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            ref={contentRef}
            tabIndex={-1}
            className={[
              'relative w-full rounded-[var(--radius-card)] bg-white dark:bg-dark-surface',
              'shadow-[var(--shadow-float)] focus:outline-none',
              // Long forms scroll inside the panel (header stays put) instead
              // of running off-screen above and below, unreachable.
              'flex flex-col max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))]',
              sizeClass[size],
            ].join(' ')}
            initial={{ scale: 0.90, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            {/* Header */}
            {(title || !hideClose) && (
              <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-teal/10 dark:border-dark-border">
                {title && (
                  <h2 id="modal-title" className="text-lg font-bold text-teal dark:text-teal-light font-display">
                    {title}
                  </h2>
                )}
                {!hideClose && (
                  <button
                    onClick={onClose}
                    aria-label="إغلاق"
                    className="ms-auto p-2 rounded-full hover:bg-teal/10 text-text-secondary hover:text-teal transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Body — rounded itself: scroll-fade paints square bands that
                would square off the panel's corners (top too without a header). */}
            <div
              className={[
                'scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 rounded-b-[var(--radius-card)]',
                title || !hideClose ? '' : 'rounded-t-[var(--radius-card)]',
              ].join(' ')}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
