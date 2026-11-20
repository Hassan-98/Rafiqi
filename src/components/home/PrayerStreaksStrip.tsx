import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, Flame } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { usePrayerLogStore, eachPrayerStreak, eachRawatibStreak } from '@/store/prayerLogStore';
import { useBadgeStore } from '@/store/badgeStore';
import { useBadgeMetrics } from '@/services/BadgeEngine';
import { useSettingsStore } from '@/store/settingsStore';
import { nearestStreakBadge, type StreakChain } from '@/components/stats/EachPrayerStreaks';
import { arCount } from '@/services/insightsService';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { BadgeMetric } from '@/data/badges';

const DAYS: StreakChain['unit'] = ['يوم واحد', 'يومان', 'أيام', 'يوماً'];
const NIGHTS: StreakChain['unit'] = ['ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة'];
const FARD = [
  ['fajr', 'الفجر'],
  ['dhuhr', 'الظهر'],
  ['asr', 'العصر'],
  ['maghrib', 'المغرب'],
  ['isha', 'العشاء'],
] as const;
/** The nawafil chains — the same runs the badges count (nights for qiyam/witr). */
const NAWAFIL: { metric: BadgeMetric; label: string; unit: StreakChain['unit'] }[] = [
  { metric: 'duha_streak', label: 'الضحى', unit: DAYS },
  { metric: 'qiyam_streak', label: 'القيام', unit: NIGHTS },
  { metric: 'qiyam_witr_streak', label: 'الوتر', unit: NIGHTS },
];

/**
 * «سلاسل الصلوات» on the prayers page, under «صلوات اليوم» (owner 2026-11-20: off Home) — each its own chain
 * (owner, 2026-11-15): the five fard, each sunnah of the rawatib (one missed
 * sunnah breaks only its own), and the nawafil — الضحى، القيام، الوتر — plus
 * the closest streak badge across them.
 */
export function PrayerStreaksStrip() {
  const navigate = useNavigate();
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const unlocked = useBadgeStore((s) => s.unlocked);
  const metrics = useBadgeMetrics();
  const male = useSettingsStore((s) => s.gender) === 'male';
  const each = useMemo(() => eachPrayerStreak(log, excused, duha), [log, excused, duha]);
  const rawatib = useMemo(() => eachRawatibStreak(log, excused, male), [log, excused, male]);
  const fard: StreakChain[] = FARD.map(([key, label]) => ({ metric: `${key}_streak`, label, current: each[key].current, unit: DAYS }));
  const sunnah: StreakChain[] = rawatib.map((r) => ({
    // Only سنة الفجر has its own streak badges; the others just show their chain.
    metric: r.prayer === 'fajr' ? 'fajr_sunnah_streak' : `${r.prayer}_${r.type}`,
    label: r.label,
    current: r.current,
    unit: DAYS,
  }));
  const nawafil: StreakChain[] = NAWAFIL.map((c) => ({
    ...c,
    // الضحى from the log directly (instant), the nights from the badge metrics.
    current: c.metric === 'duha_streak' ? each.duha.current : (metrics.value[c.metric] ?? 0),
  }));
  const all = [...fard, ...sunnah, ...nawafil];
  const next = nearestStreakBadge(all, unlocked);
  if (!all.some((c) => c.current > 0) && !next) return null;

  return (
    <Card className="p-3">
      <button
        type="button"
        onClick={() => navigate('/stats/prayers')}
        className="w-full flex items-center justify-between gap-2 text-start min-h-8"
      >
        <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">سلاسل الصلوات</span>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-teal dark:text-teal-light">
          التفاصيل <ChevronLeft size={13} />
        </span>
      </button>
      <Row title="الفرائض" chains={fard} onTitle={() => navigate('/stats/prayers')} />
      <Row title="السنن الرواتب" chains={sunnah} gold onTitle={() => navigate('/stats/nawafil')} />
      <Row title="النوافل" chains={nawafil} gold cols={3} onTitle={() => navigate('/stats/nawafil')} />
      {next ? (
        <p className="mt-2 text-[11.5px] text-text-secondary dark:text-text-on-dark/75 text-pretty">
          الأقرب: {next.left > 0 ? `بقي ${arCount(next.left, ...next.chain.unit)} من ${next.chain.label} لوسام` : 'وسام'}{' '}
          <span className="font-bold text-teal dark:text-teal-light">«{next.title}»</span>
        </p>
      ) : null}
    </Card>
  );
}

function Row({
  title,
  chains,
  gold = false,
  cols = 5,
  onTitle,
}: {
  title: string;
  chains: StreakChain[];
  gold?: boolean;
  cols?: 3 | 5;
  onTitle: () => void;
}) {
  return (
    <div className="mt-2">
      <button type="button" onClick={onTitle} className="min-h-6 text-[10.5px] font-semibold text-text-muted">
        {title}
      </button>
      <div className={['mt-1 grid gap-1', cols === 3 ? 'grid-cols-3' : 'grid-cols-5'].join(' ')}>
        {chains.map((c) => (
          <div
            key={c.metric}
            className={['flex flex-col items-center gap-0.5 rounded-xl py-2', gold ? 'bg-gold/[0.08]' : 'bg-cream-dark/45 dark:bg-dark-surface'].join(' ')}
            aria-label={`${c.label}: ${arCount(c.current, ...c.unit)} متتالية`}
          >
            <span className="max-w-full truncate px-0.5 text-[10.5px] font-semibold text-text-secondary dark:text-text-on-dark/80">{c.label}</span>
            <span
              className={[
                'inline-flex items-center gap-0.5 font-counter font-bold text-[14px] leading-none',
                c.current > 0 ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted/60',
              ].join(' ')}
            >
              <Flame size={12} aria-hidden />
              {toArabicDigits(c.current)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
