import { useMemo } from 'react';
import { Moon, Sparkles, BookOpen, Layers, CalendarRange } from 'lucide-react';
import type { TrendPoint } from '@/types';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatTile } from '@/components/stats/StatTile';
import { LineChart } from '@/components/stats/LineChart';
import { BarChart } from '@/components/stats/BarChart';
import { CellGridMap } from '@/components/stats/CellGridMap';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { Reveal } from '@/components/stats/Reveal';
import { useStatsRange } from '@/stats/StatsContext';
import { useRamadanStore } from '@/store/ramadanStore';
import { useProgressStore } from '@/store/progressStore';
import { useRecords } from '@/services/insightsService';
import { days } from '@/services/insightsEngine';
import {
  toArabicDigits,
  formatNumberAr,
  dateKeyOf,
  computeStreakFromActiveDates,
  periodDelta,
  previousRange,
  ARABIC_MONTHS,
  CHART,
  type DateRange,
} from '@/services/statsService';
import { format, subMonths, parseISO, getDay } from 'date-fns';
import type { DailyProgress } from '@/types';

import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
const TARAWEEH_TOTAL = 30;
const JUZ_TOTAL = 30;
const fasted = (dp: Record<string, DailyProgress>, k: string) =>
  !!dp[k]?.modules.find((m) => m.moduleId === 'fasting')?.completed;

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      <Moon size={22} className="text-text-muted opacity-60" />
      <p className="text-[12px] text-text-muted leading-relaxed max-w-[16rem]">{text}</p>
    </div>
  );
}

export function StatsFastingPage() {
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const streak = useMemo(() => {
    const keys = Object.keys(dailyProgress).filter((k) => fasted(dailyProgress, k));
    return { ...computeStreakFromActiveDates(keys), today: keys.includes(dateKeyOf(new Date())) };
  }, [dailyProgress]);

  return (
    <StatsSubPage
      title="إحصاءات الصيام ورمضان"
      subtitle="صيام التطوع والتراويح والختمة"
      today={<FastingToday />}
      lead={
        <SectionLead
          domain="fasting"
          streak={{ current: streak.current, best: streak.longest, unit: days, label: 'الصيام', activeToday: streak.today }}
        />
      }
    >
      <FastingStatsContent />
      <BadgeCategoryStrip categories={['fasting', 'seasons']} />
    </StatsSubPage>
  );
}

/** Today: is it a recommended fasting day, and did you log a fast? */
function FastingToday() {
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const now = new Date();
  const fastedToday = fasted(dailyProgress, dateKeyOf(now));
  const weekday = now.getDay();
  const isSunnahDay = weekday === 1 || weekday === 4;
  let fasted30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (fasted(dailyProgress, dateKeyOf(d))) fasted30++;
  }

  return (
    <TodayPanel badge={fastedToday ? <span className="text-xs font-bold text-teal dark:text-teal-light">صائم اليوم</span> : null}>
      <div className="flex items-center gap-3">
        <span
          className={[
            'w-14 h-14 rounded-2xl inline-flex items-center justify-center shrink-0',
            fastedToday ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'bg-white/70 dark:bg-dark-surface text-teal dark:text-teal-light',
          ].join(' ')}
        >
          <Moon size={24} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-text-primary dark:text-text-on-dark">
            {fastedToday
              ? 'تقبّل الله صيامك'
              : isSunnahDay
                ? `اليوم ${weekday === 1 ? 'الإثنين' : 'الخميس'} — يوم صيام مستحب`
                : 'لا صيام مسجَّلاً اليوم'}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">صمت {days(fasted30)} في آخر ٣٠ يوماً</p>
        </div>
      </div>
    </TodayPanel>
  );
}

function aggregate(dp: Record<string, DailyProgress>, range: DateRange) {
  const keys = range.dateKeys.filter((k) => fasted(dp, k));
  const sunnah = keys.filter((k) => [1, 4].includes(getDay(parseISO(k)))).length;
  return { count: keys.length, sunnah, other: keys.length - sunnah };
}

