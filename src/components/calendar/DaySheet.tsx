import { useNavigate } from 'react-router';
import { Check, Utensils, Moon, CalendarDays, ChevronLeft } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Star8 } from '@/components/ui/Ornament';
import { useProgressStore } from '@/store/progressStore';
import { toast } from '@/store/toastStore';
import { hapticsService } from '@/services/HapticsService';
import {
  countdownAr,
  daysBetween,
  gregorianLabel,
  hijriLabel,
  weekdayLabel,
  type CalendarAction,
  type CalendarDay,
  type CalendarEvent,
} from '@/services/calendarEvents';
import { EVENT_META } from './eventMeta';
import type { UserCalendarEvent } from './useDayEvents';

interface DaySheetProps {
  day: CalendarDay | null;
  user: UserCalendarEvent[];
  onClose: () => void;
  /** Open the stats DayDetailSheet (past-day worship). */
  onWorshipDetail: (key: string) => void;
}

/** Rich day details: both dates, each event with its meaning + quick actions. */
export function DaySheet({ day, user, onClose, onWorshipDetail }: DaySheetProps) {
  return (
    <BottomSheet open={!!day} onClose={onClose} title="تفاصيل اليوم">
      {day ? <DayBody day={day} user={user} onClose={onClose} onWorshipDetail={onWorshipDetail} /> : null}
    </BottomSheet>
  );
}

function DayBody({ day, user, onClose, onWorshipDetail }: Required<Omit<DaySheetProps, 'day'>> & { day: CalendarDay }) {
  const navigate = useNavigate();
  const diff = daysBetween(new Date(), day.date);
  const fasted = useProgressStore(
    (s) => s.dailyProgress[day.key]?.modules.some((m) => m.moduleId === 'fasting' && m.completed) ?? false,
  );
  const fastDay = day.events.some((e) => e.fast);
  const religious = day.events;
  const mine = user;

  const run = (a: CalendarAction) => {
    if (a.dayDetail) {
      onClose();
      onWorshipDetail(day.key);
    } else if (a.to) {
      onClose();
      navigate(a.to);
    }
  };

  const toggleFast = () => {
    const store = useProgressStore.getState();
    if (fasted) {
      store.unmarkModuleComplete('fasting', day.key);
      toast.info('تم إلغاء تسجيل الصيام');
    } else {
      store.markModuleComplete('fasting', 1, day.key);
      void hapticsService.notify('success');
      toast.success('تقبّل الله صيامك');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* Both dates */}
      <div className="text-center">
        <p className="font-display text-2xl font-bold text-text-primary dark:text-text-on-dark">{weekdayLabel(day.date)}</p>
        {diff !== 0 ? (
          <span className="inline-flex mt-1.5 items-center gap-1 rounded-full bg-cream-dark/60 dark:bg-dark-surface px-2.5 py-0.5 text-[11px] font-bold text-text-secondary dark:text-text-on-dark/80">
            <CalendarDays size={11} /> {countdownAr(diff)}
          </span>
        ) : (
          <span className="inline-flex mt-1.5 rounded-full bg-teal/10 dark:bg-teal/20 px-2.5 py-0.5 text-[11px] font-bold text-teal dark:text-teal-light">اليوم</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Card variant="gold-rim" className="p-3 text-center">
          <p className="text-[11px] text-text-muted">هجري</p>
          <p className="font-display text-[17px] font-bold text-teal dark:text-teal-light mt-1 text-balance">{hijriLabel(day.hijri)}</p>
        </Card>
        <Card variant="plain" className="p-3 text-center">
          <p className="text-[11px] text-text-muted">ميلادي</p>
          <p className="font-display text-[17px] font-bold text-text-primary dark:text-text-on-dark mt-1 text-balance">{gregorianLabel(day.date)}</p>
        </Card>
      </div>

      {/* Religious events */}
      {religious.length ? (
        <div className="flex flex-col gap-2.5">
          {religious.map((e) => (
            <EventCard key={e.id} event={e} onAction={run} />
          ))}
        </div>
      ) : (
        <Card variant="inset" className="p-4 text-center">
          <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">
            لا مناسبة خاصة في هذا اليوم. أذكار الصباح والمساء ووِردك اليومي خير ما تملؤه به.
          </p>
        </Card>
      )}

      {/* Quick fasting log (today / past days only) */}
      {fastDay ? (
        diff <= 0 ? (
          <Button variant={fasted ? 'soft' : 'primary'} fullWidth leftIcon={fasted ? <Check size={16} /> : <Utensils size={16} />} onClick={toggleFast} aria-pressed={fasted}>
            {fasted ? 'سجّلتَ صيام هذا اليوم' : 'سجّل صيامي'}
          </Button>
        ) : (
          <p className="text-xs text-text-muted text-center inline-flex items-center justify-center gap-1.5">
            <Moon size={12} /> {day.hijri.month === 9 ? 'صيام هذا اليوم فرض من رمضان' : 'يوم يُستحب صيامه'}، انوِ صيامه من الليل
          </p>
        )
      ) : null}

      {/* The user's own items */}
      {mine.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 px-1 text-sm font-bold text-text-primary dark:text-text-on-dark">
            <Star8 size={10} className="text-gold" /> عناصرك
          </h3>
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {mine.map((e) => {
              const meta = EVENT_META[e.type];
              const action = e.actions?.[0];
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => action && run(action)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
                >
                  <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', meta.chip].join(' ')}>
                    {e.done ? <Check size={16} strokeWidth={2.5} /> : <meta.Icon size={16} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{e.title}</span>
                    <span className="block text-[11px] text-text-muted truncate">
                      {meta.label}
                      {e.description ? ` · ${e.description}` : ''}
                    </span>
                  </span>
                  <ChevronLeft size={16} className="text-text-muted shrink-0" />
                </button>
              );
            })}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function EventCard({ event, onAction }: { event: CalendarEvent; onAction: (a: CalendarAction) => void }) {
  const meta = EVENT_META[event.type];
  return (
    <Card variant={event.major ? 'gradient-edge' : 'plain'} className="p-4">
      <div className="flex items-start gap-3">
        <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', meta.chip].join(' ')}>
          <meta.Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-base font-bold text-text-primary dark:text-text-on-dark text-balance">{event.title}</p>
            <span className={['rounded-full px-2 py-0.5 text-[10px] font-bold', meta.chip].join(' ')}>
              {event.night ? 'ليلة' : meta.label}
            </span>
          </div>
          {event.description ? (
            <p className="text-sm text-text-secondary dark:text-text-on-dark/80 mt-1 leading-relaxed text-pretty">{event.description}</p>
          ) : null}
        </div>
      </div>
      {event.suggestion ? (
        <div className="mt-3 p-3 rounded-[var(--radius-inner)] bg-cream-dark/60 dark:bg-dark-surface">
          <p className="text-[11px] text-text-muted mb-0.5">المستحب</p>
          <p className="text-sm text-text-primary dark:text-text-on-dark text-pretty">{event.suggestion}</p>
        </div>
      ) : null}
      {event.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.actions.map((a) => (
            <Button key={a.label} variant="soft" size="sm" onClick={() => onAction(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
