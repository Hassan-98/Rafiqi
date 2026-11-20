import { useMemo, type ReactNode } from 'react';
import {
  AlarmClock, BadgeCheck, BookOpen, BookOpenCheck, Footprints, Hand, House, MoonStar, Moon, Pause, ShieldCheck, Sparkles, Sun,
  TrendingUp, type LucideIcon,
} from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Star8 } from '@/components/ui/Ornament';
import { useProgramsStore } from '@/store/programsStore';
import { useProgramSources } from '@/services/programsSources';
import { useNow } from '@/components/study/studyUi';
import { evaluateRun, milestonesOf, type DayEval, type DayState, type RunEval } from '@/store/programsModel';
import type { ProgramIcon, ProgramTemplate, Source } from '@/data/programsCatalog';
import { parseKey } from '@/store/studyModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

const GLYPH: Record<Exclude<ProgramIcon, 'mosque'>, LucideIcon> = {
  takbeer: Footprints,
  clock: AlarmClock,
  rawatib: House,
  sun: Sun,
  moon: MoonStar,
  adhkar: Sparkles,
  istighfar: Hand,
  quran: BookOpen,
  khatma: BookOpenCheck,
  fast: Moon,
  shield: ShieldCheck,
  custom: TrendingUp,
};

export function ProgramGlyph({ icon, size = 20, className = '' }: { icon: ProgramIcon; size?: number; className?: string }) {
  if (icon === 'mosque') return <Mosque size={size} className={className} />;
  const G = GLYPH[icon];
  return <G size={size} className={className} strokeWidth={1.9} aria-hidden />;
}

/** The program's icon chip — gold for the «همّة عالية» level. */
export function IconChip({ def, size = 44 }: { def: Pick<ProgramTemplate, 'icon' | 'level'>; size?: number }) {
  const tone =
    def.level === 3 ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light';
  return (
    <span className={`inline-flex items-center justify-center rounded-2xl shrink-0 ${tone}`} style={{ width: size, height: size }}>
      <ProgramGlyph icon={def.icon} size={Math.round(size * 0.46)} />
    </span>
  );
}

/** Runs evaluated against the live stores, re-walked each minute. */
export function useProgramEvals() {
  const runs = useProgramsStore((s) => s.runs);
  const src = useProgramSources();
  const now = useNow(60_000);
  const evals = useMemo(() => new Map(runs.map((r) => [r.id, evaluateRun(r, src, new Date(now))])), [runs, src, now]);
  return { runs, evals, src, now };
}

export const isRunning = (status: string, ev: RunEval | undefined) => status === 'active' && !ev?.finishedOn;

export const STATE_LABEL: Record<DayState, string> = {
  done: 'تمّ',
  pending: 'بانتظارك',
  missed: 'فات',
  rest: 'يوم استراحة',
  paused: 'موقوف مؤقتاً',
  excused: 'يوم عذر',
};

