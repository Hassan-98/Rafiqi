/**
 * Plug-in points of «يحتاج انتباهك» (Home) and «رفيقك اليومي» (notifications).
 * A feature registers a source once at boot (see ./plugins.ts) and the core
 * engines call it on every pass — the core never imports a feature's store.
 *
 *   registerAttentionSource({ id, collect(ctx) → AttentionItem[] })
 *   registerCompanionSource({ id, nudges?(ctx), brief?(ctx, dayKey), acted?(slot, now) })
 *
 * A source that throws is skipped (and logged) — one feature can't blank Home.
 */
import type { AttentionItem, DayTimes } from '@/services/dayAttention';
import type { HijriDate } from '@/services/HijriService';

/** What every source is handed. */
export interface SourceContext {
  now: Date;
  /** yyyy-MM-dd of `now`. */
  today: string;
  /** Today's prayer times (null without a location). */
  times: DayTimes | null;
  /** Prayer times of any day (null without a location). */
  timesOf: (day: Date) => DayTimes | null;
  gender: 'male' | 'female' | null;
  /** A woman's excused day today. */
  excused: boolean;
  /** Today in Hijri, the user's sighting offset applied. */
  hijri: HijriDate;
  hijriOffset: number;
}

export interface AttentionSource {
  /** Unique; registering the same id again replaces it (hot reload). */
  id: string;
  collect: (ctx: SourceContext) => AttentionItem[];
}

/** A one-shot notification a feature asks the companion for. */
export interface CompanionCandidate {
  /** Unique per source and day → id `myzikr_smart_x_<source>_<key>[_dN]` (stable, dateless). */
  key: string;
  title: string;
  body: string;
  /** The preferred moment (today or the next two days). */
  at: Date;
  /** May slide up to here to keep its distance from other nudges (default: one hour after `at`). */
  latest?: Date;
  /** In-app route opened on tap, e.g. '/silat'. */
  to: string;
  /** Delivery priority: fard ≈ a prayer check, sunnah ≈ adhkar, extra (default) ≈ awrad. */
  weight?: 'fard' | 'sunnah' | 'extra';
  /** Allowed inside quiet hours (only for something bound to its own time). */
  quietOk?: boolean;
  /** Shown in settings when it is eased off: «خفّفتُ تذكير <label>» (default: the title). */
  label?: string;
}

export interface CompanionSource {
  id: string;
  /** Nudges for today and the next two days. Same daily cap, spacing and quiet hours as the rest. */
  nudges?: (ctx: SourceContext) => CompanionCandidate[];
  /** Lines for the morning brief of `dayKey` — short, e.g. «اتصل بخالتك». */
  brief?: (ctx: SourceContext, dayKey: string) => string[];
  /**
   * Did the user act on a delivered nudge (`key` as given in the candidate)?
   * true / false, or null = can't tell yet. Without it the nudge is never eased off.
   */
  acted?: (slot: { key: string; at: Date }, now: Date) => boolean | null;
}

const attention = new Map<string, AttentionSource>();
const companion = new Map<string, CompanionSource>();

/** Returns an unregister function. */
export function registerAttentionSource(s: AttentionSource): () => void {
  attention.set(s.id, s);
  return () => void (attention.get(s.id) === s && attention.delete(s.id));
}

/** Returns an unregister function. */
export function registerCompanionSource(s: CompanionSource): () => void {
  companion.set(s.id, s);
  return () => void (companion.get(s.id) === s && companion.delete(s.id));
}

export const companionSources = (): CompanionSource[] => [...companion.values()];

/** Every registered source's items (a failing source is skipped). */
export function collectAttention(ctx: SourceContext): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const s of attention.values()) {
    try {
      out.push(...s.collect(ctx));
    } catch (e) {
      console.warn(`[attention] source ${s.id} failed`, e);
    }
  }
  return out;
}

/** Run a source hook, swallowing its failure. */
export function safely<T>(id: string, f: () => T, fallback: T): T {
  try {
    return f();
  } catch (e) {
    console.warn(`[companion] source ${id} failed`, e);
    return fallback;
  }
}
