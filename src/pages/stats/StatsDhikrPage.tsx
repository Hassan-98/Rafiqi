import { useMemo, useState } from 'react';
import { Sunrise, Sunset, Star, Sparkles, Hash, Layers, Flame, MessageCircleHeart, MoonStar } from 'lucide-react';

import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { TimeOfDayPanel } from '@/components/stats/TimeOfDayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { Reveal } from '@/components/stats/Reveal';
import { ProgressGauge } from '@/components/stats/ProgressGauge';

import { useStatsRange } from '@/stats/StatsContext';
import { useTasbihStore } from '@/store/tasbihStore';
import { useProgressStore, frozenDays } from '@/store/progressStore';
import { useActivityLogStore, type ActivityEvent } from '@/store/activityLogStore';
import { useDhikrSessionStore, freshSession } from '@/store/dhikrSessionStore';
import { usePrayerLogStore, adhkarCountOf } from '@/store/prayerLogStore';
import { useRecords } from '@/services/insightsService';
import { days, times } from '@/services/insightsEngine';
import {
  toArabicDigits,
  dateKeyOf,
  computeStreakFromActiveDates,
  periodDelta,
  previousRange,
  patternWindow,
  weekdayAverages,
  hourHistogram,
  formatNumberAr,
  CHART,
  type DateRange,
} from '@/services/statsService';
import type { DailyProgress } from '@/types';

import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
const dhikrMod = (day: DailyProgress | undefined) => day?.modules.find((m) => m.moduleId === 'dhikr');
const isReps = (e: ActivityEvent) => e.domain === 'dhikr' || e.domain === 'tasbih';

