import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { SPECIAL_ISLAMIC_DAYS, CALENDAR_EXTRA_DAYS } from '@/data/specialIslamicDays';
import { toHijri, fromHijri, hijriMonthStart, hijriMonthLength, HIJRI_MONTHS_AR, type HijriDate } from './HijriService';
import { ARABIC_MONTHS, WEEKDAY_LABELS_AR } from './statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * Calendar events: the religious events of any day (pure, offline, Umm al-Qura
 * + the user's sighting offset). User data (awrad due, worship done, tasks…)
 * is layered on by `useDayEvents` in components/calendar/useDayEvents.ts.
 */

export type CalendarEventType =
  | 'occasion' // named Islamic day (Eid, Arafah, Ashura…)
  | 'season' // Ramadan, first ten of Dhul-Hijjah
  | 'fasting' // recommended sunnah fast (Mon/Thu, white days, 6 of Shawwal)
  | 'friday'
  | 'wird' // user's awrad due that day
  | 'task'
  | 'study'
  | 'worship'; // user's logged worship on a past day

export interface CalendarAction {
  label: string;
  /** In-app route (hash router path). */
  to?: string;
  /** Log a fast for this day via progressStore. */
  logFast?: boolean;
  /** Open the stats DayDetailSheet for this day. */
  dayDetail?: boolean;
}

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  description?: string;
  suggestion?: string;
  /** Headline occasion — the grid highlights the whole cell. */
  major?: boolean;
  /** A night that begins after Maghrib of this day (e.g. ليلة ٢٧). */
  night?: boolean;
  /** Fasting is recommended/obligatory on this day. */
  fast?: boolean;
  actions?: CalendarAction[];
}

export interface CalendarDay {
  date: Date; // local noon
  key: string; // yyyy-MM-dd
  hijri: HijriDate;
  weekday: number; // 0=Sun … 6=Sat
  events: CalendarEvent[];
}

// ── prefs (view + Hijri offset), persisted ─────────────────────────────────
export type CalendarView = 'hijri' | 'gregorian';
interface CalendarPrefs {
  view: CalendarView;
  /** Local moon-sighting adjustment, −2…+2 days. */
  hijriOffset: number;
  setView: (v: CalendarView) => void;
  setHijriOffset: (n: number) => void;
}
export const useCalendarPrefs = create<CalendarPrefs>()(
  persist(
    (set) => ({
      view: 'hijri',
      hijriOffset: 0,
      setView: (view) => set({ view }),
      setHijriOffset: (n) => set({ hijriOffset: Math.max(-2, Math.min(2, Math.round(n))) }),
    }),
    { name: 'myzikr:calendar', storage: safeStorage },
  ),
);
const currentOffset = () => useCalendarPrefs.getState().hijriOffset;

// ── date helpers ───────────────────────────────────────────────────────────
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}
/** Whole days from `from` to `to` (local calendar days). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((addDays(to, 0).getTime() - addDays(from, 0).getTime()) / 86_400_000);
}

export function hijriLabel(h: HijriDate): string {
  return `${toArabicDigits(h.day)} ${HIJRI_MONTHS_AR[h.month - 1]} ${toArabicDigits(h.year)} هـ`;
}
export function gregorianLabel(d: Date): string {
  return `${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicDigits(d.getFullYear())} م`;
}
export function weekdayLabel(d: Date): string {
  return WEEKDAY_LABELS_AR[d.getDay()];
}

/** «اليوم» / «غداً» / «بعد يومين» / «بعد ٥ أيام» / «بعد ١٢ يوماً» (and «منذ …» for the past). */
export function countdownAr(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === -1) return 'أمس';
  const a = Math.abs(n);
  const unit = a === 2 ? 'يومين' : a <= 10 ? `${toArabicDigits(a)} أيام` : `${toArabicDigits(a)} يوماً`;
  return n > 0 ? `بعد ${unit}` : `منذ ${unit}`;
}

// ── religious events ───────────────────────────────────────────────────────
const MAJOR = new Set(['hijri_ny', 'ashura', 'ramadan_start', 'laylat_qadr_27', 'eid_fitr', 'arafah', 'eid_adha']);
const FAST_DAYS = new Set(['tasua', 'ashura', 'arafah']);
const KAHF: CalendarAction = { label: 'اقرأ سورة الكهف', to: '/quran/read/18' };
const QIYAM: CalendarAction = { label: 'سجّل قيامك', to: '/targets?tab=qiyam' };
const OCCASIONS = [...SPECIAL_ISLAMIC_DAYS, ...CALENDAR_EXTRA_DAYS];

/** Days on which fasting is forbidden: the two Eids and the days of Tashreeq. */
function fastingForbidden(h: HijriDate): boolean {
  return (h.month === 10 && h.day === 1) || (h.month === 12 && h.day >= 10 && h.day <= 13);
}