function FastingStatsContent() {
  const { range, period } = useStatsRange();
  const hijriYear = useRamadanStore((s) => s.hijriYear);
  const taraweehNights = useRamadanStore((s) => s.taraweehNights);
  const juzCompletedByDate = useRamadanStore((s) => s.juzCompletedByDate);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const records = useRecords('fasting');

  const agg = useMemo(() => aggregate(dailyProgress, range), [dailyProgress, range]);
  const prev = useMemo(() => aggregate(dailyProgress, previousRange(range)), [dailyProgress, range]);
  const streakNow = useMemo(
    () => computeStreakFromActiveDates(Object.keys(dailyProgress).filter((k) => fasted(dailyProgress, k))).current,
    [dailyProgress],
  );

  // Lifetime weekday pattern + last-6-months counts (fasting is sparse by nature).
  const lifetime = useMemo(() => {
    const keys = Object.keys(dailyProgress).filter((k) => fasted(dailyProgress, k));
    const weekday = new Array<number>(7).fill(0);
    for (const k of keys) weekday[getDay(parseISO(k))]++;
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(new Date(), 5 - i);
      const prefix = format(m, 'yyyy-MM');
      return { label: ARABIC_MONTHS[m.getMonth()].slice(0, 3), value: keys.filter((k) => k.startsWith(prefix)).length, highlight: i === 5 };
    });
    return { total: keys.length, weekday, monthly };
  }, [dailyProgress]);

  const hasRamadanData = taraweehNights.length > 0 || Object.values(juzCompletedByDate).some((a) => a.length > 0);

  const taraweeh = useMemo(() => {
    const set = new Set(taraweehNights.filter((x) => x >= 1 && x <= TARAWEEH_TOTAL));
    const states: Record<number, 'a' | 'b' | 'c'> = {};
    for (let x = 1; x <= TARAWEEH_TOTAL; x++) states[x] = set.has(x) ? 'a' : 'c';
    const sorted = [...set].sort((a, b) => a - b);
    let longest = sorted.length ? 1 : 0;
    let run = longest;
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i] - sorted[i - 1] === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    return { states, count: set.size, longest };
  }, [taraweehNights]);

  const juz = useMemo(() => {
    const sortedKeys = Object.keys(juzCompletedByDate).sort();
    const seen = new Set<number>();
    const points: TrendPoint[] = [];
    const bars = sortedKeys.map((key, i) => {
      const list = juzCompletedByDate[key] ?? [];
      for (const j of list) if (j >= 1 && j <= JUZ_TOTAL) seen.add(j);
      points.push({ date: key, value: seen.size });
      return { label: toArabicDigits(i + 1), value: list.length, color: list.length > 1 ? CHART.gold : CHART.teal };
    });
    const total = bars.reduce((s, b) => s + b.value, 0);
    const active = bars.filter((b) => b.value > 0).length;
    return { points, bars, unique: seen.size, total, avg: active ? total / active : 0 };
  }, [juzCompletedByDate]);

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="صيامك في هذه الفترة"
          subtitle={range.label}
          icon={<Moon size={20} />}
          headline={{ value: toArabicDigits(agg.count), label: 'يوم صيام تطوّع' }}
          delta={periodDelta(agg.count, prev.count)}
          streak={streakNow}
          streakLabel="أيام متتالية"
          tiles={[
            { value: toArabicDigits(agg.sunnah), label: 'اثنين وخميس' },
            { value: toArabicDigits(lifetime.total), label: 'منذ البداية' },
            { value: `${toArabicDigits(juz.unique)}/${toArabicDigits(JUZ_TOTAL)}`, label: 'أجزاء ختمة رمضان' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodCalendar
          period={period === 'week' || period === 'day' ? 'month' : period}
          cells={(period === 'week' || period === 'day'
            ? Array.from({ length: new Date().getDate() }, (_, i) => format(new Date(new Date().getFullYear(), new Date().getMonth(), i + 1), 'yyyy-MM-dd'))
            : range.dateKeys
          ).map((k) => ({ date: k, value: fasted(dailyProgress, k) ? 1 : 0, complete: fasted(dailyProgress, k), ratio: fasted(dailyProgress, k) ? 1 : 0 }))}
          max={1}
          formatValue={() => 'صائم'}
          title="تقويم الصيام"
          legend={['لم يُسجَّل', 'صائم']}
        />
      </Reveal>

      <Reveal delay={0.06}>
        <StatsPanel title="الصيام شهراً بشهر" subtitle="آخر ستة أشهر" icon={<CalendarRange size={16} />}>
          <BarChart data={lifetime.monthly.map((m) => ({ ...m, color: CHART.teal }))} height={120} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.08}>
        <WeekdayPanel values={lifetime.weekday} title="أيام صيامك في الأسبوع" subtitle="منذ البداية — السنة: الإثنين والخميس" minTotal={1} />
      </Reveal>

      <Reveal delay={0.1}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'أيام الصيام', now: agg.count, prev: prev.count },
            { label: 'الإثنين والخميس', now: agg.sunnah, prev: prev.sunnah },
            { label: 'أيام أخرى', now: agg.other, prev: prev.other },
          ]}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <StatsPanel
          title="تراويح رمضان"
          subtitle={hijriYear != null ? `رمضان ${toArabicDigits(hijriYear)} هـ` : 'رمضان الحالي'}
          icon={<Sparkles size={16} />}
        >
          {hasRamadanData ? (
            <>
              <CellGridMap
                count={TARAWEEH_TOTAL}
                states={taraweeh.states}
                columns={10}
                showNumbers
                colors={{ a: CHART.teal, b: CHART.gold, c: CHART.track }}
                labelFor={(i) => `الليلة ${toArabicDigits(i)}`}
              />
              <div className="grid grid-cols-2 gap-2">
                <StatTile value={`${toArabicDigits(taraweeh.count)}/٣٠`} label="ليالي التراويح" />
                <StatTile value={toArabicDigits(taraweeh.longest)} label="أطول سلسلة ليالٍ" accent="gold" />
              </div>
            </>
          ) : (
            <EmptyHint text="لا بيانات تراويح بعد. تُحتسب من ليالي رمضان لهذا العام الهجري." />
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.14}>
        <StatsPanel title="ختمة رمضان" subtitle="الأجزاء المنجزة تراكمياً" icon={<BookOpen size={16} />}>
          {juz.points.length > 0 ? (
            <>
              <LineChart
                series={[{ points: juz.points, color: CHART.teal, area: true, label: 'الأجزاء تراكمياً' }]}
                height={150}
                yMax={JUZ_TOTAL}
                referenceY={JUZ_TOTAL}
                referenceLabel="ختمة"
                formatY={(v) => toArabicDigits(Math.round(v))}
                startLabel="بداية رمضان"
                endLabel="اليوم"
              />
              <p className="text-[12px] text-text-secondary dark:text-text-on-dark/80 text-center">
                أنجزت {toArabicDigits(juz.unique)} من {toArabicDigits(JUZ_TOTAL)} جزءاً
                {juz.unique >= JUZ_TOTAL ? ' — مبارك، أتممت الختمة' : ` — تبقّى ${toArabicDigits(JUZ_TOTAL - juz.unique)}`}
              </p>
            </>
          ) : (
            <EmptyHint text="سجّل الأجزاء المنجزة في رمضان لتظهر ختمتك التراكمية هنا." />
          )}
        </StatsPanel>
      </Reveal>

      {juz.bars.length > 0 ? (
        <Reveal delay={0.16}>
          <StatsPanel title="أجزاء كل يوم" icon={<Layers size={16} />}>
            <BarChart data={juz.bars} height={130} />
            <div className="grid grid-cols-2 gap-2">
              <StatTile value={formatNumberAr(juz.avg, 1)} label="متوسط الأجزاء يومياً" />
              <StatTile value={toArabicDigits(juz.total)} label="إجمالي الأجزاء" accent="gold" />
            </div>
          </StatsPanel>
        </Reveal>
      ) : null}

      {records.length > 0 ? (
        <Reveal delay={0.18}>
          <RecordsPanel records={records} />
        </Reveal>
      ) : null}
    </>
  );
}
