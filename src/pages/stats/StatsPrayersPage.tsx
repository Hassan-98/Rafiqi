import { useMemo, useState } from 'react';
import { CalendarHeart, Star, CalendarDays, Clock3, History, ThumbsUp, AlertTriangle, Landmark, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { PrayerName } from '@/types';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { TodayPanel } from '@/components/stats/TodayPanel';
import { WeekMatrix, type MatrixCell } from '@/components/stats/WeekMatrix';
import { SectionLead } from '@/components/stats/SectionLead';
import { PeriodTrend } from '@/components/stats/PeriodTrend';
import { PeriodCalendar } from '@/components/stats/PeriodCalendar';
import { WeekdayPanel } from '@/components/stats/WeekdayPanel';
import { TimeOfDayPanel } from '@/components/stats/TimeOfDayPanel';
import { ComparePanel } from '@/components/stats/ComparePanel';
import { RecordsPanel } from '@/components/stats/RecordsPanel';
import { EachPrayerStreaks } from '@/components/stats/EachPrayerStreaks';
import { DayDetailSheet } from '@/components/stats/DayDetailSheet';
import { Reveal } from '@/components/stats/Reveal';
import { useStatsRange } from '@/stats/StatsContext';
import { usePrayerTimes, formatPrayerTime } from '@/hooks/usePrayerTimes';
import { usePrayerLogStore, prayerStreak, type PrayerDayLog, type DuhaEntry } from '@/store/prayerLogStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useRecords } from '@/services/insightsService';
import { days } from '@/services/insightsEngine';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import {
  toArabicDigits,
  dateKeyOf,
  weekdayAverages,
  previousRange,
  stepRange,
  hourHistogram,
  formatNumberAr,
  WEEKDAY_SHORT_AR,
  WEEKDAY_LABELS_AR,
  CHART,
  patternWindow,
  type DateRange,
} from '@/services/statsService';

const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

const fardDone = (day: PrayerDayLog | undefined, p: PrayerName): boolean => !!day?.[p]?.fard;
const fardCount = (day: PrayerDayLog | undefined) => PRAYERS.filter((p) => fardDone(day, p)).length;
const sunnahCount = (day: PrayerDayLog | undefined) =>
  PRAYERS.reduce((n, p) => {
    const e = day?.[p];
    return n + (e?.sunnahBefore ? 1 : 0) + (e?.sunnahAfter ? 1 : 0);
  }, 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** The first day anything prayer-related was recorded — earlier days are «before
 *  the app», not misses. */
function useSince(): string {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  return useMemo(() => {
    const keys = [
      ...Object.keys(log).filter((k) => fardCount(log[k]) > 0 || sunnahCount(log[k]) > 0),
      ...Object.keys(excused),
      ...Object.keys(duha),
    ];
    return keys.length ? keys.sort()[0] : dateKeyOf(new Date());
  }, [log, excused, duha]);
}

/**
 * إحصاءات الصلاة. The section's NATURE: five fixed slots a day, so the visuals
 * are slot-shaped — today's five chips, a 5×7 week matrix, per-prayer
 * commitment with its change, the period's strengths and gaps, the history of
 * past periods, sunnah by type, the mosque (men) and WHEN prayers get logged.
 * Days before the first record and excused days (women) are left out of every rate.
 */
export function StatsPrayersPage() {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const streak = useMemo(() => {
    const s = prayerStreak(log, excused);
    return { ...s, today: fardCount(log[dateKeyOf(new Date())]) === 5 };
  }, [log, excused]);

  return (
    <StatsSubPage
      title="إحصاءات الصلاة"
      subtitle="الفروض والسنن يوماً بيوم"
      today={<PrayersToday />}
      lead={
        <SectionLead
          domain="prayers"
          streak={{
            current: streak.current,
            best: streak.longest,
            unit: days,
            label: 'الصلوات الخمس',
            activeToday: streak.today,
          }}
        />
      }
    >
      <PrayersContent streakNow={streak.current} />
      <BadgeCategoryStrip categories={['prayer', 'mosque']} />
    </StatsSubPage>
  );
}

function PrayersToday() {
  const log = usePrayerLogStore((s) => s.log);
  const duhaToday = usePrayerLogStore((s) => !!s.duha[dateKeyOf(new Date())]);
  const { times } = usePrayerTimes();
  const today = log[dateKeyOf(new Date())];
  const now = Date.now();
  const done = fardCount(today);
  const sunnah = sunnahCount(today) + (duhaToday ? 1 : 0);

  return (
    <TodayPanel
      badge={
        <span className="text-xs font-counter font-bold text-teal dark:text-teal-light">{toArabicDigits(done)}/٥ فروض</span>
      }
    >
      <div className="grid grid-cols-5 gap-1.5">
        {PRAYERS.map((p) => {
          const ok = fardDone(today, p);
          const t = times?.[p];
          const passed = t ? t.getTime() < now : false;
          const state = ok ? 'done' : passed ? 'missed' : 'upcoming';
          return (
            <div
              key={p}
              className={[
                'flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-0.5 ring-1',
                state === 'done'
                  ? 'bg-[image:var(--gradient-teal)] text-on-accent ring-transparent shadow-[var(--shadow-xs)]'
                  : state === 'missed'
                    ? 'bg-danger/10 dark:bg-danger/20 text-danger ring-danger/15'
                    : 'bg-white/70 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/75 ring-black/[0.04] dark:ring-white/[0.06]',
              ].join(' ')}
            >
              <span className="text-[11px] font-bold">{PRAYER_AR[p]}</span>
              <span className="text-[9px] font-counter opacity-90 whitespace-nowrap">
                {state === 'done' ? 'تمّت' : state === 'missed' ? 'لم تُسجَّل' : toArabicDigits(formatPrayerTime(t ?? undefined))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-track overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${done * 20}%` }} />
      </div>
      {sunnah > 0 ? (
        <p className="text-[11px] text-gold-dark dark:text-gold-light font-semibold mt-2 inline-flex items-center gap-1">
          <Star size={11} /> {toArabicDigits(sunnah)} من السنن والنوافل اليوم
        </p>
      ) : null}
    </TodayPanel>
  );
}

interface Agg {
  /** Days that count: on/after the first record, not excused. */
  n: number;
  excusedDays: number;
  perPrayer: Record<PrayerName, number>;
  mosque: Record<PrayerName, number>;
  mosqueTotal: number;
  sunnah: { before: number; after: number };
  /** Days صلاة الضحى was prayed (today included once done). */
  duha: number;
  /** Sunnah rakaat + الضحى. */
  sunnahTotal: number;
  perfect: number;
  /** Counted days with no fard at all. */
  empty: number;
  fard: number;
  logged: number;
  pct: number;
}

/** Days that count toward rates: on/after the first record, not excused, and
 *  not today while it is still running (unprayed later prayers aren't misses). */
const counts = (log: Record<string, PrayerDayLog>, excused: Record<string, true>, since: string, key: string) =>
  key >= since && !excused[key] && !(key === dateKeyOf(new Date()) && fardCount(log[key]) < 5);

function aggregate(
  log: Record<string, PrayerDayLog>,
  excused: Record<string, true>,
  duhaDays: Record<string, DuhaEntry>,
  since: string,
  keys: string[],
): Agg {
  const perPrayer: Record<PrayerName, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const mosque: Record<PrayerName, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const sunnah = { before: 0, after: 0 };
  let duha = 0;
  let n = 0;
  let excusedDays = 0;
  let perfect = 0;
  let empty = 0;
  let fard = 0;
  let logged = 0;
  for (const key of keys) {
    if (key >= since && excused[key]) excusedDays++;
    if (key >= since && !excused[key] && duhaDays[key]) duha++;
    if (!counts(log, excused, since, key)) continue;
    n++;
    const day = log[key];
    const c = fardCount(day);
    fard += c;
    if (c > 0) logged++;
    else empty++;
    if (c === 5) perfect++;
    for (const p of PRAYERS) {
      if (fardDone(day, p)) perPrayer[p]++;
      if (day?.[p]?.mosque) mosque[p]++;
      if (day?.[p]?.sunnahBefore) sunnah.before++;
      if (day?.[p]?.sunnahAfter) sunnah.after++;
    }
  }
  return {
    n,
    excusedDays,
    perPrayer,
    mosque,
    mosqueTotal: PRAYERS.reduce((s, p) => s + mosque[p], 0),
    sunnah,
    duha,
    sunnahTotal: sunnah.before + sunnah.after + duha,
    perfect,
    empty,
    fard,
    logged,
    pct: pct(fard, n * 5),
  };
}

/** «+١٢ نقطة» / «−٥ نقاط» chip — percentage-point change, coloured by direction. */
function PointsChip({ d, inverse = false }: { d: number | null; inverse?: boolean }) {
  if (d === null) return <span className="text-[10px] text-text-muted">—</span>;
  const good = inverse ? d < 0 : d > 0;
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-12 justify-center font-counter',
        d === 0 ? 'bg-track text-text-muted' : good ? 'bg-teal/10 text-teal dark:text-teal-light' : 'bg-danger/10 text-danger',
      ].join(' ')}
    >
      {d === 0 ? <Minus size={10} /> : d > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {d === 0 ? 'ثابت' : `${d > 0 ? '+' : '−'}${toArabicDigits(Math.abs(d))}`}
    </span>
  );
}

function PrayersContent({ streakNow }: { streakNow: number }) {
  const { range, period } = useStatsRange();
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duhaDays = usePrayerLogStore((s) => s.duha);
  const gender = useSettingsStore((s) => s.gender);
  const events = useActivityLogStore((s) => s.events);
  const records = useRecords('prayers');
  const since = useSince();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const agg = useMemo(() => aggregate(log, excused, duhaDays, since, range.dateKeys), [log, excused, duhaDays, since, range]);
  const prevRange = useMemo(() => previousRange(range), [range]);
  const prev = useMemo(() => aggregate(log, excused, duhaDays, since, prevRange.dateKeys), [log, excused, duhaDays, since, prevRange]);
  const hasPrev = prev.n > 0;

  // Past periods of the same kind (a day view looks back over days).
  const history = useMemo(() => {
    const rows: { label: string; agg: Agg }[] = [];
    let r: DateRange = range;
    for (let i = 0; i < (period === 'year' ? 4 : period === 'day' ? 7 : 6); i++) {
      const a = aggregate(log, excused, duhaDays, since, r.dateKeys);
      if (a.n === 0 && i > 0) break;
      rows.push({ label: i === 0 ? `${r.label} (الحالية)` : r.label, agg: a });
      r = stepRange(r, -1);
    }
    return rows;
  }, [log, excused, duhaDays, since, range, period]);

  // Last-7-days matrix (fixed short-term view, independent of the period).
  const week = useMemo(() => {
    const ds: { key: string; date: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      ds.push({ key: dateKeyOf(d), date: d });
    }
    const todayKey = dateKeyOf(new Date());
    return {
      columns: ds.map((d) => WEEKDAY_SHORT_AR[d.date.getDay()]),
      rows: PRAYERS.map((p) => ({
        label: PRAYER_AR[p],
        cells: ds.map<MatrixCell>((d) =>
          fardDone(log[d.key], p) ? 'done' : d.key === todayKey || excused[d.key] || d.key < since ? 'future' : 'miss',
        ),
      })),
    };
  }, [log, excused, since]);

  const pattern = useMemo(() => patternWindow(range), [range]);
  const patternKeys = useMemo(() => pattern.keys.filter((k) => counts(log, excused, since, k)), [pattern.keys, log, excused, since]);
  // WHEN prayers get logged (activity log, pattern window).
  const timing = useMemo(() => {
    const keys = new Set(pattern.keys);
    const evs = events.filter((e) => e.domain === 'prayer' && keys.has(e.dateKey));
    const avg: Partial<Record<PrayerName, { mins: number; n: number }>> = {};
    for (const e of evs) {
      const p = e.refId as PrayerName;
      if (!PRAYER_AR[p]) continue;
      const d = new Date(e.ts);
      const a = (avg[p] ??= { mins: 0, n: 0 });
      a.mins += d.getHours() * 60 + d.getMinutes();
      a.n += 1;
    }
    return { hours: hourHistogram(evs), avg };
  }, [events, pattern.keys]);

  const n = agg.n;
  const prayerPct = (a: Agg, p: PrayerName) => pct(a.perPrayer[p], a.n);
  const ranked = [...PRAYERS].sort((a, b) => agg.perPrayer[b] - agg.perPrayer[a]);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const mostMissed = [...PRAYERS].sort((a, b) => agg.perPrayer[a] - agg.perPrayer[b])[0];
  const missed = Math.max(0, n * 5 - agg.fard);
  const weekday = weekdayAverages(patternKeys, (k) => fardCount(log[k]));
  const withDays = weekday.filter((w) => w.count > 0);
  const bestDay = withDays.length ? withDays.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
  const worstDay = withDays.length ? withDays.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
  const male = gender === 'male';
  const clock = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${toArabicDigits(h % 12 || 12)}:${toArabicDigits(String(m).padStart(2, '0'))} ${h < 12 ? 'ص' : 'م'}`;
  };

  // The period's strengths and gaps, in numbers.
  const good: string[] = [];
  const bad: string[] = [];
  if (n > 0 && agg.logged > 0) {
    if (hasPrev && agg.pct > prev.pct) good.push(`ارتفع التزامك ${toArabicDigits(agg.pct - prev.pct)} نقطة عن الفترة السابقة (${toArabicDigits(prev.pct)}٪ ← ${toArabicDigits(agg.pct)}٪)`);
    if (prayerPct(agg, strongest) >= 60) good.push(`أقوى صلواتك: ${PRAYER_AR[strongest]} بنسبة ${toArabicDigits(prayerPct(agg, strongest))}٪`);
    if (agg.perfect > 0) good.push(`${toArabicDigits(agg.perfect)} من ${toArabicDigits(n)} ${n === 1 ? 'يوم' : 'أيام'} أتممت فيها الفروض الخمسة (${toArabicDigits(pct(agg.perfect, n))}٪)`);
    if (streakNow >= 2) good.push(`سلسلتك الحالية ${days(streakNow)} متتالية بالفروض كاملة`);
    if (hasPrev && agg.sunnahTotal > prev.sunnahTotal) good.push(`صلّيت ${toArabicDigits(agg.sunnahTotal)} سنة ونافلة، بزيادة ${toArabicDigits(agg.sunnahTotal - prev.sunnahTotal)}`);
    if (male && agg.mosqueTotal > 0) good.push(`${toArabicDigits(agg.mosqueTotal)} فرضاً في المسجد (${toArabicDigits(pct(agg.mosqueTotal, agg.fard))}٪ من صلواتك)`);
    if (bestDay && bestDay.avg > 0) good.push(`أفضل أيامك: ${WEEKDAY_LABELS_AR[bestDay.index]} بمتوسط ${formatNumberAr(bestDay.avg, 1)} من ٥`);

    if (missed > 0) bad.push(`لم تُسجَّل ${toArabicDigits(missed)} ${missed <= 10 ? 'فروض' : 'فرضاً'} من ${toArabicDigits(n * 5)} في هذه الفترة`);
    if (agg.perPrayer[mostMissed] < n) bad.push(`أكثر ما فاتك: ${PRAYER_AR[mostMissed]} — ${toArabicDigits(n - agg.perPrayer[mostMissed])} ${n - agg.perPrayer[mostMissed] <= 10 ? 'مرات' : 'مرة'}`);
    if (hasPrev && agg.pct < prev.pct) bad.push(`انخفض التزامك ${toArabicDigits(prev.pct - agg.pct)} نقطة عن الفترة السابقة (${toArabicDigits(prev.pct)}٪ ← ${toArabicDigits(agg.pct)}٪)`);
    if (agg.empty > 0) bad.push(`${toArabicDigits(agg.empty)} ${agg.empty === 1 ? 'يوم' : 'أيام'} بلا أي فرض مسجّل`);
    if (hasPrev) {
      const drop = PRAYERS.map((p) => ({ p, d: prayerPct(agg, p) - prayerPct(prev, p) })).sort((a, b) => a.d - b.d)[0];
      if (drop.d <= -10) bad.push(`تراجعت صلاة ${PRAYER_AR[drop.p]} ${toArabicDigits(-drop.d)} نقطة عن الفترة السابقة`);
    }
    if (worstDay && bestDay && worstDay.index !== bestDay.index && worstDay.avg < 4.5)
      bad.push(`أضعف أيامك: ${WEEKDAY_LABELS_AR[worstDay.index]} بمتوسط ${formatNumberAr(worstDay.avg, 1)} من ٥`);
  }

  return (
    <>
      <Reveal>
        <StatsHeroCard
          title="التزامك بالفروض"
          subtitle={range.label}
          icon={<CalendarHeart size={20} />}
          headline={{ value: `${toArabicDigits(agg.pct)}٪`, label: `${formatNumberAr(agg.fard)} فرضاً من ${formatNumberAr(n * 5)}` }}
          delta={hasPrev ? { pct: agg.pct - prev.pct, positive: agg.pct >= prev.pct, neutral: false } : null}
          streak={streakNow}
          streakLabel="أيام كاملة متتالية"
          tiles={[
            { value: toArabicDigits(agg.perfect), label: 'أيام مكتملة' },
            { value: toArabicDigits(missed), label: 'فروض لم تُسجَّل' },
            male
              ? { value: `${toArabicDigits(pct(agg.mosqueTotal, agg.fard))}٪`, label: 'في المسجد' }
              : gender === 'female'
                ? { value: toArabicDigits(agg.excusedDays), label: 'أيام العذر' }
                : { value: toArabicDigits(agg.sunnahTotal), label: 'سنن ونوافل' },
          ]}
        />
      </Reveal>

      {good.length || bad.length ? (
        <Reveal delay={0.02}>
          <StatsPanel title="حصاد الفترة" subtitle="ما أحسنت فيه وما يحتاج انتباهك، بالأرقام" icon={<ThumbsUp size={16} />}>
            <div className="flex flex-col gap-3">
              {good.length ? (
                <ul className="flex flex-col gap-1.5">
                  {good.map((g) => (
                    <li key={g} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-primary dark:text-text-on-dark">
                      <TrendingUp size={14} className="text-teal dark:text-teal-light shrink-0 mt-1" />
                      <span className="text-pretty">{g}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {bad.length ? (
                <ul className="flex flex-col gap-1.5 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
                  {bad.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-primary dark:text-text-on-dark">
                      <AlertTriangle size={14} className="text-danger shrink-0 mt-1" />
                      <span className="text-pretty">{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </StatsPanel>
        </Reveal>
      ) : null}

      <Reveal delay={0.04}>
        <StatsPanel title="آخر ٧ أيام — كل صلاة بيوم" icon={<CalendarDays size={16} />}>
          <WeekMatrix columns={week.columns} rows={week.rows} highlightCol={6} />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.06}>
        <StatsPanel
          title="الالتزام بكل صلاة"
          subtitle={hasPrev ? 'نسبة الأيام التي صلّيتها، والتغيّر بالنقاط عن الفترة السابقة' : 'نسبة الأيام التي صلّيتها'}
          icon={<CalendarHeart size={16} />}
        >
          {agg.logged > 0 ? (
            <div className="flex flex-col gap-3">
              {PRAYERS.map((p) => {
                const v = prayerPct(agg, p);
                return (
                  <div key={p} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[12px] font-semibold text-text-secondary dark:text-text-on-dark/85">{PRAYER_AR[p]}</span>
                      <span className="flex-1 h-2.5 rounded-full bg-track overflow-hidden" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? CHART.teal : CHART.gold }} />
                      </span>
                      <span className="w-10 text-end text-[12px] font-counter font-bold text-text-primary dark:text-text-on-dark tabular-nums">{toArabicDigits(v)}٪</span>
                      {hasPrev ? <PointsChip d={v - prayerPct(prev, p)} /> : null}
                    </div>
                    <span className="ps-16 text-[10.5px] text-text-muted">
                      {toArabicDigits(agg.perPrayer[p])} من {toArabicDigits(n)}
                      {n - agg.perPrayer[p] > 0 ? ` · فاتت ${toArabicDigits(n - agg.perPrayer[p])}` : ' · لم تفُتك'}
                      {male && agg.mosque[p] > 0 ? ` · في المسجد ${toArabicDigits(agg.mosque[p])}` : ''}
                    </span>
                  </div>
                );
              })}
              {n >= 7 && prayerPct(agg, weakest) < 80 ? (
                <p className="text-[11px] text-text-muted">صلاة {PRAYER_AR[weakest]} الأقل تسجيلاً في هذه الفترة — اجعلها محور تركيزك.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-text-muted text-center py-4">
              لا صلوات مسجَّلة في هذه الفترة — علّم صلواتك من قسم الصلاة لتظهر هنا.
            </p>
          )}
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.07}>
        <EachPrayerStreaks />
      </Reveal>

      {history.length > 1 ? (
        <Reveal delay={0.08}>
          <StatsPanel
            title={period === 'day' ? 'الأيام السابقة' : period === 'week' ? 'الأسابيع السابقة' : period === 'month' ? 'الأشهر السابقة' : 'السنوات السابقة'}
            subtitle="نسبة الفروض في كل فترة، والتغيّر عن التي قبلها"
            icon={<History size={16} />}
          >
            <div className="flex flex-col gap-2.5">
              {history.map((h, i) => {
                const before = history[i + 1]?.agg;
                return (
                  <div key={h.label} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-[12px] font-semibold text-text-secondary dark:text-text-on-dark/85 truncate">{h.label}</span>
                      <span className="text-[12px] font-counter font-bold text-text-primary dark:text-text-on-dark tabular-nums">{toArabicDigits(h.agg.pct)}٪</span>
                      <PointsChip d={before && before.n > 0 ? h.agg.pct - before.pct : null} />
                    </div>
                    <span className="h-2 rounded-full bg-track overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${h.agg.pct}%`, background: i === 0 ? CHART.teal : CHART.tealLight }} />
                    </span>
                    <span className="text-[10.5px] text-text-muted font-counter">
                      {formatNumberAr(h.agg.fard)} من {formatNumberAr(h.agg.n * 5)} · أيام كاملة {toArabicDigits(h.agg.perfect)} · السنن {toArabicDigits(h.agg.sunnahTotal)}
                      {h.agg.excusedDays ? ` · ${toArabicDigits(h.agg.excusedDays)} أيام عذر` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </StatsPanel>
        </Reveal>
      ) : null}

      <Reveal delay={0.1}>
        <PeriodTrend
          range={range}
          title="الفروض يوماً بيوم"
          subtitle="عدد الفروض المسجّلة في كل يوم"
          valueFor={(k) => fardCount(log[k])}
          max={period === 'year' ? undefined : 5}
          yearAggregate="avg"
          formatValue={(v) => formatNumberAr(v, 1)}
          onSelectDay={setSelectedDay}
        />
      </Reveal>

      {male ? (
        <Reveal delay={0.11}>
          <StatsPanel title="صلاة المسجد" subtitle={`${toArabicDigits(agg.mosqueTotal)} فرضاً في المسجد في ${range.label}`} icon={<Landmark size={16} />}>
            {agg.mosqueTotal > 0 ? (
              <DistributionBars
                items={PRAYERS.map((p) => ({ label: PRAYER_AR[p], value: agg.mosque[p], color: CHART.teal }))}
                sort={false}
                formatValue={(v) => toArabicDigits(v)}
              />
            ) : (
              <p className="text-[12px] text-text-muted text-center py-3">علّم «في المسجد» تحت كل صلاة لتتابع صلاة الجماعة.</p>
            )}
          </StatsPanel>
        </Reveal>
      ) : null}

      <Reveal delay={0.12}>
        <StatsPanel title="السنن والنوافل" subtitle={`${toArabicDigits(agg.sunnahTotal)} في ${range.label}`} icon={<Star size={16} />}>
          <DistributionBars
            items={[
              { label: 'السنن القبلية', value: agg.sunnah.before, color: CHART.teal },
              { label: 'السنن البعدية', value: agg.sunnah.after, color: CHART.tealLight },
              { label: 'الضحى', value: agg.duha, color: CHART.gold },
            ]}
            sort={false}
            formatValue={(v) => toArabicDigits(v)}
          />
        </StatsPanel>
      </Reveal>

      <Reveal delay={0.14}>
        <PeriodCalendar
          period={period}
          cells={range.dateKeys.map((k) => ({ date: k, value: fardCount(log[k]), complete: fardCount(log[k]) === 5 }))}
          max={5}
          onSelectDay={setSelectedDay}
          title={period === 'month' ? 'تقويم الفروض' : 'خريطة الفروض'}
          legend={['٠ فروض', '٥ فروض']}
        />
      </Reveal>

      <Reveal delay={0.16}>
        <WeekdayPanel
          values={weekday.map((w) => w.avg)}
          subtitle={`متوسط الفروض في كل يوم · ${pattern.label}`}
          formatValue={(v) => formatNumberAr(v, 1)}
          minTotal={1}
        />
      </Reveal>

      <Reveal delay={0.18}>
        <TimeOfDayPanel hours={timing.hours} title="متى تسجّل صلواتك" subtitle={`من أوقات التسجيل · ${pattern.label}`} />
        {Object.keys(timing.avg).length > 0 ? (
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {PRAYERS.map((p) => {
              const a = timing.avg[p];
              return (
                <div
                  key={p}
                  className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] py-2 text-center"
                >
                  <p className="text-[10px] text-text-muted">{PRAYER_AR[p]}</p>
                  <p className="text-[11px] font-counter font-bold text-text-primary dark:text-text-on-dark inline-flex items-center gap-0.5">
                    {a ? clock(a.mins / a.n) : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
        {Object.keys(timing.avg).length > 0 ? (
          <p className="mt-1.5 text-[10px] text-text-muted px-1 inline-flex items-center gap-1">
            <Clock3 size={10} /> متوسط وقت التسجيل لكل صلاة
          </p>
        ) : null}
      </Reveal>

      <Reveal delay={0.2}>
        <ComparePanel
          nowLabel={period === 'week' ? 'هذا الأسبوع' : period === 'month' ? 'هذا الشهر' : 'الفترة'}
          rows={[
            { label: 'نسبة الالتزام', now: agg.pct, prev: prev.pct, format: (v) => `${toArabicDigits(Math.round(v))}٪` },
            { label: 'الفروض المسجّلة', now: agg.fard, prev: prev.fard },
            { label: 'فروض لم تُسجَّل', now: missed, prev: Math.max(0, prev.n * 5 - prev.fard), inverse: true },
            { label: 'أيام مكتملة', now: agg.perfect, prev: prev.perfect },
            ...(male ? [{ label: 'في المسجد', now: agg.mosqueTotal, prev: prev.mosqueTotal }] : []),
            { label: 'السنن والنوافل', now: agg.sunnahTotal, prev: prev.sunnahTotal },
            { label: 'الضحى', now: agg.duha, prev: prev.duha },
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
