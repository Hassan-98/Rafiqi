import { useMemo, useState } from 'react';
import { Target as TargetIcon, Repeat, Flame, Sparkles, Layers } from 'lucide-react';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatTile } from '@/components/stats/StatTile';
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
import {
  useTargetsStore,
  TARGET_UNIT_LABEL,
  TARGET_RECURRENCE_LABEL,
  carriedOf,
  type Target,
  type TargetPeriodRecord,
} from '@/store/targetsStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useRecords } from '@/services/insightsService';
import { days } from '@/services/insightsEngine';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
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

/**
 * إحصائيات الأوراد — what was achieved per wird over the selected period.
 * Sources: `targetsStore.history` (CLOSED periods, bucketed by `endedAt`) +
 * the LIVE period of every active wird (else a daily wird reads ٠ all day),
 * and the timed activity log for WHEN you count.
 */
interface AwradRecord extends TargetPeriodRecord {
  live: boolean;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      <TargetIcon size={22} className="text-text-muted opacity-60" />
      <p className="text-[12px] text-text-muted leading-relaxed max-w-[16rem]">{text}</p>
    </div>
  );
}

function completionDays(history: TargetPeriodRecord[], targets: Target[]): string[] {
  const set = new Set(history.filter((r) => r.completed).map((r) => dateKeyOf(new Date(r.endedAt))));
  if (targets.some((t) => !t.completedAt && t.total > 0 && t.current >= t.total)) set.add(dateKeyOf(new Date()));
  return [...set];
}

export function StatsAwradPage() {
  const targets = useTargetsStore((s) => s.targets);
  const history = useTargetsStore((s) => s.history);
  const streak = useMemo(() => {
    const keys = completionDays(history, targets);
    return { ...computeStreakFromActiveDates(keys), today: keys.includes(dateKeyOf(new Date())) };
  }, [history, targets]);

  return (
    <StatsSubPage
      title="إحصائيات الأوراد"
      subtitle="أهدافك المتكررة وإنجازها"
      today={<AwradToday />}
      lead={
        <SectionLead
          domain="awrad"
          streak={{ current: streak.current, best: streak.longest, unit: days, label: 'إتمام الأوراد', activeToday: streak.today }}
        />
      }
    >
      <AwradStatsContent />
      <BadgeCategoryStrip categories={['awrad']} />
    </StatsSubPage>
  );
}

/** Live snapshot: every active wird with its CURRENT period progress. */
function AwradToday() {
  const targets = useTargetsStore((s) => s.targets);
  const active = targets.filter((t) => !t.completedAt);
  const doneCount = active.filter((t) => t.current >= t.total).length;

  return (
    <TodayPanel
      badge={
        active.length > 0 ? (
          <span className="text-xs font-counter font-bold text-teal dark:text-teal-light">
            {toArabicDigits(doneCount)}/{toArabicDigits(active.length)} مكتمل
          </span>
        ) : null
      }
    >
      {active.length === 0 ? (
        <p className="text-[12px] text-text-muted leading-relaxed">لا أوراد نشطة — أنشئ وِرداً من قسم الأوراد وتابعه هنا.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {active.slice(0, 5).map((t) => {
            const pct = t.total > 0 ? Math.min(100, Math.round((t.current / t.total) * 100)) : 0;
            const extra = t.extra ?? 0;
            return (
              <div key={t.id} className="flex items-center gap-2.5">
                <span className="flex-1 min-w-0 text-xs font-semibold text-text-primary dark:text-text-on-dark truncate">{t.title}</span>
                <div className="w-28 h-2 rounded-full bg-track overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--gradient-gold)' : CHART.teal }}
                  />
                </div>
                <span className="text-[11px] font-counter text-text-muted shrink-0 w-14 text-end">
                  {pct >= 100 && extra > 0 ? `+${toArabicDigits(extra)} نافلة` : `${toArabicDigits(pct)}٪`}
                </span>
              </div>
            );
          })}
          {active.length > 5 ? <p className="text-[10px] text-text-muted">و{toArabicDigits(active.length - 5)} أوراد أخرى</p> : null}
        </div>
      )}
    </TodayPanel>
  );
}

