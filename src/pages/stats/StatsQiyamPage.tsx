import { useMemo, useState } from 'react';
import { MoonStar, Moon, BarChart3, CalendarRange, Sparkles } from 'lucide-react';

import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { BarChart } from '@/components/stats/BarChart';
import { DonutChart } from '@/components/stats/DonutChart';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { TimeOfDayPanel } from '@/components/stats/TimeOfDayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { Reveal } from '@/components/stats/Reveal';

import { useStatsRange } from '@/stats/StatsContext';
import { useQiyamStore, qiyamNightKey, type QiyamNight } from '@/store/qiyamStore';
import { useProgressStore, frozenDays } from '@/store/progressStore';
import { usePrayerTimes, formatPrayerTime } from '@/hooks/usePrayerTimes';
import { useRecords } from '@/services/insightsService';
import { nights as nightsAr } from '@/services/insightsEngine';
import {
  toArabicDigits,
  computeStreakFromActiveDates,
  periodDelta,
  previousRange,
  patternWindow,
  hourHistogram,
  formatNumberAr,
  arabicClock,
  ARABIC_MONTHS,
  CHART,
  type DateRange,
} from '@/services/statsService';
import { parseISO, getDay, startOfWeek, subWeeks, format, subMonths } from 'date-fns';

import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
const units = (n: QiyamNight) => n.rakaat + (n.witr ? 1 : 0);

/** Night boundaries from today's times: maghrib → next fajr, last third = final third. */
function useNightThirds() {
  const { times } = usePrayerTimes();
  return useMemo(() => {
    const maghrib = times?.maghrib;
    const fajr = times?.fajr;
    if (!maghrib || !fajr) return null;
    const fajrNext = fajr.getTime() + 24 * 3600 * 1000;
    const len = fajrNext - maghrib.getTime();
    const lastThird = new Date(fajrNext - len / 3);
    const midnight = new Date(maghrib.getTime() + len / 2);
    return { lastThird, midnight, fajr: new Date(fajrNext), maghrib };
  }, [times]);
}

/** Minutes after maghrib (wraps past midnight) — for classifying a log time. */
function minsAfter(ts: number, anchor: Date): number {
  const d = new Date(ts);
  let m = d.getHours() * 60 + d.getMinutes() - (anchor.getHours() * 60 + anchor.getMinutes());
  if (m < 0) m += 24 * 60;
  return m;
}

/**
 * إحصاءات قيام الليل. NATURE: one record per NIGHT (rakaat + witr, keyed by
 * the evening it started) — so: nights & rakaat, witr rate, how many rakaat
 * you usually pray, which nights of the week, and whether you log in the
 * last third of the night.
 */
export function StatsQiyamPage() {
  const nights = useQiyamStore((s) => s.nights);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const streak = useMemo(() => {
    const keys = Object.keys(nights);
    const tonight = qiyamNightKey();
    return {
      ...computeStreakFromActiveDates(keys, parseISO(`${tonight}T12:00:00`), frozenDays('qiyam', freezes)),
      today: keys.includes(tonight),
    };
  }, [nights, freezes]);

  return (
    <StatsSubPage
      title="إحصاءات قيام الليل"
      subtitle="الليالي والركعات والوتر"
      today={<QiyamToday />}
      lead={
        <SectionLead
          domain="qiyam"
          streak={{ current: streak.current, best: streak.longest, unit: nightsAr, label: 'قيام الليل', activeToday: streak.today }}
        />
      }
    >
      <QiyamContent />
      <BadgeCategoryStrip categories={['qiyam']} />
    </StatsSubPage>
  );
}

function QiyamToday() {
  const nights = useQiyamStore((s) => s.nights);
  const thirds = useNightThirds();
  const tonight = nights[qiyamNightKey()];

  return (
    <TodayPanel
      title="الليلة"
      badge={
        tonight ? (
          <span className="text-xs font-bold text-teal dark:text-teal-light">سُجّل القيام</span>
        ) : null
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            'w-14 h-14 rounded-2xl inline-flex items-center justify-center shrink-0',
            tonight ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'bg-white/70 dark:bg-dark-surface text-teal dark:text-teal-light',
          ].join(' ')}
        >
          <MoonStar size={24} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-text-primary dark:text-text-on-dark">
            {tonight
              ? tonight.rakaat > 0
                ? `${toArabicDigits(tonight.rakaat)} ركعات${tonight.witr ? ' + الوتر' : ''} — تقبّل الله`
                : 'سُجّل قيامك — تقبّل الله'
              : 'لم يُسجَّل قيام الليلة بعد'}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {thirds
              ? `يبدأ الثلث الأخير نحو ${toArabicDigits(formatPrayerTime(thirds.lastThird))} · الفجر ${toArabicDigits(formatPrayerTime(thirds.fajr))}`
              : 'حدّد موقعك لنحسب الثلث الأخير من الليل'}
          </p>
          {tonight ? (
            <p className="text-[11px] text-text-muted">سُجّل الساعة {arabicClock(tonight.loggedAt)}</p>
          ) : null}
        </div>
      </div>
    </TodayPanel>
  );
}

