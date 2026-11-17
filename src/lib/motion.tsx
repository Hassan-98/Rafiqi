/**
 * Native, dependency-free replacement for the subset of `framer-motion` this
 * app uses. It mirrors the same import surface — `motion.<tag>`,
 * `AnimatePresence`, `useMotionValue`, `useTransform`, `animate` — so files can
 * simply import from `@/lib/motion` instead of `framer-motion`.
 *
 * It drives animations with plain CSS transitions (and the Web-Animation-free
 * requestAnimationFrame loop for motion values), which is far lighter than
 * framer-motion at runtime and ships zero extra bundle weight.
 *
 * Supported: initial / animate / exit / transition (duration, delay, ease,
 * spring-approx), whileTap / whileHover, variants + custom, AnimatePresence
 * (incl. mode="wait"), SVG pathLength, and motion values bound to style or text.
 * Intentionally no-op: layout / layoutId / drag (graceful — never throws).
 */
import React, {
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ───────────────────────── types ─────────────────────────
export interface Transition {
  duration?: number;
  delay?: number;
  ease?: string | readonly number[];
  type?: 'spring' | 'tween' | 'keyframes' | string;
  stiffness?: number;
  damping?: number;
  mass?: number;
  bounce?: number;
  repeat?: number;
  repeatType?: string;
  when?: unknown;
  staggerChildren?: number;
  delayChildren?: number;
  [key: string]: unknown;
}

type ScalarValue = string | number;
type TargetValue = ScalarValue | ScalarValue[];
interface Target {
  /** Per-target transition override (framer allows `animate={{x:1, transition}}`). */
  transition?: Transition;
  [key: string]: TargetValue | Transition | undefined;
}
type TargetResolvable = Target | string | string[] | false | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Variants = Record<string, Target | ((custom: any) => Target)>;

interface MotionExtraProps {
  initial?: TargetResolvable;
  animate?: TargetResolvable;
  exit?: TargetResolvable;
  transition?: Transition;
  variants?: Variants;
  custom?: unknown;
  whileTap?: Target;
  whileHover?: Target;
  whileFocus?: Target;
  layout?: boolean | 'position' | 'size';
  layoutId?: string;
  drag?: boolean | 'x' | 'y';
  dragConstraints?: unknown;
  dragElastic?: unknown;
  dragMomentum?: boolean;
  dragTransition?: unknown;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  onDrag?: (event: any, info: any) => void;
  onDragStart?: (event: any, info: any) => void;
  onDragEnd?: (event: any, info: any) => void;
  onTap?: (event: any) => void;
  onTapStart?: (event: any) => void;
  onTapCancel?: (event: any) => void;
  onHoverStart?: (event: any) => void;
  onHoverEnd?: (event: any) => void;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  onAnimationComplete?: () => void;
  style?: Record<string, unknown>;
  children?: React.ReactNode | MotionValue<string> | MotionValue<number>;
}

export type HTMLMotionProps<T extends keyof React.JSX.IntrinsicElements> =
  Omit<React.ComponentPropsWithRef<T>, 'style' | 'children' | 'onDrag' | 'onDragStart' | 'onDragEnd'> &
  MotionExtraProps;

// Props consumed by us and never forwarded to the DOM.
const MOTION_PROP_KEYS = new Set([
  'initial', 'animate', 'exit', 'transition', 'variants', 'custom',
  'whileTap', 'whileHover', 'whileFocus', 'whileInView', 'whileDrag',
  'layout', 'layoutId', 'layoutDependency', 'layoutScroll',
  'drag', 'dragConstraints', 'dragElastic', 'dragMomentum', 'dragListener',
  'dragControls', 'dragSnapToOrigin', 'dragTransition', 'dragDirectionLock',
  'onDrag', 'onDragStart', 'onDragEnd', 'onDirectionLock',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate', 'onHoverStart',
  'onHoverEnd', 'onTapStart', 'onTap', 'onTapCancel',
  'viewport', 'transformTemplate', 'transition',
]);

// ───────────────────────── motion values ─────────────────────────
type Sub<T> = (v: T) => void;

class MotionValue<T = number | string> {
  /** marker for detection */
  readonly __isMotionValue = true;
  private current: T;
  private subs = new Set<Sub<T>>();
  constructor(v: T) {
    this.current = v;
  }
  get(): T {
    return this.current;
  }
  set(v: T): void {
    if (v === this.current) return;
    this.current = v;
    this.subs.forEach((s) => s(v));
  }
  on(_event: 'change', cb: Sub<T>): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
}

function isMotionValue(v: unknown): v is MotionValue {
  return typeof v === 'object' && v !== null && (v as { __isMotionValue?: boolean }).__isMotionValue === true;
}

export function useMotionValue<T>(initial: T): MotionValue<T> {
  const ref = useRef<MotionValue<T> | null>(null);
  if (ref.current === null) ref.current = new MotionValue<T>(initial);
  return ref.current;
}

export function useTransform<I, O>(source: MotionValue<I>, transformer: (v: I) => O): MotionValue<O> {
  const fnRef = useRef(transformer);
  fnRef.current = transformer;
  const out = useRef<MotionValue<O> | null>(null);
  if (out.current === null) out.current = new MotionValue<O>(transformer(source.get()));
  useLayoutEffect(() => {
    const apply = (v: I) => out.current!.set(fnRef.current(v));
    apply(source.get());
    return source.on('change', apply);
  }, [source]);
  return out.current;
}

interface AnimateOptions {
  duration?: number;
  delay?: number;
  ease?: string | number[];
  onUpdate?: (v: number) => void;
  onComplete?: () => void;
}

// ── Reduced motion ─────────────────────────────────────────
// Honors BOTH the in-app "تقليل الحركة" toggle (html.reduce-motion, set by
// App.tsx) and the OS-level prefers-reduced-motion. This lib drives motion
// through inline transitions, rAF, and WAAPI — none of which the CSS
// kill-switch in index.css can reach, so without this gate the setting only
// stopped CSS animations while every JS-driven one kept moving.
const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function prefersReduced(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion')) {
    return true;
  }
  return reducedMotionQuery?.matches ?? false;
}