export function StatePill({ day, className = '' }: { day: Pick<DayEval, 'state' | 'auto'> | null; className?: string }) {
  if (!day) return null;
  const tone =
    day.state === 'done'
      ? 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light'
      : day.state === 'pending'
        ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
        : day.state === 'missed'
          ? 'bg-danger/10 text-danger'
          : 'bg-cream-dark/70 dark:bg-white/[0.07] text-text-secondary dark:text-text-on-dark/70';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone} ${className}`}>
      {day.state === 'done' && day.auto ? <BadgeCheck size={12} aria-hidden /> : null}
      {day.state === 'paused' ? <Pause size={11} aria-hidden /> : null}
      {day.state === 'done' && day.auto ? 'تحقّق تلقائياً' : STATE_LABEL[day.state]}
    </span>
  );
}

/** Thin progress bar with milestone ticks. */
export function ProgressBar({ ev, className = '' }: { ev: RunEval; className?: string }) {
  const pct = (ev.finishedOn ? 1 : ev.step / ev.total) * 100;
  const marks = milestonesOf(ev.def).filter((m) => m.kind !== 'final');
  return (
    <div
      className={`relative h-2 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={ev.total}
      aria-valuenow={ev.finishedOn ? ev.total : ev.step}
    >
      <span
        className="absolute inset-y-0 start-0 rounded-full bg-[image:var(--gradient-teal)] transition-[width] duration-300 ease-out-soft"
        style={{ width: `${pct}%` }}
      />
      {marks.map((m) => (
        <span
          key={m.step}
          className="absolute inset-y-0 w-px bg-white/70 dark:bg-dark-bg/70"
          style={{ insetInlineStart: `${(m.step / ev.total) * 100}%` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

/** The schedule as a staircase: done steps filled, today's in gold. Step 1 at the right (RTL). */
export function StepStairs({ steps, done = 0, current = -1, className = '' }: { steps: number[]; done?: number; current?: number; className?: string }) {
  const max = Math.max(...steps, 1);
  const n = steps.length;
  if (steps.every((v) => v === steps[0])) return null; // a flat schedule says nothing as a staircase
  const gap = n > 40 ? 0.22 : 0.34;
  return (
    <svg viewBox={`0 0 ${n} 32`} preserveAspectRatio="none" className={`w-full h-16 -scale-x-100 ${className}`} aria-hidden>
      {steps.map((t, i) => {
        const h = 5 + 27 * (t / max);
        const fill =
          i === current
            ? 'fill-gold'
            : i < done
              ? 'fill-teal dark:fill-teal-light'
              : 'fill-teal/15 dark:fill-teal-light/15';
        return <rect key={i} x={i + gap / 2} width={1 - gap} y={32 - h} height={h} rx={0.25} className={fill} />;
      })}
    </svg>
  );
}

/** «الطريق»: one dot per step, milestones as stars. */
export function PathDots({ ev }: { ev: RunEval }) {
  const marks = new Map(milestonesOf(ev.def).map((m) => [m.step, m]));
  const done = ev.finishedOn ? ev.total : ev.step;
  const current = ev.finishedOn ? -1 : ev.today?.state === 'done' ? -1 : ev.step;
  const cols = ev.total > 42 ? 'grid-cols-10' : 'grid-cols-7';
  return (
    <ol className={`grid ${cols} gap-1.5 sm:gap-2 justify-items-center`} aria-label={`الطريق: ${ar(done)} من ${ar(ev.total)}`}>
      {Array.from({ length: ev.total }, (_, i) => {
        const n = i + 1;
        const isDone = i < done;
        const isNow = i === current;
        const mark = marks.get(n);
        return (
          <li
            key={i}
            title={mark?.label}
            className={[
              'relative w-full max-w-9 aspect-square rounded-full inline-flex items-center justify-center text-[10px] font-counter tabular-nums transition-colors duration-200',
              isDone
                ? mark
                  ? 'bg-[image:var(--gradient-gold)] text-on-accent'
                  : 'bg-teal text-on-accent dark:bg-teal-light/90'
                : isNow
                  ? 'bg-gold/15 text-gold-dark dark:text-gold-light ring-2 ring-gold motion-safe:animate-pulse'
                  : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-muted',
            ].join(' ')}
          >
            {mark && !isDone ? <Star8 size={12} filled={false} className="text-gold" /> : isDone && !mark ? null : ar(n)}
            <span className="sr-only">{isDone ? 'تمّ' : isNow ? 'اليوم' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

const SHORT_WD = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** The last two weeks of the run, day by day (tap a day to edit it). */
export function RecentStrip({ ev, onPick }: { ev: RunEval; onPick?: (d: DayEval) => void }) {
  const days = ev.days.slice(-14);
  if (!days.length) return null;
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const date = parseKey(d.key);
        const tone =
          d.state === 'done'
            ? 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light'
            : d.state === 'missed'
              ? 'bg-danger/10 text-danger'
              : d.state === 'pending'
                ? 'bg-gold/12 text-gold-dark dark:text-gold-light ring-1 ring-gold/50'
                : 'bg-cream-dark/50 dark:bg-white/[0.05] text-text-muted';
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onPick?.(d)}
            className={`min-h-14 rounded-[var(--radius-inner)] flex flex-col items-center justify-center gap-0.5 px-0.5 ${tone} active:scale-[0.97] transition-transform`}
            aria-label={`${SHORT_WD[date.getDay()]} ${ar(date.getDate())}: ${STATE_LABEL[d.state]}${d.reset ? '، بدأ العدّ من جديد' : ''}`}
          >
            <span className="text-[10px] leading-none opacity-80">{SHORT_WD[date.getDay()]}</span>
            <span className="text-sm font-counter font-bold tabular-nums leading-none">{ar(date.getDate())}</span>
            <span className="text-[10px] leading-none">{d.state === 'done' ? '✓' : d.state === 'missed' ? (d.reset ? '↺' : '×') : d.state === 'pending' ? '•' : '–'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A hadith/ayah block with its reference. */
export function SourceQuote({ source, className = '' }: { source: Source; className?: string }) {
  return (
    <figure className={`rounded-[var(--radius-inner)] bg-gold/[0.07] dark:bg-gold/[0.06] ring-1 ring-gold/20 px-4 py-3 ${className}`}>
      <blockquote
        className={
          source.ayah
            ? 'font-quran text-[19px] leading-[2] text-text-primary dark:text-text-on-dark text-pretty'
            : 'font-ornate text-[16px] leading-[1.9] text-text-primary dark:text-text-on-dark text-pretty'
        }
      >
        {source.ayah ? `﴿${source.text}﴾` : `«${source.text}»`}
      </blockquote>
      <figcaption className="mt-1 text-[11.5px] text-text-muted">{source.ref}</figcaption>
    </figure>
  );
}

export function InfoRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light inline-flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">{title}</p>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">{children}</div>
      </div>
    </div>
  );
}