function collect(history: TargetPeriodRecord[], targets: Target[], range: DateRange): AwradRecord[] {
  const keySet = new Set(range.dateKeys);
  const closed: AwradRecord[] = history
    .filter((r) => keySet.has(dateKeyOf(new Date(r.endedAt))))
    .map((r) => ({ ...r, live: false }));
  const live: AwradRecord[] = keySet.has(dateKeyOf(new Date()))
    ? targets
        .filter((t) => !t.completedAt && t.current + (t.extra ?? 0) > 0)
        .map((t) => ({
          targetId: t.id,
          title: t.title,
          unit: t.unit,
          endedAt: Date.now(),
          goal: t.total,
          base: t.baseTotal ?? t.total,
          done: Math.min(t.current, t.total),
          extra: t.extra ?? 0,
          completed: t.current >= t.total,
          live: true,
        }))
    : [];
  return [...closed, ...live];
}

function totals(records: AwradRecord[]) {
  let amount = 0;
  let extra = 0;
  let closed = 0;
  let completed = 0;
  const perDay = new Map<string, number>();
  const completeDays = new Set<string>();
  for (const r of records) {
    amount += r.done + r.extra;
    extra += r.extra;
    const k = dateKeyOf(new Date(r.endedAt));
    perDay.set(k, (perDay.get(k) ?? 0) + r.done + r.extra);
    if (r.completed) completeDays.add(k);
    if (!r.live) {
      closed++;
      if (r.completed) completed++;
    }
  }
  return { amount, extra, closed, completed, perDay, completeDays, rate: closed > 0 ? Math.round((completed / closed) * 100) : 0 };
}