export function animate(
  value: MotionValue<number>,
  to: number,
  options: AnimateOptions = {},
): { stop: () => void } {
  if (prefersReduced()) {
    value.set(to);
    options.onUpdate?.(to);
    options.onComplete?.();
    return { stop() {} };
  }
  const from = typeof value.get() === 'number' ? (value.get() as number) : 0;
  const durationMs = (options.duration ?? 0.3) * 1000;
  const delayMs = (options.delay ?? 0) * 1000;
  const easeFn = easingFunction(options.ease);
  let raf = 0;
  let startTime = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    if (!startTime) startTime = now + delayMs;
    if (now < startTime) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const progress = durationMs <= 0 ? 1 : Math.min(1, (now - startTime) / durationMs);
    const eased = easeFn(progress);
    const v = from + (to - from) * eased;
    value.set(v);
    options.onUpdate?.(v);
    if (progress < 1) raf = requestAnimationFrame(tick);
    else options.onComplete?.();
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

// ───────────────────────── easing ─────────────────────────
function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (t: number) => number {
  // Newton-Raphson sampling — good enough for UI motion.
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const x2 = sampleX(t) - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= x2 / d;
    }
    return t;
  };
  return (x: number) => sampleY(solveX(Math.max(0, Math.min(1, x))));
}

const NAMED_EASE: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  circIn: [0.55, 0, 1, 0.45],
  circOut: [0, 0.55, 0.45, 1],
  backOut: [0.34, 1.56, 0.64, 1],
  anticipate: [0.36, 0, 0.66, -0.56],
};

