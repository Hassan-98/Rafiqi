import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal, CalendarCheck } from 'lucide-react';
import { motion } from '@/lib/motion';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { MonthGrid, GridLegend } from '@/components/calendar/MonthGrid';
import { DaySheet } from '@/components/calendar/DaySheet';
import { EVENT_META } from '@/components/calendar/eventMeta';
import { useUserEvents } from '@/components/calendar/useDayEvents';
import {
  calendarDay,
  countdownAr,
  dayKey,
  gregorianLabel,
  gregorianMonthGrid,
  hijriLabel,
  hijriMonthGrid,
  toHijri,
  upcomingEvents,
  useCalendarPrefs,
  weekdayLabel,
  HIJRI_MONTHS_AR,
  type CalendarDay,
  type CalendarEvent,
  type CalendarView,
} from '@/services/calendarEvents';
import { hijriMonthStart } from '@/services/HijriService';
import { ARABIC_MONTHS } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Weekly/recurring noise kept out of the month list (still in grid + sheet); seasons show as the grid band. */
const WEEKLY = new Set(['friday', 'monday', 'thursday', 'shawwal_six']);

function rangeLabel(a: [string, number], b: [string, number], suffix: string): string {
  if (a[0] === b[0] && a[1] === b[1]) return `${a[0]} ${toArabicDigits(a[1])} ${suffix}`;
  if (a[1] === b[1]) return `${a[0]} – ${b[0]} ${toArabicDigits(b[1])} ${suffix}`;
  return `${a[0]} ${toArabicDigits(a[1])} – ${b[0]} ${toArabicDigits(b[1])} ${suffix}`;
}

