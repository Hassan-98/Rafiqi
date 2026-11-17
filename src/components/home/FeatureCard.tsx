import type { ReactNode } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, Star8 } from '@/components/ui/Ornament';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { Mosque } from '@/components/icons/Mosque';
import type { HomeFeature } from './dayTime';

/** Everything Home needs to show one of the star features, live. */
export interface FeatureView {
  key: HomeFeature;
  Icon: LucideIcon | typeof Mosque;
  title: string;
  /** Why it's spotlighted now, e.g. "وقتها الآن". */
  kicker: string;
  /** Live status line, e.g. "٣ من ٣١ ذكراً". */
  status: string;
  /** 0–100. */
  pct: number;
  done: boolean;
  /** Nothing to do here yet/now (not set up, or its window passed) — never spotlighted. */
  idle?: boolean;
  cta: string;
  onOpen: () => void;
  /** Spotlight-only extra content (chips, time window…). */
  extra?: ReactNode;
  /** Spotlight-only second action (e.g. one-tap log). */
  secondary?: { label: string; onClick: () => void; Icon?: LucideIcon };
  /** Render the spotlight on the night surface (قيام). */
  night?: boolean;
}

const RING_ACCENT = { from: 'var(--color-teal)', to: 'var(--color-teal-light)' };
const RING_DONE = { from: 'var(--color-gold)', to: 'var(--color-gold-light)' };

function RingIcon({ view, size, stroke, night }: { view: FeatureView; size: number; stroke: number; night?: boolean }) {
  const { Icon } = view;
  const c = view.done ? RING_DONE : RING_ACCENT;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <ProgressRing
        value={view.done ? 100 : view.pct}
        size={size}
        strokeWidth={stroke}
        showPercent={false}
        colorFrom={c.from}
        colorTo={c.to}
        trackColor={night ? 'color-mix(in srgb, var(--color-text-on-dark) 14%, transparent)' : undefined}
      />
      <span
        className={[
          'absolute inset-0 flex items-center justify-center',
          night
            ? 'text-gold-light'
            : view.done
              ? 'text-gold-dark dark:text-gold-light'
              : 'text-teal dark:text-teal-light',
        ].join(' ')}
      >
        {view.done ? <Check size={size * 0.36} strokeWidth={2.6} /> : <Icon size={size * 0.36} strokeWidth={1.9} />}
      </span>
    </span>
  );
}

/** The one feature Home spotlights right now — large, with a clear action. */
export function FeatureSpotlight({ view }: { view: FeatureView }) {
  const night = !!view.night;
  return (
    <Card variant={night ? 'night' : 'gradient-edge'} className="p-5">
      <ArchMotif className="absolute -top-5 -end-7 w-36 text-gold opacity-[0.13]" />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
              night ? 'bg-gold/20 text-gold-light' : 'bg-gold/15 text-gold-dark dark:text-gold-light',
            ].join(' ')}
          >
            <Star8 size={10} />
            {view.kicker}
          </span>
          <h3
            className={[
              'mt-2.5 font-display text-[22px] font-bold leading-tight text-balance',
              night ? 'text-text-on-dark' : 'text-text-primary dark:text-text-on-dark',
            ].join(' ')}
          >
            {view.title}
          </h3>
          <p
            className={[
              'mt-1 text-[13px] text-pretty',
              night ? 'text-text-on-dark/70' : 'text-text-secondary dark:text-text-on-dark/70',
            ].join(' ')}
          >
            {view.status}
          </p>
        </div>
        <RingIcon view={view} size={74} stroke={6} night={night} />
      </div>
      {view.extra ? <div className="relative mt-4">{view.extra}</div> : null}
      <div className="relative mt-4 flex gap-2">
        <Button fullWidth onClick={view.onOpen} rightIcon={<ChevronLeft size={17} />}>
          {view.cta}
        </Button>
        {view.secondary ? (
          <Button
            variant={night ? 'gold' : 'secondary'}
            onClick={view.secondary.onClick}
            leftIcon={view.secondary.Icon ? <view.secondary.Icon size={16} /> : undefined}
            className="shrink-0"
          >
            {view.secondary.label}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** A compact live row for the features that aren't spotlighted. */
export function FeatureRow({ view, first }: { view: FeatureView; first: boolean }) {
  return (
    <button
      type="button"
      onClick={view.onOpen}
      className={[
        'w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start',
        'transition-colors duration-200 hover:bg-teal/5 active:bg-teal/8',
        first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]',
      ].join(' ')}
    >
      <RingIcon view={view} size={46} stroke={4} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{view.title}</span>
        <span className="block mt-0.5 text-[11.5px] text-text-muted truncate">{view.status}</span>
      </span>
      {view.done ? (
        <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-dark dark:text-gold-light">
          تمّ
        </span>
      ) : view.pct > 0 ? (
        <span className="shrink-0 text-xs font-counter font-bold tabular-nums text-teal dark:text-teal-light">
          {toArabicDigits(Math.round(view.pct))}٪
        </span>
      ) : null}
      <ChevronLeft size={16} className="shrink-0 text-text-muted" />
    </button>
  );
}