function easingFunction(ease?: string | readonly number[]): (t: number) => number {
  if (Array.isArray(ease) && ease.length === 4) {
    return cubicBezier(ease[0], ease[1], ease[2], ease[3]);
  }
  if (typeof ease === 'string' && NAMED_EASE[ease]) {
    const [a, b, c, d] = NAMED_EASE[ease];
    return cubicBezier(a, b, c, d);
  }
  return cubicBezier(0.25, 0.1, 0.25, 1);
}

function cssEasing(ease?: string | readonly number[], type?: string): string {
  if (Array.isArray(ease) && ease.length === 4) return `cubic-bezier(${ease.join(',')})`;
  if (typeof ease === 'string') {
    if (ease === 'linear') return 'linear';
    if (NAMED_EASE[ease]) return `cubic-bezier(${NAMED_EASE[ease].join(',')})`;
  }
  if (type === 'spring') return 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  return 'cubic-bezier(0.25, 0.1, 0.25, 1)';
}

// ───────────────────────── style application ─────────────────────────
const TRANSFORM_KEYS = [
  'x', 'y', 'z', 'translateX', 'translateY', 'translateZ',
  'scale', 'scaleX', 'scaleY', 'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'skewX', 'skewY', 'perspective',
];
const TRANSFORM_SET = new Set(TRANSFORM_KEYS);

const UNITLESS = new Set([
  'opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink',
  'order', 'zoom', 'scale', 'scaleX', 'scaleY', 'fillOpacity', 'strokeOpacity',
  'strokeDashoffset', 'strokeDasharray', 'strokeWidth', 'pathLength',
]);

const px = (v: ScalarValue): string => (typeof v === 'number' ? `${v}px` : v);
const deg = (v: ScalarValue): string => (typeof v === 'number' ? `${v}deg` : v);

function buildTransform(t: Record<string, ScalarValue>): string {
  const out: string[] = [];
  if ('perspective' in t) out.push(`perspective(${px(t.perspective)})`);
  if ('x' in t) out.push(`translateX(${px(t.x)})`);
  if ('y' in t) out.push(`translateY(${px(t.y)})`);
  if ('z' in t) out.push(`translateZ(${px(t.z)})`);
  if ('translateX' in t) out.push(`translateX(${px(t.translateX)})`);
  if ('translateY' in t) out.push(`translateY(${px(t.translateY)})`);
  if ('translateZ' in t) out.push(`translateZ(${px(t.translateZ)})`);
  if ('rotate' in t) out.push(`rotate(${deg(t.rotate)})`);
  if ('rotateX' in t) out.push(`rotateX(${deg(t.rotateX)})`);
  if ('rotateY' in t) out.push(`rotateY(${deg(t.rotateY)})`);
  if ('rotateZ' in t) out.push(`rotateZ(${deg(t.rotateZ)})`);
  if ('scale' in t) out.push(`scale(${t.scale})`);
  if ('scaleX' in t) out.push(`scaleX(${t.scaleX})`);
  if ('scaleY' in t) out.push(`scaleY(${t.scaleY})`);
  if ('skewX' in t) out.push(`skewX(${deg(t.skewX)})`);
  if ('skewY' in t) out.push(`skewY(${deg(t.skewY)})`);
  return out.join(' ');
}

