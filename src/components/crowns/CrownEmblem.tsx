import { memo, useId, useMemo } from 'react';
import { emblemLabel, emblemOf, type Emblem, type Person } from '@/services/crowns';
import { useCrowns } from '@/services/leaderboard';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * «التيجان» — one combined emblem, each period adding its own mark:
 *   اليوم    a slim three-point crown, a crescent cradling a star on its peak
 *   الأسبوع  the royal five-point crown inside an arabesque laurel wreath
 *   الشهر    the royal crown on a night-blue eight-point seal, jewelled band, a slow sheen
 *   الكامل   all of it, with a radiant halo of rays
 * A dominant lead (≥ 25% over #2) adds a twinkling four-point star; a field of
 * 2–4 people draws the quiet crown: flat gold, no jewels, rays or motion. Colours are tokens
 * (gold-*, teal-*, --crown-gem-*), so every palette and mode works.
 * Drawn on a 48-unit grid; `size` = the px height of the bare crown.
 */

const rad = (d: number) => (d * Math.PI) / 180;
function star(n: number, outer: number, inner: number, cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rad(-90 + (i * 180) / n);
    const r = i % 2 ? inner : outer;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Crown bodies: tips joined by scalloped arches, on a gently smiling band.
const ROYAL = 'M12.6 32 L11 19 Q14.3 28.4 17.5 15.6 Q20.8 27.2 24 11.4 Q27.2 27.2 30.5 15.6 Q33.7 28.4 37 19 L35.4 32 Z';
const ROYAL_TIPS: [number, number][] = [[11, 19], [17.5, 15.6], [24, 11.4], [30.5, 15.6], [37, 19]];
const ROYAL_BAND = 'M11.6 30.4 Q24 33.8 36.4 30.4 L36.4 36 Q24 39.4 11.6 36 Z';
const SLIM = 'M14.4 32 L12.8 20.4 Q18.8 29.6 24 12.4 Q29.2 29.6 35.2 20.4 L33.6 32 Z';
const SLIM_TIPS: [number, number][] = [[12.8, 20.4], [24, 12.4], [35.2, 20.4]];
const SLIM_BAND = 'M13.8 30.8 Q24 33.4 34.2 30.8 L34.2 35.2 Q24 37.8 13.8 35.2 Z';

// The laurel: paired leaves along an arc from the bottom knot up the left side (mirrored for the right).
const LAUREL_C = { x: 24, y: 24.5, r: 20.6 };
const onArc = (deg: number) => [LAUREL_C.x + LAUREL_C.r * Math.cos(rad(deg)), LAUREL_C.y + LAUREL_C.r * Math.sin(rad(deg))];
const STEM = (() => {
  const [x1, y1] = onArc(100);
  const [x2, y2] = onArc(212);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${LAUREL_C.r} ${LAUREL_C.r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
})();
const LEAVES = [108, 127, 146, 165, 184, 203].flatMap((deg, i) => {
  const [x, y] = onArc(deg);
  const along = deg + 90; // the stem's direction, growing upward
  const s = 1 - i * 0.05;
  return [
    { x, y, rot: along - 38, s },
    { x, y, rot: along + 34, s: s * 0.92 },
  ];
});
const TIP_LEAF = (() => {
  const [x, y] = onArc(212);
  return { x, y, rot: 212 + 90 - 4, s: 0.95 };
})();
const LEAF = 'M0 0 Q2.7 -1.55 5.6 0 Q2.7 1.55 0 0 Z';

/** An eight-point seal turned half a point, so a valley (not a spike) sits under the finial. */
function seal(outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rad(-90 + i * 22.5);
    const r = i % 2 ? outer : inner;
    pts.push(`${(24 + r * Math.cos(a)).toFixed(2)},${(24.4 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const SEAL = seal(22.6, 17.6);
const SEAL_SMALL = seal(18.4, 14.3);
/** Tapered rays: many fine ones for a large emblem, a few bold ones inline. */
function rays(n: number, r1: number, long: number, short: number, half: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -90 + (i * 360) / n;
    const r2 = i % 2 ? short : long;
    const p = (r: number, d: number) => `${(24 + r * Math.cos(rad(d))).toFixed(2)},${(24.4 + r * Math.sin(rad(d))).toFixed(2)}`;
    return `${p(r1, a - half)} ${p(r2, a)} ${p(r1, a + half)}`;
  });
}
const RAYS_FINE = rays(40, 17, 29, 24.5, 2.1);
const RAYS_BOLD = rays(16, 18, 28, 24.5, 5.5);
const TWINKLE = 'M0 -5.2 Q1.1 -1.1 5.2 0 Q1.1 1.1 0 5.2 Q-1.1 1.1 -5.2 0 Q-1.1 -1.1 0 -5.2 Z';

// Boxes (x y w h): the bare crown, framed (wreath / seal), radiant (rays).
const BOX_CROWN = [7, 2.6, 34, 37] as const;
const BOX_FRAMED = [-0.5, -0.5, 49, 49] as const;
const BOX_RADIANT = [-5.5, -5.1, 59, 59] as const;

export interface CrownEmblemProps {
  emblem: Pick<Emblem, 'periods' | 'dominant' | 'quiet'>;
  /** Px height of the bare crown; framed / radiant emblems grow around it. */
  size?: number;
  /** Sheen, twinkle and the turning rays (CSS; off under reduced motion). */
  animate?: boolean;
  className?: string;
}

export const CrownEmblem = memo(function CrownEmblem({ emblem, size = 16, animate = true, className = '' }: CrownEmblemProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (k: string) => `cr-${uid}-${k}`;
  const day = emblem.periods.includes('day');
  const week = emblem.periods.includes('week');
  const month = emblem.periods.includes('month');
  const full = day && week && month;
  const quiet = emblem.quiet;
  const royal = week || month;
  const radiant = full && !quiet;
  const framed = week || month;
  const box = radiant ? BOX_RADIANT : framed ? BOX_FRAMED : BOX_CROWN;
  const unit = size / BOX_CROWN[3];
  const w = box[2] * unit;
  const h = box[3] * unit;
  const body = royal ? ROYAL : SLIM;
  const band = royal ? ROYAL_BAND : SLIM_BAND;
  const tips = royal ? ROYAL_TIPS : SLIM_TIPS;
  const finialY = royal ? 11.4 : 12.4;
  const ink = quiet ? 'var(--color-gold)' : `url(#${id('gold')})`;
  const sparkle = emblem.dominant && !quiet;
  const motion = animate && !quiet;

  return (
    <svg
      viewBox={box.join(' ')}
      width={w}
      height={h}
      className={['shrink-0 overflow-visible', className].join(' ')}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={id('gold')} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-gold-light)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--color-gold)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-dark)' }} />
        </linearGradient>
        <linearGradient id={id('leaf')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-gold-light)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-dark)' }} />
        </linearGradient>
        <linearGradient id={id('night')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-teal-dark)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-dark-bg)' }} />
        </linearGradient>
        <radialGradient id={id('halo')}>
          <stop offset="0.35" style={{ stopColor: 'var(--color-gold-light)', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-light)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={id('ray')} gradientUnits="userSpaceOnUse" cx="24" cy="24.4" r="29">
          <stop offset="0.55" style={{ stopColor: 'var(--color-gold-light)', stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold)', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.85" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('clip')}>
          <path d={body} />
          <path d={band} />
        </clipPath>
        <mask id={id('moon')}>
          <circle cx="24" cy={finialY - 3.7} r="3.4" fill="white" />
          <circle cx="24" cy={finialY - 5.2} r="2.85" fill="black" />
        </mask>
      </defs>

      {/* ── the full crown: halo and rays ── */}
      {radiant ? (
        <>
          <circle cx="24" cy="24.4" r="29" fill={`url(#${id('halo')})`} className={motion ? 'badge-glow' : undefined} />
          <g className={motion ? 'badge-spin' : undefined} fill={`url(#${id('ray')})`}>
            {(size >= 40 ? RAYS_FINE : RAYS_BOLD).map((pts, i) => (
              <polygon key={i} points={pts} />
            ))}
          </g>
        </>
      ) : null}

      {/* ── the month: an eight-point seal ── */}
      {month ? (
        <polygon
          points={week ? SEAL_SMALL : SEAL}
          fill={quiet ? 'none' : `url(#${id('night')})`}
          stroke="var(--color-gold)"
          strokeWidth={quiet ? 1.3 : 1.1}
          strokeLinejoin="round"
        />
      ) : null}
      {month && !quiet ? (
        <circle cx="24" cy="24.4" r={week ? 13.6 : 15.4} fill="none" stroke="var(--color-gold-light)" strokeWidth="0.45" strokeOpacity="0.55" strokeDasharray="0.6 1.4" />
      ) : null}

      {/* ── the week: an arabesque laurel ── */}
      {week ? (
        <g>
          {[0, 1].map((side) => (
            <g key={side} transform={side ? 'matrix(-1 0 0 1 48 0)' : undefined}>
              <path d={STEM} fill="none" stroke="var(--color-gold-dark)" strokeWidth="0.7" strokeLinecap="round" />
              {[...LEAVES, TIP_LEAF].map((l, i) => (
                <path
                  key={i}
                  d={LEAF}
                  transform={`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.rot.toFixed(1)}) scale(${l.s.toFixed(2)})`}
                  fill={quiet ? 'var(--color-gold)' : `url(#${id('leaf')})`}
                  stroke="var(--color-gold-dark)"
                  strokeWidth="0.35"
                />
              ))}
            </g>
          ))}
          <circle cx="24" cy="45.2" r="1.5" fill={quiet ? 'var(--color-gold)' : 'var(--crown-gem-ruby)'} stroke="var(--color-gold-dark)" strokeWidth="0.5" />
        </g>
      ) : null}

      {/* ── the crown (a touch smaller when both the seal and the wreath frame it) ── */}
      <g strokeLinejoin="round" transform={week && month ? 'translate(24 26) scale(0.84) translate(-24 -26)' : undefined}>
        <path d={body} fill={ink} stroke="var(--color-gold-dark)" strokeWidth="0.75" />
        {/* facets: a fine light line from each inner tip down to the band */}
        {!quiet
          ? tips.slice(1, -1).map(([x, y]) => (
              <path key={x} d={`M${x} ${y + 2.4} L${x + (24 - x) * 0.08} 30.6`} stroke="var(--color-gold-light)" strokeWidth="0.5" strokeOpacity="0.55" strokeLinecap="round" />
            ))
          : null}
        <path d={band} fill={ink} stroke="var(--color-gold-dark)" strokeWidth="0.75" />
        {!quiet ? (
          <path
            d={royal ? 'M12.6 31.4 Q24 34.6 35.4 31.4' : 'M14.6 31.8 Q24 34.2 33.4 31.8'}
            fill="none"
            stroke="var(--color-gold-light)"
            strokeWidth="0.55"
            strokeOpacity="0.9"
          />
        ) : null}
        {tips.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={royal ? 1.75 : 1.6}
            fill="var(--color-gold-light)"
            stroke="var(--color-gold-dark)"
            strokeWidth="0.5"
          />
        ))}
        {/* month: a jewelled band */}
        {month && !quiet ? (
          <>
            <path d="M24 32.6 L26.3 35 L24 37.4 L21.7 35 Z" fill="var(--crown-gem-emerald)" stroke="var(--color-gold-dark)" strokeWidth="0.45" />
            <path d="M23.2 34 L24 33.3 L24.6 34.1 Z" fill="white" fillOpacity="0.75" />
            <circle cx="17.3" cy="34.3" r="1.35" fill="var(--crown-gem-ruby)" stroke="var(--color-gold-dark)" strokeWidth="0.4" />
            <circle cx="30.7" cy="34.3" r="1.35" fill="var(--crown-gem-ruby)" stroke="var(--color-gold-dark)" strokeWidth="0.4" />
            {[14, 20.7, 27.3, 34].map((x) => (
              <circle key={x} cx={x} cy={x === 14 || x === 34 ? 33.3 : 34.6} r="0.62" fill="var(--color-gold-light)" />
            ))}
          </>
        ) : null}
        {/* week only: a single gem at the band's heart */}
        {week && !month && !quiet ? (
          <circle cx="24" cy="34.8" r="1.4" fill="var(--crown-gem-emerald)" stroke="var(--color-gold-dark)" strokeWidth="0.45" />
        ) : null}

      {/* the finial: the day's crescent and star, else an eight-point star */}
      {day ? (
        <>
          <rect x="18" y={finialY - 8} width="12" height="8" fill={ink} mask={`url(#${id('moon')})`} />
          <circle cx="24" cy={finialY - 3.7} r="3.4" fill="none" stroke="var(--color-gold-dark)" strokeWidth="0.45" mask={`url(#${id('moon')})`} />
          <polygon points={star(5, 1.35, 0.6, 24, finialY - 5.1)} fill={quiet ? 'var(--color-gold)' : 'var(--color-gold-light)'} />
        </>
      ) : (
        <polygon
          points={star(8, 2.9, 1.55, 24, finialY - 3)}
          fill={ink}
          stroke="var(--color-gold-dark)"
          strokeWidth="0.4"
        />
      )}

      {/* the month's sheen */}
      {month && motion ? (
        <g clipPath={`url(#${id('clip')})`}>
          <polygon className="crown-sheen" points="9,6 16,6 11,42 4,42" fill={`url(#${id('sheen')})`} />
        </g>
      ) : null}
      </g>

      {/* a dominant lead */}
      {sparkle ? (
        <path
          d={TWINKLE}
          transform={radiant ? 'translate(41.5 6.5)' : framed ? 'translate(41 7)' : 'translate(37.2 7.2)'}
          fill="var(--color-gold-light)"
          stroke="var(--color-gold-dark)"
          strokeWidth="0.35"
          className={motion ? 'crown-twinkle' : undefined}
        />
      ) : null}
    </svg>
  );
});

