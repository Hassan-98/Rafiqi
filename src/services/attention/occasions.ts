/**
 * Tomorrow's fast and the seasons ahead — PURE, Hijri-aware (Umm al-Qura + the
 * user's sighting offset, through calendarEvents so Home and the calendar agree).
 * Every line is an authentic text; checked by scripts/dayAttention.test.ts.
 */
import { differenceInCalendarDays } from 'date-fns';
import { countdownAr, eventsForDate, fromHijri, toHijri } from '@/services/calendarEvents';

export interface FastReason {
  /** calendarEvents id: arafah, ashura, tasua, dhul_hijjah_ten, white_days, shawwal_six, monday, thursday. */
  id: string;
  /** «يوم عرفة» — for «صيام …». */
  name: string;
  /** The evening before: «غداً يوم عرفة». */
  eve: string;
  body: string;
  /** Worth a word even to someone who seldom fasts. */
  major: boolean;
}

const MONTHLY = '«صيام ثلاثة أيام من كل شهر صيام الدهر كله»';
const MON_THU = '«تُعرض الأعمال يوم الاثنين والخميس، فأحبّ أن يُعرض عملي وأنا صائم»';
const REASONS: Record<string, Omit<FastReason, 'id'>> = {
  arafah: { name: 'يوم عرفة', eve: 'غداً يوم عرفة', body: '«صيام يوم عرفة أحتسب على الله أن يكفّر السنة التي قبله والسنة التي بعده»', major: true },
  ashura: { name: 'يوم عاشوراء', eve: 'غداً يوم عاشوراء', body: '«صيام يوم عاشوراء أحتسب على الله أن يكفّر السنة التي قبله»', major: true },
  tasua: { name: 'تاسوعاء', eve: 'غداً تاسوعاء', body: '«لئن بقيتُ إلى قابلٍ لأصومنّ التاسع»', major: true },
  dhul_hijjah_ten: { name: 'العشر من ذي الحجة', eve: 'غداً من العشر الأوائل', body: '«ما من أيام العمل الصالح فيها أحبّ إلى الله من هذه الأيام»', major: false },
  white_days: { name: 'الأيام البيض', eve: 'غداً من الأيام البيض', body: MONTHLY, major: false },
  shawwal_six: { name: 'ستّ شوال', eve: 'غداً من ستّ شوال', body: '«من صام رمضان ثم أتبعه ستاً من شوال كان كصيام الدهر»', major: false },
  monday: { name: 'الإثنين', eve: 'غداً الإثنين — صيام مستحب', body: MON_THU, major: false },
  thursday: { name: 'الخميس', eve: 'غداً الخميس — صيام مستحب', body: MON_THU, major: false },
};

/**
 * Why `day` is a day to fast voluntarily — the weightiest reason, or null
 * (Ramadan is its own matter; the Eids and Tashreeq are never fasted).
 * `sixDone`: the six of Shawwal are already fasted this year.
 */
export function fastReason(day: Date, offset = 0, sixDone = false): FastReason | null {
  const events = eventsForDate(day, offset);
  if (events.some((e) => e.id === 'ramadan')) return null;
  for (const e of events) {
    if (!e.fast || !REASONS[e.id] || (e.id === 'shawwal_six' && sixDone)) continue;
    return { id: e.id, ...REASONS[e.id] };
  }
  return null;
}

/** The day's named occasion or season (for the morning brief): «يوم عرفة», «اليوم ١٢ من رمضان». */
export function occasionOf(day: Date, offset = 0): string | null {
  return eventsForDate(day, offset).find((e) => e.type === 'occasion' || e.type === 'season')?.title ?? null;
}

export interface SeasonNotice {
  /** Stable per season: «ليس الآن» hides it for the day. */
  id: string;
  title: string;
  body: string;
  to: string;
  daysUntil: number;
}

/**
 * A season worth preparing for, announced ahead:
 *  - Ramadan: 30 and 20 days out, then daily over the last ten;
 *  - the last ten nights: from three days before;
 *  - the first ten of Dhul-Hijjah: from four days before.
 */
export function seasonNotice(now: Date, offset = 0): SeasonNotice | null {
  const h = toHijri(now, offset);
  const until = (month: number) => differenceInCalendarDays(fromHijri({ year: h.year, month, day: 1 }, offset), now);

  if (h.month === 7 || h.month === 8) {
    const n = until(9);
    if (n === 30 || n === 20 || (n >= 1 && n <= 10)) {
      return {
        id: `season.ramadan.${h.year}`,
        title: `رمضان ${countdownAr(n)}`,
        body: n <= 2 ? 'بحسب التقويم، والعبرة برؤية الهلال — «تسحّروا فإن في السحور بركة»' : '«كان ﷺ يصوم شعبان إلا قليلاً» — استعدّ له بالصيام والقرآن',
        to: '/calendar',
        daysUntil: n,
      };
    }
  }
  if (h.month === 9 && h.day >= 18 && h.day <= 20) {
    const n = 21 - h.day;
    return {
      id: `season.lastTen.${h.year}`,
      title: n === 1 ? 'الليلة أولى ليالي العشر الأواخر' : `العشر الأواخر ${countdownAr(n)}`,
      body: '«كان ﷺ إذا دخل العشر شدّ مئزره، وأحيا ليله، وأيقظ أهله»',
      to: '/targets?tab=qiyam',
      daysUntil: n,
    };
  }
  if (h.month === 11) {
    const n = until(12);
    if (n >= 1 && n <= 4) {
      return {
        id: `season.dhulHijjah.${h.year}`,
        title: `العشر من ذي الحجة ${countdownAr(n)}`,
        body:
          n <= 2
            ? '«إذا دخلت العشر وأراد أحدكم أن يضحّي فلا يمسّ من شعره وبشره شيئاً»'
            : '«ما من أيام العمل الصالح فيها أحبّ إلى الله من هذه الأيام»',
        to: '/calendar',
        daysUntil: n,
      };
    }
  }
  return null;
}
