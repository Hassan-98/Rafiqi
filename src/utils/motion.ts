/**
 * Shared framer-motion spring/transition presets — the JS counterpart to the
 * CSS motion tokens in `index.css` (@theme). Hardcoded spring params were
 * scattered across components (Card 300/28, Button 480/26, nav 480/32);
 * importing from here makes motion feel unified app-wide.
 *
 * Added in Wave 0 of the app-wide redesign; components migrate to it in
 * later waves.
 */
import type { Transition } from '@/lib/motion';

/** Gentle, settled — cards, panels, content entrances. */
export const springSoft: Transition = { type: 'spring', stiffness: 300, damping: 28 };

/** Snappy — buttons, taps, toggles. */
export const springStiff: Transition = { type: 'spring', stiffness: 480, damping: 30 };

/** Playful overshoot — celebratory / "pop" moments. */
export const springBouncy: Transition = { type: 'spring', stiffness: 380, damping: 18 };

/** Tween durations (seconds) mirroring the CSS --duration-* tokens. */
export const durations = { fast: 0.15, base: 0.22, slow: 0.36 } as const;

export const easeOutSoft = [0.16, 1, 0.3, 1] as const;
export const easeInOutSoft = [0.45, 0, 0.2, 1] as const;

/** Standard content entrance (fade + small rise). */
export const fadeRise: Transition = { duration: durations.base, ease: easeOutSoft };
