import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity, Sparkles, ChevronLeft, BookOpen, MoonStar, HandCoins, GraduationCap, Trophy, ListChecks,
  Target, Moon, Star, Flame, History, TrendingUp, TrendingDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Sparkline } from '@/components/stats/Sparkline';
import { PeriodSelector } from '@/components/stats/PeriodSelector';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { TimeOfDayPanel } from '@/components/stats/TimeOfDayPanel';
import { InsightList } from '@/components/stats/InsightList';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { Reveal } from '@/components/stats/Reveal';
import { StatsProvider, useStatsRange } from '@/stats/StatsContext';
import { useProgressStore } from '@/store/progressStore';
import { usePrayerLogStore, rawatibRakaatOf, type PrayerDayLog, duhaRakaatOf, type DuhaEntry } from '@/store/prayerLogStore';
import { useQuranStore } from '@/store/quranStore';
import { useQiyamStore, type QiyamNight } from '@/store/qiyamStore';
import { useTargetsStore, type TargetPeriodRecord } from '@/store/targetsStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useActivityLogStore, type ActivityEvent } from '@/store/activityLogStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAsmaProgressStore } from '@/store/asmaProgressStore';
import { useBadgeStore } from '@/store/badgeStore';
import { badgesFor, unlockedCount } from '@/data/badges';
import { useRecords } from '@/services/insightsService';
import {
  toArabicDigits,
  dateKeyOf,
  periodDelta,
  previousRange,
  patternWindow,
  weekdayAverages,
  hourHistogram,
  formatNumberAr,
  computeStreakFromActiveDates,
  CHART,
  type DateRange,
  type Delta,
} from '@/services/statsService';
import type { DailyProgress, PrayerName } from '@/types';

const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function StatsPage() {
  return (
    <StatsProvider>
      <StatsLanding />
    </StatsProvider>
  );
}

interface Sources {
  dp: Record<string, DailyProgress>;
  log: Record<string, PrayerDayLog>;
  duha: Record<string, DuhaEntry>;
  wh: Record<string, { unit: string; amount: number; achieved: number }>;
  nights: Record<string, QiyamNight>;
  history: TargetPeriodRecord[];
  events: ActivityEvent[];
  sadaqah: { date: string }[];
  habitIds: string[];
  /** Men: Friday's sunnah is Jumu'ah's. */
  male: boolean;
}

const fardOf = (s: Sources, k: string) => PRAYERS.reduce((n, p) => n + (s.log[k]?.[p]?.fard ? 1 : 0), 0);
const modDone = (s: Sources, k: string, id: string) => !!s.dp[k]?.modules.find((m) => m.moduleId === id)?.completed;
const modRate = (s: Sources, k: string, id: string) => s.dp[k]?.modules.find((m) => m.moduleId === id)?.completionRate ?? 0;

/** One day's worship score 0..1 — the unit of the «نبض العبادة». */
function dayScore(s: Sources, k: string): number {
  const w = s.wh[k];
  const quran = w && w.amount > 0 ? Math.min(1, w.achieved / w.amount) : modRate(s, k, 'quran');
  const base =
    0.4 * (fardOf(s, k) / 5) +
    0.2 * modRate(s, k, 'dhikr') +
    0.2 * quran +
    0.1 * (s.nights[k] ? 1 : 0) +
    0.1 * (s.history.some((r) => r.completed && dateKeyOf(new Date(r.endedAt)) === k) ? 1 : 0);
  const bonus = (modDone(s, k, 'fasting') ? 0.05 : 0) + (s.sadaqah.some((e) => e.date === k) ? 0.05 : 0);
  return Math.min(1, base + bonus);
}

interface SectionSummary {
  key: string;
  label: string;
  to: string;
  Icon: LucideIcon | typeof Mosque;
  value: string;
  caption: string;
  now: number;
  prev: number;
  spark: number[];
  gold?: boolean;
}

