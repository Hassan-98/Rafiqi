import { toArabicDigits } from '@/services/statsService';

type TriState = 'a' | 'b' | 'c';

interface CellGridMapProps {
  count: number;
  /** Index → state. Indices follow `oneBased`. Missing → 'c' (untouched). */
  states: Record<number, TriState>;
  colors: { a: string; b: string; c: string };
  columns?: number;
  onSelect?: (i: number) => void;
  labelFor?: (i: number) => string;
  oneBased?: boolean;
  /** Show the cell index number inside each cell. */
  showNumbers?: boolean;
}

/**
 * Fixed-count cell grid for bounded sets: 99 names (studied / favourited /
 * untouched), 30 taraweeh nights, 1-604 Mushaf page density. Each cell is
 * tappable with a tooltip.
 */
export function CellGridMap({
  count,
  states,
  colors,
  columns = 11,
  onSelect,
  labelFor,
  oneBased = true,
  showNumbers = false,
}: CellGridMapProps) {
  const cells = Array.from({ length: count }, (_, i) => (oneBased ? i + 1 : i));

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map((idx) => {
        const state = states[idx] ?? 'c';
        const bg = colors[state];
        const interactive = !!onSelect;
        return (
          <button
            key={idx}
            type="button"
            disabled={!interactive}
            onClick={interactive ? () => onSelect!(idx) : undefined}
            title={labelFor ? labelFor(idx) : String(idx)}
            className={[
              'aspect-square rounded-[5px] flex items-center justify-center text-[9px] font-counter transition-transform',
              interactive ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default',
            ].join(' ')}
            style={{ background: bg, color: state === 'c' ? 'var(--color-text-muted)' : 'var(--color-on-accent)' }}
          >
            {showNumbers ? toArabicDigits(idx) : ''}
          </button>
        );
      })}
    </div>
  );
}
