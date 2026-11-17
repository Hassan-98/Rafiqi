import type { ReactNode } from 'react';
import { motion } from '@/lib/motion';
import { toArabicDigits } from '@/services/statsService';

interface Threshold {
  at: number; // value (0..max) at/above which `color` applies
  color: string;
}

interface ProgressGaugeProps {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  thresholds?: Threshold[];
  variant?: 'semicircle' | 'ring';
  size?: number;
  /** Custom center renderer; defaults to the rounded percentage. */
  formatValue?: (pct: number) => ReactNode;
  trackColor?: string;
}

const DEFAULT_THRESHOLDS: Threshold[] = [
  { at: 0, color: 'var(--color-danger)' },
  { at: 40, color: 'var(--color-gold-dark)' },
  { at: 60, color: 'var(--color-gold)' },
  { at: 80, color: 'var(--color-teal)' },
];

function colorForPct(pct: number, thresholds: Threshold[]): string {
  let chosen = thresholds[0]?.color ?? 'var(--color-teal)';
  for (const t of thresholds) {
    if (pct >= t.at) chosen = t.color;
  }
  return chosen;
}

/**
 * Generalized gauge: a semicircle (180°) or full ring (270°) sweep with a
 * threshold-driven colour, animated stroke and a center label slot. Powers
 * the worship pulse, wird position %, taraweeh rate, asma coverage, etc.
 */
export function ProgressGauge({
  value,
  max = 100,
  label,
  sublabel,
  thresholds = DEFAULT_THRESHOLDS,
  variant = 'semicircle',
  size = 160,
  formatValue,
  trackColor = 'var(--color-track)',
}: ProgressGaugeProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const pct = Math.round(ratio * 100);
  const color = colorForPct(pct, thresholds);
  const stroke = Math.max(8, Math.round(size * 0.08));

  if (variant === 'semicircle') {
    const w = size;
    const h = size * 0.6;
    const r = (size - stroke) / 2;
    const cx = w / 2;
    const cy = size / 2;
    // 180° arc from left to right across the top.
    const startX = cx - r;
    const endX = cx + r;
    const arc = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;
    const len = Math.PI * r;
    const offset = len - ratio * len;

    return (
      <div className="flex flex-col items-center gap-1.5" style={{ width: w }}>
        <div className="relative" style={{ width: w, height: h }}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h + stroke / 2}`} aria-hidden="true">
            <path d={arc} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
            <motion.path
              d={arc}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={len}
              initial={{ strokeDashoffset: len }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="text-2xl font-bold font-counter" style={{ color }}>
              {formatValue ? formatValue(pct) : `${toArabicDigits(pct)}٪`}
            </span>
          </div>
        </div>
        {label ? <span className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{label}</span> : null}
        {sublabel ? <span className="text-[11px] text-text-muted">{sublabel}</span> : null}
      </div>
    );
  }

  // Full ring (270° sweep).
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const sweep = 0.75; // 270°
  const dash = circumference * sweep;
  const offset = dash - ratio * dash;

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-[135deg]" aria-hidden="true">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            initial={{ strokeDashoffset: dash }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-counter" style={{ color }}>
            {formatValue ? formatValue(pct) : `${toArabicDigits(pct)}٪`}
          </span>
          {label ? <span className="text-[11px] text-text-muted mt-0.5">{label}</span> : null}
        </div>
      </div>
      {sublabel ? <span className="text-[11px] text-text-muted">{sublabel}</span> : null}
    </div>
  );
}
