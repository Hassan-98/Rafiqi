import { useMemo, useState } from 'react';
import { Star, CalendarDays, PieChart, ListChecks, Home, SunMedium } from 'lucide-react';

import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { DonutChart } from '@/components/stats/DonutChart';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { WeekMatrix, type MatrixCell } from '@/components/stats/WeekMatrix';
import { StreakPanel } from '@/components/stats/StreakPanel';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { Reveal } from '@/components/stats/Reveal';
import { TimeOfDayPanel } from '@/components/stats/TimeOfDayPanel';
import { BarChart } from '@/components/stats/BarChart';

import { useStatsRange } from '@/stats/StatsContext';
import {
  usePrayerLogStore,
  dayStreak,
  rawatibRakaatOf,
  RAWATIB,
  rawatibFullOn,
  rawatibOn,
  DUHA_RAKAAT_OPTIONS,
  duhaRakaatOf,
  duhaWindow,
  type DuhaEntry,
  type PrayerDayLog,
} from '@/store/prayerLogStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { usePrayerTimes } from '@/hooks/usePrayerTimes';
import { useQiyamStore, qiyamNightKey, type QiyamNight } from '@/store/qiyamStore';
import { days } from '@/services/insightsEngine';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import {
  toArabicDigits,
  periodDelta,
  previousRange,
  formatNumberAr,
  dateKeyOf,
  hourHistogram,
  WEEKDAY_SHORT_AR,
  CHART,
  type DateRange,
} from '@/services/statsService';

const qiyamUnits = (n: QiyamNight | undefined) => (n ? n.rakaat + (n.witr ? 1 : 0) : 0);

function useNawafil() {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const nights = useQiyamStore((s) => s.nights);
  return { log, excused, duha, nights };
}

/** A day's rawatib all prayed (12, or 10 on a man's Friday — الجمعة has no قبلية). */
const isFull = (log: Record<string, PrayerDayLog>, k: string, male: boolean) => rawatibRakaatOf(log[k], k, male) >= rawatibFullOn(k, male);
const fullDays = (log: Record<string, PrayerDayLog>, male: boolean) => Object.keys(log).filter((k) => isFull(log, k, male));
const useMale = () => useSettingsStore((s) => s.gender) === 'male';

/**
 * إحصاءات النوافل. NATURE: the twelve rawatib in five fixed slots, the day's
 * الضحى, and the night's الوتر/القيام — slot-shaped like the prayers page,
 * with the «بيت في الجنة» day (all twelve) as the headline unit.
 */
export function StatsNawafilPage() {
  const { log, excused, duha } = useNawafil();
  const male = useMale();
  const today = dateKeyOf(new Date());
  const rawatib = useMemo(() => dayStreak(fullDays(log, male), excused), [log, excused, male]);
  const duhaStreak = useMemo(() => dayStreak(Object.keys(duha), excused), [duha, excused]);

  return (
    <StatsSubPage
      title="إحصاءات النوافل"
      subtitle="السنن الرواتب والضحى والوتر"
      today={<NawafilToday />}
      lead={
        <div className="flex flex-col gap-3">
          <StreakPanel
            current={rawatib.current}
            best={rawatib.longest}
            unit={days}
            label="الرواتب كاملة"
            activeToday={isFull(log, today, male)}
            hint={male ? 'اثنتا عشرة ركعة في اليوم، وعشر يوم الجمعة' : 'اثنتا عشرة ركعة في اليوم'}
          />
          <StreakPanel current={duhaStreak.current} best={duhaStreak.longest} unit={days} label="صلاة الضحى" activeToday={!!duha[today]} />
        </div>
      }
    >
      <NawafilContent streakNow={rawatib.current} />
      <BadgeCategoryStrip categories={['sunnah']} />
    </StatsSubPage>
  );
}

