import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  BookOpen, BookText, Globe, GraduationCap, HeartHandshake, Languages, Link2, Mic, ScrollText, Scale, Sparkles, Landmark,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { PLATFORM_LABEL, type Platform, type StudySubject, type TaskPriority } from '@/store/studyModel';

/**
 * Platform identity. Brand hues come from Tailwind's built-in palette (not the
 * app palette) on purpose: Telegram is blue in every theme. Light → -600 ink,
 * dark → -400 ink, both on a 12% tint of the same hue.
 */
export const PLATFORM_TONE: Record<Platform, string> = {
  telegram: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  whatsapp: 'bg-green-600/12 text-green-700 dark:text-green-400',
  youtube: 'bg-red-600/12 text-red-700 dark:text-red-400',
  zoom: 'bg-blue-600/12 text-blue-700 dark:text-blue-300',
  meet: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  website: 'bg-teal/10 text-teal dark:text-teal-light',
  inperson: 'bg-gold/15 text-gold-dark dark:text-gold-light',
  other: 'bg-cream-dark/70 dark:bg-white/10 text-text-secondary dark:text-text-on-dark/80',
};

/** Tiny platform marks drawn in currentColor (no external logos). */
export function PlatformGlyph({ platform, size = 16, className = '' }: { platform: Platform; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', className, 'aria-hidden': true } as const;
  switch (platform) {
    case 'telegram':
      return (
        <svg {...p} fill="currentColor">
          <path d="M21.6 3.3 2.9 10.5c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.8c.3-1.3-.5-1.9-1.4-1.5ZM9.6 14.1l8.7-7.6c.4-.3-.1-.5-.6-.2L7.9 13l.3.1 1.4 1Z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
          <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" />
          <path
            fill="currentColor"
            stroke="none"
            d="M9.1 7.6c-.3 0-.6.1-.8.4-.4.4-.9 1-.9 2.2 0 1.3.9 2.5 1 2.7.2.2 1.8 2.8 4.4 3.8 2.2.8 2.6.7 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3-1.8-.9c-.3-.1-.5-.1-.7.1l-.8 1c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.4-1.8-.1-.3 0-.4.1-.5l.4-.5.3-.4v-.5l-.8-2c-.2-.5-.4-.4-.6-.4h-.1Z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg {...p} fill="currentColor">
          <path fillRule="evenodd" d="M6.2 5h11.6A4.2 4.2 0 0 1 22 9.2v5.6a4.2 4.2 0 0 1-4.2 4.2H6.2A4.2 4.2 0 0 1 2 14.8V9.2A4.2 4.2 0 0 1 6.2 5ZM10 9v6l5.2-3L10 9Z" />
        </svg>
      );
    case 'zoom':
      return (
        <svg {...p} fill="currentColor">
          <path d="M2.5 8.2A2.7 2.7 0 0 1 5.2 5.5h7.6A2.7 2.7 0 0 1 15.5 8.2v7.6a2.7 2.7 0 0 1-2.7 2.7H5.2a2.7 2.7 0 0 1-2.7-2.7V8.2ZM16.8 10.2l3.7-2.7c.4-.3 1 0 1 .5v8c0 .5-.6.8-1 .5l-3.7-2.7v-3.6Z" />
        </svg>
      );
    case 'meet':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round">
          <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
          <path d="m15.5 10.5 5.5-3.5v10l-5.5-3.5" />
          <path d="M6 14.5v-5l3 3 3-3v5" strokeLinecap="round" strokeWidth={1.5} />
        </svg>
      );
    case 'website':
      return <Globe size={size} className={className} aria-hidden />;
    case 'inperson':
      return <Mosque size={size} className={className} />;
    default:
      return <Link2 size={size} className={className} aria-hidden />;
  }
}

export function PlatformChip({ platform, className = '', label }: { platform: Platform; className?: string; label?: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full ps-1.5 pe-2 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap',
        PLATFORM_TONE[platform],
        className,
      ].join(' ')}
    >
      <PlatformGlyph platform={platform} size={13} />
      {label ?? PLATFORM_LABEL[platform]}
    </span>
  );
}

export const SUBJECT_ICON: Record<StudySubject, LucideIcon> = {
  aqeedah: Sparkles,
  fiqh: Scale,
  tafsir: BookOpen,
  hadith: ScrollText,
  seerah: Landmark,
  tajweed: Mic,
  arabic: Languages,
  tazkiyah: HeartHandshake,
  other: GraduationCap,
};

export const LESSON_ICON = BookText;

/** Priority → token classes: the check ring + the start-edge keyline. */
export const PRIORITY_TONE: Record<TaskPriority, { ring: string; bar: string; text: string }> = {
  high: { ring: 'border-danger text-danger', bar: 'bg-danger', text: 'text-danger' },
  normal: { ring: 'border-teal/60 text-teal dark:border-teal-light/70 dark:text-teal-light', bar: 'bg-teal/60', text: 'text-teal dark:text-teal-light' },
  low: { ring: 'border-text-muted/50 text-text-muted', bar: 'bg-text-muted/40', text: 'text-text-muted' },
};

/** Open an external lesson link: in-app browser tab on Android, the OS browser on desktop/web. */
export async function openLink(url?: string): Promise<void> {
  if (!url) return;
  const href = /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url: href });
    else window.open(href, '_blank', 'noopener');
  } catch {
    window.open(href, '_blank', 'noopener');
  }
}

/** Re-render every `ms` so countdowns stay live. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Design-doc segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={['flex rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1', className].join(' ')}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={[
              'flex-1 min-h-10 rounded-xl text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out-soft',
              active
                ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                : 'text-text-secondary dark:text-text-on-dark/70',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small selectable pill used across the forms. */
export function Pill({
  active,
  onClick,
  children,
  className = '',
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-9 px-3 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 disabled:opacity-40',
        active
          ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
          : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export const fieldClass =
  'w-full bg-cream-dark/60 dark:bg-white/[0.06] text-text-primary dark:text-text-on-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-text-muted';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
    </label>
  );
}
