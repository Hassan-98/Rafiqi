import { useEffect, useId, useRef, useState } from 'react';
import { motion } from '@/lib/motion';
import type { TrendPoint } from '@/types';
import { CHART, toArabicDigits } from '@/services/statsService';

export interface LineSeries {
  points: TrendPoint[];
  color?: string;
  area?: boolean;
  dashed?: boolean;
  label?: string;
}

interface LineChartProps {
  series: LineSeries[];
  height?: number;
  yMax?: number;
  formatY?: (v: number) => string;
  referenceY?: number;
  referenceLabel?: string;
  /** Axis labels for the first / last x points (Arabic). */
  startLabel?: string;
  endLabel?: string;
}

const PAD = { top: 12, right: 8, bottom: 8, left: 8 };

/** Width of the chart box — the SVG is drawn 1:1 so dots stay round. */
function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Smooth (Catmull-Rom → cubic Bézier) path through the points, clamped to the plot box. */
function smoothPath(pts: (readonly [number, number])[], minY: number, maxY: number): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.12;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) * t);
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) * t);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Pure-SVG line/area chart: smooth curve with an animated draw, soft gradient
 * fill, dashed grid, a dot on the latest value and an optional dashed
 * reference line (e.g. the wird target). Time flows RIGHT→LEFT (oldest on the
 * right) to match the RTL bar charts and calendars.
 */
export function LineChart({
  series,
  height = 160,
  yMax,
  formatY = (v) => toArabicDigits(Math.round(v)),
  referenceY,
  referenceLabel,
  startLabel,
  endLabel,
}: LineChartProps) {
  const gradId = useId().replace(/:/g, '');
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const maxV = yMax ?? Math.max(1, ...allValues);
  const n = Math.max(...series.map((s) => s.points.length), 1);

  // RTL time flow (matches the bar charts): oldest on the RIGHT, newest on the LEFT.
  const xFor = (i: number) => PAD.left + innerW - (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v: number) => PAD.top + innerH - (Math.min(v, maxV) / maxV) * innerH;
  const baseY = PAD.top + innerH;

  const hasData = allValues.some((v) => v > 0);

  return (
    <div className="w-full" ref={boxRef}>
      <div className="flex justify-end -mb-1">
        <span className="text-[9px] text-text-muted font-counter">{formatY(maxV)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="مخطط الاتجاه">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`${gradId}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? CHART.teal} stopOpacity={0.3} />
              <stop offset="100%" stopColor={s.color ?? CHART.teal} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={PAD.top + innerH * (1 - f)}
            y2={PAD.top + innerH * (1 - f)}
            stroke={CHART.track}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}
        <line x1={PAD.left} y1={baseY} x2={PAD.left + innerW} y2={baseY} stroke={CHART.track} strokeWidth={1.2} />

        {referenceY != null && referenceY <= maxV ? (
          <line
            x1={PAD.left}
            y1={yFor(referenceY)}
            x2={PAD.left + innerW}
            y2={yFor(referenceY)}
            stroke={CHART.gold}
            strokeWidth={1.2}
            strokeDasharray="5 4"
            opacity={0.9}
          />
        ) : null}

        {series.map((s, si) => {
          const color = s.color ?? CHART.teal;
          const pts = s.points.map((p, i) => [xFor(i), yFor(p.value)] as const);
          if (pts.length === 0) return null;
          const linePath = smoothPath(pts, PAD.top, baseY);
          const areaPath = `${linePath} L ${xFor(pts.length - 1)} ${baseY} L ${xFor(0)} ${baseY} Z`;
          const last = pts[pts.length - 1];
          return (
            <g key={si}>
              {s.area ? <path d={areaPath} fill={`url(#${gradId}-${si})`} /> : null}
              <motion.path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
              {!s.dashed && hasData ? (
                <>
                  <circle cx={last[0]} cy={last[1]} r={6} fill={color} opacity={0.18} />
                  <circle cx={last[0]} cy={last[1]} r={3.2} fill={color} />
                </>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* x-axis labels + reference label */}
      <div dir="rtl" className="flex items-center justify-between px-1 mt-1 text-[10px] text-text-muted font-counter">
        <span>{startLabel ?? ''}</span>
        {referenceLabel ? <span className="text-gold-dark dark:text-gold-light">{referenceLabel}</span> : null}
        <span>{endLabel ?? ''}</span>
      </div>

      {!hasData ? (
        <p className="text-[11px] text-text-muted text-center -mt-16 mb-10">لا يوجد نشاط في هذه الفترة</p>
      ) : null}

      {series.some((s) => s.label) ? (
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {series.map((s, si) =>
            s.label ? (
              <span key={si} className="inline-flex items-center gap-1 text-[11px] text-text-secondary dark:text-text-on-dark/75">
                <span className="w-3 h-0.5 rounded-full" style={{ background: s.color ?? CHART.teal }} />
                {s.label}
              </span>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
