import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Moon, Plus, Volume1, Volume2, VolumeX } from 'lucide-react';
import { toArabicDigits, formatClock } from '@/utils/arabicFormat';
import { Toggle } from '@/components/ui/Toggle';
import { backgroundPlaybackSupported, useBackgroundPlaybackStore } from '@/services/backgroundPlayback';

/**
 * Listening controls shared by the Quran player and adhkar listening mode:
 * one visual language for volume, speed, sleep timer and the sheet sections.
 */

export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export const rateLabel = (r: number) => `${toArabicDigits(String(r).replace('.', '٫'))}×`;

/** A titled block inside a «إعدادات الاستماع» sheet. */
export function ControlSection({
  icon,
  title,
  hint,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-3.5 flex flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</span>
          {hint ? <span className="block text-[11.5px] text-text-muted text-pretty">{hint}</span> : null}
        </span>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Segmented control (design system «Chips»). `cols` switches to a grid. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  cols,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={[
        'rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 gap-1',
        cols ? 'grid' : 'flex',
      ].join(' ')}
      style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={[
              'flex-1 min-h-11 px-1 rounded-xl text-[12.5px] font-semibold font-counter whitespace-nowrap transition-colors duration-200',
              on
                ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                : 'text-text-secondary dark:text-text-on-dark/70',
            ].join(' ')}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

export function SpeedChips({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  return (
    <Segmented<number>
      label="سرعة التلاوة"
      value={value}
      options={SPEEDS.map((v) => ({ v, l: rateLabel(v) }))}
      onChange={onChange}
    />
  );
}

/**
 * Mute toggle + 0–100% slider. RTL: no `dir` override, so the thumb and the
 * gold fill both grow from the right.
 */
export function VolumeControl({
  volume,
  muted,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number, muted: boolean) => void;
}) {
  const pct = Math.round(volume * 100);
  const silent = muted || pct === 0;
  const Icon = silent ? VolumeX : pct < 50 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(pct === 0 ? 0.6 : volume, pct === 0 ? false : !muted)}
        aria-label={silent ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
        aria-pressed={muted}
        className={[
          'w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors',
          silent ? 'bg-danger/10 text-danger' : 'bg-teal/10 text-teal dark:text-teal-light',
        ].join(' ')}
      >
        <Icon size={19} />
      </button>
      <div className="relative flex-1 h-11 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-cream-dark dark:bg-dark-surface">
          <div
            className={['h-full rounded-full', silent ? 'bg-text-muted/40' : 'bg-[image:var(--gradient-gold)]'].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100, false)}
          aria-label="مستوى صوت التلاوة"
          aria-valuetext={`${toArabicDigits(pct)}٪`}
          className="audio-seek absolute inset-x-0 w-full appearance-none bg-transparent"
        />
      </div>
      <span className="w-11 text-center text-xs font-counter font-bold tabular-nums text-text-secondary dark:text-text-on-dark/80">
        {muted ? 'صامت' : `${toArabicDigits(pct)}٪`}
      </span>
    </div>
  );
}

/** − N + stepper for small counts. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format = (n) => toArabicDigits(n),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  const btn =
    'w-11 h-11 rounded-xl inline-flex items-center justify-center text-teal dark:text-teal-light hover:bg-teal/10 disabled:opacity-30 transition-colors';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] text-text-secondary dark:text-text-on-dark/80">{label}</span>
      <span className="flex items-center rounded-2xl bg-cream-dark/60 dark:bg-dark-surface">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`إنقاص ${label}`}>
          <Minus size={16} />
        </button>
        <span className="min-w-10 text-center text-sm font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark" aria-live="polite">
          {format(value)}
        </span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`زيادة ${label}`}>
          <Plus size={16} />
        </button>
      </span>
    </div>
  );
}

/** Live countdown to `endsAt` (re-renders once a second, only while shown). */
export function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, endsAt - now) : 0;
}

/**
 * Compact «مؤقت النوم» chip: a moon and the time left (or a short label for
 * "at the end of …"). Not a button: it sits inside tappable headers.
 */
export function SleepChip({ endsAt, endLabel }: { endsAt: number | null; endLabel?: string }) {
  const left = useCountdown(endsAt);
  if (!endsAt && !endLabel) return null;
  const text = endsAt ? formatClock(left / 1000) : endLabel;
  return (
    <span
      role="timer"
      aria-label={endsAt ? `مؤقت الإيقاف، يتبقى ${text}` : `مؤقت الإيقاف: ${endLabel}`}
      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-teal/10 text-teal dark:text-teal-light px-1.5 py-0.5 text-[10px] font-counter font-bold tabular-nums"
    >
      <Moon size={10} aria-hidden /> {text}
    </span>
  );
}

/** Sleep-timer choices: 0 = off, minutes, or 'end' (end of surah / dhikr). */
export type SleepValue = number | 'end';

export function SleepPicker({
  value,
  minutes,
  endLabel,
  onChange,
}: {
  value: SleepValue;
  minutes: number[];
  endLabel: string;
  onChange: (v: SleepValue) => void;
}) {
  const options: { v: SleepValue; l: string }[] = [
    { v: 0, l: 'إيقاف' },
    ...minutes.map((m) => ({ v: m, l: `${toArabicDigits(m)} د` })),
    { v: 'end', l: endLabel },
  ];
  return <Segmented<SleepValue> label="مؤقت الإيقاف" value={value} options={options} onChange={onChange} cols={3} />;
}

/** «التشغيل في الخلفية» — Android only (desktop/web keep playing anyway). */
export function BackgroundPlayToggle() {
  const enabled = useBackgroundPlaybackStore((s) => s.enabled);
  const setEnabled = useBackgroundPlaybackStore((s) => s.setEnabled);
  if (!backgroundPlaybackSupported()) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-3.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark">التشغيل في الخلفية</span>
        <span className="block text-[11.5px] text-text-muted text-pretty">
          يستمر الاستماع عند إطفاء الشاشة أو الخروج من التطبيق، مع أزرار التحكم في الإشعارات وشاشة القفل
        </span>
      </span>
      <Toggle checked={enabled} onChange={setEnabled} label="التشغيل في الخلفية" hideLabel />
    </div>
  );
}
