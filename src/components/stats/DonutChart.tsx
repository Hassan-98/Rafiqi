import type { ReactNode } from 'react';
import { motion } from '@/lib/motion';
import { toArabicDigits } from '@/services/statsService';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  centerLabel?: ReactNode;
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  emptyLabel?: string;
}

/**
 * SVG donut with animated arc sweep, gap between slices and an optional
 * center label slot. Replaces the recharts-based ring for distributions
 * (wird unit, bookmark colour, donation cause, hadith grade, etc.).
 */
export function DonutChart({
  slices,
  centerLabel,
  size = 160,
  thickness = 22,
  showLegend = true,
  emptyLabel = 'لا توجد بيانات',
}: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center gap-2" style={{ width: size }}>
        <div
          className="rounded-full border-[length:var(--t)] border-track flex items-center justify-center"
          style={{ width: size, height: size, ['--t' as string]: `${thickness}px` }}
        >
          <span className="text-xs text-text-muted">{emptyLabel}</span>
        </div>
      </div>
    );
  }

  let acc = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const dash = frac * circumference;
      const gap = circumference - dash;
      const offset = -acc * circumference;
      acc += frac;
      return { ...s, dash, gap, offset, pct: Math.round(frac * 100) };
    });

  return (
    <div className="flex flex-col items-center gap-3" style={{ width: '100%' }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-track)" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={a.offset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel}
        </div>
      </div>

      {showLegend ? (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
          {arcs.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary dark:text-text-on-dark">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
              {a.label}
              <span className="font-counter text-text-muted">{toArabicDigits(a.pct)}٪</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
