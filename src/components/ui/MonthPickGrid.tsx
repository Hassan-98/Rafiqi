import { useMemo, useState } from 'react';
import { addMonths, format, getDaysInMonth, parseISO, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Islamic week starts on Saturday. */
const HEAD = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const monthFmt = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' });

export type DayMark = 'full' | 'partial' | 'excused' | null;

interface Props {
  /** The latest pickable day (today / tonight) — later days are disabled. */
  todayKey: string;
  markOf: (dateKey: string) => DayMark;
  /** A small gold dot under the number (e.g. witr prayed). */
  dotOf?: (dateKey: string) => boolean;
  /** Month badge from the number of `full` days, e.g. «٣ ليالٍ». */
  countLabel: (fullDays: number) => string;
  onPick: (dateKey: string) => void;
}

/** A small month calendar; tap any past day to log or edit it (قيام nights, prayer days). */
export function MonthPickGrid({ todayKey, markOf, dotOf, countLabel, onPick }: Props) {
  const [offset, setOffset] = useState(0);
  const month = useMemo(() => addMonths(startOfMonth(parseISO(`${todayKey}T12:00:00`)), offset), [todayKey, offset]);

  const cells = useMemo(() => {
    const lead = (month.getDay() + 1) % 7; // Sat = 0
    const prefix = format(month, 'yyyy-MM');
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= getDaysInMonth(month); d++) out.push(`${prefix}-${String(d).padStart(2, '0')}`);
    return out;
  }, [month]);
  const full = cells.filter((k) => k && markOf(k) === 'full').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="الشهر السابق"
          onClick={() => setOffset((o) => o - 1)}
          className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-text-secondary hover:bg-teal/10"
        >
          <ChevronRight size={17} />
        </button>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">{monthFmt.format(month)}</p>
          <span className="text-[11px] font-semibold text-teal dark:text-teal-light bg-teal/10 rounded-md px-1.5 py-0.5">
            {countLabel(full)}
          </span>
        </div>
        <button
          type="button"
          aria-label="الشهر التالي"
          disabled={offset >= 0}
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-text-secondary hover:bg-teal/10 disabled:opacity-30"
        >
          <ChevronLeft size={17} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {HEAD.map((h) => (
          <span key={h} className="text-[10px] font-semibold text-text-muted">
            {h}
          </span>
        ))}
        {cells.map((k, i) => {
          if (!k) return <span key={`x${i}`} />;
          const mark = markOf(k);
          const future = k > todayKey;
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => onPick(k)}
              aria-label={toArabicDigits(Number(k.slice(8)))}
              className={[
                'relative aspect-square rounded-lg text-[11px] font-counter font-bold tabular-nums inline-flex items-center justify-center transition-colors',
                mark === 'full'
                  ? 'bg-[image:var(--gradient-teal)] text-on-accent'
                  : mark === 'partial'
                    ? 'bg-teal/20 text-teal dark:text-teal-light'
                    : mark === 'excused'
                      ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                      : future
                        ? 'text-text-muted/40'
                        : 'bg-cream-dark/55 dark:bg-dark-surface text-text-muted hover:bg-teal/10',
                k === todayKey && !mark ? 'outline-dashed outline-1 -outline-offset-2 outline-teal/60' : '',
              ].join(' ')}
            >
              {toArabicDigits(Number(k.slice(8)))}
              {dotOf?.(k) ? <span className="absolute bottom-1 w-1 h-1 rounded-full bg-gold-light" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