const SET_ICON: Record<string, typeof Sunrise> = { morning: Sunrise, evening: Sunset, postPrayer: Star, sleep: MoonStar };
const TASBIH_LADDER = [100, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

/**
 * إحصاءات الأذكار والتسبيح. NATURE: daily sets (صباح/مساء/بعد الصلاة…) + an
 * always-on tasbih — so the page counts REPETITIONS (from the timed log),
 * per-set consistency, the phrases you repeat most, and when you remember.
 */
export function StatsDhikrPage() {
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const streak = useMemo(() => {
    const keys = Object.values(dailyProgress)
      .filter((d) => dhikrMod(d)?.completed)
      .map((d) => d.dateKey);
    return { ...computeStreakFromActiveDates(keys, new Date(), frozenDays('dhikr', freezes)), today: keys.includes(dateKeyOf(new Date())) };
  }, [dailyProgress, freezes]);

  return (
    <StatsSubPage
      title="إحصاءات الأذكار والتسبيح"
      subtitle="الأوراد اليومية والسبحة"
      today={<DhikrToday />}
      lead={
        <SectionLead
          domain="dhikr"
          streak={{ current: streak.current, best: streak.longest, unit: days, label: 'الأذكار', activeToday: streak.today }}
        />
      }
    >
      <DhikrContent />
      <BadgeCategoryStrip categories={['dhikr']} />
    </StatsSubPage>
  );
}

const TODAY_SETS = [
  { id: 'morning', label: 'الصباح', Icon: Sunrise },
  { id: 'evening', label: 'المساء', Icon: Sunset },
  { id: 'postPrayer', label: 'بعد الصلاة', Icon: Star },
  { id: 'sleep', label: 'النوم', Icon: MoonStar },
] as const;

function DhikrToday() {
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const sessions = useDhikrSessionStore((s) => s.sessions);
  const events = useActivityLogStore((s) => s.events);
  const todayKey = dateKeyOf(new Date());
  const afterPrayers = usePrayerLogStore((s) => adhkarCountOf(s.log[todayKey]));
  const todayPct = Math.round((dhikrMod(dailyProgress[todayKey])?.completionRate ?? 0) * 100);
  const repsToday = useMemo(
    () => events.reduce((n, e) => (e.dateKey === todayKey && isReps(e) ? n + e.amount : n), 0),
    [events, todayKey],
  );

  return (
    <TodayPanel
      badge={
        repsToday > 0 ? (
          <span className="text-xs font-counter font-bold text-gold-dark dark:text-gold-light">
            {formatNumberAr(repsToday)} ذكراً
          </span>
        ) : null
      }
    >
      <div className="flex items-center gap-4">
        <ProgressGauge value={todayPct} max={100} variant="ring" size={84} label="أذكار اليوم" thresholds={[{ at: 0, color: CHART.teal }, { at: 100, color: CHART.gold }]} formatValue={(p) => <span className="text-lg">{toArabicDigits(p)}٪</span>} />
        <div className="flex-1 grid grid-cols-4 gap-1.5">
          {TODAY_SETS.map(({ id, label, Icon }) => {
            const s = freshSession(sessions[id]);
            const read = Object.values(s.counts).filter((n) => n > 0).length + Object.values(s.skipped).filter(Boolean).length;
            // أذكار ما بعد الصلاة are counted per prayer, from the prayer log.
            const post = id === 'postPrayer';
            const started = post ? afterPrayers > 0 : read > 0;
            return (
              <div
                key={id}
                className={[
                  'flex flex-col items-center gap-0.5 rounded-xl py-2 ring-1',
                  started
                    ? 'bg-teal/12 dark:bg-teal/20 text-teal dark:text-teal-light ring-teal/15'
                    : 'bg-white/70 dark:bg-dark-surface text-text-muted ring-black/[0.04] dark:ring-white/[0.06]',
                ].join(' ')}
              >
                <Icon size={15} />
                <span className="text-[10px] font-bold">{label}</span>
                <span className="text-[10px] font-counter">
                  {post ? `${toArabicDigits(afterPrayers)} من ٥` : started ? `${toArabicDigits(read)} ذكراً` : 'لم تبدأ'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </TodayPanel>
  );
}

function aggregate(events: ActivityEvent[], dp: Record<string, DailyProgress>, range: DateRange) {
  const keys = new Set(range.dateKeys);
  const repsByDay = new Map<string, number>();
  let reps = 0;
  let tasbih = 0;
  const sets = new Map<string, { title: string; days: Set<string>; reps: number }>();
  const phrases = new Map<string, number>();
  for (const e of events) {
    if (!keys.has(e.dateKey) || !isReps(e)) continue;
    reps += e.amount;
    repsByDay.set(e.dateKey, (repsByDay.get(e.dateKey) ?? 0) + e.amount);
    if (e.domain === 'tasbih') tasbih += e.amount;
    if (e.domain === 'dhikr' && e.refId) {
      const s = sets.get(e.refId) ?? { title: e.title, days: new Set(), reps: 0 };
      s.days.add(e.dateKey);
      s.reps += e.amount;
      sets.set(e.refId, s);
    }
    const phrase = (e.domain === 'dhikr' ? e.detail : e.title) ?? e.title;
    phrases.set(phrase, (phrases.get(phrase) ?? 0) + e.amount);
  }
  const completed = range.dateKeys.filter((k) => dhikrMod(dp[k])?.completed).length;
  const setDays = (id: string) => sets.get(id)?.days.size ?? 0;
  return { reps, tasbih, repsByDay, sets, phrases, completed, morning: setDays('morning'), evening: setDays('evening') };
}

function DhikrContent() {
  const { range, period } = useStatsRange();
  const counters = useTasbihStore((s) => s.counters);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const events = useActivityLogStore((s) => s.events);
  const records = useRecords('dhikr');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(events, dailyProgress, range), [events, dailyProgress, range]);
  const prev = useMemo(() => aggregate(events, dailyProgress, previousRange(range)), [events, dailyProgress, range]);
  const pattern = useMemo(() => patternWindow(range), [range]);

  // Per-set lifetime streaks (from every logged day, not just the range).
  const setStreaks = useMemo(() => {
    const byset = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.domain !== 'dhikr' || !e.refId) continue;
      let s = byset.get(e.refId);
      if (!s) byset.set(e.refId, (s = new Set()));
      s.add(e.dateKey);
    }
    return new Map([...byset].map(([id, s]) => [id, computeStreakFromActiveDates([...s])]));
  }, [events]);

  const patternData = useMemo(() => {
    const keys = new Set(pattern.keys);
    const evs = events.filter((e) => isReps(e) && keys.has(e.dateKey));
    const byDay = new Map<string, number>();
    for (const e of evs) byDay.set(e.dateKey, (byDay.get(e.dateKey) ?? 0) + e.amount);
    return {
      hours: hourHistogram(evs, (e) => e.amount),
      weekday: weekdayAverages(pattern.keys, (k) => byDay.get(k) ?? 0).map((w) => w.avg),
    };
  }, [events, pattern.keys]);

  const lifetime = useMemo(() => {
    const total = counters.reduce((sum, c) => sum + c.totalLifetimeCount, 0);
    const top = [...counters].sort((a, b) => b.totalLifetimeCount - a.totalLifetimeCount).slice(0, 6);
    const next = TASBIH_LADDER.find((m) => m > total) ?? total;
    return { total, top, next };
  }, [counters]);

  const setRows = [...agg.sets.entries()].sort((a, b) => b[1].days.size - a[1].days.size);
  const topPhrases = [...agg.phrases.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const n = range.dateKeys.length;
  const rounded = (v: number) => formatNumberAr(v);

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="ذكرك في هذه الفترة"
          subtitle={range.label}
          icon={<Sparkles size={20} />}
          headline={{ value: formatNumberAr(agg.reps), label: 'ذكراً وتسبيحة' }}
          delta={periodDelta(agg.reps, prev.reps)}
          streak={setStreaks.get('morning')?.current ?? 0}
          streakLabel="سلسلة الصباح"
          tiles={[
            { value: `${toArabicDigits(agg.completed)}/${toArabicDigits(n)}`, label: 'أيام مكتملة' },
            { value: toArabicDigits(agg.morning), label: 'أيام الصباح' },
            { value: toArabicDigits(agg.evening), label: 'أيام المساء' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodTrend
          range={range}
          title="الأذكار يوماً بيوم"
          subtitle="مجموع التكرارات في الأوراد والسبحة"
          valueFor={(k) => agg.repsByDay.get(k) ?? 0}
          formatValue={rounded}
          color={CHART.teal}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="كل ورد على حدة" subtitle="أيام القراءة في الفترة والسلسلة الحالية" icon={<Layers size={16} />}>
          {setRows.length === 0 ? (
            <p className="text-[12px] text-text-muted text-center py-4">لم تُقرأ أوراد في هذه الفترة بعد.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {setRows.map(([id, s]) => {
                const Icon = SET_ICON[id] ?? Sparkles;
                const st = setStreaks.get(id);
                const pct = n > 0 ? Math.round((s.days.size / n) * 100) : 0;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                      <Icon size={17} />
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{s.title}</span>
                        {st && st.current > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-counter font-bold text-gold-dark dark:text-gold-light">
                            <Flame size={11} /> {toArabicDigits(st.current)}
                          </span>
                        ) : null}
                      </div>
                      <div className="h-1.5 rounded-full bg-track overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? CHART.gold : CHART.teal }} />
                      </div>
                      <span className="text-[11px] text-text-muted">
                        <span className="font-counter">{toArabicDigits(s.days.size)}</span> من {toArabicDigits(n)} أيام ·{' '}
                        <span className="font-counter">{formatNumberAr(s.reps)}</span> تكراراً
                        {st && st.longest > 1 ? ` · الأطول ${days(st.longest)}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => {
            const rate = dhikrMod(dailyProgress[k])?.completionRate ?? 0;
            return { date: k, value: Math.round(rate * 100), complete: rate >= 1, ratio: rate };
          })}
          max={100}
          formatValue={(v) => `${toArabicDigits(Math.round(v))}٪`}
          onSelectDay={setSelectedDay}
          title={period === 'month' ? 'تقويم إتمام الأذكار' : 'خريطة المواظبة'}
          legend={['بلا أذكار', 'مكتملة']}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <StatsPanel title="أكثر ما رددته" subtitle={range.label} icon={<MessageCircleHeart size={16} />}>
          <DistributionBars
            items={topPhrases.map(([label, value], i) => ({ label, value, color: i === 0 ? CHART.gold : CHART.teal }))}
            formatValue={times}
            emptyLabel="لا تكرارات مسجّلة في هذه الفترة"
          />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.14}>
        <WeekdayPanel values={patternData.weekday} subtitle={`متوسط التكرارات في كل يوم · ${pattern.label}`} formatValue={rounded} />
      </Reveal>

      <Reveal delay={0.16}>
        <TimeOfDayPanel hours={patternData.hours} title="متى تذكر الله" subtitle={`حسب عدد التكرارات · ${pattern.label}`} />
      </Reveal>

      <Reveal delay={0.18}>
        <StatsPanel title="السبحة — الرصيد الكامل" subtitle="تراكمي منذ بدأت" icon={<Hash size={16} />}>
          {lifetime.top.length === 0 || lifetime.total === 0 ? (
            <p className="text-[12px] text-text-muted text-center py-4">افتح السبحة وابدأ التسبيح لتظهر أرقامك هنا.</p>
          ) : (
            <>
              <div className="rounded-[var(--radius-inner)] bg-[image:var(--gradient-gold-soft)] ring-1 ring-gold/25 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-counter font-bold text-gold-dark dark:text-gold-light">{formatNumberAr(lifetime.total)}</span>
                  <span className="text-[11px] text-text-muted">العلامة القادمة {formatNumberAr(lifetime.next)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-track overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[image:var(--gradient-gold)]"
                    style={{ width: `${Math.round((lifetime.total / Math.max(1, lifetime.next)) * 100)}%` }}
                  />
                </div>
              </div>
              <DistributionBars
                items={lifetime.top.map((c, i) => ({ label: c.name, value: c.totalLifetimeCount, color: i === 0 ? CHART.gold : CHART.tealLight }))}
                formatValue={formatNumberAr}
              />
            </>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.2}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'مجموع التكرارات', now: agg.reps, prev: prev.reps, format: formatNumberAr },
            { label: 'أيام مكتملة', now: agg.completed, prev: prev.completed },
            { label: 'أيام أذكار الصباح', now: agg.morning, prev: prev.morning },
            { label: 'أيام أذكار المساء', now: agg.evening, prev: prev.evening },
            { label: 'تسبيح السبحة', now: agg.tasbih, prev: prev.tasbih, format: formatNumberAr },
          ]}
        />
      </Reveal>

      <Reveal delay={0.22}>
        <RecordsPanel records={records} />
      </Reveal>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}
