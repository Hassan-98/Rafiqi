import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { leftFor } from '@/components/badges/badgeUi';
import { useBadgeMetrics, useBadgeModel, type ComboPart, type TodayCombo, type TrackItem } from '@/services/BadgeEngine';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { BadgeMetric } from '@/data/badges';

/** The combined day to put forward: the closest unfinished one (the full «ذهبي» last). */
export function focusCombo(combos: TodayCombo[]): TodayCombo | null {
  const open = combos.filter((c) => !c.done);
  if (!open.length) return combos[combos.length - 1] ?? null;
  const ranked = [...open].sort((a, b) => {
    const golden = Number(a.metric === 'day_golden') - Number(b.metric === 'day_golden');
    return golden || b.doneCount / b.parts.length - a.doneCount / a.parts.length;
  });
  return ranked[0];
}

export function PartChips({ parts }: { parts: ComboPart[] }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => navigate(p.to)}
          aria-pressed={p.done}
          className={[
            'inline-flex items-center gap-1 min-h-8 px-2.5 rounded-full text-[11.5px] font-bold transition-colors',
            p.done
              ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
              : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/80 ring-1 ring-black/[0.07] dark:ring-white/[0.1] hover:ring-teal/40',
          ].join(' ')}
        >
          {p.done ? (
            <Check size={12} strokeWidth={3} aria-hidden />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-current opacity-60" aria-hidden />
          )}
          {p.label}
          {p.note && !p.done ? <span className="font-counter opacity-70">{p.note}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ComboRow({ combo, track }: { combo: TodayCombo; track?: TrackItem }) {
  const shown = track?.next ?? track?.top;
  const pct = Math.round((combo.doneCount / combo.parts.length) * 100);
  return (
    <div className="px-3 py-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        {shown ? (
          <BadgeEmblem
            icon={shown.badge.icon}
            rarity={shown.badge.rarity}
            unlocked={combo.done || shown.unlocked}
            pct={pct}
            size={46}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{combo.title}</span>
            <span
              className={[
                'shrink-0 font-counter tabular-nums text-xs font-bold',
                combo.done ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted',
              ].join(' ')}
            >
              {combo.done ? 'اكتمل اليوم' : `${toArabicDigits(combo.doneCount)}/${toArabicDigits(combo.parts.length)}`}
            </span>
          </p>
          {track?.next ? (
            <p className="text-[11px] text-text-muted truncate">
              التالي: «{track.next.badge.titleAr}»، {leftFor(track.next)}
            </p>
          ) : (
            <p className="text-[11px] text-gold-dark dark:text-gold-light">أتممتَ كل درجات هذا المسار</p>
          )}
        </div>
      </div>
      <PartChips parts={combo.parts} />
    </div>
  );
}

/**
 * «تحديات اليوم» — every combined day (اليوم المحفوظ، الكامل، الذهبي…) with
 * what is done today and what is left, each part one tap from where it's done.
 */
export function TodayChallenges({ only }: { only?: BadgeMetric[] } = {}) {
  const all = useBadgeMetrics().today;
  const today = only ? all.filter((c) => only.includes(c.metric)) : all;
  const model = useBadgeModel();
  const byMetric = new Map(model.tracks.map((t) => [t.metric, t]));
  const done = today.filter((c) => c.done).length;
  if (!today.length) return null;
  return (
    <div className="rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-1.5">
      <p className="px-3 pt-2 text-[11.5px] text-text-muted">
        {done > 0 ? `أتممتَ ${toArabicDigits(done)} من ${toArabicDigits(today.length)} اليوم — ` : ''}
        كل يومٍ تُكمله يُحتسب في مسار وسامه
      </p>
      {today.map((c, i) => (
        <div key={c.metric}>
          {i > 0 ? <div className="mx-3 h-px bg-black/[0.05] dark:bg-white/[0.06]" /> : null}
          <ComboRow combo={c} track={byMetric.get(c.metric)} />
        </div>
      ))}
    </div>
  );
}
