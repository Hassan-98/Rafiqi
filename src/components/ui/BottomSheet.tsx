import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/motion';
import { useCloseOnBack } from '@/lib/overlayBack';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: ('quarter' | 'half' | 'full');
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // When a sheet is opened by a *tap* (e.g. tapping a Quran word), the browser
  // fires a synthesized compatibility `click` ~immediately after `pointerup`.
  // That ghost click lands on the freshly-mounted full-screen backdrop and
  // would instantly close the sheet ("opens for a millisecond then closes").
  // We record when the sheet opened and ignore any backdrop click that arrives
  // within a short grace window — a deliberate dismiss tap always comes later.
  const openedAtRef = useRef(0);
  useCloseOnBack(open, onClose);
  useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);

  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return; // swallow the ghost click
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Dialog semantics + initial focus (Modal had both; BottomSheet — which
  // hosts most of the app's pickers — announced as nothing to screen readers
  // and left focus behind the overlay).
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      // Focus after the enter animation kicks off so it doesn't scroll-jump.
      const t = setTimeout(() => sheetRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    restoreFocusRef.current?.focus?.();
    return undefined;
  }, [open]);

  // Swipe-down-to-dismiss with real pointer events. The previous version
  // passed framer-style `drag` props that the in-house motion shim silently
  // ignores — the advertised gesture never worked. Dragging starts from the
  // handle/header zone only, so it never fights the body's scroll.
  const dragState = useRef<{ startY: number; lastY: number; lastT: number; active: boolean }>({
    startY: 0,
    lastY: 0,
    lastT: 0,
    active: false,
  });

  const onDragStart = (e: React.PointerEvent) => {
    dragState.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onDragMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st.active || !sheetRef.current) return;
    const dy = e.clientY - st.startY;
    st.lastY = e.clientY;
    st.lastT = performance.now();
    // Only downward drag moves the sheet; a slight upward pull resists.
    const offset = dy > 0 ? dy : dy * 0.15;
    sheetRef.current.style.transform = `translateY(${offset}px)`;
  };

  const onDragEnd = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st.active || !sheetRef.current) return;
    st.active = false;
    const dy = e.clientY - st.startY;
    const dt = Math.max(1, performance.now() - st.lastT);
    const velocity = (e.clientY - st.lastY) / dt; // px per ms at release
    if (dy > 90 || velocity > 0.5) {
      onClose();
      // Leave the transform — the exit animation takes over from here.
      return;
    }
    sheetRef.current.style.transition = 'transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1)';
    sheetRef.current.style.transform = 'translateY(0px)';
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-dark-bg/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={[
              'relative w-full max-h-[85dvh] bg-white dark:bg-dark-surface outline-none',
              'rounded-t-[1.5rem] shadow-[var(--shadow-float)] flex flex-col',
              // Desktop: a full-width sheet looks broken at 1920 — cap + centre.
              'lg:max-w-2xl lg:mx-auto',
            ].join(' ')}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            {/* Drag zone: handle + header */}
            <div
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-teal/20 dark:bg-dark-border" />
              </div>

              {title && (
                <div className="flex items-center justify-between px-5 pb-3 border-b border-teal/10 dark:border-dark-border">
                  <h2 id={titleId} className="text-lg font-bold text-teal dark:text-teal-light font-display">
                    {title}
                  </h2>
                  <button
                    onClick={onClose}
                    aria-label="إغلاق"
                    className="p-2 rounded-full hover:bg-teal/10 text-text-secondary hover:text-teal"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