function summarize(s: Sources, range: DateRange, prevRange: DateRange, last14: string[]): SectionSummary[] {
  const n = range.dateKeys.length;
  const sum = (keys: string[], f: (k: string) => number) => keys.reduce((a, k) => a + f(k), 0);
  const count = <T,>(items: T[], keyOf: (t: T) => string | null, w: (t: T) => number = () => 1) => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = keyOf(it);
      if (k) m.set(k, (m.get(k) ?? 0) + w(it));
    }
    return m;
  };
  const repsMap = count(s.events, (e) => (e.domain === 'dhikr' || e.domain === 'tasbih' ? e.dateKey : null), (e) => e.amount);
  const awradMap = count(s.history, (r) => (r.completed ? dateKeyOf(new Date(r.endedAt)) : null));
  const sadaqahMap = count(s.sadaqah, (e) => e.date);
  const reps = (k: string) => repsMap.get(k) ?? 0;
  const awradDone = (k: string) => awradMap.get(k) ?? 0;
  const habitsDone = (k: string) => s.habitIds.filter((id) => modDone(s, k, id)).length;
  const sadaqahN = (k: string) => sadaqahMap.get(k) ?? 0;
  const rows: [string, string, string, LucideIcon | typeof Mosque, (k: string) => number, (v: number) => string, string, boolean?][] = [
    ['prayers', 'الصلاة', '/stats/prayers', Mosque, (k) => fardOf(s, k), (v) => `${toArabicDigits(Math.round((v / Math.max(1, n * 5)) * 100))}٪`, 'من الفروض'],
    ['dhikr', 'الأذكار', '/stats/dhikr', Sparkles, reps, formatNumberAr, 'ذكراً وتسبيحة', true],
    ['quran', 'القرآن', '/stats/quran', BookOpen, (k) => s.wh[k]?.achieved ?? 0, formatNumberAr, 'من الورد'],
    ['awrad', 'الأوراد', '/stats/awrad', Target, awradDone, toArabicDigits, 'فترات مكتملة', true],
    ['qiyam', 'قيام الليل', '/stats/qiyam', MoonStar, (k) => (s.nights[k] ? 1 : 0), toArabicDigits, 'ليالٍ'],
    ['nawafil', 'النوافل', '/stats/nawafil', Star, (k) => rawatibRakaatOf(s.log[k], k, s.male) + duhaRakaatOf(s.duha[k]), formatNumberAr, 'ركعة رواتب وضحى', true],
    ['habits', 'العادات', '/stats/habits', Star, habitsDone, toArabicDigits, 'إنجازات', true],
    ['fasting', 'الصيام', '/stats/fasting', Moon, (k) => (modDone(s, k, 'fasting') ? 1 : 0), toArabicDigits, 'أيام صيام'],
    ['sadaqah', 'الصدقة', '/stats/sadaqah', HandCoins, sadaqahN, toArabicDigits, 'صدقات', true],
  ];
  return rows.map(([key, label, to, Icon, f, fmt, caption, gold]) => {
    const now = sum(range.dateKeys, f);
    return { key, label, to, Icon, value: fmt(now), caption, now, prev: sum(prevRange.dateKeys, f), spark: last14.map(f), gold };
  });
}