export function HijriCalendarPage() {
  const view = useCalendarPrefs((s) => s.view);
  const setView = useCalendarPrefs((s) => s.setView);
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const userEvents = useUserEvents();

  const now = new Date();
  const todayKey = dayKey(now);
  const [anchor, setAnchor] = useState(() => now);
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [worshipKey, setWorshipKey] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const today = useMemo(() => calendarDay(new Date(), offset), [offset, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const anchorHijri = toHijri(anchor, offset);

  const grid = useMemo(
    () =>
      view === 'hijri'
        ? hijriMonthGrid(anchorHijri.year, anchorHijri.month, offset)
        : gregorianMonthGrid(anchor.getFullYear(), anchor.getMonth() + 1, offset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, offset, anchorHijri.year, anchorHijri.month, anchor.getFullYear(), anchor.getMonth()],
  );
  const monthId = view === 'hijri' ? `h${anchorHijri.year}-${anchorHijri.month}` : `g${anchor.getFullYear()}-${anchor.getMonth()}`;
  const showingToday = grid.days.some((d) => d.key === todayKey);

  const first = grid.days[0];
  const last = grid.days[grid.days.length - 1];
  const hijriRange = rangeLabel(
    [HIJRI_MONTHS_AR[first.hijri.month - 1], first.hijri.year],
    [HIJRI_MONTHS_AR[last.hijri.month - 1], last.hijri.year],
    'هـ',
  );
  const gregRange = rangeLabel(
    [ARABIC_MONTHS[first.date.getMonth()], first.date.getFullYear()],
    [ARABIC_MONTHS[last.date.getMonth()], last.date.getFullYear()],
    'م',
  );
  const [title, subtitle] = view === 'hijri' ? [hijriRange, gregRange] : [gregRange, hijriRange];

  const step = (dir: 1 | -1) => {
    setDirection(dir);
    if (view === 'hijri') {
      const m = anchorHijri.month + dir;
      const y = anchorHijri.year + (m > 12 ? 1 : m < 1 ? -1 : 0);
      setAnchor(hijriMonthStart(y, ((m + 11) % 12) + 1, offset));
    } else {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1, 12));
    }
  };
  const goToday = () => {
    setDirection(grid.days[0].key > todayKey ? -1 : 1);
    setAnchor(new Date());
  };

  const monthList = useMemo(
    () =>
      grid.days
        .map((d) => ({
          d,
          events: d.events.filter((e) => !WEEKLY.has(e.id) && e.type !== 'season' && (e.id !== 'white_days' || d.hijri.day === 13)),
        }))
        .filter((x) => x.events.length > 0),
    [grid],
  );
  const upcoming = useMemo(() => upcomingEvents(new Date(), 6, 400, offset), [offset, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayUser = userEvents(todayKey).filter((e) => !e.minor || e.type === 'wird');

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="التقويم"
        subtitle="هجري وميلادي بمناسباته"
        showBack
        actions={
          <HapticPressable
            haptic="light"
            onClick={() => setAdjustOpen(true)}
            className="w-11 h-11 rounded-xl inline-flex items-center justify-center hover:bg-teal/10 text-teal dark:text-teal-light"
            aria-label="ضبط التاريخ الهجري"
          >
            <SlidersHorizontal size={19} />
          </HapticPressable>
        }
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* ماذا اليوم؟ */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card variant="gradient-edge" className="p-5" onClick={() => setSelected(today)} pressable>
            <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
            <p className="text-[11px] font-bold text-gold-dark dark:text-gold-light">ماذا اليوم؟</p>
            <div className="flex items-center gap-4 mt-2">
              <Medallion size={68} tone="gold">
                <span className="text-2xl text-gold-dark dark:text-gold-light">{toArabicDigits(today.hijri.day)}</span>
              </Medallion>
              <div className="flex-1 min-w-0">
                <p className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark leading-tight text-balance">
                  {weekdayLabel(today.date)}، {hijriLabel(today.hijri)}
                </p>
                <p className="text-sm text-text-secondary dark:text-text-on-dark/70 mt-1">{gregorianLabel(today.date)}</p>
              </div>
            </div>
            <div className="mt-4 pt-3.5 border-t border-gold/30 dark:border-gold/20 flex flex-wrap gap-1.5">
              {today.events.length || todayUser.length ? (
                <>
                  {today.events.map((e) => (
                    <EventChip key={e.id} event={e} />
                  ))}
                  {todayUser.length ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold bg-cream-dark/70 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/80">
                      <CalendarCheck size={12} /> {toArabicDigits(todayUser.length)} من عناصرك
                    </span>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-text-muted">لا مناسبة خاصة اليوم، املأه بالذكر والعمل الصالح.</p>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Calendar */}
        <section className="flex flex-col gap-3">
          <div className="rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 grid grid-cols-2" role="group" aria-label="نوع التقويم">
            {(['hijri', 'gregorian'] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={[
                  'h-10 rounded-xl text-sm font-bold transition-colors duration-200 ease-out-soft',
                  view === v
                    ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                    : 'text-text-secondary dark:text-text-on-dark/70',
                ].join(' ')}
              >
                {v === 'hijri' ? 'هجري' : 'ميلادي'}
              </button>
            ))}
          </div>

          <Card variant="plain" className="p-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <HapticPressable haptic="light" onClick={() => step(-1)} className="w-11 h-11 rounded-xl inline-flex items-center justify-center hover:bg-teal/10" aria-label="الشهر السابق">
                <ChevronRight size={20} className="text-teal dark:text-teal-light" />
              </HapticPressable>
              <div className="text-center min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-teal dark:text-teal-light leading-tight text-balance">{title}</p>
                <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
              </div>
              <HapticPressable haptic="light" onClick={() => step(1)} className="w-11 h-11 rounded-xl inline-flex items-center justify-center hover:bg-teal/10" aria-label="الشهر التالي">
                <ChevronLeft size={20} className="text-teal dark:text-teal-light" />
              </HapticPressable>
            </div>
            <MonthGrid
              grid={grid}
              view={view}
              monthId={monthId}
              direction={direction}
              todayKey={todayKey}
              selectedKey={selected?.key ?? null}
              userEvents={userEvents}
              onSelect={setSelected}
              onStep={step}
            />
            {!showingToday ? (
              <div className="flex justify-center mt-3">
                <Button variant="soft" size="sm" onClick={goToday}>
                  العودة إلى اليوم
                </Button>
              </div>
            ) : null}
          </Card>
          <GridLegend />
        </section>

        {/* Month occasions */}
        {monthList.length ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="مناسبات هذا الشهر" />
            <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {monthList.map(({ d, events }) => (
                <DayRow key={d.key} day={d} events={events} view={view} todayKey={todayKey} onClick={() => setSelected(d)} />
              ))}
            </Card>
          </section>
        ) : null}

        {/* Upcoming */}
        {upcoming.length ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="القادم" subtitle="أقرب المناسبات والأيام المباركة" />
            <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {upcoming.map(({ day, event }) => (
                <DayRow key={`${day.key}-${event.id}`} day={day} events={[event]} view={view} todayKey={todayKey} onClick={() => setSelected(day)} />
              ))}
            </Card>
          </section>
        ) : null}
      </div>

      <DaySheet
        day={selected}
        user={selected ? userEvents(selected.key) : []}
        onClose={() => setSelected(null)}
        onWorshipDetail={setWorshipKey}
      />
      <DayDetailSheet dateKey={worshipKey} onClose={() => setWorshipKey(null)} />
      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} />
    </div>
  );
}

