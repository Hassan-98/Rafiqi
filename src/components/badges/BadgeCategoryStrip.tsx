import { useNavigate } from 'react-router';
import { Award, ChevronLeft } from 'lucide-react';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { ProgressBar, leftFor } from '@/components/badges/badgeUi';
import { useBadgeModel } from '@/services/BadgeEngine';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { BadgeCategory } from '@/data/badges';

/**
 * «أوسمة هذا القسم» — the section's share of the catalog and its three
 * closest next tiers, one tap into the gallery filtered to it.
 */
export function BadgeCategoryStrip({ categories }: { categories: BadgeCategory[] }) {
  const navigate = useNavigate();
  const model = useBadgeModel();
  const tracks = model.tracks.filter((t) => categories.includes(t.category));
  if (!tracks.length) return null;
  const tiers = tracks.flatMap((t) => t.tiers);
  const got = tiers.filter((x) => x.unlocked).length;
  const next = tracks
    .filter((t) => !t.secret)
    .map((t) => t.next)
    .filter((x) => x !== null)
    .sort((a, c) => c.pct - a.pct)
    .slice(0, 3);
  const latest = tiers.filter((x) => x.unlocked).sort((a, c) => (c.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))[0];

  return (
    <StatsPanel
      title="أوسمة هذا القسم"
      subtitle={`${toArabicDigits(got)} من ${toArabicDigits(tiers.length)} وساماً`}
      icon={<Award size={16} />}
      action={
        <button
          type="button"
          onClick={() => navigate(`/badges?cat=${categories[0]}`)}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
        >
          الكل <ChevronLeft size={14} />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        {latest ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-inner)] bg-gold/[0.07] ring-1 ring-gold/20 px-3 py-2.5">
            <BadgeEmblem icon={latest.badge.icon} rarity={latest.badge.rarity} unlocked size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-gold-dark dark:text-gold-light font-bold">آخر ما أحرزت</span>
              <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{latest.badge.titleAr}</span>
            </span>
          </div>
        ) : null}
        {next.map((it) => (
          <button
            key={it.badge.id}
            type="button"
            onClick={() => navigate(`/badges?cat=${categories[0]}`)}
            className="flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-2 text-start hover:bg-teal/5"
          >
            <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked={false} pct={it.pct} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{it.badge.titleAr}</span>
                <span className="shrink-0 font-counter tabular-nums text-[11px] text-text-muted">
                  {toArabicDigits(Math.min(it.current, it.target))}/{toArabicDigits(it.target)}
                </span>
              </span>
              <ProgressBar pct={it.pct} rarity={it.badge.rarity} className="mt-1.5" />
              <span className="mt-1 block text-[10.5px] text-text-muted">{leftFor(it)}</span>
            </span>
          </button>
        ))}
      </div>
    </StatsPanel>
  );
}
