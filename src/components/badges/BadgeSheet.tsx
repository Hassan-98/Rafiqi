import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Pin, PinOff } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { OrnamentRule } from '@/components/ui/Ornament';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { ProgressBar, RarityPill, badgeDate, countFor, leftFor } from '@/components/badges/badgeUi';
import { CATEGORY_BY_ID } from '@/data/badges';
import { useBadgeStore, MAX_FEATURED } from '@/store/badgeStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { TrackItem } from '@/services/badgeMetrics';

/**
 * A track's detail: the chosen tier up top (emblem, meaning, progress, pin to
 * profile / start now), then the whole ladder of tiers to step through.
 */
export function BadgeSheet({ track, initialId, onClose }: { track: TrackItem | null; initialId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const featured = useBadgeStore((s) => s.featured);
  const toggleFeatured = useBadgeStore((s) => s.toggleFeatured);
  const [sel, setSel] = useState<string | undefined>(initialId);
  useEffect(() => setSel(initialId), [initialId, track?.metric]);

  const tiers = track?.tiers ?? [];
  const cur = tiers.find((t) => t.badge.id === sel) ?? track?.next ?? track?.top ?? tiers[0];
  const secret = !!track?.secret;

  return (
    <BottomSheet open={!!track && !!cur} onClose={onClose} title={secret ? 'وسام خفي' : track?.label}>
      {track && cur ? (
        <div className="flex flex-col gap-4 pb-2" dir="rtl">
          <div className="flex flex-col items-center text-center gap-2 pt-1">
            <BadgeEmblem
              key={cur.badge.id}
              icon={cur.badge.icon}
              rarity={cur.badge.rarity}
              unlocked={cur.unlocked}
              pct={cur.pct}
              mystery={secret}
              size={116}
              animate
              className={cur.unlocked ? 'badge-pop' : ''}
            />
            <RarityPill rarity={cur.badge.rarity} points />
            <h3 className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark text-balance">
              {secret ? 'ما زال سرّاً' : cur.badge.titleAr}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty max-w-sm">
              {secret ? cur.badge.hint : cur.badge.descriptionAr}
            </p>
            {cur.unlocked ? (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-dark dark:text-gold-light">
                <Check size={14} strokeWidth={3} />
                {cur.unlockedAt ? `أُحرز في ${badgeDate.format(new Date(cur.unlockedAt))}` : 'مُحرَز'}
              </p>
            ) : !secret ? (
              <div className="w-full max-w-xs flex flex-col gap-1.5">
                <ProgressBar pct={cur.pct} rarity={cur.badge.rarity} />
                <p className="flex justify-between text-[11.5px] text-text-muted">
                  <span className="font-counter tabular-nums">
                    {toArabicDigits(Math.min(cur.current, cur.target))}/{toArabicDigits(cur.target)}
                  </span>
                  <span>{leftFor(cur)}</span>
                </p>
              </div>
            ) : null}
            <div className="w-full max-w-xs mt-1">
              {cur.unlocked ? (
                <Button
                  variant="soft"
                  fullWidth
                  leftIcon={featured.includes(cur.badge.id) ? <PinOff size={16} /> : <Pin size={16} />}
                  onClick={() => toggleFeatured(cur.badge.id)}
                  aria-pressed={featured.includes(cur.badge.id)}
                >
                  {featured.includes(cur.badge.id) ? 'إزالته من ملفي' : `اعرضه في ملفي (حتى ${toArabicDigits(MAX_FEATURED)})`}
                </Button>
              ) : !secret ? (
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    onClose();
                    navigate(CATEGORY_BY_ID[track.category].to);
                  }}
                >
                  ابدأ الآن
                </Button>
              ) : null}
            </div>
          </div>

          {!secret && tiers.length > 1 ? (
            <>
              <OrnamentRule className="mx-6" />
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-text-muted px-1">
                  درجات «{track.label}»، أحرزتَ {toArabicDigits(track.got)} من {toArabicDigits(tiers.length)}
                </p>
                <ol className="flex flex-col gap-1.5">
                  {tiers.map((t, i) => {
                    const active = t.badge.id === cur.badge.id;
                    return (
                      <li key={t.badge.id}>
                        <button
                          type="button"
                          onClick={() => setSel(t.badge.id)}
                          aria-pressed={active}
                          className={[
                            'w-full flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-2.5 text-start transition-colors',
                            active ? 'bg-teal/[0.08] ring-1 ring-teal/25' : 'hover:bg-teal/5',
                          ].join(' ')}
                        >
                          <span className="w-5 text-center font-counter text-[11px] font-bold text-text-muted">{toArabicDigits(i + 1)}</span>
                          <BadgeEmblem icon={t.badge.icon} rarity={t.badge.rarity} unlocked={t.unlocked} pct={t.pct} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{t.badge.titleAr}</span>
                            <span className="block text-[11px] text-text-muted">{countFor(t, t.target)}</span>
                          </span>
                          {t.unlocked ? (
                            <Check size={16} strokeWidth={3} className="text-gold-dark dark:text-gold-light shrink-0" />
                          ) : (
                            <span className="font-counter text-[11px] text-text-muted shrink-0">{toArabicDigits(t.pct)}٪</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
