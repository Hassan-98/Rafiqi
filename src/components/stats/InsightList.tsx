import { useNavigate } from 'react-router';
import { Flame, Trophy, TrendingUp, BellRing, Sparkles, ChevronLeft } from 'lucide-react';
import { useInsights, type Insight, type InsightDomain } from '@/services/insightsService';

const KIND_ICON: Record<Insight['kind'], typeof Sparkles> = {
  streak: Flame,
  record: Trophy,
  milestone: Trophy,
  trend: TrendingUp,
  comparison: TrendingUp,
  nudge: BellRing,
};

const TONE_CHIP: Record<Insight['tone'], string> = {
  celebrate: 'bg-gold/15 text-gold-dark dark:text-gold-light',
  encourage: 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
  info: 'bg-cream-dark/70 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/80',
};

interface InsightListProps {
  /** Engine domain (omit for all domains). Ignored when `items` is given. */
  domain?: InsightDomain;
  items?: Insight[];
  limit?: number;
  emptyText?: string;
}

/**
 * Vertical list of insights from the shared engine — the "ما يلفت في أدائك"
 * block on every stats page and the landing. Rows are tappable (to the
 * insight's route); milestone insights draw a progress bar.
 */
export function InsightList({ domain, items, limit = 6, emptyText = 'سجّل عبادتك لتظهر هنا ملاحظات عن تقدّمك.' }: InsightListProps) {
  const navigate = useNavigate();
  const fromEngine = useInsights(domain, limit);
  const list = items ?? fromEngine;

  if (list.length === 0) {
    return <p className="text-[12px] text-text-muted px-1 py-2">{emptyText}</p>;
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-1.5">
      {list.map((it, i) => {
        const Icon = KIND_ICON[it.kind];
        return (
          <button
            key={it.id}
            type="button"
            onClick={it.to ? () => navigate(it.to!) : undefined}
            className={[
              'w-full flex items-start gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start transition-colors',
              it.to ? 'hover:bg-teal/5' : 'cursor-default',
              i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
            ].join(' ')}
          >
            <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${TONE_CHIP[it.tone]}`}>
              <Icon size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{it.title}</span>
                {it.value ? (
                  <span
                    className={[
                      'ms-auto shrink-0 text-[12px] font-counter font-bold tabular-nums',
                      it.tone === 'celebrate' ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light',
                    ].join(' ')}
                  >
                    {it.value}
                  </span>
                ) : null}
              </span>
              <span className="block mt-0.5 text-[12px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
                {it.body}
              </span>
              {it.progress != null && it.progress < 1 ? (
                <span className="block mt-2 h-1.5 rounded-full bg-track overflow-hidden" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-[image:var(--gradient-gold)]"
                    style={{ width: `${Math.max(4, Math.round(it.progress * 100))}%` }}
                  />
                </span>
              ) : null}
            </span>
            {it.to ? <ChevronLeft size={15} className="text-text-muted shrink-0 mt-2.5" /> : null}
          </button>
        );
      })}
    </div>
  );
}