function kebab(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

interface MotionNode extends HTMLElement {
  __pathLen?: number;
  __anim?: Animation;
  getTotalLength?: () => number;
}

const scalar = (v: TargetValue): ScalarValue => (Array.isArray(v) ? v[0] : v);

function setStyleProp(node: MotionNode, key: string, value: ScalarValue): void {
  const v = typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : `${value}`;
  node.style.setProperty(kebab(key), v);
}

function hasKeyframes(target: Target): boolean {
  for (const k in target) if (Array.isArray(target[k])) return true;
  return false;
}

/** Multi-step values (e.g. scale:[1,1.2,1], y:[0,-6,0]) → Web Animations API,
 *  which CSS transitions can't express. Also handles looping (repeat). */
function animateKeyframes(node: MotionNode, target: Target, transition: Transition = {}): void {
  if (prefersReduced() || typeof node.animate !== 'function') {
    const last: Target = {};
    for (const k in target) last[k] = Array.isArray(target[k]) ? target[k][target[k].length - 1] : target[k];
    applyTarget(node, last, { instant: true });
    return;
  }
  const tr = (target.transition as Transition | undefined) ?? transition;
  const keys = Object.keys(target).filter((k) => k !== 'pathLength' && k !== 'transition');
  let frames = 1;
  for (const k of keys) if (Array.isArray(target[k])) frames = Math.max(frames, (target[k] as ScalarValue[]).length);
  const hasTransform = keys.some((k) => TRANSFORM_SET.has(k));
  const frameAt = (v: TargetValue, i: number): ScalarValue =>
    Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v;

  const list: Keyframe[] = [];
  for (let i = 0; i < frames; i++) {
    const frame: Record<string, string | number> = {};
    if (hasTransform) {
      const tObj: Record<string, ScalarValue> = {};
      for (const k of keys) if (TRANSFORM_SET.has(k)) tObj[k] = frameAt(target[k] as TargetValue, i);
      frame.transform = buildTransform(tObj);
    }
    for (const k of keys) {
      if (TRANSFORM_SET.has(k)) continue;
      const v = frameAt(target[k] as TargetValue, i);
      frame[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v;
    }
    list.push(frame as Keyframe);
  }

  const dur = (tr.duration ?? 0.5) * 1000;
  const delay = (tr.delay ?? 0) * 1000;
  const repeat = tr.repeat;
  const iterations = repeat === Infinity ? Infinity : typeof repeat === 'number' ? repeat + 1 : 1;
  const direction = tr.repeatType === 'reverse' || tr.repeatType === 'mirror' ? 'alternate' : 'normal';
  node.__anim?.cancel();
  node.__anim = node.animate(list, {
    duration: dur,
    delay,
    easing: cssEasing(tr.ease, tr.type),
    iterations,
    direction: direction as PlaybackDirection,
    fill: iterations === Infinity ? 'none' : 'forwards',
  });
}

function applyTarget(
  node: MotionNode,
  target: Target,
  opts: { transition?: Transition; instant?: boolean },
): void {
  // Keyframe arrays need the Web Animations API (unless applying instantly).
  if (!opts.instant && hasKeyframes(target)) {
    animateKeyframes(node, target, opts.transition);
    return;
  }
  const animatedProps: string[] = [];

  if ('pathLength' in target && typeof node.getTotalLength === 'function') {
    if (node.__pathLen === undefined) node.__pathLen = node.getTotalLength();
    const len = node.__pathLen || 0;
    node.style.strokeDasharray = `${len}`;
    node.style.strokeDashoffset = `${len * (1 - Number(scalar(target.pathLength as TargetValue)))}`;
    animatedProps.push('stroke-dashoffset');
  }

  let hasTransform = false;
  for (const k of TRANSFORM_KEYS) {
    if (k in target) {
      hasTransform = true;
      break;
    }
  }
  if (hasTransform) {
    const scalarized: Record<string, ScalarValue> = {};
    for (const k of TRANSFORM_KEYS) if (k in target) scalarized[k] = scalar(target[k] as TargetValue);
    node.style.transform = buildTransform(scalarized);
    animatedProps.push('transform');
  }

  for (const key in target) {
    if (key === 'pathLength' || key === 'transition' || TRANSFORM_SET.has(key)) continue;
    setStyleProp(node, key, scalar(target[key] as TargetValue));
    animatedProps.push(kebab(key));
  }

  if (opts.instant || prefersReduced()) {
    node.style.transition = 'none';
  } else {
    const tr = (target.transition as Transition | undefined) ?? opts.transition ?? {};
    const dur = tr.duration ?? (tr.type === 'spring' ? 0.45 : 0.3);
    const delay = tr.delay ?? 0;
    const ease = cssEasing(tr.ease, tr.type);
    const props = animatedProps.length ? Array.from(new Set(animatedProps)) : ['all'];
    node.style.transition = props.map((p) => `${p} ${dur}s ${ease} ${delay}s`).join(', ');
  }
}

function transitionDurationMs(transition?: Transition): number {
  if (prefersReduced()) return 0;
  const tr = transition ?? {};
  const dur = tr.duration ?? (tr.type === 'spring' ? 0.45 : 0.3);
  const delay = tr.delay ?? 0;
  return (dur + delay) * 1000;
}

// ───────────────────────── variant resolution ─────────────────────────
function resolveTarget(
  t: TargetResolvable,
  variants: Variants | undefined,
  custom: unknown,
): Target | null {
  if (t == null || t === false) return null;
  if (typeof t === 'string') {
    const v = variants?.[t];
    if (!v) return null;
    return typeof v === 'function' ? v(custom) : v;
  }
  if (Array.isArray(t)) {
    let merged: Target = {};
    for (const name of t) {
      const v = variants?.[name];
      if (v) merged = { ...merged, ...(typeof v === 'function' ? v(custom) : v) };
    }
    return merged;
  }
  return t;
}

// ───────────────────────── presence (exit) ─────────────────────────
interface PresenceCtx {
  isPresent: boolean;
  onExitComplete: () => void;
}
const PresenceContext = createContext<PresenceCtx | null>(null);

// ───────────────────────── the motion component ─────────────────────────
const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();

function createMotionComponent(tag: string) {
  const Component = forwardRef<HTMLElement, Record<string, unknown>>(function Motion(props, ref) {
    const {
      initial, animate: animateProp, exit, transition, variants, custom,
      whileTap, whileHover, whileFocus,
      style, children, onTap,
      onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onPointerEnter,
      ...rest
    } = props as Record<string, unknown> & {
      initial?: TargetResolvable;
      animate?: TargetResolvable;
      exit?: TargetResolvable;
      transition?: Transition;
      variants?: Variants;
      custom?: unknown;
      whileTap?: Target;
      whileHover?: Target;
      whileFocus?: Target;
      style?: React.CSSProperties & Record<string, unknown>;
      children?: React.ReactNode;
      onTap?: (e: React.PointerEvent | React.MouseEvent) => void;
    };

    const innerRef = useRef<MotionNode | null>(null);
    const setRef = useCallback(
      (node: MotionNode | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      },
      [ref],
    );

    const presence = useContext(PresenceContext);
    const isPresent = presence ? presence.isPresent : true;

    const animTarget = useMemo(
      () => resolveTarget(animateProp, variants, custom),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [JSON.stringify(animateProp), JSON.stringify(variants), custom],
    );
    const animTargetRef = useRef(animTarget);
    animTargetRef.current = animTarget;
    const transitionRef = useRef(transition);
    transitionRef.current = transition;

    // Split out static style and any motion-value-bound style props.
    const { staticStyle, mvStyle } = useMemo(() => {
      const ss: React.CSSProperties = {};
      const mv: [string, MotionValue][] = [];
      if (style) {
        for (const k in style) {
          const val = (style as Record<string, unknown>)[k];
          if (isMotionValue(val)) mv.push([k, val]);
          else (ss as Record<string, unknown>)[k] = val;
        }
      }
      return { staticStyle: ss, mvStyle: mv };
    }, [style]);

    // Mount: apply initial → animate (or animate instantly when no entrance).
    const mountedRef = useRef(false);
    useLayoutEffect(() => {
      const node = innerRef.current;
      if (!node || mountedRef.current) return;
      mountedRef.current = true;
      node.__pathLen = undefined;
      const initTarget = initial === false ? null : resolveTarget(initial, variants, custom);
      const target = animTargetRef.current;
      if (initTarget) {
        applyTarget(node, initTarget, { instant: true });
        // Force reflow so the browser registers the start before transitioning.
        void node.offsetWidth;
        requestAnimationFrame(() => {
          const n = innerRef.current;
          if (n && target) applyTarget(n, target, { transition: transitionRef.current });
        });
      } else if (target) {
        applyTarget(node, target, { instant: true });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // React to `animate` changes after mount.
    const animKey = JSON.stringify(animTarget);
    useLayoutEffect(() => {
      const node = innerRef.current;
      if (!node || !mountedRef.current) return;
      if (animTargetRef.current) applyTarget(node, animTargetRef.current, { transition: transitionRef.current });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animKey]);

    // Exit animation when removed under <AnimatePresence>.
    const exitingRef = useRef(false);
    useLayoutEffect(() => {
      if (isPresent || exitingRef.current) return;
      exitingRef.current = true;
      const node = innerRef.current;
      const exitTarget = resolveTarget(exit, variants, custom);
      const exitTransition = (exitTarget?.transition as Transition | undefined) ?? transition;
      if (node && exitTarget) applyTarget(node, exitTarget, { transition: exitTransition });
      const ms = transitionDurationMs(exitTransition);
      const timer = setTimeout(() => presence?.onExitComplete(), ms);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPresent]);

    // Cancel any running keyframe animation when the element unmounts.
    useLayoutEffect(() => () => innerRef.current?.__anim?.cancel(), []);

    // Bind motion-value styles directly to the DOM (no React re-render).
    useLayoutEffect(() => {
      const node = innerRef.current;
      if (!node) return;
      const unsubs = mvStyle.map(([key, mv]) => {
        const apply = (v: string | number) => setStyleProp(node, key, v);
        apply(mv.get());
        return mv.on('change', apply);
      });
      return () => unsubs.forEach((u) => u());
    }, [mvStyle]);

    // Interactive (whileTap / whileHover) overlays, reverting to `animate`.
    const applyInteractive = (extra: Target) => {
      const node = innerRef.current;
      if (!node) return;
      applyTarget(node, { ...(animTargetRef.current ?? {}), ...extra }, { transition: { duration: 0.13 } });
    };
    const revertInteractive = () => {
      const node = innerRef.current;
      if (node && animTargetRef.current) applyTarget(node, animTargetRef.current, { transition: transitionRef.current });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      if (whileTap) applyInteractive(whileTap);
      (onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(e);
    };
    const handlePointerUp = (e: React.PointerEvent) => {
      if (whileTap || whileHover) revertInteractive();
      (onPointerUp as ((e: React.PointerEvent) => void) | undefined)?.(e);
    };
    const handlePointerLeave = (e: React.PointerEvent) => {
      if (whileTap || whileHover) revertInteractive();
      (onPointerLeave as ((e: React.PointerEvent) => void) | undefined)?.(e);
    };
    const handlePointerCancel = (e: React.PointerEvent) => {
      if (whileTap || whileHover) revertInteractive();
      (onPointerCancel as ((e: React.PointerEvent) => void) | undefined)?.(e);
    };
    const handlePointerEnter = (e: React.PointerEvent) => {
      if (whileHover) applyInteractive(whileHover);
      (onPointerEnter as ((e: React.PointerEvent) => void) | undefined)?.(e);
    };

    // Strip motion-only props before forwarding to the DOM.
    const domProps: Record<string, unknown> = {};
    for (const k in rest) {
      if (!MOTION_PROP_KEYS.has(k)) domProps[k] = (rest as Record<string, unknown>)[k];
    }
    // framer's `onTap` fires on release — map it onto a click handler.
    if (onTap) {
      const prevClick = domProps.onClick as ((e: React.MouseEvent) => void) | undefined;
      domProps.onClick = (e: React.MouseEvent) => {
        prevClick?.(e);
        onTap(e);
      };
    }

    const needsPointer = Boolean(whileTap || whileHover);
    const renderedChildren = isMotionValue(children) ? String(children.get()) : children;

    // If a motion value is used as text content, keep it synced imperatively.
    useLayoutEffect(() => {
      if (!isMotionValue(children)) return;
      const node = innerRef.current;
      if (!node) return;
      const apply = (v: string | number) => {
        node.textContent = String(v);
      };
      apply(children.get());
      return children.on('change', apply);
    }, [children]);

    return React.createElement(
      tag,
      {
        ...domProps,
        ref: setRef,
        style: staticStyle,
        onPointerDown: needsPointer || onPointerDown ? handlePointerDown : undefined,
        onPointerUp: needsPointer || onPointerUp ? handlePointerUp : undefined,
        onPointerLeave: needsPointer || onPointerLeave ? handlePointerLeave : undefined,
        onPointerCancel: needsPointer || onPointerCancel ? handlePointerCancel : undefined,
        onPointerEnter: whileHover || onPointerEnter ? handlePointerEnter : undefined,
      },
      renderedChildren,
    );
  });
  Component.displayName = `motion.${tag}`;
  return Component as unknown as React.ComponentType<Record<string, unknown>>;
}

type MotionProxy = {
  [K in keyof React.JSX.IntrinsicElements]: React.ComponentType<
    HTMLMotionProps<K>
  >;
};

export const motion: MotionProxy = new Proxy({} as MotionProxy, {
  get(_target, prop: string) {
    if (typeof prop !== 'string') return undefined;
    let comp = cache.get(prop);
    if (!comp) {
      comp = createMotionComponent(prop);
      cache.set(prop, comp);
    }
    return comp;
  },
});

// ───────────────────────── AnimatePresence ─────────────────────────
function PresenceChild({
  present,
  onExitComplete,
  children,
}: {
  present: boolean;
  onExitComplete: () => void;
  children: React.ReactNode;
}) {
  const value = useMemo<PresenceCtx>(
    () => ({ isPresent: present, onExitComplete }),
    [present, onExitComplete],
  );
  // Safety backstop: if the child isn't a motion element (and so never reports
  // its own exit), still release it shortly after it's removed.
  useLayoutEffect(() => {
    if (present) return;
    const timer = setTimeout(onExitComplete, 700);
    return () => clearTimeout(timer);
  }, [present, onExitComplete]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function AnimatePresence({
  children,
  mode = 'sync',
}: {
  children?: React.ReactNode;
  mode?: 'sync' | 'wait' | 'popLayout';
  initial?: boolean;
  custom?: unknown;
  onExitComplete?: () => void;
}) {
  const target = useMemo(
    () => React.Children.toArray(children).filter(isValidElement) as React.ReactElement[],
    [children],
  );
  const targetKeys = target.map((c) => String(c.key));

  // Keep the latest element for every key currently present.
  const latest = useRef(new Map<string, React.ReactElement>());
  target.forEach((c) => latest.current.set(String(c.key), c));

  const [orderKeys, setOrderKeys] = useState<string[]>(targetKeys);
  const exiting = useRef(new Set<string>());

  useLayoutEffect(() => {
    setOrderKeys((prev) => {
      const present = new Set(targetKeys);
      for (const k of prev) if (!present.has(k)) exiting.current.add(k);
      for (const k of targetKeys) exiting.current.delete(k);
      const next = [...prev];
      for (const k of targetKeys) if (!next.includes(k)) next.push(k);
      const filtered = next.filter((k) => present.has(k) || exiting.current.has(k));
      const changed = filtered.length !== prev.length || filtered.some((k, i) => k !== prev[i]);
      return changed ? filtered : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKeys.join('|')]);

  const handleExitComplete = useCallback((key: string) => {
    exiting.current.delete(key);
    latest.current.delete(key);
    setOrderKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  }, []);

  const presentSet = new Set(targetKeys);
  const anyExiting = orderKeys.some((k) => !presentSet.has(k));

  return (
    <>
      {orderKeys.map((key) => {
        const present = presentSet.has(key);
        // mode="wait": hold back newly-entering children until exits finish.
        if (mode === 'wait' && present && anyExiting) return null;
        const el = latest.current.get(key);
        if (!el) return null;
        return (
          <PresenceChild key={key} present={present} onExitComplete={() => handleExitComplete(key)}>
            {el}
          </PresenceChild>
        );
      })}
    </>
  );
}
