/**
 * «تذكرة الإتقان» — PURE. When the full-screen reminder may appear, which
 * one, and how it reads for this reader. The UI (components/mindful) only
 * adds the live checks (app visible, no alert ringing, no dialog open).
 *
 *  (owner 2026-11-18: more, and several a day — but never the same kind twice)
 *  - each kind at most ONCE a day; at most DAY_CAP a day in all, QUIET_MS apart;
 *  - 'open' («تذكرة اليوم»): from a random moment of the first half of the day
 *    (`openMinuteFor`, 05:30–12:00, new each day), on whatever screen is open;
 *  - a section: when that section is opened;
 *  - never before onboarding, on the first day of use, or right after a
 *    notification / deep link opened the app;
 *  - variants rotate per context and never repeat the last one.
 *
 * Checked by scripts/mindful.test.ts.
 */
import { format } from 'date-fns';
import { MINDFUL_REMINDERS, type MindfulContext, type MindfulQuote } from '@/data/mindfulReminders';
import type { Gender } from '@/store/settingsStore';

export type { MindfulContext } from '@/data/mindfulReminders';

export type OpenEvery = 1 | 2 | 3 | 7;

export interface MindfulData {
  enabled: boolean;
  /** Days between two 'open' reminders. */
  openEvery: OpenEvery;
  /** «في الأقسام أيضاً». */
  inSections: boolean;
  /** Day this device first ran the feature (yyyy-MM-dd); nothing shows that day. */
  firstSeen: string | null;
  /** Epoch ms of the last reminder of any kind (0 = never). */
  lastShownAt: number;
  /** Day each context last showed (yyyy-MM-dd). */
  lastByContext: Partial<Record<MindfulContext, string>>;
  /** Index of the variant each context last showed. */
  lastVariant: Partial<Record<MindfulContext, number>>;
}

export const MINDFUL_DEFAULTS: MindfulData = {
  enabled: true,
  openEvery: 2,
  inSections: true,
  firstSeen: null,
  lastShownAt: 0,
  lastByContext: {},
  lastVariant: {},
};

/** Reminders a day, all kinds together. */
export const DAY_CAP = 5;
/** Between any two reminders. */
export const QUIET_MS = 45 * 60 * 1000;

/** «تذكرة اليوم»'s moment: minutes after midnight, 05:30–12:00, stable through the day, new each day. */
export function openMinuteFor(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 330 + ((h >>> 0) % 391);
}

export const dayKey = (d: Date | number): string => format(d, 'yyyy-MM-dd');

/**
 * Route → context. First match wins. `tabs` lists the accepted `?tab=` values
 * ('' = no tab); null accepts any. A path ending in '*' also matches its
 * sub-paths. Add a row when a section or tab is added.
 */
export const ROUTE_CONTEXTS: [path: string, tabs: string[] | null, ctx: MindfulContext][] = [
  ['/', null, 'open'],
  ['/quran', null, 'quran'],
  ['/adhkar', null, 'adhkar'],
  ['/tasbih', null, 'adhkar'],
  ['/targets', ['', 'awrad'], 'awrad'],
  ['/targets', ['qiyam'], 'qiyam'],
  ['/targets', ['circles'], 'circles'],
  ['/targets', ['qada'], 'qada'],
  ['/targets', ['friday', 'review'], 'review'],
  ['/qiyam', null, 'qiyam'],
  ['/qada', null, 'qada'],
  ['/leaderboard', null, 'numbers'],
  ['/stats*', null, 'numbers'],
  ['/badges', null, 'numbers'],
  ['/me', null, 'numbers'],
  ['/programs', null, 'programs'],
  ['/sadaqah', null, 'sadaqah'],
  ['/silat', null, 'silat'],
  ['/study', ['silat'], 'silat'],
  ['/study', ['', 'tasks'], 'study'],
  ['/study', ['circles'], 'circles'],
  ['/study/circle*', null, 'circles'],
  ['/module/prayers', null, 'prayer'],
  ['/friday-review', null, 'review'],
];

export function contextForRoute(pathname: string, search = ''): MindfulContext | null {
  const tab = new URLSearchParams(search).get('tab') ?? '';
  for (const [path, tabs, ctx] of ROUTE_CONTEXTS) {
    const hit = path.endsWith('*')
      ? pathname === path.slice(0, -1) || pathname.startsWith(path.slice(0, -1) + '/')
      : pathname === path;
    if (hit && (!tabs || tabs.includes(tab))) return ctx;
  }
  return null;
}

/** Live conditions the UI checks at the moment of showing. */
export interface MindfulGate {
  onboardingComplete: boolean;
  /** This session opened from a notification or deep link. */
  deepLinked: boolean;
  /** An alarm/alert is ringing, another dialog is open, or the app is hidden. */
  busy: boolean;
}

export function canShowMindful(ctx: MindfulContext, d: MindfulData, gate: MindfulGate, now = new Date()): boolean {
  if (!gate.onboardingComplete || gate.deepLinked || gate.busy) return false;
  const today = dayKey(now);
  if (!d.firstSeen || d.firstSeen >= today) return false;
  if (d.lastByContext[ctx] === today) return false;
  if (Object.values(d.lastByContext).filter((k) => k === today).length >= DAY_CAP) return false;
  if (d.lastShownAt && now.getTime() - d.lastShownAt < QUIET_MS) return false;
  return ctx !== 'open' || now.getHours() * 60 + now.getMinutes() >= openMinuteFor(today);
}

/** The variant after the last one shown in this context. */
export function nextVariant(ctx: MindfulContext, d: Pick<MindfulData, 'lastVariant'>): number {
  const last = d.lastVariant[ctx];
  return last == null ? 0 : (last + 1) % MINDFUL_REMINDERS[ctx].length;
}

/** Ledger update after showing `variant` of `ctx`. */
export function recordShown(d: MindfulData, ctx: MindfulContext, variant: number, now = new Date()): Partial<MindfulData> {
  return {
    lastShownAt: now.getTime(),
    lastByContext: { ...d.lastByContext, [ctx]: dayKey(now) },
    lastVariant: { ...d.lastVariant, [ctx]: variant },
  };
}

export function salutation(gender: Gender | null): string {
  return gender === 'female' ? 'أختي المسلمة،' : gender === 'male' ? 'أخي المسلم،' : 'أيها المسلم الكريم،';
}

/** Resolve `{male|female}` choices; the male form addresses an unknown reader. */
export function gendered(text: string, gender: Gender | null): string {
  return text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m: string, f: string) => (gender === 'female' ? f : m));
}

export interface ComposedMindful {
  salutation: string;
  body: string;
  quote: MindfulQuote;
}

export function composeMindful(ctx: MindfulContext, variant: number, gender: Gender | null): ComposedMindful {
  const r = MINDFUL_REMINDERS[ctx][variant] ?? MINDFUL_REMINDERS[ctx][0];
  return { salutation: salutation(gender), body: gendered(r.body, gender), quote: r.quote };
}
