import { useEffect, useId, useState, type ReactNode } from 'react';
import { Award, Footprints, Scale, Target, TrendingUp } from 'lucide-react';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import type { RaceDay, VerdictKind } from '@/services/selfRace';

/** The icon beside a self-race verdict (selfRace.verdictOf) — the board and «أنا». */
export const VERDICT_ICON: Record<VerdictKind, typeof Award> = { record: Award, ahead: TrendingUp, behind: Target, even: Scale, start: Footprints };

/**
 * «سباقك مع نفسك» drawings — hand-built SVG like the stats charts (no chart lib).
 * Colours by token only: `currentColor` + text-* classes, gold stops by var().
 */

const R = 84;
const C = 100;
/** A 270° arc that opens at the bottom and fills right → left (RTL). */
const pt = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
};
const START = 45; // bottom-right
const SWEEP = 270;
const at = (f: number) => pt(START - SWEEP * Math.min(1, Math.max(0, f)));
const ARC = (() => {
  const [x0, y0] = pt(START);
  const [x1, y1] = pt(START - SWEEP);
  return `M ${x0} ${y0} A ${R} ${R} 0 1 0 ${x1} ${y1}`;
})();

/** Animate from 0 on mount (none under reduced motion — the CSS transition is off there). */
function useGrow(value: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return v;
}

/**
 * The hero gauge on the night card: my points as a gold arc, yesterday's me
 * (the ghost) as a hollow marker, my record as a gold one. `children` sit in the middle.
 */