function NawafilToday() {
  const { log, duha, nights } = useNawafil();
  const male = useMale();
  const key = dateKeyOf(new Date());
  const day = log[key];
  const rakaat = rawatibRakaatOf(day, key, male);
  const chips = [
    ...rawatibOn(key, male).map((r) => ({ label: r.label, sub: `${toArabicDigits(r.rakaat)} ركعات`, ok: !!day?.[r.prayer]?.[r.type] })),
    { label: 'الضحى', sub: 'ركعتان فأكثر', ok: !!duha[key], done: duha[key] ? `${toArabicDigits(duhaRakaatOf(duha[key]))} ركعات` : undefined },
    { label: 'الوتر', sub: 'الليلة', ok: !!nights[qiyamNightKey()]?.witr },
  ];

  return (
    <TodayPanel
      badge={
        <span className="text-xs font-counter font-bold text-teal dark:text-teal-light">
          {toArabicDigits(rakaat)}/{toArabicDigits(rawatibFullOn(key, male))} ركعة
        </span>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {chips.map((c) => (
          <div
            key={c.label}
            className={[
              'flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-0.5 ring-1 text-center',
              c.ok
                ? 'bg-[image:var(--gradient-teal)] text-on-accent ring-transparent shadow-[var(--shadow-xs)]'
                : 'bg-white/70 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/75 ring-black/[0.04] dark:ring-white/[0.06]',
            ].join(' ')}
          >
            <span className="text-[11px] font-bold leading-tight">{c.label}</span>
            <span className="text-[9px] font-counter opacity-90 whitespace-nowrap">{c.ok ? ('done' in c && c.done) || 'تمّت' : c.sub}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-track overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${(rakaat / rawatibFullOn(key, male)) * 100}%` }} />
      </div>
      {rakaat >= rawatibFullOn(key, male) ? (
        <p className="text-[11px] text-gold-dark dark:text-gold-light font-semibold mt-2 inline-flex items-center gap-1 text-pretty">
          <Home size={11} /> «من صلّى اثنتي عشرة ركعة في يوم وليلة بُني له بهنّ بيت في الجنة» — رواه مسلم
        </p>
      ) : null}
    </TodayPanel>
  );
}

function aggregate(
  log: Record<string, PrayerDayLog>,
  excused: Record<string, true>,
  duha: Record<string, DuhaEntry>,
  nights: Record<string, QiyamNight>,
  range: DateRange,
  male: boolean,
) {
  const keys = range.dateKeys.filter((k) => !excused[k]);
  const has = (k: string, r: (typeof RAWATIB)[number]) => rawatibOn(k, male).some((x) => x.prayer === r.prayer && x.type === r.type);
  // Each sunnah's share of the days it HAS (a man's Friday has no قبلية الظهر).
  const perSlot = RAWATIB.map((r) => {
    const of = keys.filter((k) => has(k, r));
    return of.length ? of.filter((k) => log[k]?.[r.prayer]?.[r.type]).length / of.length : 0;
  });
  const rawatib = keys.reduce((s, k) => s + rawatibRakaatOf(log[k], k, male), 0);
  const duhaDays = keys.filter((k) => duha[k]).length;
  const duhaRakaat = keys.reduce((s, k) => s + duhaRakaatOf(duha[k]), 0);
  const qiyam = range.dateKeys.reduce((s, k) => s + qiyamUnits(nights[k]), 0);
  return {
    n: keys.length,
    perSlot,
    rawatib,
    full: keys.filter((k) => isFull(log, k, male)).length,
    duhaDays,
    duhaRakaat,
    duhaBuckets: DUHA_RAKAAT_OPTIONS.map((r, i) =>
      keys.filter((k) => {
        const n = duhaRakaatOf(duha[k]);
        return n >= r && n < (DUHA_RAKAAT_OPTIONS[i + 1] ?? Infinity);
      }).length,
    ),
    witr: range.dateKeys.filter((k) => nights[k]?.witr).length,
    qiyam,
    total: rawatib + duhaRakaat + qiyam,
  };
}

function NawafilContent({ streakNow }: { streakNow: number }) {
  const { range, period } = useStatsRange();
  const { log, excused, duha, nights } = useNawafil();
  const male = useMale();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(log, excused, duha, nights, range, male), [log, excused, duha, nights, range, male]);
  const prev = useMemo(() => aggregate(log, excused, duha, nights, previousRange(range), male), [log, excused, duha, nights, range, male]);
  const rakaatOn = (k: string) =>
    (excused[k] ? 0 : rawatibRakaatOf(log[k], k, male) + duhaRakaatOf(duha[k])) + qiyamUnits(nights[k]);

  const week = useMemo(() => {
    const ds: { key: string; date: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      ds.push({ key: dateKeyOf(d), date: d });
    }
    const todayKey = dateKeyOf(new Date());
    const cell = (k: string, ok: boolean): MatrixCell => (ok ? 'done' : k === todayKey || excused[k] ? 'future' : 'miss');
    return {
      columns: ds.map((d) => WEEKDAY_SHORT_AR[d.date.getDay()]),
      rows: [
        ...RAWATIB.map((r) => ({
          label: r.label,
          // A man's Friday has no قبلية الظهر → a blank cell, not a miss.
          cells: ds.map((d) =>
            rawatibOn(d.key, male).some((x) => x.prayer === r.prayer && x.type === r.type)
              ? cell(d.key, !!log[d.key]?.[r.prayer]?.[r.type])
              : ('future' as MatrixCell),
          ),
        })),
        { label: 'الضحى', cells: ds.map((d) => cell(d.key, !!duha[d.key])) },
        { label: 'الوتر', cells: ds.map((d) => cell(d.key, !!nights[d.key]?.witr)) },
      ],
    };
  }, [log, excused, duha, nights, male]);

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="نوافلك في هذه الفترة"
          subtitle={range.label}
          icon={<Star size={20} />}
          headline={{ value: formatNumberAr(agg.total), label: 'ركعة نافلة' }}
          delta={periodDelta(agg.total, prev.total)}
          streak={streakNow}
          streakLabel="أيام رواتب كاملة متتالية"
          tiles={[
            { value: toArabicDigits(agg.full), label: 'أيام الرواتب كاملة' },
            { value: toArabicDigits(agg.duhaDays), label: 'أيام الضحى' },
            { value: toArabicDigits(agg.witr), label: 'ليالي الوتر' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <StatsPanel title="آخر ٧ أيام — كل نافلة بيوم" icon={<CalendarDays size={16} />}>
          <WeekMatrix columns={week.columns} rows={week.rows} highlightCol={6} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.06}>
        <PeriodTrend
          monthStyle="bars"
          range={range}
          title="الركعات يوماً بيوم"
          subtitle="الرواتب والضحى والقيام مع الوتر"
          valueFor={rakaatOn}
          onSelectDay={setSelectedDay}
          color={CHART.gold}
        />
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="التزامك بكل سنة" subtitle={`نسبة الأيام · ${range.label}`} icon={<ListChecks size={16} />}>
          <DistributionBars
            items={[
              ...RAWATIB.map((r, i) => ({ label: r.label, value: Math.round(agg.perSlot[i] * 100), max: 100, color: CHART.teal })),
              { label: 'الضحى', value: agg.n ? Math.round((agg.duhaDays / agg.n) * 100) : 0, max: 100, color: CHART.gold },
            ]}
            formatValue={(v) => `${toArabicDigits(v)}٪`}
            emptyLabel="لا أيام في هذه الفترة"
          />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <StatsPanel title="من أين نوافلك" subtitle="بالركعات" icon={<PieChart size={16} />}>
          <DonutChart
            size={140}
            thickness={18}
            slices={[
              { label: 'الرواتب', value: agg.rawatib, color: CHART.teal },
              { label: 'الضحى', value: agg.duhaRakaat, color: CHART.gold },
              { label: 'القيام والوتر', value: agg.qiyam, color: CHART.tealLight },
            ]}
            centerLabel={
              <span className="flex flex-col items-center leading-none">
                <span className="text-2xl font-counter font-bold text-gold-dark dark:text-gold-light">{formatNumberAr(agg.total)}</span>
                <span className="text-[10px] text-text-muted mt-1">ركعة</span>
              </span>
            }
            emptyLabel="لا نوافل بعد"
          />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.11}>
        <DuhaPanel agg={agg} rangeKeys={range.dateKeys} rangeLabel={range.label} />
      </Reveal>

      <Reveal delay={0.12}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => ({
            date: k,
            value: rakaatOn(k),
            complete: isFull(log, k, male),
          }))}
          onSelectDay={setSelectedDay}
          title={period === 'month' ? 'تقويم النوافل' : 'خريطة النوافل'}
          legend={['لا نوافل', 'ركعات أكثر']}
        />
      </Reveal>

      <Reveal delay={0.14}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'ركعات النوافل', now: agg.total, prev: prev.total },
            { label: 'أيام الرواتب كاملة', now: agg.full, prev: prev.full },
            { label: 'ركعات الرواتب', now: agg.rawatib, prev: prev.rawatib },
            { label: 'أيام الضحى', now: agg.duhaDays, prev: prev.duhaDays },
            { label: 'ركعات الضحى', now: agg.duhaRakaat, prev: prev.duhaRakaat },
            { label: 'ليالي الوتر', now: agg.witr, prev: prev.witr },
          ]}
        />
      </Reveal>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}

/** صلاة الضحى on its own: how many rakaat you usually pray, and when. */
function DuhaPanel({
  agg,
  rangeKeys,
  rangeLabel,
}: {
  agg: ReturnType<typeof aggregate>;
  rangeKeys: string[];
  rangeLabel: string;
}) {
  const events = useActivityLogStore((s) => s.events);
  const { times } = usePrayerTimes();
  const win = times ? duhaWindow(times) : null;
  const hours = useMemo(() => {
    const keys = new Set(rangeKeys);
    return hourHistogram(events.filter((e) => e.domain === 'prayer' && e.refId === 'duha' && keys.has(e.dateKey)));
  }, [events, rangeKeys]);
  const top = Math.max(...agg.duhaBuckets);
  const hour = (d: Date) => d.getHours() + d.getMinutes() / 60;

  return (
    <div className="flex flex-col gap-3">
      <StatsPanel
        title="صلاة الضحى"
        subtitle={`${toArabicDigits(agg.duhaDays)} يوماً · ${formatNumberAr(agg.duhaRakaat)} ركعة في ${rangeLabel}`}
        icon={<SunMedium size={16} />}
      >
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { v: agg.duhaDays ? formatNumberAr(agg.duhaRakaat / agg.duhaDays, 1) : '٠', l: 'ركعة في اليوم' },
            { v: `${toArabicDigits(agg.n ? Math.round((agg.duhaDays / agg.n) * 100) : 0)}٪`, l: 'من الأيام' },
            { v: toArabicDigits(agg.duhaBuckets[3] + agg.duhaBuckets[4]), l: 'يوماً بثمانٍ فأكثر' },
          ].map((x) => (
            <div key={x.l} className="rounded-[var(--radius-inner)] p-2.5 text-center ring-1 bg-[image:var(--gradient-gold-soft)] ring-gold/25">
              <p className="text-lg font-counter font-bold text-gold-dark dark:text-gold-light">{x.v}</p>
              <p className="text-[10px] text-text-muted">{x.l}</p>
            </div>
          ))}
        </div>
        <BarChart
          data={DUHA_RAKAAT_OPTIONS.map((r, i) => ({
            label: `${toArabicDigits(r)} ركعات`,
            value: agg.duhaBuckets[i],
            color: agg.duhaBuckets[i] === top && top > 0 ? CHART.gold : CHART.teal,
          }))}
          orientation="horizontal"
          formatValue={(v) => days(v)}
        />
      </StatsPanel>
      <TimeOfDayPanel
        hours={hours}
        title="متى تصلّي الضحى"
        subtitle={`وقت التسجيل · ${rangeLabel}`}
        emptyText="تظهر أوقات صلاتك للضحى هنا بعد تسجيلها في يومها."
        band={win ? { from: hour(win.best), to: hour(win.end), label: 'أفضل وقتها: حين ترمض الفِصال' } : undefined}
      />
    </div>
  );
}
