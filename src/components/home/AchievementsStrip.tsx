import { useNavigate } from 'react-router';
import { ChevronLeft, Flame, Trophy, TrendingUp, BellRing, Sparkles } from 'lucide-react';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { useInsights, type Insight } from '@/services/insightsService';
import { useBadgeStore } from '@/store/badgeStore';
import { BADGE_BY_ID } from '@/data/badges';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const KIND_ICON: Record<Insight['kind'], typeof Sparkles> = {
  streak: Flame,
  record: Trophy,
  milestone: Trophy,
  trend: TrendingUp,
  comparison: TrendingUp,
  nudge: BellRing,
};

/**
 * «إنجازاتك» — the latest badge (unlocked this week) as the lead event, then
 * the top facts from the shared insights engine (celebrations first, then
 * gentle nudges), one tap into the stats behind each.
 */
export function AchievementsStrip() {
  const navigate = useNavigate();
  const all = useInsights(undefined, 12);
  const unlockedAt = useBadgeStore((s) => s.unlockedAt);
  const recent = Object.entries(unlockedAt)
    .filter(([, at]) => Date.now() - new Date(at).getTime() < WEEK_MS)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .map(([id]) => BADGE_BY_ID.get(id))
    .find(Boolean);
  const items = [
    ...all.filter((i) => i.tone === 'celebrate'),
    ...all.filter((i) => i.tone === 'encourage'),
  ].slice(0, recent ? 3 : 4);
  if (items.length === 0 && !recent) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="إنجازاتك"
        subtitle="من سجلّ عبادتك"
        action={
          <button
            type="button"
            onClick={() => navigate('/stats')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
          >
            الإحصاءات <ChevronLeft size={14} />
          </button>
        }
      />
      {/* A grid, not an edge-bleeding carousel: cut-off cards read as overflow on narrow phones. */}
      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2.5">
        {recent ? (
          <button
            type="button"
            onClick={() => navigate('/badges')}
            className="w-full min-w-0 text-start rounded-[var(--radius-card)] p-3.5 ring-1 flex items-center gap-3 bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-gold/40"
          >
            <BadgeEmblem icon={recent.icon} rarity={recent.rarity} unlocked size={48} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-gold-dark dark:text-gold-light">وسام جديد</span>
              <span className="block text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">{recent.titleAr}</span>
              <span className="block mt-0.5 text-[11.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/70 line-clamp-2 text-pretty">
                {recent.descriptionAr}
              </span>
            </span>
          </button>
        ) : null}
        {items.map((it) => {
          const Icon = KIND_ICON[it.kind];
          const celebrate = it.tone === 'celebrate';
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => navigate(it.to ?? '/stats')}
              className={[
                'w-full min-w-0 text-start rounded-[var(--radius-card)] p-3.5 ring-1 transition-colors',
                'flex items-start gap-3',
                celebrate
                  ? 'bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-gold/30 dark:ring-gold/20'
                  : 'bg-white dark:bg-dark-card ring-black/[0.05] dark:ring-white/[0.07] shadow-[var(--shadow-xs)]',
              ].join(' ')}
            >
              <Medallion size={42} tone={celebrate ? 'gold' : 'teal'}>
                <Icon
                  size={16}
                  className={celebrate ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'}
                />
              </Medallion>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">
                  {it.title}
                </span>
                {it.value ? (
                  <span
                    className={[
                      'block text-base font-counter font-bold leading-snug',
                      celebrate ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light',
                    ].join(' ')}
                  >
                    {it.value}
                  </span>
                ) : null}
                <span className="block mt-0.5 text-[11.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/70 line-clamp-2 text-pretty">
                  {it.body}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
