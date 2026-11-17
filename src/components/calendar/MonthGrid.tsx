import { useRef } from 'react';
import { Check } from 'lucide-react';
import { motion } from '@/lib/motion';
import { Star8 } from '@/components/ui/Ornament';
import { toArabicDigits } from '@/utils/arabicFormat';
import { WEEKDAY_SHORT_AR } from '@/services/statsService';
import type { CalendarDay, CalendarView, MonthGrid as Grid } from '@/services/calendarEvents';
import type { UserCalendarEvent } from './useDayEvents';

const HEADER_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Sat … Fri
const USER_TYPES = new Set(['wird', 'task', 'study']);

interface MonthGridProps {
  grid: Grid;
  view: CalendarView;
  /** Identity of the shown month (drives the slide animation). */
  monthId: string;
  /** +1 = moved to a later month, −1 = earlier (sets slide direction). */
  direction: number;
  todayKey: string;
  selectedKey: string | null;
  userEvents: (key: string) => UserCalendarEvent[];
  onSelect: (day: CalendarDay) => void;
  /** Swipe: +1 = next month, −1 = previous. RTL: drag right → next. */
  onStep: (dir: 1 | -1) => void;
}

/**
 * Saturday→Friday month grid. The big number is the view's calendar; the
 * small one is the other calendar. Event markers:
 *  - major occasion  → gold cell + star
 *  - season          → gold band on top (Ramadan, العشر)
 *  - occasion        → gold dot
 *  - sunnah fast     → teal dot
 *  - your items      → hollow dot (awrad/tasks/study)
 *  - worship logged  → tiny check
 */
