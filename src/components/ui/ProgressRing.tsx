import React, { useEffect, useId, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from '@/lib/motion';
import { toArabicDigits } from '@/utils/arabicFormat';

interface ProgressRingProps {
  value: number;       // 0–100
  size?: number;       // px
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  /** Gradient start color (default: teal). */
  colorFrom?: string;
  /** Gradient end color (default: teal-light). */
  colorTo?: string;
  trackColor?: string;
  showPercent?: boolean;
  animate?: boolean;
  /** Soft breathing pulse on the track for in-progress states. */
  pulse?: boolean;
}

export const ProgressRing = React.memo(function ProgressRing({
  value,
  size = 100,
  strokeWidth = 8,
  label,
  sublabel,
  colorFrom = 'var(--color-teal)',
  colorTo = 'var(--color-teal-light)',
  trackColor = 'var(--color-track)',
  showPercent = true,
  animate: shouldAnimate = true,
  pulse = false,
}: ProgressRingProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const reactId = useId();
  const gradientId = `pr-grad-${reactId.replace(/:/g, '')}`;
  const glowId = `pr-glow-${reactId.replace(/:/g, '')}`;

  const motionVal = useMotionValue(shouldAnimate ? 0 : clampedValue);
  const dashOffset = useTransform(motionVal, (v) => circumference - (v / 100) * circumference);
  const displayVal = useTransform(motionVal, (v) => toArabicDigits(Math.round(v)));

  const prevValue = useRef(0);
  useEffect(() => {
    if (shouldAnimate) {
      const ctrl = animate(motionVal, clampedValue, { duration: 1, ease: 'easeOut' });
      prevValue.current = clampedValue;
      return ctrl.stop;
    }
    motionVal.set(clampedValue);
    return undefined;
  }, [clampedValue, shouldAnimate, motionVal]);

  const cx = size / 2;
  const cy = size / 2;
  const isComplete = clampedValue >= 100;

  return (
    <div
      className="inline-flex flex-col items-center gap-1"
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
            {isComplete ? (
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null}
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            className={pulse ? 'animate-pulse-soft' : ''}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            filter={isComplete ? `url(#${glowId})` : undefined}
            style={{ strokeDashoffset: dashOffset }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showPercent ? (
            <span className="inline-flex items-baseline text-sm font-bold text-teal dark:text-teal-light font-counter leading-none">
              <motion.span>{displayVal}</motion.span>
              <span className="text-[0.75em] ms-0.5">٪</span>
            </span>
          ) : null}
          {label ? (
            <span className="text-[10px] text-text-muted mt-0.5 leading-none text-center px-1">
              {label}
            </span>
          ) : null}
        </div>
      </div>
      {sublabel ? (
        <span className="text-xs text-text-secondary dark:text-gray-400 text-center">{sublabel}</span>
      ) : null}
    </div>
  );
});
