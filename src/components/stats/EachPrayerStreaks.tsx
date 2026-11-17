import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { usePrayerLogStore, eachPrayerStreak } from '@/store/prayerLogStore';
import { useBadgeStore } from '@/store/badgeStore';
import { BADGES } from '@/data/badges';
import { arCount } from '@/services/insightsService';
import type { PrayerName } from '@/types';

const days = (n: number) => arCount(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');

export const PRAYER_STREAK_ROWS: { key: PrayerName | 'duha'; label: string }[] = [
  { key: 'fajr', label: 'الفجر' },
  { key: 'dhuhr', label: 'الظهر' },
  { key: 'asr', label: 'العصر' },
  { key: 'maghrib', label: 'المغرب' },
  { key: 'isha', label: 'العشاء' },
  { key: 'duha', label: 'الضحى' },
];

/** The nearest still-locked badge on this prayer's streak metric. */
function nextBadge(key: string, unlocked: string[]) {
  let best: { title: string; target: number } | null = null;
  for (const b of BADGES) {
    if (b.metric !== `${key}_streak` || unlocked.includes(b.id)) continue;
    if (!best || b.target < best.target) best = { title: b.titleAr, target: b.target };
  }
  return best;
}

export interface StreakChain {
  /** The badge metric of the chain, e.g. `fajr_streak`, `qiyam_witr_streak`. */
  metric: string;
  label: string;
  current: number;
  /** Plural forms of its unit (days / nights). */
  unit: [string, string, string, string];
}

/** Across the chains: the locked streak badge with the fewest days (nights) left. */
export function nearestStreakBadge(
  chains: StreakChain[],
  unlocked: string[],
): { chain: StreakChain; title: string; left: number } | null {
  let best: { chain: StreakChain; title: string; left: number } | null = null;
  for (const chain of chains) {
    const next = nextBadge(chain.metric.replace(/_streak$/, ''), unlocked);
    if (!next) continue;
    const left = Math.max(0, next.target - chain.current);
    if (!best || left < best.left) best = { chain, title: next.title, left };
  }
  return best;
}

/**
 * «سلسلة كل صلاة» — each fard's own run of consecutive days (and الضحى's),
 * its best, and how far the next streak badge is. Like the awrad rows: one
 * missed Fajr breaks only Fajr's chain, not the other four.
 */
export function EachPrayerStreaks() {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const unlocked = useBadgeStore((s) => s.unlocked);
  const each = useMemo(() => eachPrayerStreak(log, excused, duha), [log, excused, duha]);

  return (
    <StatsPanel title="سلسلة كل صلاة" subtitle="أيام متتالية لم تفُتك فيها كل صلاة، وأطول سلسلة لك" icon={<Flame size={16} />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRAYER_STREAK_ROWS.map(({ key, label }) => {
          const s = each[key];
          const next = nextBadge(key, unlocked);
          const nafl = key === 'duha';
          return (
            <div
              key={key}
              className={[
                'rounded-[var(--radius-inner)] p-3 ring-1 flex flex-col gap-1',
                nafl
                  ? 'bg-gold/[0.07] ring-gold/25'
                  : 'bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06]',
              ].join(' ')}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark">{label}</span>
                {nafl ? (
                  <span className="px-1.5 py-px rounded-md text-[9.5px] font-bold bg-gold/15 text-gold-dark dark:text-gold-light">نافلة</span>
                ) : null}
              </div>
              <p className="flex items-center gap-1 font-counter font-bold text-[17px] leading-tight text-text-primary dark:text-text-on-dark">
                <Flame size={15} aria-hidden className={s.current > 0 ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted/40'} />
                {s.current > 0 ? days(s.current) : '—'}
              </p>
              <p className="text-[10.5px] text-text-muted">الأطول: {s.longest > 0 ? days(s.longest) : '—'}</p>
              {next ? (
                <p className="text-[10.5px] leading-snug text-teal dark:text-teal-light text-pretty">
                  {s.current >= next.target
                    ? `وسام «${next.title}» قريباً`
                    : `بقي ${days(next.target - s.current)} لوسام «${next.title}»`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-text-muted">
        اليوم لا يقطع السلسلة قبل أن ينتهي، وأيام العذر لا تُحتسب.
      </p>
    </StatsPanel>
  );
}