export function RaceGauge({
  now,
  ghost,
  record,
  children,
}: {
  now: number;
  ghost: number;
  record: number | null;
  children: ReactNode;
}) {
  const gid = useId();
  const max = Math.max(10, now, ghost, record ?? 0) * 1.12;
  const f = useGrow(now / max);
  const broke = record != null && now > record;
  const [gx, gy] = at(ghost / max);
  const [rx, ry] = record ? at(record / max) : [0, 0];
  const [hx, hy] = at(f);
  return (
    <div className="relative mx-auto w-full max-w-[15.5rem] aspect-square">
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--color-gold)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-gold-light)' }} />
          </linearGradient>
        </defs>
        {/* ticks: the track's quarters */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const [x0, y0] = pt(START - SWEEP * t);
          const k = 1.12;
          return (
            <line
              key={t}
              x1={x0}
              y1={y0}
              x2={C + (x0 - C) * k}
              y2={C + (y0 - C) * k}
              className="text-text-on-dark/25"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })}
        <path d={ARC} fill="none" stroke="currentColor" strokeWidth={13} strokeLinecap="round" className="text-text-on-dark/[0.08]" />
        <path
          d={ARC}
          pathLength={100}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={13}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.01, f * 100)} 100`}
          className="transition-[stroke-dasharray] duration-1000 ease-out-soft motion-reduce:transition-none"
          style={broke ? { filter: 'drop-shadow(0 0 6px var(--color-gold))' } : undefined}
        />
        {ghost > 0 ? (
          <circle cx={gx} cy={gy} r={7.5} fill="var(--color-dark-bg)" stroke="currentColor" strokeWidth={2} strokeDasharray="2.6 2.2" className="text-text-on-dark/80" />
        ) : null}
        {record ? (
          <g transform={`translate(${rx} ${ry})`}>
            <rect x={-5.5} y={-5.5} width={11} height={11} rx={1.5} transform="rotate(45)" className="text-gold-light" fill="currentColor" />
            <circle r={2} fill="var(--color-dark-bg)" />
          </g>
        ) : null}
        {now > 0 ? <circle cx={hx} cy={hy} r={4} className="text-text-on-dark transition-all duration-1000 ease-out-soft motion-reduce:transition-none" fill="currentColor" /> : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">{children}</div>
    </div>
  );
}

/** The gauge's key: what the hollow and the gold markers are. */
export function GaugeLegend({ ghostLabel, ghost, record }: { ghostLabel: string; ghost: number; record: { points: number; label: string } | null }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] text-text-on-dark/75">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-3 h-3 rounded-full border-2 border-dashed border-text-on-dark/80" />
        {ghostLabel}: <b className="font-counter tabular-nums text-text-on-dark">{ar(ghost)}</b>
      </span>
      {record ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-2.5 h-2.5 rotate-45 rounded-[2px] bg-gold-light" />
          رقمك القياسي: <b className="font-counter tabular-nums text-text-on-dark">{ar(record.points)}</b>
        </span>
      ) : null}
    </div>
  );
}

/** The week day by day against last week's same days (outlined ghosts behind). */
export function GhostBars({ days, today }: { days: RaceDay[]; today: string }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.now ?? 0, d.ghost)));
  return (
    <ol className="grid grid-cols-7 items-end gap-1.5 h-36" aria-label="نقاط كل يوم مقابل الأسبوع الماضي">
      {days.map((d) => {
        const h = (n: number) => `${Math.max(3, (n / max) * 100)}%`;
        const ahead = d.now != null && d.now > d.ghost;
        return (
          <li
            key={d.key}
            className="flex flex-col items-center justify-end gap-1 h-full min-w-0"
            aria-label={`${d.label}: ${d.now == null ? 'لم يأتِ بعد' : ar(d.now)}، الأسبوع الماضي ${ar(d.ghost)}`}
          >
            <span className={['font-counter tabular-nums text-[10.5px] font-bold', ahead ? 'text-gold-dark dark:text-gold-light' : 'text-text-secondary dark:text-text-on-dark/80'].join(' ')}>
              {d.now != null ? ar(d.now) : ''}
            </span>
            <span className="relative w-full flex-1 flex items-end">
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 rounded-t-md border-[1.5px] border-dashed border-teal/45 dark:border-teal-light/40"
                style={{ height: d.ghost ? h(d.ghost) : 0 }}
              />
              <span
                aria-hidden
                className={[
                  'relative w-[72%] mx-auto rounded-t-md transition-[height] duration-700 ease-out-soft motion-reduce:transition-none',
                  d.key === today ? 'bg-[image:var(--gradient-gold)]' : ahead ? 'bg-gold/70' : 'bg-teal/35 dark:bg-teal/45',
                ].join(' ')}
                style={{ height: d.now ? h(d.now) : 0 }}
              />
            </span>
            <span className={['text-[9.5px] truncate max-w-full', d.key === today ? 'font-bold text-text-primary dark:text-text-on-dark' : 'text-text-muted'].join(' ')}>
              {d.label.replace('ال', '')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Two cumulative lines over the days of a month: this one (gold, so far) and
 * the one before (dashed) — where the gold line runs above, you are ahead.
 */
export function GhostLines({ now, ghost, days }: { now: number[]; ghost: number[]; days: number }) {
  const W = 300;
  const H = 120;
  const cum = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a[a.length - 1] ?? 0) + x], []);
  const a = cum(now);
  const b = cum(ghost);
  const max = Math.max(1, a[a.length - 1] ?? 0, b[b.length - 1] ?? 0);
  // RTL: the 1st of the month on the right.
  const x = (i: number) => W - (i / Math.max(1, days - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 8) - 4;
  const line = (xs: number[]) => xs.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = a.length - 1;
  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 overflow-visible" aria-hidden>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={W} y1={H * t} y2={H * t} stroke="currentColor" className="text-black/[0.05] dark:text-white/[0.06]" />
        ))}
        <path d={line(b)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" className="text-teal/60 dark:text-teal-light/55" />
        <path d={`${line(a)} L ${x(last)} ${H} L ${x(0)} ${H} Z`} fill="currentColor" className="text-gold/10" />
        <path d={line(a)} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" className="text-gold-dark dark:text-gold-light" />
        {last >= 0 ? <circle cx={x(last)} cy={y(a[last])} r={4.5} fill="currentColor" className="text-gold-dark dark:text-gold-light" /> : null}
      </svg>
      {/* RTL: the 1st on the right, the month's last day on the left. */}
      <span className="flex justify-between text-[10px] text-text-muted font-counter tabular-nums" aria-hidden>
        <span>يوم ١</span>
        <span>يوم {ar(days)}</span>
      </span>
    </div>
  );
}

/** The last seven days as small bars, the chosen one in gold, the average dashed across. */
export function WeekStrip({ days, avg, chosen }: { days: { key: string; label: string; points: number }[]; avg: number | null; chosen: string }) {
  const max = Math.max(1, avg ?? 0, ...days.map((d) => d.points));
  // Bars and the average share one box, so one scale: 78% leaves room for the numbers.
  const pct = (n: number) => `${(n / max) * 78}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-24">
        <ol className="absolute inset-0 grid grid-cols-7 gap-1.5" aria-label="آخر سبعة أيام">
          {days.map((d) => (
            <li key={d.key} className="flex flex-col items-center justify-end h-full min-w-0" aria-label={`${d.label}: ${ar(d.points)}`}>
              <span className="mb-0.5 font-counter tabular-nums text-[10px] font-bold text-text-secondary dark:text-text-on-dark/80">{d.points ? ar(d.points) : ''}</span>
              <span
                aria-hidden
                className={['w-[72%] rounded-t-md', d.key === chosen ? 'bg-[image:var(--gradient-gold)]' : 'bg-teal/30 dark:bg-teal/40'].join(' ')}
                style={{ height: d.points ? pct(d.points) : '4%' }}
              />
            </li>
          ))}
        </ol>
        {avg ? (
          <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-gold/70 pointer-events-none" style={{ bottom: pct(avg) }} />
        ) : null}
      </div>
      <div className="grid grid-cols-7 gap-1.5" aria-hidden>
        {days.map((d) => (
          <span
            key={d.key}
            className={['text-center text-[9.5px] truncate', d.key === chosen ? 'font-bold text-text-primary dark:text-text-on-dark' : 'text-text-muted'].join(' ')}
          >
            {d.label.replace('ال', '')}
          </span>
        ))}
      </div>
      {avg ? (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <span aria-hidden className="w-4 border-t border-dashed border-gold/70" />
          معدّلك {ar(avg)}
        </p>
      ) : null}
    </div>
  );
}
