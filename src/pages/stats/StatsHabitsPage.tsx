import { useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { Sparkles, BellRing, Snowflake, CalendarDays, Clock, CheckCircle2, CircleSlash, Flame, ListChecks } from 'lucide-react';
import type { ModuleId, CustomHabit, DailyProgress } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useNotificationStore } from '@/store/notificationStore';
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
  patternWindow,
  weekdayAverages,
  shortDateAr,
  CHART,
  WEEKDAY_SHORT_AR,
  type DateRange,
} from '@/services/statsService';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { WeekMatrix, type MatrixCell } from '@/components/stats/WeekMatrix';
import { useStatsRange } from '@/stats/StatsContext';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatTile } from '@/components/stats/StatTile';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { Reveal } from '@/components/stats/Reveal';

import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
/** The seven first-class modules that own reminder configs. */
const MODULE_ORDER: ModuleId[] = ['prayers', 'dhikr', 'quran', 'qiyam', 'fasting', 'duaa', 'habits'];
const MODULE_LABELS_AR: Record<ModuleId, string> = {
  prayers: 'الصلوات',
  dhikr: 'الأذكار',
  quran: 'الورد القرآني',
  qiyam: 'قيام الليل',
  fasting: 'الصيام',
  duaa: 'الأدعية',
  habits: 'العادات',
};

const habitDone = (dp: Record<string, DailyProgress>, k: string, id: string) =>
  !!dp[k]?.modules.find((m) => m.moduleId === id)?.completed;

function habitKeys(dp: Record<string, DailyProgress>, id: string): string[] {
  return Object.values(dp)
    .filter((d) => d.modules.some((m) => m.moduleId === id && m.completed))
    .map((d) => d.dateKey);
}

export function StatsHabitsPage() {
  const customHabits = useSettingsStore((s) => s.customHabits);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const best = useMemo(() => {
    let out: { name: string; current: number; longest: number; today: boolean } | null = null;
    for (const h of customHabits) {
      const keys = habitKeys(dailyProgress, h.id);
      const s = computeStreakFromActiveDates(keys);
      if (!out || s.current > out.current || (s.current === out.current && s.longest > out.longest)) {
        out = { name: h.nameAr, current: s.current, longest: s.longest, today: keys.includes(dateKeyOf(new Date())) };
      }
    }
    return out;
  }, [customHabits, dailyProgress]);

  return (
    <StatsSubPage
      title="إحصاءات العادات"
      subtitle="عاداتك والتذكيرات ورموز التجميد"
      today={<HabitsToday />}
      lead={
        <SectionLead
          domain="habits"
          streak={
            best
              ? { current: best.current, best: best.longest, unit: days, label: `«${best.name}»`, activeToday: best.today }
              : undefined
          }
        />
      }
    >
      <HabitsContent />
      <BadgeCategoryStrip categories={['habits']} />
    </StatsSubPage>
  );
}

/** Today: every custom habit as a live chip (done / started / not yet). */
function HabitsToday() {
  const customHabits = useSettingsStore((s) => s.customHabits);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const today = dailyProgress[dateKeyOf(new Date())];
  const states = customHabits.map((h) => {
    const mod = today?.modules.find((m) => m.moduleId === h.id);
    return { h, done: !!mod?.completed, rate: mod?.completionRate ?? 0 };
  });
  const doneCount = states.filter((s) => s.done).length;

  return (
    <TodayPanel
      badge={
        customHabits.length > 0 ? (
          <span className="text-xs font-counter font-bold text-teal dark:text-teal-light">
            {toArabicDigits(doneCount)}/{toArabicDigits(customHabits.length)} عادة
          </span>
        ) : null
      }
    >
      {customHabits.length === 0 ? (
        <p className="text-[12px] text-text-muted leading-relaxed">لا عادات مخصّصة بعد — أضف عاداتك وتابعها هنا.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {states.map(({ h, done, rate }) => (
            <span
              key={h.id}
              className={[
                'inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold ring-1',
                done
                  ? 'bg-[image:var(--gradient-teal)] text-on-accent ring-transparent'
                  : rate > 0
                    ? 'bg-teal/12 text-teal dark:text-teal-light ring-teal/15'
                    : 'bg-white/70 dark:bg-dark-surface text-text-muted ring-black/[0.04] dark:ring-white/[0.06]',
              ].join(' ')}
            >
              <span aria-hidden>{h.icon}</span>
              {h.nameAr}
              {done ? ' ✓' : rate > 0 ? ` ${toArabicDigits(Math.round(rate * 100))}٪` : ''}
            </span>
          ))}
        </div>
      )}
    </TodayPanel>
  );
}

