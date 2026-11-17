import { memo, useId } from 'react';
import { Lock } from 'lucide-react';
import type { BadgeRarity } from '@/data/badges';

/**
 * A badge seal — one silhouette per rarity, all token-coloured:
 *  عادي    a ringed disc (accent)
 *  نادر    an eight-point star (accent)
 *  ملحمي   a twelve-point rosette (gold)
 *  أسطوري  a gilded khatam with rays and a sheen
 *  فريد    a night-blue sixteen-point star, gold rings, a turning halo
 * Locked: muted, with a progress ring; `mystery` = a secret not yet found.
 */

function star(n: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((-90 + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 ? inner : outer;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const STAR8 = star(8, 47, 40);
const ROSETTE12 = star(12, 47, 42);
const KHATAM = star(8, 47, 35);
const STAR16 = star(16, 47, 39);
const RAYS = Array.from({ length: 24 }, (_, i) => {
  const a = ((i * 15 - 90) * Math.PI) / 180;
  return { x1: 50 + 41 * Math.cos(a), y1: 50 + 41 * Math.sin(a), x2: 50 + 50 * Math.cos(a), y2: 50 + 50 * Math.sin(a) };
});

export interface BadgeEmblemProps {
  icon: string;
  rarity: BadgeRarity;
  unlocked: boolean;
  size?: number;
  /** Locked progress, 0–100 (drawn as a ring). */
  pct?: number;
  /** A hidden badge not found yet. */
  mystery?: boolean;
  /** Motion for the top rarities (off in dense lists). */
  animate?: boolean;
  className?: string;
}

export const BadgeEmblem = memo(function BadgeEmblem({
  icon,
  rarity,
  unlocked,
  size = 64,
  pct = 0,
  mystery = false,
  animate = false,
  className = '',
}: BadgeEmblemProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gold = `bg-${uid}-g`;
  const night = `bg-${uid}-n`;
  const top = rarity === 'legendary' || rarity === 'mythic';
  const tone = unlocked ? '' : 'text-text-muted/70 dark:text-text-on-dark/35';

  return (
    <span
      className={['relative inline-flex items-center justify-center shrink-0', className].join(' ')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-gold-light)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--color-gold)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-gold-dark)' }} />
          </linearGradient>
          <linearGradient id={night} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-teal-dark)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-dark-bg)' }} />
          </linearGradient>
        </defs>

        {mystery ? (
          <g className="text-text-muted dark:text-text-on-dark/50">
            <circle cx="50" cy="50" r="44" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
          </g>
        ) : !unlocked ? (
          <g className={tone}>
            {rarity === 'common' ? (
              <circle cx="50" cy="50" r="44" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
            ) : (
              <polygon
                points={rarity === 'rare' ? STAR8 : rarity === 'epic' ? ROSETTE12 : rarity === 'legendary' ? KHATAM : STAR16}
                fill="currentColor"
                fillOpacity="0.08"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}
            <circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
          </g>
        ) : rarity === 'common' ? (
          <g className="text-teal dark:text-teal-light">
            <circle cx="50" cy="50" r="44" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" />
          </g>
        ) : rarity === 'rare' ? (
          <g className="text-teal dark:text-teal-light">
            <polygon points={STAR8} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="50" cy="50" r="33" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
          </g>
        ) : rarity === 'epic' ? (
          <g className="text-gold dark:text-gold-light">
            <polygon points={ROSETTE12} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="50" cy="50" r="31" fill="currentColor" fillOpacity="0.1" />
          </g>
        ) : rarity === 'legendary' ? (
          <g>
            <g className="text-gold" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
              {RAYS.map((r, i) => (
                <line key={i} {...r} />
              ))}
            </g>
            <polygon points={KHATAM} fill={`url(#${gold})`} strokeLinejoin="round" />
            <circle cx="50" cy="50" r="30" className="text-white dark:text-dark-card" fill="currentColor" />
            <circle cx="50" cy="50" r="30" fill="none" className="text-gold-dark dark:text-gold" stroke="currentColor" strokeWidth="2" />
          </g>
        ) : (
          <g>
            {animate ? <circle cx="50" cy="50" r="47" className="text-gold badge-glow" fill="currentColor" fillOpacity="0.25" /> : null}
            <g className={['text-gold-light', animate ? 'badge-spin' : ''].join(' ')}>
              <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 5.8" />
            </g>
            <polygon points={STAR16} fill={`url(#${night})`} className="text-gold" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="50" cy="50" r="31" fill="none" stroke={`url(#${gold})`} strokeWidth="2.4" />
            <circle cx="50" cy="50" r="27" fill="none" className="text-gold-light" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.7" />
          </g>
        )}

        {!unlocked && !mystery && pct > 0 ? (
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            className="text-teal dark:text-teal-light"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(2, Math.min(99, pct))} 100`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
      </svg>

      {unlocked && top && animate ? (
        <span className="badge-sheen" style={{ inset: size * 0.2 }} />
      ) : null}

      {mystery ? (
        <span className="relative font-display font-bold text-text-muted dark:text-text-on-dark/60" style={{ fontSize: size * 0.4 }}>
          ؟
        </span>
      ) : (
        <span
          className={['relative leading-none select-none', unlocked ? '' : 'grayscale opacity-45'].join(' ')}
          style={{ fontSize: size * (top ? 0.3 : 0.36) }}
        >
          {icon}
        </span>
      )}

      {!unlocked && !mystery && size >= 44 ? (
        <span className="absolute -bottom-0.5 end-0 w-[30%] h-[30%] min-w-4 min-h-4 rounded-full bg-white dark:bg-dark-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] inline-flex items-center justify-center text-text-muted">
          <Lock size={Math.max(9, size * 0.14)} strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  );
});
