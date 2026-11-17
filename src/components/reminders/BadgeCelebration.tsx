import { useEffect, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { OrnamentRule, Star8 } from '@/components/ui/Ornament';
import { Button } from '@/components/ui/Button';
import { Sparkle } from '@/components/ui/Sparkle';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { LevelSeal, RarityPill } from '@/components/badges/badgeUi';
import { BADGE_BY_ID, LEVELS, METRICS, RARITY_POINTS, RARITY_RANK } from '@/data/badges';
import { useBadgeCelebrationStore } from '@/services/BadgeEngine';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * The unlock moment. Mount ONCE at the app root (props-less). While mounted,
 * BadgeEngine queues each unlock batch here instead of a toast: the rarest
 * badge large, the rest of the batch as a row, and a level-up if it raised one.
 */
export function BadgeCelebration() {
  const queue = useBadgeCelebrationStore((s) => s.queue);
  useEffect(() => {
    useBadgeCelebrationStore.setState((s) => ({ mounted: s.mounted + 1 }));
    return () => useBadgeCelebrationStore.setState((s) => ({ mounted: s.mounted - 1 }));
  }, []);

  const item = queue[0];
  const badges = (item?.ids ?? []).map((id) => BADGE_BY_ID.get(id)).filter((x) => !!x);
  const [lead] = badges;
  const rest = badges.slice(1);
  const level = item?.levelRank ? LEVELS.find((l) => l.rank === item.levelRank) : undefined;
  const points = badges.reduce((n, x) => n + RARITY_POINTS[x.rarity], 0);
  const grand = !!lead && RARITY_RANK[lead.rarity] >= 3;
  const [burst, setBurst] = useState(false);

  const dismiss = () => useBadgeCelebrationStore.setState((s) => ({ queue: s.queue.slice(1) }));

  useEffect(() => {
    if (!lead) return;
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 900);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [lead]);

  return (
    <AnimatePresence>
      {lead ? (
        <motion.div
          key={item.ids.join(',')}
          className="fixed inset-0 z-[80] flex items-center justify-center px-6 bg-black/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={dismiss}
          dir="rtl"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-cel-title"
            className="relative w-full max-w-sm max-h-[88dvh] overflow-y-auto overflow-x-hidden rounded-[var(--radius-card)] bg-[image:var(--gradient-night)] ring-1 ring-gold/35 shadow-[var(--shadow-lg)] px-6 pt-7 pb-6 text-center text-text-on-dark"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <span aria-hidden className="lattice lattice-fade text-gold" />
            <Star8 size={130} filled={false} className="absolute -top-10 -start-10 text-gold/20" />
            <Star8 size={90} filled={false} className="absolute -bottom-8 -end-8 text-gold/15" />

            <p className="relative text-xs font-bold text-gold-light">
              {badges.length > 1 ? `${toArabicDigits(badges.length)} أوسمة جديدة` : 'وسام جديد'} — {METRICS[lead.metric].label}
            </p>
            <div className="relative mt-4 flex justify-center">
              {grand ? (
                <span aria-hidden className="absolute inset-0 m-auto w-44 h-44 rounded-full bg-gold/20 blur-2xl badge-glow" />
              ) : null}
              <BadgeEmblem icon={lead.icon} rarity={lead.rarity} unlocked size={grand ? 140 : 124} animate className="badge-pop" />
              <Sparkle show={burst} count={12} size={6} color="var(--color-gold-light)" />
            </div>
            <div className="relative mt-3 flex justify-center">
              <RarityPill rarity={lead.rarity} points />
            </div>
            <h2 id="badge-cel-title" className="relative mt-3 font-display text-2xl font-bold text-text-on-dark text-balance">
              {lead.titleAr}
            </h2>
            <p className="relative mt-1.5 text-sm leading-relaxed text-text-on-dark/80 text-pretty">{lead.descriptionAr}</p>

            {rest.length > 0 ? (
              <div className="relative mt-4">
                <p className="text-[11px] text-text-on-dark/65">ومعه {toArabicDigits(rest.length)} من سجلّك</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {rest.slice(0, 10).map((x) => (
                    <BadgeEmblem key={x.id} icon={x.icon} rarity={x.rarity} unlocked size={36} />
                  ))}
                  {rest.length > 10 ? (
                    <span className="w-9 h-9 rounded-full bg-white/10 inline-flex items-center justify-center font-counter text-[11px] font-bold">
                      +{toArabicDigits(rest.length - 10)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {level ? (
              <div className="relative mt-4 flex items-center gap-3 rounded-[var(--radius-inner)] bg-white/[0.06] ring-1 ring-gold/25 p-3 text-start">
                <LevelSeal rank={level.rank} size={52} onDark />
                <div className="min-w-0">
                  <p className="text-[11px] text-gold-light">ارتقيتَ مستوى</p>
                  <p className="font-display text-lg font-bold leading-tight">
                    المستوى {toArabicDigits(level.rank)}، «{level.titleAr}»
                  </p>
                </div>
              </div>
            ) : null}

            <OrnamentRule className="relative my-4 mx-8" />
            <p className="relative font-ornate text-lg text-gold-light">بارك الله فيك وتقبّل منك</p>
            <p className="relative mt-1 font-counter text-[11px] text-text-on-dark/60">+{toArabicDigits(points)} نقطة</p>
            <div className="relative mt-5 flex gap-2.5">
              <Button
                variant="gold"
                className="flex-1"
                onClick={() => {
                  dismiss();
                  window.location.hash = '#/badges';
                }}
              >
                خزانة الأوسمة
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="flex-1 min-h-12 rounded-[var(--radius-btn)] bg-white/10 hover:bg-white/15 text-text-on-dark text-[15px] font-bold transition-colors"
              >
                متابعة
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