function aggregate(habits: CustomHabit[], dp: Record<string, DailyProgress>, range: DateRange) {
  let done = 0;
  let perfect = 0;
  const perHabit = new Map<string, number>();
  for (const k of range.dateKeys) {
    let n = 0;
    for (const h of habits) {
      if (habitDone(dp, k, h.id)) {
        n++;
        perHabit.set(h.id, (perHabit.get(h.id) ?? 0) + 1);
      }
    }
    done += n;
    if (habits.length > 0 && n === habits.length) perfect++;
  }
  const possible = habits.length * range.dateKeys.length;
  return { done, perfect, perHabit, pct: possible > 0 ? Math.round((done / possible) * 100) : 0 };
}

function HabitsContent() {
  const { range, period } = useStatsRange();
  const customHabits = useSettingsStore((s) => s.customHabits);
  const notifConfigs = useNotificationStore((s) => s.configs);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const freezeTokens = useProgressStore((s) => s.freezeTokens);
  const freezesUsed = useProgressStore((s) => s.freezesUsed);
  const records = useRecords('habits');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(customHabits, dailyProgress, range), [customHabits, dailyProgress, range]);
  const prev = useMemo(
    () => aggregate(customHabits, dailyProgress, previousRange(range)),
    [customHabits, dailyProgress, range],
  );
  const pattern = useMemo(() => patternWindow(range), [range]);
  const countOn = (k: string) => customHabits.filter((h) => habitDone(dailyProgress, k, h.id)).length;

  const perHabit = useMemo(
    () =>
      customHabits
        .map((h) => {
          const s = computeStreakFromActiveDates(habitKeys(dailyProgress, h.id));
          return { h, n: agg.perHabit.get(h.id) ?? 0, current: s.current, longest: s.longest };
        })
        .sort((a, b) => b.n - a.n),
    [customHabits, dailyProgress, agg.perHabit],
  );

  const weekMatrix = useMemo(() => {
    if (customHabits.length === 0) return null;
    const ds = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const todayKey = dateKeyOf(new Date());
    return {
      columns: ds.map((d) => WEEKDAY_SHORT_AR[d.getDay()]),
      rows: customHabits.slice(0, 8).map((h) => ({
        label: `${h.icon} ${h.nameAr}`,
        cells: ds.map<MatrixCell>((d) => {
          const k = dateKeyOf(d);
          const mod = dailyProgress[k]?.modules.find((m) => m.moduleId === h.id);
          if (mod?.completed) return 'done';
          if ((mod?.completionRate ?? 0) > 0) return 'partial';
          return k === todayKey ? 'future' : 'miss';
        }),
      })),
    };
  }, [customHabits, dailyProgress]);

  const notif = useMemo(() => {
    const rows = MODULE_ORDER.map((id) => {
      const cfg = notifConfigs[id];
      return { id, label: MODULE_LABELS_AR[id], enabled: cfg?.enabled ?? false, time: cfg?.time ?? '—' };
    });
    return { rows, enabled: rows.filter((r) => r.enabled).length };
  }, [notifConfigs]);

  const freeze = useMemo(() => {
    const all = Object.entries(freezesUsed)
      .filter(([, mods]) => mods.length > 0)
      .sort((a, b) => b[0].localeCompare(a[0]));
    const inRange = all.filter(([k]) => range.dateKeys.includes(k)).reduce((s, [, m]) => s + m.length, 0);
    return { lifetime: all.reduce((s, [, m]) => s + m.length, 0), inRange, last: all[0]?.[0] ?? null };
  }, [freezesUsed, range.dateKeys]);

  if (customHabits.length === 0) {
    return (
      <StatsPanel title="العادات" icon={<ListChecks size={16} />}>
        <p className="text-[12px] text-text-muted text-center py-6">لم تُنشئ أي عادة بعد. أضِف عاداتك لتتبّع التزامك بها هنا.</p>
      </StatsPanel>
    );
  }

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="التزامك بعاداتك"
          subtitle={range.label}
          icon={<Sparkles size={20} />}
          headline={{ value: `${toArabicDigits(agg.pct)}٪`, label: `${toArabicDigits(agg.done)} إنجازاً من ${toArabicDigits(customHabits.length * range.dateKeys.length)}` }}
          delta={periodDelta(agg.pct, prev.pct)}
          streak={perHabit[0] ? Math.max(...perHabit.map((x) => x.current)) : 0}
          streakLabel="أطول سلسلة جارية"
          tiles={[
            { value: toArabicDigits(agg.perfect), label: 'أيام أتممت كلها' },
            { value: toArabicDigits(customHabits.length), label: 'عادات تتابعها' },
            { value: toArabicDigits(freezeTokens), label: 'رموز تجميد' },
          ]}
        />
      </Reveal>

      {weekMatrix ? (
        <Reveal delay={0.04}>
          <StatsPanel title="آخر ٧ أيام — كل عادة بيوم" icon={<CalendarDays size={16} />}>
            <WeekMatrix columns={weekMatrix.columns} rows={weekMatrix.rows} highlightCol={6} />
          </StatsPanel>
        </Reveal>
      ) : null}

      <Reveal delay={0.06}>
        <PeriodTrend
          range={range}
          title="العادات يوماً بيوم"
          subtitle="عدد العادات المنجزة في كل يوم"
          valueFor={countOn}
          max={period === 'year' ? undefined : customHabits.length}
          yearAggregate="avg"
          formatValue={(v) => formatNumberAr(v, 1)}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      <Reveal delay={0.08}>
        <StatsPanel title="كل عادة على حدة" subtitle={`أيام الإنجاز في ${range.label}`} icon={<ListChecks size={16} />}>
          <div className="flex flex-col gap-3">
            {perHabit.map(({ h, n, current, longest }) => {
              const pct = range.dateKeys.length ? Math.round((n / range.dateKeys.length) * 100) : 0;
              return (
                <div key={h.id} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-teal/10 dark:bg-teal/15 inline-flex items-center justify-center shrink-0 text-lg" aria-hidden>
                    {h.icon}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{h.nameAr}</span>
                      <span className="text-[12px] font-counter font-bold text-teal dark:text-teal-light">{toArabicDigits(pct)}٪</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-track overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? CHART.gold : CHART.teal }} />
                    </div>
                    <span className="text-[11px] text-text-muted inline-flex items-center gap-1">
                      {toArabicDigits(n)} من {toArabicDigits(range.dateKeys.length)} أيام
                      {current > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-gold-dark dark:text-gold-light font-semibold">
                          · <Flame size={10} /> {toArabicDigits(current)}
                        </span>
                      ) : null}
                      {longest > 1 ? ` · الأطول ${days(longest)}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => {
            const c = countOn(k);
            return { date: k, value: c, complete: c === customHabits.length, ratio: c / customHabits.length };
          })}
          max={customHabits.length}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      <Reveal delay={0.12}>
        <WeekdayPanel
          values={weekdayAverages(pattern.keys, countOn).map((w) => w.avg)}
          subtitle={`متوسط العادات المنجزة · ${pattern.label}`}
          formatValue={(v) => formatNumberAr(v, 1)}
        />
      </Reveal>

      <Reveal delay={0.14}>
        <ComparePanel
          nowLabel="الفترة الحالية"
          rows={[
            { label: 'إنجازات العادات', now: agg.done, prev: prev.done },
            { label: 'أيام أتممت كلها', now: agg.perfect, prev: prev.perfect },
            { label: 'نسبة الالتزام', now: agg.pct, prev: prev.pct, format: (v) => `${toArabicDigits(v)}٪` },
          ]}
        />
      </Reveal>

      {records.length > 0 ? (
        <Reveal delay={0.16}>
          <RecordsPanel records={records} />
        </Reveal>
      ) : null}

      <Reveal delay={0.18}>
        <StatsPanel title="التذكيرات" subtitle={`${toArabicDigits(notif.enabled)} من ${toArabicDigits(notif.rows.length)} مُفعّلة`} icon={<BellRing size={16} />}>
          <div className="flex flex-col">
            {notif.rows.map((row, i) => (
              <div
                key={row.id}
                className={[
                  'flex items-center justify-between gap-2 px-1 py-2.5',
                  i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {row.enabled ? (
                    <CheckCircle2 size={16} className="text-teal dark:text-teal-light shrink-0" />
                  ) : (
                    <CircleSlash size={16} className="text-text-muted shrink-0" />
                  )}
                  <span className="text-[13px] text-text-primary dark:text-text-on-dark truncate">{row.label}</span>
                </div>
                {row.enabled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-counter text-text-secondary dark:text-text-on-dark/80">
                    <Clock size={11} className="text-text-muted" />
                    {toArabicDigits(row.time)}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-text-muted">مُعطّل</span>
                )}
              </div>
            ))}
          </div>
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.2}>
        <StatsPanel title="رموز التجميد" subtitle="تحفظ سلسلتك عند تفويت يوم (الحدّ ٣ رموز)" icon={<Snowflake size={16} />}>
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={toArabicDigits(freezeTokens)} label="متاحة" icon={<Snowflake size={14} />} />
            <StatTile value={toArabicDigits(freeze.inRange)} label="في الفترة" accent="gold" />
            <StatTile value={toArabicDigits(freeze.lifetime)} label="منذ البداية" accent="gold" />
          </div>
          <p className="text-[11px] text-text-muted">
            {freeze.last ? `آخر استخدام: ${shortDateAr(freeze.last)}` : 'لم تستخدم أي رمز تجميد بعد.'}
          </p>
        </StatsPanel>
      </Reveal>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}