function aggregate(nights: Record<string, QiyamNight>, range: DateRange) {
  const list = range.dateKeys.map((k) => nights[k]).filter(Boolean) as QiyamNight[];
  const counted = list.filter((n) => n.rakaat > 0);
  const rakaat = list.reduce((s, n) => s + units(n), 0);
  const witr = list.filter((n) => n.witr).length;
  const minutes = list.reduce((s, n) => s + (n.minutes ?? 0), 0);
  return {
    list,
    count: list.length,
    rakaat,
    witr,
    minutes,
    witrPct: counted.length ? Math.round((counted.filter((n) => n.witr).length / counted.length) * 100) : 0,
    avg: counted.length ? counted.reduce((s, n) => s + n.rakaat, 0) / counted.length : 0,
  };
}

const RAKAAT_BUCKETS: { label: string; test: (r: number) => boolean }[] = [
  { label: 'ركعتان', test: (r) => r > 0 && r <= 2 },
  { label: '٤ ركعات', test: (r) => r > 2 && r <= 4 },
  { label: '٦ ركعات', test: (r) => r > 4 && r <= 6 },
  { label: '٨ ركعات', test: (r) => r > 6 && r <= 8 },
  { label: '١٠ ركعات', test: (r) => r > 8 && r <= 10 },
  { label: '١١ فأكثر', test: (r) => r > 10 },
];

