import React from 'react';
import type { HeatmapCell } from '@/types';

interface WeeklyHeatmapProps {
  cells: HeatmapCell[];      // ordered by date asc, up to ~12 weeks × 7 days
  weeks?: number;
  title?: string;
}

function getIntensityClass(rate: number): string {
  if (rate === 0) return 'bg-cream-dark dark:bg-dark-card';
  if (rate < 0.25) return 'bg-gold/20';
  if (rate < 0.50) return 'bg-gold/40';
  if (rate < 0.75) return 'bg-teal/40';
  return 'bg-teal';
}

const DAY_LABELS = ['ج', 'س', 'ح', 'ن', 'ث', 'ر', 'خ']; // Fri→Thu (Arabic)

export const WeeklyHeatmap = React.memo(function WeeklyHeatmap({
  cells,
  weeks = 12,
  title,
}: WeeklyHeatmapProps) {
  // Group cells into weeks (7 each), latest last
  const paddedCells = [...cells];
  while (paddedCells.length % 7 !== 0) {
    paddedCells.unshift({ date: '', value: 0 });
  }

  const weekChunks: HeatmapCell[][] = [];
  for (let i = 0; i < paddedCells.length; i += 7) {
    weekChunks.push(paddedCells.slice(i, i + 7));
  }
  const visibleWeeks = weekChunks.slice(-weeks);

  return (
    <div className="flex flex-col gap-2">
      {title && <h3 className="text-sm font-semibold text-text-secondary dark:text-gray-400">{title}</h3>}

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 me-1">
          {DAY_LABELS.map((d, i) => (
            <span key={i} className="w-3 h-4 text-[9px] text-text-muted flex items-center justify-center">{d}</span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-1 overflow-x-auto">
          {visibleWeeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell.date ? `${cell.date}: ${Math.round(cell.value * 100)}%` : ''}
                  className={[
                    'w-4 h-4 rounded-sm transition-colors duration-200',
                    getIntensityClass(cell.value),
                  ].join(' ')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[10px] text-text-muted">
        <span>أقل</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${getIntensityClass(v)}`} />
        ))}
        <span>أكثر</span>
      </div>
    </div>
  );
});