export function MonthGrid({ grid, view, monthId, direction, todayKey, selectedKey, userEvents, onSelect, onStep }: MonthGridProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return (
    <div
      className="touch-pan-y select-none"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          swiped.current = true;
          onStep(dx > 0 ? 1 : -1);
        }
      }}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5" aria-hidden>
        {HEADER_ORDER.map((wd) => (
          <span key={wd} className={['text-[11px] font-bold', wd === 5 ? 'text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
            {WEEKDAY_SHORT_AR[wd]}
          </span>
        ))}
      </div>
        <motion.div
          key={monthId}
          initial={direction ? { opacity: 0, x: direction * -28 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-7 gap-1"

        >
          {Array.from({ length: grid.leading }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {grid.days.map((day) => (
            <DayCell
              key={day.key}
              day={day}
              view={view}
              isToday={day.key === todayKey}
              selected={day.key === selectedKey}
              user={userEvents(day.key)}
              onSelect={onSelect}
            />
          ))}
        </motion.div>
    </div>
  );
}

function DayCell({
  day,
  view,
  isToday,
  selected,
  user,
  onSelect,
}: {
  day: CalendarDay;
  view: CalendarView;
  isToday: boolean;
  selected: boolean;
  user: UserCalendarEvent[];
  onSelect: (d: CalendarDay) => void;
}) {
  const ev = day.events;
  const major = ev.some((e) => e.major);
  const occasion = ev.some((e) => e.type === 'occasion');
  const season = ev.some((e) => e.type === 'season');
  const fasting = ev.some((e) => e.type === 'fasting');
  const whiteDay = ev.some((e) => e.id === 'white_days');
  const mine = user.some((e) => USER_TYPES.has(e.type) && !e.minor);
  const worship = user.some((e) => e.type === 'worship');
  const friday = day.weekday === 5;

  const big = view === 'hijri' ? day.hijri.day : day.date.getDate();
  const small = view === 'hijri' ? day.date.getDate() : day.hijri.day;
  const smallIsFirst = small === 1;

  const names = [...ev, ...user.filter((e) => !e.minor)].map((e) => e.title);
  const label = `${toArabicDigits(big)}${names.length ? `، ${names.join('، ')}` : ''}`;

  const tone = isToday
    ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-sm)]'
    : major
      ? 'bg-gold/15 dark:bg-gold/20 ring-1 ring-gold/50 text-gold-dark dark:text-gold-light'
      : occasion
        ? 'bg-gold/[0.08] dark:bg-gold/10 text-text-primary dark:text-text-on-dark'
        : friday
          ? 'bg-teal/[0.06] dark:bg-teal/10 text-text-primary dark:text-text-on-dark'
          : 'bg-cream-dark/35 dark:bg-dark-surface/70 text-text-primary dark:text-text-on-dark';
  const dot = (filled: string) => (isToday ? 'bg-on-accent' : filled);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      onClick={() => onSelect(day)}
      className={[
        'relative h-14 rounded-xl flex flex-col items-center justify-center transition-[transform,box-shadow] duration-150 ease-out-soft active:scale-95 motion-reduce:active:scale-100',
        tone,
        selected && !isToday ? 'ring-2 ring-teal dark:ring-teal-light' : whiteDay && !isToday && !major ? 'ring-1 ring-teal/35 dark:ring-teal-light/40' : '',
        selected && isToday ? 'ring-2 ring-offset-2 ring-teal ring-offset-white dark:ring-offset-dark-card' : '',
      ].join(' ')}
    >
      {season ? (
        <span className={['absolute top-1 inset-x-3 h-[3px] rounded-full', isToday ? 'bg-on-accent/70' : 'bg-gold/70'].join(' ')} />
      ) : null}
      {major ? (
        <Star8 size={9} className={['absolute top-1 end-1', isToday ? 'text-on-accent' : 'text-gold'].join(' ')} />
      ) : null}
      {worship ? (
        <Check size={10} strokeWidth={3} className={['absolute top-1 start-1', isToday ? 'text-on-accent' : 'text-teal dark:text-teal-light'].join(' ')} />
      ) : null}

      <span className="text-[17px] font-counter font-bold leading-none tabular-nums">{toArabicDigits(big)}</span>
      <span
        className={[
          'text-[10px] font-counter leading-none mt-1 tabular-nums',
          isToday ? 'text-on-accent/80' : smallIsFirst ? 'font-bold text-teal dark:text-teal-light' : 'text-text-muted',
        ].join(' ')}
      >
        {toArabicDigits(small)}
      </span>

      {occasion || fasting || mine ? (
        <span className="absolute bottom-1 inset-x-0 flex items-center justify-center gap-[3px]" aria-hidden>
          {occasion && !major ? <span className={['w-1.5 h-1.5 rounded-full', dot('bg-gold')].join(' ')} /> : null}
          {fasting ? <span className={['w-1.5 h-1.5 rounded-full', dot('bg-teal dark:bg-teal-light')].join(' ')} /> : null}
          {mine ? (
            <span
              className={[
                'w-1.5 h-1.5 rounded-full ring-[1.5px]',
                isToday ? 'ring-on-accent' : 'ring-text-secondary dark:ring-text-on-dark/70',
              ].join(' ')}
            />
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/** Legend for the grid markers. */
export function GridLegend() {
  const item = 'inline-flex items-center gap-1.5';
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center justify-center text-[11px] text-text-muted px-2">
      <span className={item}>
        <Star8 size={10} className="text-gold" /> مناسبة كبرى
      </span>
      <span className={item}>
        <span className="w-4 h-[3px] rounded-full bg-gold/70" /> موسم
      </span>
      <span className={item}>
        <span className="w-1.5 h-1.5 rounded-full bg-gold" /> مناسبة
      </span>
      <span className={item}>
        <span className="w-1.5 h-1.5 rounded-full bg-teal dark:bg-teal-light" /> صيام مستحب
      </span>
      <span className={item}>
        <span className="w-3.5 h-3.5 rounded-[5px] ring-1 ring-teal/35 dark:ring-teal-light/40" /> الأيام البيض
      </span>
      <span className={item}>
        <span className="w-1.5 h-1.5 rounded-full ring-[1.5px] ring-text-secondary dark:ring-text-on-dark/70" /> عناصرك
      </span>
      <span className={item}>
        <Check size={10} strokeWidth={3} className="text-teal dark:text-teal-light" /> عبادة مسجّلة
      </span>
    </div>
  );
}