function QiyamContent() {
  const { range, period } = useStatsRange();
  const nights = useQiyamStore((s) => s.nights);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const records = useRecords('qiyam');
  const thirds = useNightThirds();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(nights, range), [nights, range]);
  const prev = useMemo(() => aggregate(nights, previousRange(range)), [nights, range]);
  const pattern = useMemo(() => patternWindow(range), [range]);
  const streakNow = useMemo(
    () => computeStreakFromActiveDates(Object.keys(nights), parseISO(`${qiyamNightKey()}T12:00:00`), frozenDays('qiyam', freezes)).current,
    [nights, freezes],
  );

  const patternData = useMemo(() => {
    const list = pattern.keys.map((k) => nights[k]).filter(Boolean) as QiyamNight[];
    const weekday = new Array<number>(7).fill(0);
    for (const n of list) weekday[getDay(parseISO(`${n.nightKey}T12:00:00`))]++;
    const buckets = RAKAAT_BUCKETS.map((b) => list.filter((n) => b.test(n.rakaat)).length);
    // When in the night it was logged (a proxy for when it was prayed).
    const hours = hourHistogram(list.map((n) => ({ ts: n.loggedAt })));
    let early = 0;
    let middle = 0;
    let last = 0;
    if (thirds) {
      const len = minsAfter(thirds.fajr.getTime(), thirds.maghrib);
      for (const n of list) {
        const m = minsAfter(n.loggedAt, thirds.maghrib);
        if (m >= len) last++; // logged after fajr — counts toward the pre-dawn third
        else if (m >= (len * 2) / 3) last++;
        else if (m >= len / 3) middle++;
        else early++;
      }
    }
    return { list, weekday, buckets, hours, early, middle, last };
  }, [nights, pattern.keys, thirds]);

  // Nights per week — last 12 weeks (Saturday-start).
  const weekly = useMemo(() => {
    const out: { label: string; value: number; highlight?: boolean }[] = [];
    const start0 = startOfWeek(new Date(), { weekStartsOn: 6 });
    for (let i = 11; i >= 0; i--) {
      const ws = subWeeks(start0, i);
      const from = format(ws, 'yyyy-MM-dd');
      const to = format(new Date(ws.getTime() + 6 * 86400000), 'yyyy-MM-dd');
      const value = Object.keys(nights).filter((k) => k >= from && k <= to).length;
      out.push({ label: toArabicDigits(ws.getDate()), value, highlight: i === 0 });
    }
    return out;
  }, [nights]);

  // Nights per month — last 6 months.
  const monthly = useMemo(() => {
    const out: { label: string; value: number; highlight?: boolean }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const prefix = format(m, 'yyyy-MM');
      out.push({
        label: ARABIC_MONTHS[m.getMonth()].slice(0, 3),
        value: Object.keys(nights).filter((k) => k.startsWith(prefix)).length,
        highlight: i === 0,
      });
    }
    return out;
  }, [nights]);
  const bestMonth = Math.max(...monthly.map((m) => m.value));

  const lastThirdBand = thirds
    ? { from: thirds.lastThird.getHours() + thirds.lastThird.getMinutes() / 60, to: thirds.fajr.getHours() + thirds.fajr.getMinutes() / 60, label: 'الثلث الأخير من الليل (تقريبي)' }
    : undefined;
  const classified = patternData.early + patternData.middle + patternData.last;
  const n = range.dateKeys.length;

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="قيامك في هذه الفترة"
          subtitle={range.label}
          icon={<MoonStar size={20} />}
          headline={{ value: toArabicDigits(agg.count), label: `ليلة قيام من ${toArabicDigits(n)}` }}
          delta={periodDelta(agg.count, prev.count)}
          streak={streakNow}
          streakLabel="ليالٍ متتالية"
          tiles={[
            { value: formatNumberAr(agg.rakaat), label: 'ركعة مع الوتر' },
            { value: `${toArabicDigits(agg.witrPct)}٪`, label: 'نسبة الوتر' },
            { value: formatNumberAr(agg.avg, 1), label: 'ركعة في الليلة' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodTrend
          monthStyle="bars"
          range={range}
          title="الركعات ليلةً بليلة"
          subtitle="الركعات مع الوتر في كل ليلة"
          valueFor={(k) => (nights[k] ? units(nights[k]) : 0)}
          onSelectDay={setSelectedDay}
          color={CHART.tealLight}
        />
      </Reveal>

      <Reveal delay={0.06}>
        <StatsPanel title="ليالي القيام أسبوعاً بأسبوع" subtitle="آخر ١٢ أسبوعاً — الرقم أول أيام الأسبوع" icon={<BarChart3 size={16} />}>
          <BarChart data={weekly.map((w) => ({ ...w, color: CHART.teal }))} height={120} max={7} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="flex flex-col gap-3">
          <StatsPanel title="كم تصلّي" subtitle={pattern.label} icon={<Sparkles size={16} />}>
            <BarChart
              data={RAKAAT_BUCKETS.map((b, i) => ({
                label: b.label,
                value: patternData.buckets[i],
                color: patternData.buckets[i] === Math.max(...patternData.buckets) && patternData.buckets[i] > 0 ? CHART.gold : CHART.teal,
              }))}
              orientation="horizontal"
              formatValue={(v) => nightsAr(v)}
            />
          </StatsPanel>
          <StatsPanel title="الوتر" subtitle={range.label} icon={<Moon size={16} />}>
            <DonutChart
              size={140}
              thickness={18}
              slices={[
                { label: 'مع الوتر', value: agg.witr, color: CHART.gold },
                { label: 'دون وتر', value: agg.count - agg.witr, color: CHART.teal },
              ]}
              centerLabel={
                <span className="flex flex-col items-center leading-none">
                  <span className="text-2xl font-counter font-bold text-gold-dark dark:text-gold-light">{toArabicDigits(agg.witr)}</span>
                  <span className="text-[10px] text-text-muted mt-1">ليلة وتر</span>
                </span>
              }
              emptyLabel="لا ليالٍ بعد"
            />
          </StatsPanel>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => ({
            date: k,
            value: nights[k] ? units(nights[k]) : 0,
            complete: !!nights[k]?.witr,
          }))}
          onSelectDay={setSelectedDay}
          title={period === 'month' ? 'تقويم القيام' : 'خريطة القيام'}
          legend={['لا قيام', 'ركعات أكثر']}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <WeekdayPanel values={patternData.weekday} nights subtitle={`عدد الليالي · ${pattern.label}`} title="لياليك في الأسبوع" />
      </Reveal>

      <Reveal delay={0.14}>
        <TimeOfDayPanel
          hours={patternData.hours}
          title="متى تقوم"
          subtitle={`وقت تسجيل القيام · ${pattern.label}`}
          emptyText="تظهر أوقات قيامك هنا بعد تسجيل بعض الليالي."
          band={lastThirdBand}
        />
        {thirds && classified > 0 ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { label: 'الثلث الأول', v: patternData.early },
              { label: 'الثلث الأوسط', v: patternData.middle },
              { label: 'الثلث الأخير', v: patternData.last, gold: true },
            ].map((x) => (
              <div
                key={x.label}
                className={[
                  'rounded-[var(--radius-inner)] p-2.5 text-center ring-1',
                  x.gold ? 'bg-[image:var(--gradient-gold-soft)] ring-gold/30' : 'bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06]',
                ].join(' ')}
              >
                <p className={['text-lg font-counter font-bold', x.gold ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
                  {toArabicDigits(Math.round((x.v / classified) * 100))}٪
                </p>
                <p className="text-[10px] text-text-muted">{x.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Reveal>

      <Reveal delay={0.16}>
        <StatsPanel title="ليالي كل شهر" subtitle="آخر ستة أشهر" icon={<CalendarRange size={16} />}>
          <BarChart data={monthly.map((m) => ({ ...m, color: m.value === bestMonth && m.value > 0 ? CHART.gold : CHART.teal }))} height={120} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.18}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'ليالي القيام', now: agg.count, prev: prev.count },
            { label: 'الركعات مع الوتر', now: agg.rakaat, prev: prev.rakaat },
            { label: 'ليالي الوتر', now: agg.witr, prev: prev.witr },
            { label: 'دقائق القيام', now: agg.minutes, prev: prev.minutes },
          ]}
        />
      </Reveal>

      <Reveal delay={0.2}>
        <RecordsPanel records={records} />
      </Reveal>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}