/**
 * The emblem beside a name, with its «×٣» run and a tooltip / accessible name
 * («تاج الأسبوع · ٣ أسابيع متتالية»). `onAccent` for the teal hero cards.
 */
export function CrownMark({
  emblem,
  size = 16,
  onAccent = false,
  counter = true,
  className = '',
}: {
  emblem: Emblem;
  size?: number;
  onAccent?: boolean;
  /** false where the run is already spelled out beside it (the standing chip). */
  counter?: boolean;
  className?: string;
}) {
  const label = emblemLabel(emblem);
  return (
    <span role="img" aria-label={label} title={label} className={['inline-flex items-center gap-0.5 shrink-0 align-middle', className].join(' ')}>
      <CrownEmblem emblem={emblem} size={size} />
      {counter && emblem.streak ? (
        <span
          aria-hidden
          className={[
            // A quiet annotation beside the name, not a second headline (owner 2026-11-18).
            'font-counter font-semibold leading-none tabular-nums opacity-90',
            size >= 22 ? 'text-[10.5px]' : 'text-[9.5px]',
            onAccent ? 'text-gold-light' : 'text-gold-dark dark:text-gold-light',
          ].join(' ')}
        >
          ×{toArabicDigits(emblem.streak.n)}
        </span>
      ) : null}
    </span>
  );
}

/** A person's crowns right now (from the global board), or nothing. */
export function PersonCrown({ who, size, onAccent, className }: { who: Person; size?: number; onAccent?: boolean; className?: string }) {
  const crowns = useCrowns();
  const { name, tag, isMe } = who;
  const emblem = useMemo(() => emblemOf(crowns, { name, tag, isMe }), [crowns, name, tag, isMe]);
  return emblem ? <CrownMark emblem={emblem} size={size} onAccent={onAccent} className={className} /> : null;
}

/** My own crowns (Home greeting, «أنا»). */
export function useMyEmblem(): Emblem | null {
  const crowns = useCrowns();
  return useMemo(() => emblemOf(crowns, { name: null, tag: -1, isMe: true }), [crowns]);
}
