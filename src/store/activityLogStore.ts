import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { format } from 'date-fns';
import { evictQuranCache } from '@/services/quranCacheEvict';

/**
 * A write-debounced localStorage wrapper. The activity log is written on hot
 * paths (every tasbih/dhikr tap) and its payload grows to thousands of events,
 * so a synchronous localStorage write per tap would jank fast tapping. This
 * batches writes (~800ms) and force-flushes when the app is backgrounded or
 * closed, so nothing is lost. Reads stay synchronous. Quota failures reclaim
 * Quran-cache space and retry once, mirroring {@link safeStorage}.
 */
function createDebouncedStorage(delay = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    try {
      localStorage.setItem(name, value);
    } catch {
      try {
        evictQuranCache(value.length * 2);
        localStorage.setItem(name, value);
      } catch {
        /* give up silently rather than crash */
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    // cloudSync reads localStorage directly: a pending write must land first,
    // or a merge+rehydrate drops the last taps and this stale write lands after it.
    window.addEventListener('myzikr:flush-storage', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return createJSONStorage(() => ({
    getItem: (name: string): string | null => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string): void => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  }));
}

/**
 * A lightweight, append-only log of *when* worship happened — the missing
 * ingredient the statistics day-detail sheet needs. Existing stores keep daily
 * totals (or, for adhkar, only today), but none of them remember the clock
 * time of an action. This store stamps every meaningful action with its exact
 * time + count so a tapped day can show an hour-by-hour timeline and a
 * per-dhikr breakdown.
 *
 * It is purely additive: nothing reads it as a source of truth for counting —
 * the counters live in their own stores. Losing/clearing this log never affects
 * a single tally. That keeps it safe to wire into hot action paths.
 *
 * Rapid taps are COALESCED: incrementing the same dhikr 33 times in a row
 * becomes one event of amount 33, not 33 rows — bounding both storage and
 * timeline noise.
 */

export type ActivityDomain =
  | 'awrad'
  | 'dhikr'
  | 'tasbih'
  | 'quran'
  | 'prayer'
  | 'fasting'
  | 'habit'
  | 'sadaqah'
  /** قيام الليل (qiyamStore.logNight may log one 'complete' event per night). */
  | 'qiyam';

export interface ActivityEvent {
  id: string;
  /** Epoch ms of the (latest) action in this coalesced event. */
  ts: number;
  /** Local calendar day (yyyy-MM-dd) — precomputed to dodge TZ drift on read. */
  dateKey: string;
  domain: ActivityDomain;
  /** Owning entity id (wird/set/counter/prayer). Drives coalescing. */
  refId?: string;
  /** Sub-entity id (a specific dhikr item). Also drives coalescing. */
  subId?: string;
  /** Human title — the wird/set/counter name, or the prayer. */
  title: string;
  /** Optional secondary text — e.g. the specific dhikr recited. */
  detail?: string;
  /** Reps / units accumulated in this event. */
  amount: number;
  unit?: string;
  kind?: 'progress' | 'complete' | 'session';
}

export type ActivityInput = Omit<ActivityEvent, 'id' | 'ts' | 'dateKey'> & {
  /** Override the timestamp (defaults to now). */
  ts?: number;
};

/** Cap total stored events (newest kept). ~months of heavy daily use. */
const MAX_EVENTS = 4000;
/** Drop anything older than this to keep storage lean. */
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
/** Merge same-target actions that land within this window into one event. */
const COALESCE_MS = 2 * 60 * 1000;
/** How far back in the (newest-first) list to look for a coalesce target. */
const COALESCE_SCAN = 10;

function dayKey(ts: number): string {
  return format(new Date(ts), 'yyyy-MM-dd');
}

function makeId(): string {
  return `a_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface ActivityLogState {
  events: ActivityEvent[];
  /** Append (or coalesce) an activity event. */
  log: (e: ActivityInput) => void;
  /** All events on a given yyyy-MM-dd, ascending by time. */
  eventsForDay: (dateKey: string) => ActivityEvent[];
  clear: () => void;
}

export const useActivityLogStore = create<ActivityLogState>()(
  persist(
    (set, get) => ({
      events: [],

      log: (input) => {
        const ts = input.ts ?? Date.now();
        set((s) => {
          const events = s.events;
          // Try to coalesce with a very recent same-target event.
          for (let i = 0; i < Math.min(COALESCE_SCAN, events.length); i++) {
            const e = events[i];
            if (
              e.domain === input.domain &&
              e.refId === input.refId &&
              e.subId === input.subId &&
              e.kind === input.kind &&
              ts - e.ts < COALESCE_MS
            ) {
              const merged: ActivityEvent = {
                ...e,
                ts,
                dateKey: dayKey(ts),
                amount: e.amount + input.amount,
                // Refresh label/detail in case they changed.
                title: input.title,
                detail: input.detail ?? e.detail,
              };
              const next = events.slice();
              next.splice(i, 1);
              return { events: [merged, ...next] };
            }
          }

          const event: ActivityEvent = {
            id: makeId(),
            ts,
            dateKey: dayKey(ts),
            domain: input.domain,
            refId: input.refId,
            subId: input.subId,
            title: input.title,
            detail: input.detail,
            amount: input.amount,
            unit: input.unit,
            kind: input.kind,
          };

          let next = [event, ...events];
          if (next.length > MAX_EVENTS + 50) {
            const cutoff = ts - MAX_AGE_MS;
            // Sort first: a cloud merge appends the other device's (newest) events at the end.
            next = next
              .filter((e) => e.ts >= cutoff)
              .sort((a, b) => b.ts - a.ts)
              .slice(0, MAX_EVENTS);
          }
          return { events: next };
        });
      },

      eventsForDay: (dateKey) =>
        get()
          .events.filter((e) => e.dateKey === dateKey)
          .sort((a, b) => a.ts - b.ts),

      clear: () => set({ events: [] }),
    }),
    { name: 'myzikr:activity-log', storage: createDebouncedStorage() },
  ),
);

/** Non-hook logger for stores/services outside React. */
export function logActivity(e: ActivityInput): void {
  useActivityLogStore.getState().log(e);
}
