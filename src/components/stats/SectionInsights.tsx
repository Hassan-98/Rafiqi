import { useNavigate } from 'react-router';
import { ChevronLeft, Sparkles, TrendingUp, Flame, Trophy, BellRing } from 'lucide-react';
import { useInsights, type Insight, type InsightDomain } from '@/services/insightsService';

const KIND_ICON: Record<Insight['kind'], typeof Sparkles> = {
  streak: Flame,
  record: Trophy,
  milestone: Trophy,
  trend: TrendingUp,
  comparison: TrendingUp,
  nudge: BellRing,
};

interface SectionInsightsProps {
  domain: InsightDomain;
  /** Where "كل الإحصاءات" goes (the section's own stats page). */
  statsTo: string;
  limit?: number;
  className?: string;
}

/**
 * Compact "your progress here" strip that every section embeds at the top
 * (أذكار، قيام، أوراد، قرآن…): the top insights from the shared engine +
 * a link to the section's full statistics page.
 */
export function SectionInsights({ domain, statsTo, limit = 3, className = '' }: SectionInsightsProps) {
  const navigate = useNavigate();
  const items = useInsights(domain, limit);

  return (
    <div className={['flex flex-col gap-2', className].join(' ')}>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted px-1">ابدأ اليوم لتظهر إنجازاتك وإحصاءاتك هنا.</p>
      ) : (
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
          {items.map((it) => {
            const Icon = KIND_ICON[it.kind];
            const celebrate = it.tone === 'celebrate';
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => navigate(it.to ?? statsTo)}
                className={[
                  'w-full min-w-0 text-start rounded-[var(--radius-inner)] p-3 ring-1 transition-colors',
                  celebrate
                    ? 'bg-gold/10 ring-gold/25 hover:bg-gold/15'
                    : 'bg-white dark:bg-dark-card ring-black/[0.05] dark:ring-white/[0.07] hover:ring-teal/25',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      'w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0',
                      celebrate ? 'bg-gold/20 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
                    ].join(' ')}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{it.title}</span>
                  {it.value ? (
                    <span className="ms-auto text-xs font-counter font-bold text-teal dark:text-teal-light shrink-0">{it.value}</span>
                  ) : null}
                </span>
                <span className="block mt-1.5 text-[11.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 line-clamp-2">
                  {it.body}
                </span>
                {it.progress != null && it.progress < 1 ? (
                  <span className="block mt-2 h-1 rounded-full bg-track overflow-hidden" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-[image:var(--gradient-gold)]"
                      style={{ width: `${Math.max(4, Math.round(it.progress * 100))}%` }}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => navigate(statsTo)}
        className="self-start inline-flex items-center gap-1 text-xs font-semibold text-teal dark:text-teal-light px-1"
      >
        كل الإحصاءات <ChevronLeft size={13} />
      </button>
    </div>
  );
}
