/**
 * Pure decisions for adhkar listening mode (no DOM, no audio) — so the
 * sequencing rules can be checked in isolation (scripts/adhkarListen.test.ts).
 *
 * One "recitation" = the reciter reads the dhikr once, then the user gets a
 * pause to repeat after them, then the counter goes up by one. After that the
 * same dhikr is recited again (until its count is filled, in «كرّر حسب العدد»
 * mode) or listening moves on to the next unfinished dhikr in order.
 */

/** count = to the dhikr's own target · once · fixed = exactly `fixedTimes` recitations. */
export type RepeatMode = 'count' | 'once' | 'fixed';
/** Seconds between recitations, or 'match' = as long as the recitation itself. */
export type PauseMode = 0 | 2 | 5 | 'match';

export interface ListenPrefs {
  repeatMode: RepeatMode;
  pause: PauseMode;
  rate: number;
  /** Items without audio: skip them automatically (true) or wait for the user. */
  skipNoAudio: boolean;
  /** Recitations per dhikr in 'fixed' mode. Optional: older saves lack it. */
  fixedTimes?: number;
}

export const LISTEN_RATES = [0.75, 1, 1.25, 1.5] as const;

interface Item {
  id: string;
  count: number;
}

export interface ListenCtx {
  items: Item[];
  counts: Record<string, number>;
  skipped: Record<string, boolean>;
  hasAudio: (id: string) => boolean;
  prefs: Pick<ListenPrefs, 'repeatMode' | 'skipNoAudio' | 'fixedTimes'>;
}

const isDone = (it: Item, c: ListenCtx) => (c.counts[it.id] ?? 0) >= it.count || !!c.skipped[it.id];

/** First unfinished dhikr at or after `from` that listening should stop on
 *  (no-audio items are passed over only when skipNoAudio), or -1. */
export function nextListenIndex(c: ListenCtx, from: number): number {
  for (let i = Math.max(0, from); i < c.items.length; i++) {
    const it = c.items[i];
    if (isDone(it, c)) continue;
    if (c.prefs.skipNoAudio && !c.hasAudio(it.id)) continue;
    return i;
  }
  return -1;
}

/** Where listening starts: resume at the current card, else wrap to the first
 *  unfinished one. -1 → nothing left to listen to. */
export function startIndex(c: ListenCtx, current: number): number {
  const i = nextListenIndex(c, current);
  return i >= 0 ? i : nextListenIndex(c, 0);
}

export type ArriveAction = { kind: 'play' } | { kind: 'wait' } | { kind: 'goto'; index: number } | { kind: 'end' };

/** A card became current while listening (auto-advance or the user's prev/next).
 *  A finished card is still recited once (review) — it just isn't counted. */
export function onArrive(c: ListenCtx, index: number): ArriveAction {
  const it = c.items[index];
  if (!it) return { kind: 'end' };
  if (c.hasAudio(it.id)) return { kind: 'play' };
  if (!c.prefs.skipNoAudio) return { kind: 'wait' };
  const next = nextListenIndex(c, index + 1);
  return next < 0 ? { kind: 'end' } : { kind: 'goto', index: next };
}

export type AfterAction = { kind: 'again' } | { kind: 'goto'; index: number } | { kind: 'end' };

/** After one recitation + pause, with `c.counts` ALREADY including that count.
 *  `recitedHere` = recitations of this dhikr in the current visit, this one
 *  included (drives 'fixed' mode, which ignores the counter). */
export function afterRecitation(c: ListenCtx, index: number, recitedHere = 1): AfterAction {
  const it = c.items[index];
  if (!it) return { kind: 'end' };
  if (c.prefs.repeatMode === 'count' && !isDone(it, c)) return { kind: 'again' };
  if (c.prefs.repeatMode === 'fixed' && recitedHere < (c.prefs.fixedTimes ?? 3)) return { kind: 'again' };
  const next = nextListenIndex(c, index + 1);
  return next < 0 ? { kind: 'end' } : { kind: 'goto', index: next };
}

/** Counts after one more repetition of `id` (capped at the target, like the counter). */
export function countedOnce(c: ListenCtx, id: string): Record<string, number> {
  const it = c.items.find((x) => x.id === id);
  const cur = c.counts[id] ?? 0;
  if (!it || cur >= it.count) return c.counts;
  return { ...c.counts, [id]: cur + 1 };
}

/** The user's turn after a recitation, in ms. */
export function pauseMs(mode: PauseMode, recitedMs: number): number {
  return mode === 'match' ? Math.max(0, Math.round(recitedMs)) : mode * 1000;
}