function AwradStatsContent() {
  const { range, period } = useStatsRange();
  const targets = useTargetsStore((s) => s.targets);
  const history = useTargetsStore((s) => s.history);
  const events = useActivityLogStore((s) => s.events);
  const records = useRecords('awrad');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const recs = useMemo(() => collect(history, targets, range), [history, targets, range]);
  const t = useMemo(() => totals(recs), [recs]);
  const p = useMemo(() => totals(collect(history, targets, previousRange(range))), [history, targets, range]);
  const pattern = useMemo(() => patternWindow(range), [range]);

  const activeAwrad = useMemo(() => targets.filter((x) => !x.completedAt), [targets]);
  const bestStreak = activeAwrad.reduce((m, x) => Math.max(m, x.streak ?? 0), 0);
  const carriedNow = activeAwrad.reduce((sum, x) => sum + carriedOf(x), 0);

  const patternData = useMemo(() => {
    const keys = new Set(pattern.keys);
    const evs = events.filter((e) => e.domain === 'awrad' && keys.has(e.dateKey));
    const byDay = new Map<string, number>();
    for (const e of evs) byDay.set(e.dateKey, (byDay.get(e.dateKey) ?? 0) + e.amount);
    return {
      hours: hourHistogram(evs, (e) => e.amount),
      weekday: weekdayAverages(pattern.keys, (k) => byDay.get(k) ?? 0).map((w) => w.avg),
    };
  }, [events, pattern.keys]);

  interface WirdRow {
    targetId: string;
    title: string;
    unit: string;
    amount: number;
    goal: number;
    closed: number;
    completed: number;
    hasLive: boolean;
    target?: Target;
  }
  const perWird = useMemo<WirdRow[]>(() => {
    const map = new Map<string, WirdRow>();
    for (const r of recs) {
      let row = map.get(r.targetId);
      if (!row) {
        row = {
          targetId: r.targetId,
          title: r.title,
          unit: TARGET_UNIT_LABEL[r.unit],
          amount: 0,
          goal: 0,
          closed: 0,
          completed: 0,
          hasLive: false,
          target: targets.find((x) => x.id === r.targetId),
        };
        map.set(r.targetId, row);
      }
      row.amount += r.done + r.extra;
      row.goal += r.goal;
      if (r.live) row.hasLive = true;
      else {
        row.closed += 1;
        if (r.completed) row.completed += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [recs, targets]);

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="أورادك في هذه الفترة"
          subtitle={range.label}
          icon={<TargetIcon size={20} />}
          headline={{ value: formatNumberAr(t.amount), label: 'الكمية المنجزة في أورادك' }}
          delta={periodDelta(t.amount, p.amount)}
          streak={bestStreak}
          streakLabel="أطول وِرد متصل"
          tiles={[
            { value: `${toArabicDigits(t.rate)}٪`, label: 'نسبة الإتمام' },
            { value: toArabicDigits(t.completed), label: 'فترات مكتملة' },
            { value: `+${formatNumberAr(t.extra)}`, label: 'نوافل فوق الوِرد' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodTrend
          monthStyle="bars"
          range={range}
          title="الإنجاز يوماً بيوم"
          subtitle="مجموع ما أنجزته في كل أورادك"
          valueFor={(k) => t.perDay.get(k) ?? 0}
          formatValue={formatNumberAr}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      <Reveal delay={0.06}>
        <div className="grid grid-cols-2 gap-3">
          <StatTile value={toArabicDigits(activeAwrad.length)} label="أوراد نشطة" icon={<Repeat size={14} />} />
          <StatTile value={formatNumberAr(carriedNow)} label="مُرحَّل حالياً" icon={<Layers size={14} />} accent="gold" />
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="كل وِرد خلال المدة" subtitle="الإنجاز، نسبة الإتمام، والسلسلة" icon={<TargetIcon size={16} />}>
          {perWird.length === 0 ? (
            <EmptyHint
              text={
                activeAwrad.length > 0
                  ? 'لم تُسجَّل كميات في هذه الفترة — ابدأ العد في أورادك وستظهر تفاصيلها هنا.'
                  : 'لا أوراد بعد. أنشئ وِرداً متكرراً من قسم الأوراد وتابع التزامك هنا.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3.5">
              {perWird.map((row) => {
                const pct = row.goal > 0 ? Math.min(100, Math.round((row.amount / row.goal) * 100)) : 0;
                const tg = row.target;
                const rate = row.closed > 0 ? Math.round((row.completed / row.closed) * 100) : null;
                const carried = tg ? carriedOf(tg) : 0;
                return (
                  <div key={row.targetId} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 min-w-0 text-[13.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{row.title}</p>
                      {tg?.recurrence && tg.recurrence !== 'none' ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-teal dark:text-teal-light bg-teal/10 dark:bg-teal/20 rounded-full px-1.5 py-0.5">
                          <Repeat size={10} /> {TARGET_RECURRENCE_LABEL[tg.recurrence]}
                        </span>
                      ) : null}
                      {row.hasLive ? (
                        <span className="shrink-0 text-[10px] font-semibold text-gold-dark dark:text-gold-light bg-gold/15 rounded-full px-1.5 py-0.5">
                          جارٍ الآن
                        </span>
                      ) : null}
                    </div>
                    <div className="h-2 rounded-full bg-track overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--gradient-gold)' : CHART.teal }}
                      />
                    </div>
                    <p className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-counter">
                        {formatNumberAr(row.amount)} / {formatNumberAr(row.goal)} {row.unit}
                      </span>
                      {rate != null ? (
                        <span>
                          · أتممت {toArabicDigits(row.completed)} من {toArabicDigits(row.closed)} ({toArabicDigits(rate)}٪)
                        </span>
                      ) : null}
                      {tg && (tg.streak ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-gold-dark dark:text-gold-light font-semibold">
                          <Flame size={10} /> {toArabicDigits(tg.streak ?? 0)}
                        </span>
                      ) : null}
                      {carried > 0 ? <span className="text-warning font-semibold">مُرحَّل +{toArabicDigits(carried)}</span> : null}
                    </p>
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
          cells={range.dateKeys.map((k) => ({ date: k, value: t.perDay.get(k) ?? 0, complete: t.completeDays.has(k) }))}
          onSelectDay={setSelectedDay}
          formatValue={formatNumberAr}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <WeekdayPanel values={patternData.weekday} subtitle={`متوسط الإنجاز في كل يوم · ${pattern.label}`} formatValue={formatNumberAr} />
      </Reveal>

      <Reveal delay={0.14}>
        <TimeOfDayPanel hours={patternData.hours} title="متى تعدّ أورادك" subtitle={`حسب الكمية · ${pattern.label}`} />
      </Reveal>

      <Reveal delay={0.16}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'الكمية المنجزة', now: t.amount, prev: p.amount, format: formatNumberAr },
            { label: 'فترات مكتملة', now: t.completed, prev: p.completed },
            { label: 'نسبة الإتمام', now: t.rate, prev: p.rate, format: (v) => `${toArabicDigits(v)}٪` },
            { label: 'النوافل', now: t.extra, prev: p.extra, format: formatNumberAr },
          ]}
        />
      </Reveal>

      <Reveal delay={0.18}>
        <RecordsPanel records={records} emptyText="تظهر أرقامك القياسية مع استمرار أورادك." />
      </Reveal>

      <p className="text-center text-[11px] text-text-muted inline-flex items-center justify-center gap-1">
        <Sparkles size={11} className="text-gold" /> الأوراد تُحتسب يوم انتهاء فترتها
      </p>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}
