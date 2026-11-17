import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { motion } from '@/lib/motion';
import { Card } from '@/components/ui/Card';
import { ArchMotif, Medallion } from '@/components/ui/Ornament';
import { toArabicDigits, type Delta } from '@/services/statsService';

interface HeroTile {
  value: ReactNode;
  label: string;
}

interface StatsHeroCardProps {
  title: string;
  subtitle?: string;
  /** Big visual (gauge/ring) — centred under the header. */
  gauge?: ReactNode;
  /** The period's key number, printed large beside the streak seal. */
  headline?: { value: ReactNode; label: string };
  /** Change vs the previous period (shown as a chip under the headline). */
  delta?: Delta | null;
  deltaLabel?: string;
  tiles?: HeroTile[];
  streak?: number;
  streakLabel?: string;
  /** @deprecated kept for API compatibility — heroes always use the accent surface. */
  accent?: 'teal' | 'gold';
  icon?: ReactNode;
  /** Extra content under the tiles (e.g. a progress bar). */
  children?: ReactNode;
}

/**
 * The one hero of every stats page: the accent surface with the etched
 * lattice and a faint mihrab arch, the period's headline number, an
 * eight-point streak seal and a row of secondary tiles.
 */
export function StatsHeroCard({
  title,
  subtitle,
  gauge,
  headline,
  delta,
  deltaLabel = 'عن الفترة السابقة',
  tiles = [],
  streak,
  streakLabel = 'سلسلة',
  icon,
  children,
}: StatsHeroCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-6 -end-8 w-44 opacity-[0.13]" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-display font-bold flex items-center gap-2 text-balance">
                {icon ? <span className="text-gold-light shrink-0">{icon}</span> : null}
                {title}
              </h2>
              {subtitle ? <p className="text-[12px] text-on-accent/75 mt-0.5">{subtitle}</p> : null}
            </div>
            {streak != null && !headline ? <StreakSeal streak={streak} label={streakLabel} /> : null}
          </div>

          {headline ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[44px] leading-none font-counter font-bold tabular-nums">{headline.value}</p>
                <p className="text-[12px] text-on-accent/80 mt-1.5">{headline.label}</p>
                {delta && !delta.neutral ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-on-accent/12 px-2 py-0.5 text-[11px] font-semibold">
                    {delta.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {toArabicDigits(Math.abs(delta.pct))}٪ {deltaLabel}
                  </span>
                ) : null}
              </div>
              {streak != null ? <StreakSeal streak={streak} label={streakLabel} large /> : null}
            </div>
          ) : null}

          {gauge ? <div className="flex justify-center">{gauge}</div> : null}

          {tiles.length > 0 ? (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 3)}, minmax(0,1fr))` }}
            >
              {tiles.map((t, i) => (
                <div key={i} className="rounded-2xl bg-on-accent/10 ring-1 ring-on-accent/10 px-2 py-2.5 text-center min-w-0">
                  <div className="text-lg font-bold font-counter tabular-nums leading-tight truncate">{t.value}</div>
                  <div className="text-[10px] text-on-accent/75 mt-0.5 leading-tight">{t.label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {children}
        </div>
      </Card>
    </motion.div>
  );
}

function StreakSeal({ streak, label, large = false }: { streak: number; label: string; large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <Medallion size={large ? 76 : 58} tone="onAccent">
        <span className={large ? 'text-2xl' : 'text-lg'}>{toArabicDigits(streak)}</span>
      </Medallion>
      <span className="inline-flex items-center gap-0.5 text-[10px] text-on-accent/80">
        <Flame size={10} className="text-gold-light" />
        {label}
      </span>
    </div>
  );
}
