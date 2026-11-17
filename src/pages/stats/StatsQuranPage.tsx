import { useMemo, useState } from 'react';
import { BookOpen, Layers, Map as MapIcon } from 'lucide-react';
import type { WirdUnit } from '@/types';

import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatTile } from '@/components/stats/StatTile';
import { CellGridMap } from '@/components/stats/CellGridMap';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { Reveal } from '@/components/stats/Reveal';
import { ProgressGauge } from '@/components/stats/ProgressGauge';

import { useStatsRange } from '@/stats/StatsContext';
import { useQuranStore } from '@/store/quranStore';
import { useMushafiStore, quranTypeStats, khatmaState } from '@/store/mushafiStore';
import { QURAN_TYPE_IDS, QURAN_TYPES, quranTypeOf } from '@/data/quranTypes';
import { useRecords } from '@/services/insightsService';
import { days } from '@/services/insightsEngine';
import { juzForPage, TOTAL_MUSHAF_PAGES } from '@/data/juz';
import { featuredKhatma, khatmaCovers, khatmaNextPage, khatmaPct } from '@/store/khatmaModel';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import {
  toArabicDigits,
  dateKeyOf,
  computeStreakFromActiveDates,
  periodDelta,
  previousRange,
  patternWindow,
  weekdayAverages,
  formatNumberAr,
  CHART,
  type DateRange,
} from '@/services/statsService';

export const UNIT_LABELS_AR: Record<WirdUnit, string> = {
  page: 'صفحة',
  ayat: 'آية',
  juz: 'جزء',
  hizb: 'حزب',
  surah: 'سورة',
};

type WirdHistory = Record<string, { unit: WirdUnit; amount: number; achieved: number }>;

