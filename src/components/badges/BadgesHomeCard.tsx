import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { OrnamentRule, SectionTitle } from '@/components/ui/Ornament';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { LevelSeal, ProgressBar, leftFor } from '@/components/badges/badgeUi';
import { PartChips, focusCombo } from '@/components/badges/TodayChallenges';
import { useBadgeMetrics, useBadgeModel } from '@/services/BadgeEngine';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * «أوسمتك» on Home: the level, today's combined-day challenge with its parts
 * (each one tap from where it's done), and the badge closest to unlocking.
 */
export function BadgesHomeCard() {
  const navigate = useNavigate();
  const model = useBadgeModel();
  const { today } = useBadgeMetrics();
  const combo = focusCombo(today);
  const next = model.nearest[0];
  const lvl = model.level;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="أوسمتك"
        subtitle={`${toArabicDigits(model.got)} من ${toArabicDigits(model.total)} وساماً`}
        action={
          <button
            type="button"
            onClick={() => navigate('/badges')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
          >
            خزانة الأوسمة <ChevronLeft size={14} />
          </button>
        }
      />
      <Card variant="gradient-edge" className="p-4">
        <button type="button" onClick={() => navigate('/badges')} className="relative w-full flex items-center gap-3 text-start">
          <LevelSeal rank={lvl.level.rank} size={54} animate={false} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">
                المستوى {toArabicDigits(lvl.level.rank)}، «{lvl.level.titleAr}»
              </span>
              <span className="shrink-0 font-counter tabular-nums text-[11px] text-gold-dark dark:text-gold-light font-bold">
                {toArabicDigits(model.points)} نقطة
              </span>
            </span>
            <span className="mt-1.5 block h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden">
              <span className="block h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${lvl.pct}%` }} />
            </span>
            <span className="mt-1 block text-[11px] text-text-muted">
              {lvl.next ? `بقي ${toArabicDigits(lvl.next.min - model.points)} نقطة إلى «${lvl.next.titleAr}»` : 'أعلى المستويات'}
            </span>
          </span>
        </button>

        {combo ? (
          <>
            <OrnamentRule className="relative my-3.5 mx-4" />
            <div className="relative flex flex-col gap-2">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">
                  تحدّي اليوم: {combo.title}
                </span>
                <span
                  className={[
                    'shrink-0 font-counter tabular-nums text-[11.5px] font-bold',
                    combo.done ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted',
                  ].join(' ')}
                >
                  {combo.done ? 'اكتمل، تقبّل الله' : `${toArabicDigits(combo.doneCount)}/${toArabicDigits(combo.parts.length)}`}
                </span>
              </p>
              <PartChips parts={combo.parts} />
            </div>
          </>
        ) : null}

        {next ? (
          <button
            type="button"
            onClick={() => navigate(`/badges?cat=${encodeURIComponent(model.tracks.find((t) => t.metric === next.badge.metric)?.category ?? '')}`)}
            className="relative mt-3.5 w-full flex items-center gap-3 rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-2.5 text-start"
          >
            <BadgeEmblem icon={next.badge.icon} rarity={next.badge.rarity} unlocked={false} pct={next.pct} size={42} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark truncate">الأقرب: «{next.badge.titleAr}»</span>
                <span className="shrink-0 font-counter text-[11px] text-text-muted">{toArabicDigits(next.pct)}٪</span>
              </span>
              <ProgressBar pct={next.pct} rarity={next.badge.rarity} className="mt-1.5" />
              <span className="mt-1 block text-[10.5px] text-text-muted truncate">{leftFor(next)}</span>
            </span>
          </button>
        ) : null}
      </Card>
    </section>
  );
}