function StatsLanding() {
  const navigate = useNavigate();
  const { range, period } = useStatsRange();

  const dp = useProgressStore((s) => s.dailyProgress);
  const computeOverallStreak = useProgressStore((s) => s.computeOverallStreak);
  const log = usePrayerLogStore((s) => s.log);
  const duha = usePrayerLogStore((s) => s.duha);
  const wh = useQuranStore((s) => s.wirdHistory);
  const nights = useQiyamStore((s) => s.nights);
  const history = useTargetsStore((s) => s.history);
  const events = useActivityLogStore((s) => s.events);
  const sadaqah = useSadaqahStore((s) => s.entries);
  const habits = useSettingsStore((s) => s.customHabits);
  const gender = useSettingsStore((s) => s.gender);
  const asmaStudied = useAsmaProgressStore((s) => s.studied);
  const badges = useBadgeStore((s) => s.unlocked);
  const records = useRecords();

  const src = useMemo<Sources>(
    () => ({ dp, log, duha, wh, nights, history, events, sadaqah, habitIds: habits.map((h) => h.id), male: gender === 'male' }),
    [dp, log, duha, wh, nights, history, events, sadaqah, habits, gender],
  );
  const prevRange = useMemo(() => previousRange(range), [range]);
  const pattern = useMemo(() => patternWindow(range), [range]);

  const data = useMemo(() => {
    const score = new Map(range.dateKeys.map((k) => [k, dayScore(src, k)]));
    const prevScores = prevRange.dateKeys.map((k) => dayScore(src, k));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const pulse = Math.round(avg([...score.values()]) * 100);
    const prevPulse = Math.round(avg(prevScores) * 100);
    const active = range.dateKeys.filter((k) => dp[k]?.modules.some((m) => m.completed)).length;
    const best = Math.max(0, ...[...score.values()]);
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return dateKeyOf(d);
    });
    const sections = summarize(src, range, prevRange, last14);
    const activeKeys = Object.values(dp).filter((d) => d.modules.some((m) => m.completed)).map((d) => d.dateKey);
    return { score, pulse, prevPulse, active, best, sections, longest: computeStreakFromActiveDates(activeKeys).longest };
  }, [src, range, prevRange, dp]);

  const patternData = useMemo(() => {
    const keys = new Set(pattern.keys);
    return {
      hours: hourHistogram(events.filter((e) => keys.has(e.dateKey))),
      weekday: weekdayAverages(pattern.keys, (k) => dayScore(src, k) * 100).map((w) => w.avg),
    };
  }, [events, pattern.keys, src]);

  const streak = computeOverallStreak();
  const delta = periodDelta(data.pulse, data.prevPulse);
  const userName = useSettingsStore((s) => s.userName);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <div className="px-4 pb-nav lg:max-w-3xl lg:mx-auto flex flex-col gap-6" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
        <header>
          <p className="text-xs text-text-muted">إحصاءاتي{userName ? ` · ${userName}` : ''}</p>
          <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">الصورة الكاملة</h1>
          <p className="text-[13px] text-text-secondary dark:text-text-on-dark/75 text-pretty">
            عبادتك كلها في مكان واحد، ثم تفاصيل كل قسم على حدة
          </p>
        </header>

        <div className="-mb-3">
          <PeriodSelector sticky={false} />
        </div>

        {/* ── Hero: worship pulse ───────────────────────────────── */}
        <Reveal>
          <Card variant="hero" className="p-5">
            <ArchMotif className="absolute -top-6 -end-8 w-44 opacity-[0.13]" />
            <div className="relative flex items-center gap-4">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Medallion size={104} tone="onAccent">
                  <span className="text-[23px]">{toArabicDigits(data.pulse)}</span>
                </Medallion>
                <span className="text-[10px] text-on-accent/75">من ١٠٠</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-accent/75 inline-flex items-center gap-1">
                  <Activity size={13} className="text-gold-light" /> نبض العبادة
                </p>
                <h2 className="text-xl font-display font-bold">{range.label}</h2>
                <p className="text-[12px] text-on-accent/80 mt-1 text-pretty">
                  مزيج الفروض والأذكار والورد والقيام والأوراد في كل يوم
                </p>
                {!delta.neutral ? <DeltaChip delta={delta} /> : null}
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-3 gap-2">
              {[
                { v: toArabicDigits(streak), l: 'يوماً متتالياً', Icon: Flame },
                { v: `${toArabicDigits(data.active)}/${toArabicDigits(range.dateKeys.length)}`, l: 'أيام عبادة', Icon: Star },
                { v: `${toArabicDigits(Math.round(data.best * 100))}`, l: 'أفضل يوم', Icon: Trophy },
              ].map(({ v, l, Icon }) => (
                <div key={l} className="rounded-2xl bg-on-accent/10 ring-1 ring-on-accent/10 px-2 py-3 text-center">
                  <Icon size={15} className="mx-auto text-gold-light" />
                  <p className="mt-1 text-xl font-counter font-bold tabular-nums">{v}</p>
                  <p className="text-[10px] text-on-accent/75 leading-tight">{l}</p>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* ── Cross-section report ──────────────────────────────── */}
        <Reveal delay={0.04}>
          <section className="flex flex-col gap-3">
            <SectionTitle title="تقرير الأقسام" subtitle={`${range.label} مقارنةً بالمدة نفسها قبلها`} />
            <div className="grid grid-cols-2 gap-2.5">
              {data.sections.map((s, i) => (
                <SectionCard key={s.key} s={s} wide={i === 0 || (i === data.sections.length - 1 && data.sections.length % 2 === 0)} onOpen={() => navigate(s.to)} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <LinkTile Icon={GraduationCap} label="التعلّم" hint={`${toArabicDigits(asmaStudied.length)} اسماً`} onOpen={() => navigate('/stats/learning')} />
              <LinkTile Icon={Trophy} label="الأوسمة" hint={`${toArabicDigits(unlockedCount(badges, gender))}/${toArabicDigits(badgesFor(gender).length)}`} onOpen={() => navigate('/stats/achievements')} gold />
              <LinkTile Icon={History} label="السجل" hint="يوماً بيوم" onOpen={() => navigate('/stats/history')} />
            </div>
          </section>
        </Reveal>

        {/* ── Top insights ──────────────────────────────────────── */}
        <Reveal delay={0.08}>
          <section className="flex flex-col gap-3">
            <SectionTitle title="أبرز ما حقّقته" subtitle="من محرّك الإنجازات، عبر كل الأقسام" />
            <InsightList limit={6} />
          </section>
        </Reveal>

        {/* ── Pulse trend + calendar ───────────────────────────── */}
        <Reveal delay={0.1}>
          <PeriodTrend
            range={range}
            title="نبض العبادة يوماً بيوم"
            subtitle="الدرجة من ١٠٠ لكل يوم"
            valueFor={(k) => Math.round((data.score.get(k) ?? 0) * 100)}
            max={100}
            yearAggregate="avg"
            formatValue={(v) => toArabicDigits(Math.round(v))}
          />
        </Reveal>

        <Reveal delay={0.12}>
          <PeriodCalendar
            period={period}
            cells={range.dateKeys.map((k) => {
              const v = data.score.get(k) ?? 0;
              return { date: k, value: Math.round(v * 100), complete: v >= 0.9, ratio: v };
            })}
            max={100}
            title={period === 'month' ? 'تقويم العبادة' : 'خريطة العبادة'}
          />
        </Reveal>

        <Reveal delay={0.14}>
          <WeekdayPanel
            values={patternData.weekday}
            subtitle={`متوسط النبض في كل يوم · ${pattern.label}`}
            formatValue={(v) => toArabicDigits(Math.round(v))}
          />
        </Reveal>

        <Reveal delay={0.16}>
          <TimeOfDayPanel hours={patternData.hours} title="ساعات عبادتك" subtitle={`كل نشاط مؤقَّت · ${pattern.label}`} />
        </Reveal>

        {/* ── Records wall ─────────────────────────────────────── */}
        <Reveal delay={0.18}>
          <RecordsPanel
            records={records.slice(0, 9)}
            title="جدار الأرقام القياسية"
            subtitle={`أفضل ما بلغته في كل قسم · أطول سلسلة عامة ${toArabicDigits(data.longest)} يوماً`}
            linkable
          />
        </Reveal>

        <Reveal delay={0.2}>
          <StatsPanel bare>
            <HapticPressable
              onClick={() => navigate('/stats/history')}
              className="w-full text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4 flex items-center gap-3"
            >
              <span className="w-11 h-11 rounded-2xl bg-[image:var(--gradient-teal)] text-on-accent inline-flex items-center justify-center shrink-0">
                <ListChecks size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-text-primary dark:text-text-on-dark">السجل التفصيلي الكامل</span>
                <span className="block text-xs text-text-muted">كل عبادة سجّلتها، مجمّعة يوماً بيوم</span>
              </span>
              <ChevronLeft size={18} className="text-text-muted" />
            </HapticPressable>
          </StatsPanel>
        </Reveal>
      </div>
    </div>
  );
}

function DeltaChip({ delta }: { delta: Delta }) {
  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-on-accent/12 px-2 py-0.5 text-[11px] font-semibold">
      {delta.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {toArabicDigits(Math.abs(delta.pct))}٪ عن المدة السابقة
    </span>
  );
}

function SectionCard({ s, wide, onOpen }: { s: SectionSummary; wide?: boolean; onOpen: () => void }) {
  const d = periodDelta(s.now, s.prev);
  const Icon = s.Icon;
  return (
    <HapticPressable
      onClick={onOpen}
      className={[
        'text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-3.5 flex flex-col gap-2 min-w-0 hover:ring-teal/25',
        wide ? 'col-span-2' : '',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <span
          className={[
            'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
            s.gold ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
          ].join(' ')}
        >
          <Icon size={16} />
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{s.label}</span>
        <ChevronLeft size={14} className="text-text-muted shrink-0" />
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="min-w-0">
          <span className={['block font-counter font-bold tabular-nums leading-none', wide ? 'text-3xl' : 'text-2xl', s.gold ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'].join(' ')}>
            {s.value}
          </span>
          <span className="block text-[10.5px] text-text-muted mt-1">{s.caption}</span>
        </span>
        <Sparkline points={s.spark} color={s.gold ? CHART.gold : CHART.teal} width={wide ? 120 : 56} height={wide ? 30 : 22} fill />
      </span>
      {s.now > 0 || s.prev > 0 ? (
        <span
          className={[
            'inline-flex items-center gap-0.5 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            d.neutral || s.now === s.prev
              ? 'bg-track text-text-muted'
              : d.positive
                ? 'bg-teal/10 text-teal dark:text-teal-light'
                : 'bg-danger/10 text-danger',
          ].join(' ')}
        >
          {s.now === s.prev ? 'ثابت' : s.prev === 0 ? 'جديد' : (
            <>
              {d.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {toArabicDigits(Math.abs(d.pct))}٪
            </>
          )}
        </span>
      ) : (
        <span className="text-[10px] text-text-muted">لا نشاط بعد</span>
      )}
    </HapticPressable>
  );
}

function LinkTile({ Icon, label, hint, onOpen, gold }: { Icon: LucideIcon; label: string; hint: string; onOpen: () => void; gold?: boolean }) {
  return (
    <HapticPressable
      onClick={onOpen}
      className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] py-3 flex flex-col items-center gap-1 hover:ring-teal/25"
    >
      <span className={gold ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'}>
        <Icon size={19} />
      </span>
      <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/85">{label}</span>
      <span className="text-[10px] font-counter text-text-muted">{hint}</span>
    </HapticPressable>
  );
}