const dayCount = (n: number) =>
  n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${toArabicDigits(n)} أيام` : `${toArabicDigits(n)} يوماً`;

/**
 * إحصاءات القرآن. NATURE: a daily wird (portion) + a long journey through 604
 * pages + تسميع sessions — so: units read, wird completion, the khatma map by
 * juz with a pace-based ETA, hifz accuracy, and when you usually read.
 */
export function StatsQuranPage() {
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const streak = useMemo(() => {
    const keys = Object.entries(wirdHistory)
      .filter(([, e]) => e.achieved > 0)
      .map(([k]) => k);
    return { ...computeStreakFromActiveDates(keys), today: keys.includes(dateKeyOf(new Date())) };
  }, [wirdHistory]);

  return (
    <StatsSubPage
      title="إحصاءات القرآن"
      subtitle="الورد والختمات وأنواعها"
      today={<QuranToday />}
      lead={
        <SectionLead
          domain="quran"
          streak={{ current: streak.current, best: streak.longest, unit: days, label: 'الورد', activeToday: streak.today }}
        />
      }
    >
      <QuranContent />
      <BadgeCategoryStrip categories={['quran']} />
    </StatsSubPage>
  );
}

function QuranToday() {
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const khatmas = useMushafiStore((s) => s.khatmas);
  const marks = useMushafiStore((s) => s.marks);
  const today = dateKeyOf(new Date());
  const entry = wirdHistory[today];
  const pct = entry && entry.amount > 0 ? Math.min(100, Math.round((entry.achieved / entry.amount) * 100)) : 0;
  const running = useMemo(
    () => khatmas.map((k) => khatmaState(k, marks, today)).filter((x) => x.live && x.day >= 0 && x.day < x.days),
    [khatmas, marks, today],
  );

  return (
    <TodayPanel
      badge={
        entry ? (
          <span className="text-xs font-counter font-bold text-teal dark:text-teal-light">
            {toArabicDigits(entry.achieved)}/{toArabicDigits(entry.amount)} {UNIT_LABELS_AR[entry.unit]}
          </span>
        ) : null
      }
    >
      <div className="flex items-center gap-4">
        <ProgressGauge value={pct} max={100} variant="ring" size={84} label="ورد اليوم" thresholds={[{ at: 0, color: CHART.teal }, { at: 100, color: CHART.gold }]} formatValue={(p) => <span className="text-lg">{toArabicDigits(p)}٪</span>} />
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <p className="text-[12.5px] font-semibold text-text-secondary dark:text-text-on-dark/85">
            {!entry ? 'اربط مصحفي ليُتابَع وردك هنا يوماً بيوم' : pct >= 100 ? 'أتممت ورد اليوم — تقبّل الله' : pct > 0 ? 'واصل، أنت في منتصف وردك' : 'لم تبدأ ورد اليوم بعد'}
          </p>
          {running.map((x) => (
            <p key={x.id} className="text-[11px] text-text-muted flex items-center gap-1 min-w-0">
              <span className="truncate">«{x.name}»، {QURAN_TYPES[x.type].label}</span>
              <span className={`shrink-0 font-counter ${x.owe === 0 ? 'text-gold-dark dark:text-gold-light font-semibold' : ''}`}>
                {x.owe === 0 ? 'تمّ' : `بقي ${toArabicDigits(x.owe)} ص`}
              </span>
            </p>
          ))}
        </div>
      </div>
    </TodayPanel>
  );
}

function aggregate(wh: WirdHistory, range: DateRange) {
  let achieved = 0;
  let activeDays = 0;
  let completeDays = 0;
  let best = 0;
  const byUnit = new Map<WirdUnit, number>();
  for (const k of range.dateKeys) {
    const e = wh[k];
    if (!e || e.achieved <= 0) continue;
    activeDays++;
    achieved += e.achieved;
    best = Math.max(best, e.achieved);
    if (e.amount > 0 && e.achieved >= e.amount) completeDays++;
    byUnit.set(e.unit, (byUnit.get(e.unit) ?? 0) + e.achieved);
  }
  const mainUnit = [...byUnit].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'page';
  return { achieved, activeDays, completeDays, best, mainUnit };
}

function QuranContent() {
  const { range, period } = useStatsRange();
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const khatmas = useQuranStore((s) => s.khatmas);
  const activeKhatmaId = useQuranStore((s) => s.activeKhatmaId);
  const mDays = useMushafiStore((s) => s.days);
  const mKhatmas = useMushafiStore((s) => s.khatmas);
  const mMarks = useMushafiStore((s) => s.marks);
  const mTops = useMushafiStore((s) => s.tops);
  const records = useRecords('quran');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(wirdHistory, range), [wirdHistory, range]);
  const prevRange = useMemo(() => previousRange(range), [range]);
  const prev = useMemo(() => aggregate(wirdHistory, prevRange), [wirdHistory, prevRange]);
  const pattern = useMemo(() => patternWindow(range), [range]);
  const streakNow = useMemo(
    () => computeStreakFromActiveDates(Object.entries(wirdHistory).filter(([, e]) => e.achieved > 0).map(([k]) => k)).current,
    [wirdHistory],
  );

  // Khatma types: each at its own pace, so compared by how REGULAR you were in it, not by pages.
  const types = useMemo(() => quranTypeStats(mDays, mKhatmas, mMarks, dateKeyOf(new Date()), mTops), [mDays, mKhatmas, mMarks, mTops]);
  const typeRows = (r: DateRange) =>
    QURAN_TYPE_IDS.map((ty) => {
      const d = types[ty].days;
      const keys = new Set(r.dateKeys);
      return {
        type: ty,
        pages: r.dateKeys.reduce((n, k) => n + (d[k] ?? 0), 0),
        days: r.dateKeys.filter((k) => (d[k] ?? 0) > 0).length,
        finished: mKhatmas.filter((k) => !k.del && k.f && keys.has(k.f) && quranTypeOf(k.ty) === ty).length,
        open: types[ty].running.length > 0,
      };
    });
  const typesNow = useMemo(() => typeRows(range), [types, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const typesPrev = useMemo(() => typeRows(prevRange), [types, prevRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishedNow = typesNow.reduce((n, x) => n + x.finished, 0);
  const finishedPrev = typesPrev.reduce((n, x) => n + x.finished, 0);

  // Khatma journey (featured named khatma): pages covered since ITS start →
  // juz map (a juz is done when all its pages are covered) + 14-day pace ETA.
  const journey = useMemo(() => {
    const k = featuredKhatma(khatmas, activeKhatmaId);
    if (!k) return null;
    const next = khatmaNextPage(k);
    const juzLeft = new Set<number>();
    for (let p = 1; p <= TOTAL_MUSHAF_PAGES; p++) if (!khatmaCovers(k, p)) juzLeft.add(juzForPage(p));
    const nextJuz = k.read < TOTAL_MUSHAF_PAGES ? juzForPage(next) : 0;
    const states: Record<number, 'a' | 'b' | 'c'> = {};
    for (let j = 1; j <= 30; j++) states[j] = !juzLeft.has(j) ? 'a' : j === nextJuz ? 'b' : 'c';
    let pages14 = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const e = wirdHistory[dateKeyOf(d)];
      if (e?.unit === 'page') pages14 += e.achieved;
    }
    const pace = pages14 / 14;
    const left = TOTAL_MUSHAF_PAGES - k.read;
    const eta = pace > 0 && left > 0 ? Math.ceil(left / pace) : null;
    const mk = mKhatmas.find((x) => `m_${x.id}` === k.id);
    return { name: k.name, type: mk ? QURAN_TYPES[quranTypeOf(mk.ty)].label : null, read: k.read, next, juz: nextJuz, states, pace, eta, pct: khatmaPct(k) };
  }, [khatmas, activeKhatmaId, wirdHistory, mKhatmas]);

  const patternData = useMemo(
    () => ({ weekday: weekdayAverages(pattern.keys, (k) => wirdHistory[k]?.achieved ?? 0).map((w) => w.avg) }),
    [pattern.keys, wirdHistory],
  );

  const unit = UNIT_LABELS_AR[agg.mainUnit as WirdUnit] ?? 'صفحة';
  const n = range.dateKeys.length;
  const avgActive = agg.activeDays > 0 ? agg.achieved / agg.activeDays : 0;

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="قراءتك في هذه الفترة"
          subtitle={range.label}
          icon={<BookOpen size={20} />}
          headline={{ value: formatNumberAr(agg.achieved), label: `${unit} من وردك` }}
          delta={periodDelta(agg.achieved, prev.achieved)}
          streak={streakNow}
          streakLabel="أيام ورد متتالية"
          tiles={[
            { value: `${toArabicDigits(agg.activeDays)}/${toArabicDigits(n)}`, label: 'أيام قرأت فيها' },
            { value: toArabicDigits(agg.completeDays), label: 'ورد مكتمل' },
            { value: formatNumberAr(avgActive, 1), label: `${unit} يومياً` },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodTrend
          monthStyle="bars"
          range={range}
          title="الورد يوماً بيوم"
          subtitle={`عدد ما قرأت (${unit}) في كل يوم`}
          valueFor={(k) => wirdHistory[k]?.achieved ?? 0}
          formatValue={formatNumberAr}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="طريقك إلى الختمة" subtitle={journey ? `«${journey.name}»${journey.type ? `، ${journey.type}` : ''} جزءاً جزءاً` : 'ختمتك جزءاً جزءاً'} icon={<MapIcon size={16} />}>
          {journey ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2.5 rounded-full bg-track overflow-hidden">
                    <div className="h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${journey.pct}%` }} />
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    قرأت {toArabicDigits(journey.read)} من {toArabicDigits(TOTAL_MUSHAF_PAGES)} صفحة
                    {journey.juz ? ` · التالية ${toArabicDigits(journey.next)} (الجزء ${toArabicDigits(journey.juz)})` : ' — تقبّل الله'}
                  </p>
                </div>
                <span className="text-2xl font-counter font-bold text-teal dark:text-teal-light shrink-0">
                  {toArabicDigits(journey.pct)}٪
                </span>
              </div>
              <CellGridMap
                count={30}
                states={journey.states}
                columns={10}
                showNumbers
                colors={{ a: CHART.teal, b: CHART.gold, c: CHART.track }}
                labelFor={(i) => `الجزء ${toArabicDigits(i)}`}
              />
              <div className="grid grid-cols-2 gap-2">
                <StatTile value={formatNumberAr(journey.pace, 1)} label="صفحة يومياً (آخر ١٤ يوماً)" />
                <StatTile
                  value={journey.eta != null ? toArabicDigits(journey.eta) : '—'}
                  label={journey.eta != null ? 'يوماً حتى الختمة بمعدلك' : 'اقرأ لنحسب موعد الختمة'}
                  accent="gold"
                />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-text-muted text-center py-4">
              أنشئ ختمة في مصحفي ليُتابَع تقدّمها هنا.
            </p>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => {
            const e = wirdHistory[k];
            const ratio = e && e.amount > 0 ? Math.min(1, e.achieved / e.amount) : 0;
            return { date: k, value: e?.achieved ?? 0, complete: ratio >= 1, ratio };
          })}
          onSelectDay={setSelectedDay}
          title={period === 'month' ? 'تقويم الورد' : 'خريطة الورد'}
          legend={['لا ورد', 'ورد كامل']}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <StatsPanel title="أنواع الختمات" subtitle={`${range.label} — لكلٍّ سرعته، فالمقياس أيامك فيه`} icon={<Layers size={16} />}>
          {typesNow.every((x) => !x.days && !x.open && !x.finished) ? (
            <p className="text-[12px] text-text-muted text-center py-4">
              لا تقدّم في ختمات مصحفي في هذه الفترة. اجعل لك من التلاوة والاستماع والتفسير والمراجعة نصيباً.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {typesNow.map((x) => {
                const { Icon, label } = QURAN_TYPES[x.type];
                return (
                  <div key={x.type} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span className="font-bold text-text-primary dark:text-text-on-dark">{label}</span>
                        <span className="font-counter tabular-nums text-text-muted">
                          {x.days ? `${toArabicDigits(x.pages)} ص في ${dayCount(x.days)} من ${toArabicDigits(n)}` : 'لا تقدّم'}
                        </span>
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-track overflow-hidden">
                        <div className="h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${Math.round((x.days / Math.max(1, n)) * 100)}%` }} />
                      </div>
                      {x.finished ? (
                        <p className="text-[11px] text-gold-dark dark:text-gold-light font-semibold mt-0.5">ختمت {toArabicDigits(x.finished)} في هذه الفترة</p>
                      ) : !x.open && !x.days ? (
                        <p className="text-[11px] text-text-muted mt-0.5">لا ختمة {label} جارية</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.14}>
        <WeekdayPanel
          values={patternData.weekday}
          subtitle={`متوسط ما تقرأ في كل يوم · ${pattern.label}`}
          formatValue={(v) => formatNumberAr(v, 1)}
        />
      </Reveal>

      <Reveal delay={0.18}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: `ما قرأت (${unit})`, now: agg.achieved, prev: prev.achieved },
            { label: 'أيام القراءة', now: agg.activeDays, prev: prev.activeDays },
            { label: 'ورد مكتمل', now: agg.completeDays, prev: prev.completeDays },
            { label: 'أكثر يوم', now: agg.best, prev: prev.best },
            { label: 'ختمات أتممتها', now: finishedNow, prev: finishedPrev },
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