/** Religious events of a Gregorian day, most important first. */
export function eventsForDate(date: Date, offset = currentOffset()): CalendarEvent[] {
  const h = toHijri(date, offset);
  // Nights (Laylat al-Qadr candidates) begin the evening before their Hijri day.
  const tomorrow = toHijri(addDays(date, 1), offset);
  const wd = date.getDay();
  const out: CalendarEvent[] = [];

  for (const o of OCCASIONS) {
    const isNight = o.id.startsWith('laylat_qadr');
    const at = isNight ? tomorrow : h;
    if (o.hijriMonth !== at.month || o.hijriDay !== at.day) continue;
    out.push({
      id: o.id,
      type: 'occasion',
      title: o.nameAr,
      description: isNight ? `${o.significance} · تبدأ بعد مغرب هذا اليوم` : o.significance,
      suggestion: o.suggestedAction,
      major: MAJOR.has(o.id),
      night: isNight || undefined,
      fast: FAST_DAYS.has(o.id) || undefined,
      actions: isNight ? [QIYAM] : undefined,
    });
  }

  if (h.month === 9) {
    const lastTen = h.day >= 21;
    out.push({
      id: 'ramadan',
      type: 'season',
      title: lastTen ? `العشر الأواخر · اليوم ${toArabicDigits(h.day)} من رمضان` : `اليوم ${toArabicDigits(h.day)} من رمضان`,
      description: 'صيام رمضان ركن من أركان الإسلام، وهو شهر القرآن والقيام',
      suggestion: lastTen ? 'اجتهد في القيام والدعاء وتحرَّ ليلة القدر' : 'أكثر من تلاوة القرآن والصدقة',
      fast: true,
    });
  }
  if (h.month === 12 && h.day <= 9) {
    out.push({
      id: 'dhul_hijjah_ten',
      type: 'season',
      title: `العشر من ذي الحجة · اليوم ${toArabicDigits(h.day)}`,
      description: 'أيام العمل الصالح فيها أحبّ إلى الله من غيرها',
      suggestion: 'أكثر من التكبير والتهليل، ويُستحب صيام التسع الأوائل',
      fast: true,
    });
  }

  if (h.month !== 9 && !fastingForbidden(h)) {
    if (h.day >= 13 && h.day <= 15) {
      out.push({
        id: 'white_days',
        type: 'fasting',
        title: `الأيام البيض · ${toArabicDigits(h.day)}`,
        description: 'يُستحب صيام ثلاثة أيام من كل شهر هجري: ١٣ و١٤ و١٥',
        fast: true,
      });
    }
    if (h.month === 10) {
      out.push({
        id: 'shawwal_six',
        type: 'fasting',
        title: 'ستٌّ من شوال',
        description: 'يُستحب صيام ستة أيام من شوال بعد رمضان، متتابعة أو متفرقة',
        fast: true,
      });
    }
    if (wd === 1 || wd === 4) {
      out.push({
        id: wd === 1 ? 'monday' : 'thursday',
        type: 'fasting',
        title: wd === 1 ? 'صيام الإثنين' : 'صيام الخميس',
        description: 'من الصيام المستحب، وكان النبي ﷺ يتحرّى صيام الإثنين والخميس',
        fast: true,
      });
    }
  }

  if (wd === 5) {
    out.push({
      id: 'friday',
      type: 'friday',
      title: 'يوم الجمعة',
      description: 'خير يوم طلعت عليه الشمس',
      suggestion: 'قراءة سورة الكهف، والإكثار من الصلاة على النبي ﷺ، وتحرّي ساعة الإجابة آخر النهار',
      actions: [KAHF],
    });
  }
  return out;
}

export function calendarDay(date: Date, offset = currentOffset()): CalendarDay {
  const d = addDays(date, 0);
  return { date: d, key: dayKey(d), hijri: toHijri(d, offset), weekday: d.getDay(), events: eventsForDate(d, offset) };
}

// ── month grids (Sat-first, RTL) ───────────────────────────────────────────
export interface MonthGrid {
  /** Blank cells before the 1st (Saturday-first week). */
  leading: number;
  days: CalendarDay[];
}
/** Column 0 = Saturday. */
export const satFirstIndex = (weekday: number) => (weekday + 1) % 7;

function gridFrom(first: Date, length: number, offset: number): MonthGrid {
  const days = Array.from({ length }, (_, i) => calendarDay(addDays(first, i), offset));
  return { leading: satFirstIndex(first.getDay()), days };
}
export function hijriMonthGrid(year: number, month: number, offset = currentOffset()): MonthGrid {
  return gridFrom(hijriMonthStart(year, month, offset), hijriMonthLength(year, month, offset), offset);
}
export function gregorianMonthGrid(year: number, month /* 1..12 */: number, offset = currentOffset()): MonthGrid {
  return gridFrom(new Date(year, month - 1, 1, 12), new Date(year, month, 0).getDate(), offset);
}

// ── upcoming ───────────────────────────────────────────────────────────────
export interface UpcomingEvent {
  day: CalendarDay;
  event: CalendarEvent;
  daysUntil: number;
}
/**
 * Upcoming named occasions (+ the start of each month's white days) from
 * `from`, skipping weekly noise. Consecutive same-title days (Tashreeq) collapse.
 */
export function upcomingEvents(from = new Date(), limit = 8, horizonDays = 400, offset = currentOffset()): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  let lastTitle = '';
  for (let i = 0; i <= horizonDays && out.length < limit; i += 1) {
    const day = calendarDay(addDays(from, i), offset);
    for (const event of day.events) {
      const pick = event.type === 'occasion' || (event.id === 'white_days' && day.hijri.day === 13);
      if (!pick || event.title === lastTitle) continue;
      out.push({ day, event, daysUntil: i });
      lastTitle = event.title;
    }
    if (!day.events.some((e) => e.title === lastTitle)) lastTitle = '';
  }
  return out.slice(0, limit);
}

export { toHijri, fromHijri, HIJRI_MONTHS_AR, type HijriDate };
