import { useEffect, useRef } from 'react';

/**
 * Open overlays (Modal, BottomSheet), topmost last. Android's back button
 * closes the top one before it navigates (main.tsx) — it used to navigate
 * back underneath a still-open modal.
 */
const stack: Array<() => void> = [];

/** Close the topmost open overlay. Returns false when none is open. */
export function closeTopOverlay(): boolean {
  const close = stack[stack.length - 1];
  close?.();
  return !!close;
}

/** Register an overlay while `open`, so the back button closes it first. */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const close = () => latest.current();
    stack.push(close);
    return () => {
      const i = stack.indexOf(close);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