function EventChip({ event }: { event: CalendarEvent }) {
  const meta = EVENT_META[event.type];
  return (
    <span className={['inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', meta.chip].join(' ')}>
      <meta.Icon size={12} /> {event.title}
    </span>
  );
}

function DayRow({
  day,
  events,
  view,
  todayKey,
  onClick,
}: {
  day: CalendarDay;
  events: CalendarEvent[];
  view: CalendarView;
  todayKey: string;
  onClick: () => void;
}) {
  const major = events.some((e) => e.major);
  const diff = Math.round((day.date.getTime() - new Date(`${todayKey}T12:00:00`).getTime()) / 86_400_000);
  const big = view === 'hijri' ? day.hijri.day : day.date.getDate();
  const monthName = view === 'hijri' ? HIJRI_MONTHS_AR[day.hijri.month - 1] : ARABIC_MONTHS[day.date.getMonth()];
  const other = view === 'hijri' ? gregorianLabel(day.date) : hijriLabel(day.hijri);
  const meta = EVENT_META[events[0].type];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
    >
      <span
        className={[
          'w-14 h-14 rounded-xl inline-flex flex-col items-center justify-center shrink-0 leading-none',
          major ? 'bg-gold/15 dark:bg-gold/20 text-gold-dark dark:text-gold-light ring-1 ring-gold/40' : meta.chip,
        ].join(' ')}
      >
        <span className="text-base font-counter font-bold">{toArabicDigits(big)}</span>
        <span className="text-[9px] mt-1 px-0.5 leading-tight text-center">{monthName}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{events.map((e) => e.title).join('، ')}</span>
        <span className="block text-[11px] text-text-muted truncate">
          {weekdayLabel(day.date)}، {other}
        </span>
      </span>
      {diff >= 0 ? (
        <span
          className={[
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
            diff === 0 ? 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-light' : 'bg-gold/15 text-gold-dark dark:bg-gold/20 dark:text-gold-light',
          ].join(' ')}
        >
          {countdownAr(diff)}
        </span>
      ) : (
        <ChevronLeft size={16} className="text-text-muted shrink-0" />
      )}
    </button>
  );
}

function AdjustSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const setOffset = useCalendarPrefs((s) => s.setHijriOffset);
  return (
    <BottomSheet open={open} onClose={onClose} title="ضبط التاريخ الهجري">
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80 leading-relaxed text-pretty">
          يعتمد التقويم على حساب أم القرى. إن ثبتت رؤية الهلال في بلدك بيوم مختلف، عدّل التاريخ هنا.
        </p>
        <div className="rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 grid grid-cols-5" role="group" aria-label="فرق الأيام">
          {[-2, -1, 0, 1, 2].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={offset === n}
              onClick={() => setOffset(n)}
              className={[
                'h-11 rounded-xl text-sm font-bold font-counter transition-colors duration-200 ease-out-soft',
                offset === n
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-secondary dark:text-text-on-dark/70',
              ].join(' ')}
            >
              {n === 0 ? '٠' : `${n > 0 ? '+' : '−'}${toArabicDigits(Math.abs(n))}`}
            </button>
          ))}
        </div>
        <Card variant="inset" className="p-3 text-center">
          <p className="text-[11px] text-text-muted">اليوم بعد الضبط</p>
          <p className="font-display text-lg font-bold text-teal dark:text-teal-light mt-0.5">{hijriLabel(toHijri(new Date(), offset))}</p>
        </Card>
        <Button variant="primary" fullWidth onClick={onClose}>
          تم
        </Button>
      </div>
    </BottomSheet>
  );
}
