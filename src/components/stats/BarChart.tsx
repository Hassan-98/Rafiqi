import { useEffect, useRef } from 'react';
import { toArabicDigits } from '@/services/statsService';
import { motion } from '@/lib/motion';

export interface BarSegment {
  value: number;
  color: string;
  label?: string;
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  /** Optional secondary caption under the value (e.g. weekday letter). */
  sublabel?: string;
  /** Marks the "today" / current bar so the chart can highlight it. */
  highlight?: boolean;
  /** Stacked segments — when present, `value` is ignored in favour of the sum. */
  segments?: BarSegment[];
}

interface BarChartProps {
  data: BarDatum[];
  orientation?: 'vertical' | 'horizontal';
  max?: number;
  showValues?: boolean;
  formatValue?: (v: number) => string;
  height?: number;
  /**
   * Horizontal-scroll mode for long series (a full month/year of daily bars).
   * Each bar gets a fixed width and the whole row scrolls, so bars stay wide
   * enough to read instead of collapsing into hairlines. Values are always
   * shown in this mode.
   */
  scrollable?: boolean;
  /** Fixed column width (incl. gap) used only in scrollable mode. */
  barMinWidth?: number;
  /** Tap a bar (index into `data`) — used to open a day's detail sheet. */
  onSelectBar?: (index: number) => void;
}

function datumTotal(d: BarDatum): number {
  return d.segments ? d.segments.reduce((s, x) => s + x.value, 0) : d.value;
}

/**
 * SVG-free (flex/CSS) bar chart with rounded caps, supporting vertical and
 * horizontal orientation plus stacked segments (used for sunnah-by-type).
 * In `scrollable` mode the vertical chart lays bars out at a fixed width inside
 * a horizontally-scrolling track so a whole month/year stays legible.
 * Animated grow-in via framer-motion.
 */
export function BarChart({
  data,
  orientation = 'vertical',
  max,
  showValues = true,
  formatValue = (v) => toArabicDigits(Math.round(v)),
  height = 160,
  scrollable = false,
  barMinWidth = 38,
  onSelectBar,
}: BarChartProps) {
  const globalMax = max ?? Math.max(1, ...data.map(datumTotal));
  // Scrollable rows open on the latest bars (the inline-end side; negative scrollLeft in RTL).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -el.scrollWidth : el.scrollWidth;
  }, [data.length, scrollable]);

  if (orientation === 'horizontal') {
    return (
      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const total = datumTotal(d);
          const pct = (total / globalMax) * 100;
          return (
            <div key={`${d.label}-${i}`} className="flex items-center gap-2">
              <span className="text-[11px] text-text-secondary dark:text-text-on-dark w-16 shrink-0 truncate text-start">
                {d.label}
              </span>
              <div className="flex-1 h-4 rounded-full bg-track overflow-hidden flex">
                {d.segments ? (
                  d.segments.map((seg, si) => (
                    <motion.div
                      key={si}
                      className="h-full"
                      style={{ background: seg.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(seg.value / globalMax) * 100}%` }}
                      transition={{ duration: 0.6, delay: i * 0.04 }}
                    />
                  ))
                ) : (
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: d.color ?? 'var(--color-teal)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04 }}
                  />
                )}
              </div>
              {showValues ? (
                <span className="text-[11px] font-counter font-semibold text-text-primary dark:text-text-on-dark w-9 shrink-0 text-end">
                  {formatValue(total)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Vertical ──────────────────────────────────────────────────────────────
  const showVals = scrollable ? true : showValues;

  const renderColumn = (d: BarDatum, i: number) => {
    const total = datumTotal(d);
    const pct = (total / globalMax) * 100;
    const active = total > 0;
    const barColor = d.highlight
      ? 'var(--color-gold)'
      : d.segments
        ? 'transparent'
        : d.color ?? 'var(--color-teal)';

    const inner = (
      <>
        {showVals ? (
          <span
            className={[
              'text-[10px] font-counter font-semibold tabular-nums leading-none',
              active ? 'text-text-primary dark:text-text-on-dark' : 'text-text-muted/50',
            ].join(' ')}
          >
            {formatValue(total)}
          </span>
        ) : null}
        <div className="relative w-full max-w-[30px] mx-auto flex-1 min-h-0 rounded-lg bg-track/70 flex flex-col justify-end overflow-hidden">
          <motion.div
            className="w-full rounded-lg overflow-hidden flex flex-col-reverse"
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(pct, active ? 4 : 0)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: Math.min(i * 0.03, 0.5) }}
            style={{ background: barColor, minHeight: active ? 4 : 0 }}
          >
            {d.segments
              ? d.segments.map((seg, si) => (
                  <div
                    key={si}
                    style={{ background: seg.color, height: `${(seg.value / total) * 100}%` }}
                  />
                ))
              : null}
          </motion.div>
        </div>
        <span
          className={[
            'text-[10px] truncate w-full text-center leading-tight',
            d.highlight ? 'text-gold-dark dark:text-gold-light font-bold' : 'text-text-muted',
          ].join(' ')}
        >
          {d.label}
        </span>
        {d.sublabel ? (
          <span className="text-[8px] text-text-muted/70 leading-none">{d.sublabel}</span>
        ) : null}
      </>
    );

    const columnClass = [
      'flex flex-col items-center gap-1 h-full justify-end min-w-0',
      scrollable ? 'shrink-0' : 'flex-1',
    ].join(' ');
    const columnStyle = scrollable ? { width: barMinWidth } : undefined;

    if (onSelectBar) {
      return (
        <button
          key={`${d.label}-${i}`}
          type="button"
          onClick={() => onSelectBar(i)}
          className={`${columnClass} rounded-lg hover:bg-teal/5 dark:hover:bg-teal/10 transition-colors cursor-pointer`}
          style={columnStyle}
        >
          {inner}
        </button>
      );
    }
    return (
      <div key={`${d.label}-${i}`} className={columnClass} style={columnStyle}>
        {inner}
      </div>
    );
  };

  if (scrollable) {
    return (
      <div ref={scroller} className="overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
        <div className="flex items-end gap-1" style={{ height, width: 'max-content' }}>
          {data.map(renderColumn)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height }}>
      {data.map(renderColumn)}
    </div>
  );
}
