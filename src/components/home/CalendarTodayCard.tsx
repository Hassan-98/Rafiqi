import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Medallion } from '@/components/ui/Ornament';
import { calendarDay, countdownAr, gregorianLabel, upcomingEvents, useCalendarPrefs, weekdayLabel } from '@/services/calendarEvents';
import { HIJRI_MONTHS_AR } from '@/services/calendarEvents';
import { EVENT_META } from '@/components/calendar/eventMeta';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Religious event types worth showing on Home (user items live in «مهام اليوم»). */
const SHOW = new Set(['occasion', 'season', 'fasting', 'friday']);

/**
 * «اليوم في التقويم» on Home: today's Hijri + Gregorian date, today's
 * occasions / sunnah fasts, and the next occasion with a countdown.
 */
export function CalendarTodayCard() {
  const navigate = useNavigate();
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const { day, next } = useMemo(() => {
    const now = new Date();
    const d = calendarDay(now, offset);
    const upcoming = upcomingEvents(now, 3, 400, offset).find((u) => u.daysUntil > 0) ?? null;
    return { day: d, next: upcoming };
  }, [offset]);
  const events = day.events.filter((e) => SHOW.has(e.type));
  const lead = events.find((e) => e.major) ?? events[0];

  return (
    <HapticPressable
      onClick={() => navigate('/calendar')}
      className="w-full text-start rounded-[var(--radius-card)] bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-1 ring-gold/30 dark:ring-gold/20 shadow-[var(--shadow-sm)] p-4 relative isolate overflow-hidden"
      aria-label="افتح التقويم"
    >
      <span aria-hidden className="lattice lattice-fade text-gold" />
      <span className="flex items-center gap-3.5">
        <Medallion size={58} tone="gold">
          <span className="text-lg text-gold-dark dark:text-gold-light">{toArabicDigits(day.hijri.day)}</span>
        </Medallion>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-text-muted">اليوم في التقويم · {weekdayLabel(day.date)}</span>
          <span className="block text-base font-bold text-text-primary dark:text-text-on-dark truncate">
            {toArabicDigits(day.hijri.day)} {HIJRI_MONTHS_AR[day.hijri.month - 1]} {toArabicDigits(day.hijri.year)} هـ
          </span>
          <span className="block text-xs text-text-muted truncate">{gregorianLabel(day.date)}</span>
        </span>
        <CalendarDays size={18} className="text-gold-dark dark:text-gold-light shrink-0" />
      </span>

      {events.length ? (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {events.slice(0, 3).map((e) => {
            const meta = EVENT_META[e.type];
            const Icon = meta.Icon;
            return (
              <span key={e.id} className={['inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold', meta.chip].join(' ')}>
                <Icon size={12} /> {e.title}
              </span>
            );
          })}
        </span>
      ) : null}
      {lead?.suggestion ? (
        <span className="mt-2 block text-xs text-text-secondary dark:text-text-on-dark/80 text-pretty">{lead.suggestion}</span>
      ) : null}

      {next ? (
        <span className="mt-3 pt-3 border-t border-gold/20 flex items-center gap-2 text-xs">
          <span className="text-text-muted">القادم:</span>
          <span className="font-semibold text-text-primary dark:text-text-on-dark truncate">{next.event.title}</span>
          <span className="ms-auto shrink-0 font-semibold text-gold-dark dark:text-gold-light">{countdownAr(next.daysUntil)}</span>
          <ChevronLeft size={14} className="text-text-muted shrink-0" />
        </span>
      ) : null}
    </HapticPressable>
  );
}
