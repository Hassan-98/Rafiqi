import { useMemo } from 'react';
import { HandCoins, CalendarRange, Target, ScrollText, Coins, Goal } from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth, startOfWeek, subWeeks } from 'date-fns';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { BarChart } from '@/components/stats/BarChart';
import { DonutChart } from '@/components/stats/DonutChart';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { Reveal } from '@/components/stats/Reveal';
import { useStatsRange } from '@/stats/StatsContext';
import { useSadaqahStore, type SadaqahEntry } from '@/store/sadaqahStore';
import { weeks } from '@/services/insightsEngine';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import {
  toArabicDigits,
  periodDelta,
  previousRange,
  formatNumberAr,
  shortDateAr,
  ARABIC_MONTHS,
  CHART,
  type DateRange,
} from '@/services/statsService';

const SLICE_COLORS = [CHART.gold, CHART.teal, CHART.goldDark, CHART.tealLight, CHART.tealDark, CHART.goldLight];
const NO_CAUSE = 'غير محدد';
const fmt = (v: number) => formatNumberAr(v, 2);

/** Consecutive Saturday-start weeks (ending this or last week) with a donation. */
function weekStreak(entries: SadaqahEntry[]): { current: number; longest: number } {
  const wk = (k: string) => format(startOfWeek(parseISO(k), { weekStartsOn: 6 }), 'yyyy-MM-dd');
  const set = new Set(entries.map((e) => wk(e.date)));
  let cursor = startOfWeek(new Date(), { weekStartsOn: 6 });
  if (!set.has(format(cursor, 'yyyy-MM-dd'))) cursor = subWeeks(cursor, 1);
  let current = 0;
  while (set.has(format(cursor, 'yyyy-MM-dd'))) {
    current++;
    cursor = subWeeks(cursor, 1);
  }
  const sorted = [...set].sort();
  let longest = sorted.length ? 1 : 0;
  let run = longest;
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round((parseISO(sorted[i]).getTime() - parseISO(sorted[i - 1]).getTime()) / (7 * 86400000));
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

function aggregate(entries: SadaqahEntry[], currency: string, range: DateRange) {
  const inRange = entries.filter((e) => e.date >= range.startKey && e.date <= range.endKey);
  const cur = inRange.filter((e) => (e.currency || '—') === currency);
  const total = cur.reduce((s, e) => s + e.amount, 0);
  const days = new Set(cur.map((e) => e.date)).size;
  return { inRange, cur, total, count: cur.length, days };
}

export function StatsSadaqahPage() {
  const entries = useSadaqahStore((s) => s.entries);
  const ws = useMemo(() => weekStreak(entries), [entries]);
  return (
    <StatsSubPage
      title="إحصاءات الصدقة"
      subtitle="ما تصدّقت به وأين وضعته"
      today={<SadaqahToday />}
      lead={
        <SectionLead
          domain="sadaqah"
          streak={{ current: ws.current, best: ws.longest, unit: weeks, label: 'الصدقة الأسبوعية' }}
        />
      }
    >
      <SadaqahContent />
      <BadgeCategoryStrip categories={['sadaqah']} />
    </StatsSubPage>
  );
}

function SadaqahToday() {
  const entries = useSadaqahStore((s) => s.entries);
  const goal = useSadaqahStore((s) => s.monthlyGoal);
  const monthPrefix = format(new Date(), 'yyyy-MM');
  const currency = goal?.currency ?? entries[0]?.currency ?? '';
  const month = entries.filter((e) => e.date.startsWith(monthPrefix) && (!goal || e.currency === goal.currency));
  const monthTotal = month.reduce((s, e) => s + e.amount, 0);
  const last = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const pct = goal && goal.amount > 0 ? Math.min(100, Math.round((monthTotal / goal.amount) * 100)) : null;

  return (
    <TodayPanel title="هذا الشهر">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-2xl bg-[image:var(--gradient-gold-soft)] ring-1 ring-gold/30 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
          <HandCoins size={24} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-text-primary dark:text-text-on-dark">
            {month.length > 0 ? `${toArabicDigits(month.length)} صدقات · ${fmt(monthTotal)} ${currency}` : 'لم تُسجَّل صدقة هذا الشهر بعد'}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {last ? `آخر صدقة: ${shortDateAr(last.date)}${last.cause ? ` · ${last.cause}` : ''}` : '«ما نقص مال من صدقة»'}
          </p>
          {pct != null ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-track overflow-hidden">
                <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] font-counter text-text-muted">
                <Goal size={10} className="inline -mt-0.5" /> {toArabicDigits(pct)}٪ من هدفك
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </TodayPanel>
  );
}

function SadaqahContent() {
  const entries = useSadaqahStore((s) => s.entries);
  const { range } = useStatsRange();

  // Dominant currency — amounts in different currencies are never summed.
  const currencyRows = useMemo(() => {
    const by: Record<string, { total: number; count: number }> = {};
    for (const e of entries) {
      const c = e.currency || '—';
      (by[c] ??= { total: 0, count: 0 }).total += e.amount;
      by[c].count += 1;
    }
    return Object.entries(by)
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);
  const cur = currencyRows[0]?.currency ?? '';

  const agg = useMemo(() => aggregate(entries, cur, range), [entries, cur, range]);
  const prev = useMemo(() => aggregate(entries, cur, previousRange(range)), [entries, cur, range]);

  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of agg.cur) m.set(e.date, (m.get(e.date) ?? 0) + e.amount);
    return m;
  }, [agg.cur]);

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const m = startOfMonth(subMonths(new Date(), 5 - i));
      return { key: format(m, 'yyyy-MM'), label: ARABIC_MONTHS[m.getMonth()].slice(0, 3), value: 0, highlight: i === 5 };
    });
    for (const e of entries) {
      if ((e.currency || '—') !== cur) continue;
      const b = buckets.find((x) => x.key === e.date.slice(0, 7));
      if (b) b.value += e.amount;
    }
    return buckets;
  }, [entries, cur]);

  const causes = useMemo(() => {
    const by: Record<string, { total: number; count: number }> = {};
    for (const e of agg.cur) {
      const c = e.cause?.trim() || NO_CAUSE;
      (by[c] ??= { total: 0, count: 0 }).total += e.amount;
      by[c].count += 1;
    }
    return Object.entries(by)
      .map(([cause, v]) => ({ cause, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [agg.cur]);

  const weekday = useMemo(() => {
    const w = new Array<number>(7).fill(0);
    for (const e of entries) w[parseISO(e.date).getDay()]++;
    return w;
  }, [entries]);

  const amounts = entries.filter((e) => (e.currency || '—') === cur).map((e) => e.amount);
  const lifetime = currencyRows[0]?.total ?? 0;
  const largest = amounts.length ? Math.max(...amounts) : 0;
  const ledger = [...agg.inRange].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));

  if (entries.length === 0) {
    return (
      <StatsPanel title="الصدقة" icon={<HandCoins size={16} />}>
        <p className="text-[12px] text-text-muted text-center py-6">لم تُسجَّل أي صدقة بعد — سجّل صدقتك الأولى لتظهر أرقامك هنا.</p>
      </StatsPanel>
    );
  }

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="صدقاتك في هذه الفترة"
          subtitle={currencyRows.length > 1 ? `${range.label} · بعملة ${cur} (لديك عملات أخرى)` : `${range.label} · بعملة ${cur}`}
          icon={<HandCoins size={20} />}
          headline={{ value: fmt(agg.total), label: `${cur} في ${toArabicDigits(agg.count)} صدقة` }}
          delta={periodDelta(agg.total, prev.total)}
          tiles={[
            { value: fmt(lifetime), label: 'منذ البداية' },
            { value: fmt(agg.count ? agg.total / agg.count : 0), label: 'متوسط الصدقة' },
            { value: fmt(largest), label: 'أكبر صدقة' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PeriodTrend
          monthStyle="bars"
          range={range}
          title="الصدقات يوماً بيوم"
          subtitle={`المبلغ بعملة ${cur}`}
          valueFor={(k) => perDay.get(k) ?? 0}
          formatValue={(v) => formatNumberAr(v)}
          color={CHART.gold}
        />
      </Reveal>

      <Reveal delay={0.06}>
        <StatsPanel title="الاتجاه الشهري" subtitle={`آخر ستة أشهر · ${cur}`} icon={<CalendarRange size={16} />}>
          <BarChart data={monthly.map((m) => ({ ...m, color: CHART.gold }))} height={130} formatValue={(v) => formatNumberAr(v)} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="حسب الجهة" subtitle={range.label} icon={<Target size={16} />}>
          {causes.length > 0 ? (
            <DonutChart
              slices={causes.slice(0, 6).map((c, i) => ({ label: c.cause, value: c.total, color: SLICE_COLORS[i % SLICE_COLORS.length] }))}
              size={160}
              thickness={22}
              centerLabel={
                <span className="flex flex-col items-center leading-none">
                  <span className="text-xl font-counter font-bold text-text-primary dark:text-text-on-dark">{toArabicDigits(causes.length)}</span>
                  <span className="text-[10px] text-text-muted mt-1">جهة</span>
                </span>
              }
            />
          ) : (
            <p className="text-[12px] text-text-muted text-center py-4">لا صدقات في {range.label}.</p>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <WeekdayPanel values={weekday} title="أيام عطائك" subtitle="عدد الصدقات في كل يوم منذ البداية" minTotal={3} />
      </Reveal>

      <Reveal delay={0.12}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: `المبلغ (${cur})`, now: agg.total, prev: prev.total, format: fmt },
            { label: 'عدد الصدقات', now: agg.count, prev: prev.count },
            { label: 'أيام العطاء', now: agg.days, prev: prev.days },
          ]}
        />
      </Reveal>

      {currencyRows.length > 1 ? (
        <Reveal delay={0.14}>
          <StatsPanel title="العملات" icon={<Coins size={16} />}>
            <div className="flex flex-wrap gap-2">
              {currencyRows.map((row) => (
                <div key={row.currency} className="rounded-[var(--radius-inner)] bg-cream-dark/45 dark:bg-dark-surface ring-1 ring-gold/15 px-3.5 py-2 flex flex-col items-center min-w-[88px]">
                  <span className="text-[11px] font-bold text-gold-dark dark:text-gold-light">{row.currency}</span>
                  <span className="font-counter text-lg font-bold text-text-primary dark:text-text-on-dark">{fmt(row.total)}</span>
                  <span className="text-[10px] text-text-muted">{toArabicDigits(row.count)} صدقة</span>
                </div>
              ))}
            </div>
          </StatsPanel>
        </Reveal>
      ) : null}

      <Reveal delay={0.16}>
        <StatsPanel title="السجل" subtitle={range.label} icon={<ScrollText size={16} />}>
          {ledger.length > 0 ? (
            <div className="flex flex-col">
              {ledger.map((e, i) => (
                <div
                  key={e.id}
                  className={['flex items-start justify-between gap-3 py-2.5', i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{e.cause?.trim() || NO_CAUSE}</p>
                    <p className="text-[11px] text-text-muted">{shortDateAr(e.date)}</p>
                    {e.notes ? <p className="text-[11px] text-text-secondary dark:text-text-on-dark/80 line-clamp-2">{e.notes}</p> : null}
                  </div>
                  <span className="shrink-0 font-counter text-[15px] font-bold text-gold-dark dark:text-gold-light whitespace-nowrap">
                    {fmt(e.amount)} <span className="text-[10px] font-normal text-text-muted">{e.currency}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-text-muted text-center py-4">لا صدقات مسجّلة في {range.label}.</p>
          )}
        </StatsPanel>
      </Reveal>
    </>
  );
}
