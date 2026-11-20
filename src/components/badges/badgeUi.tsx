import { BookOpen, CalendarHeart, Flame, Gem, Gift, GraduationCap, HeartHandshake, Landmark, ListChecks, Moon, MoonStar, Sparkles, Sprout, Sun, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { arCount } from '@/services/insightsEngine';
import { RARITY_LABEL_AR, RARITY_POINTS, unitOf, type BadgeCategory, type BadgeRarity } from '@/data/badges';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { BadgeItem } from '@/services/badgeMetrics';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';

export const CATEGORY_ICON: Record<BadgeCategory, LucideIcon | typeof Mosque> = {
  days: Gem,
  prayer: Mosque,
  sunnah: Sun,
  mosque: Landmark,
  qiyam: MoonStar,
  dhikr: Sparkles,
  quran: BookOpen,
  awrad: Target,
  fasting: Moon,
  seasons: CalendarHeart,
  sadaqah: Gift,
  silat: HeartHandshake,
  knowledge: GraduationCap,
  habits: ListChecks,
  tazkiya: Sprout,
  steadfast: Flame,
};

export const RARITY_PILL: Record<BadgeRarity, string> = {
  common: 'bg-teal/10 text-teal dark:text-teal-light',
  rare: 'bg-teal/15 text-teal-dark dark:text-teal-light',
  epic: 'bg-gold/15 text-gold-dark dark:text-gold-light',
  legendary: 'bg-[image:var(--gradient-gold)] text-on-accent',
  mythic: 'bg-[image:var(--gradient-night)] text-gold-light ring-1 ring-gold/40',
};

export const RARITY_BAR: Record<BadgeRarity, string> = {
  common: 'bg-teal',
  rare: 'bg-teal-light',
  epic: 'bg-gold',
  legendary: 'bg-[image:var(--gradient-gold)]',
  mythic: 'bg-[image:var(--gradient-gold)]',
};

/** «٣ أيام» — a badge's own unit. */
export const countFor = (it: BadgeItem, n: number) => arCount(n, ...unitOf(it.badge));

/** «بقي ٣ أيام» while locked. */
export const leftFor = (it: BadgeItem) => `بقي ${countFor(it, Math.max(0, it.target - it.current))}`;

export function RarityPill({ rarity, points = false }: { rarity: BadgeRarity; points?: boolean }) {
  return (
    <span className={['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold', RARITY_PILL[rarity]].join(' ')}>
      {RARITY_LABEL_AR[rarity]}
      {points ? (
        <>
          <span className="w-px h-3 bg-current opacity-35" aria-hidden />
          <span className="font-counter opacity-85">{toArabicDigits(RARITY_POINTS[rarity])} نقطة</span>
        </>
      ) : null}
    </span>
  );
}

export function ProgressBar({ pct, rarity, className = '' }: { pct: number; rarity: BadgeRarity; className?: string }) {
  return (
    <div
      className={['h-1.5 rounded-full bg-cream-dark/70 dark:bg-white/10 overflow-hidden', className].join(' ')}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={['h-full rounded-full transition-[width] duration-300 ease-out-soft', RARITY_BAR[rarity]].join(' ')}
        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
      />
    </div>
  );
}

export const badgeDate = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });

/** The level's seal grows richer with rank: disc → star → rosette → khatam → night star. */
export const levelRarity = (rank: number): BadgeRarity =>
  rank >= 12 ? 'mythic' : rank >= 9 ? 'legendary' : rank >= 6 ? 'epic' : rank >= 4 ? 'rare' : 'common';

const LEVEL_INK: Record<BadgeRarity, string> = {
  common: 'text-teal dark:text-teal-light',
  rare: 'text-teal dark:text-teal-light',
  epic: 'text-gold-dark dark:text-gold-light',
  legendary: 'text-gold-dark dark:text-gold',
  mythic: 'text-gold-light',
};

export function LevelSeal({ rank, size = 64, animate = true, onDark = false }: { rank: number; size?: number; animate?: boolean; onDark?: boolean }) {
  const rarity = levelRarity(rank);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-label={`المستوى ${toArabicDigits(rank)}`}>
      <BadgeEmblem icon="" rarity={rarity} unlocked size={size} animate={animate} />
      <span
        className={['absolute inset-0 flex items-center justify-center font-counter font-bold leading-none', onDark && rarity !== 'legendary' ? 'text-gold-light' : LEVEL_INK[rarity]].join(' ')}
        style={{ fontSize: size * 0.3 }}
        aria-hidden
      >
        {toArabicDigits(rank)}
      </span>
    </span>
  );
}
