import type { ReactNode } from 'react';

export type MatrixCell = 'done' | 'partial' | 'miss' | 'future';

interface WeekMatrixProps {
  /** Column headers, in display order (RTL: first = rightmost). */
  columns: string[];
  rows: { label: ReactNode; cells: MatrixCell[] }[];
  /** Highlight a column (e.g. today) with a soft ring. */
  highlightCol?: number;
}

const CELL_CLS: Record<MatrixCell, string> = {
  done: 'bg-teal dark:bg-teal-light',
  partial: 'bg-teal/35 dark:bg-teal-light/35',
  miss: 'bg-danger/15 dark:bg-danger/25',
  future: 'bg-track',
};

/**
 * Compact label × days grid — THE at-a-glance view for anything done
 * per-slot per-day (prayers 5×7, habits n×7). Solid teal = done, faded =
 * partial, red wash = missed, neutral = not yet / future. Pure CSS grid.
 */
export function WeekMatrix({ columns, rows, highlightCol }: WeekMatrixProps) {
  return (
    <div className="flex flex-col gap-1.5" dir="rtl">
      {/* Header row */}
      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: `5.5rem repeat(${columns.length}, 1fr)` }}>
        <span />
        {columns.map((c, i) => (
          <span
            key={i}
            className={[
              'text-center text-[10px] font-semibold',
              i === highlightCol ? 'text-teal dark:text-teal-light' : 'text-text-muted',
            ].join(' ')}
          >
            {c}
          </span>
        ))}
      </div>
      {rows.map((row, r) => (
        <div
          key={r}
          className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: `5.5rem repeat(${columns.length}, 1fr)` }}
        >
          <span className="text-[11px] font-semibold text-text-secondary dark:text-text-on-dark/80 truncate pl-1">
            {row.label}
          </span>
          {row.cells.map((cell, c) => (
            <span
              key={c}
              className={[
                'h-6 rounded-lg',
                CELL_CLS[cell],
                c === highlightCol ? 'ring-2 ring-gold/60' : '',
              ].join(' ')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
