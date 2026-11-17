/**
 * Content-level merge of two persisted store snapshots (local vs cloud).
 *
 * WHY: sync conflicts used to be resolved per STORAGE KEY with "local wins".
 * Each zustand store is one key, so a stale device that touched a store at
 * launch (progressStore stamps today, quranStore updates lastRead, …) would
 * push its months-old copy of that WHOLE store over the newer cloud copy —
 * and the up-to-date device would then dutifully adopt it. That is the
 * "opened the old phone and lost everything on both" disaster.
 *
 * Instead we merge the two JSON states structurally so history is UNITED:
 *  - maps (dateKey → day, id → record) become the union of both sides;
 *  - arrays of `{ id }` items are unioned by id;
 *  - primitive arrays are unioned by value;
 *  - well-known worship shapes resolve by "more worship wins" (higher
 *    completion / lifetime count / streak recency / target progress);
 *  - in history stores, boolean conflicts resolve to TRUE (a prayer marked
 *    done on either device did happen) and number conflicts to MAX (counts
 *    and positions only ever grow);
 *  - anything else keeps the LOCAL value (settings stay per-device).
 *
 * Known tradeoff: without tombstones a record deleted on one device can be
 * resurrected by another that still holds it. Resurrection is recoverable by
 * the user; silent wiping of months of history is not.
 */

type Dict = Record<string, unknown>;

/** Stores whose contents are worship history: booleans OR, numbers MAX. */
const HISTORY_KEYS = new Set([
  'myzikr:progress',
  'myzikr:prayer-log',
  'myzikr:qiyam',
  'myzikr:study',
  'myzikr:tasks',
  'myzikr:house',
  'myzikr:quran',
  'myzikr:memorization',
  'myzikr:tasbih',
  'myzikr:targets',
  'myzikr:dhikr-sessions',
  'myzikr:sadaqah',
  'myzikr:ramadan',
  'myzikr:asma',
  'myzikr:badges',
  'myzikr:hadith',
  'myzikr:duaa-library',
  'myzikr:bookmarks',
]);

function isPlainObject(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Epoch ms from an ISO string or epoch-number field; 0 when unusable. */
function toMs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Wholesale winner for well-known worship record shapes where "merge the
 * fields" would mix two inconsistent snapshots. Returns undefined when the
 * shape isn't recognized (caller falls back to structural merge).
 */
function pickKnownShape(l: Dict, r: Dict): Dict | undefined {
  // DailyProgress — union the day PER MODULE (higher rate / completed wins)
  // and recompute the average. Picking the whole day by overallRate dropped
  // e.g. a freshly logged قيام whenever the other copy's average was higher.
  if (typeof l.dateKey === 'string' && typeof l.overallRate === 'number' && typeof r.overallRate === 'number') {
    const byId = new Map<string, Dict>();
    for (const m of [...((l.modules as Dict[]) ?? []), ...((r.modules as Dict[]) ?? [])]) {
      const id = String(m.moduleId);
      const prev = byId.get(id);
      if (!prev) byId.set(id, m);
      else {
        const better = Number(m.completionRate ?? 0) > Number(prev.completionRate ?? 0) ? m : prev;
        byId.set(id, { ...better, completed: Boolean(prev.completed || m.completed) });
      }
    }
    const modules = [...byId.values()];
    const overallRate = modules.length
      ? modules.reduce((sum, m) => sum + Number(m.completionRate ?? 0), 0) / modules.length
      : 0;
    return { ...l, modules, overallRate };
  }
  // StreakData — the side that worshipped more recently knows the CURRENT
  // streak; the longest streak is a lifetime max on both.
  if (typeof l.currentStreak === 'number' && typeof l.longestStreak === 'number' && typeof r.longestStreak === 'number') {
    const base = toMs(r.lastCompletedDate) > toMs(l.lastCompletedDate) ? r : l;
    return { ...base, longestStreak: Math.max(l.longestStreak, r.longestStreak) };
  }
  // TasbihCounter — lifetime count only ever grows.
  if (typeof l.totalLifetimeCount === 'number' && typeof r.totalLifetimeCount === 'number') {
    return r.totalLifetimeCount > l.totalLifetimeCount ? r : l;
  }
  // Target (ورد) — a completed copy beats an in-progress one; otherwise the
  // side with more progress wins.
  if (typeof l.current === 'number' && typeof l.total === 'number' && 'createdAt' in l && typeof r.current === 'number') {
    if (l.completedAt && !r.completedAt) return l;
    if (r.completedAt && !l.completedAt) return r;
    return r.current > l.current ? r : l;
  }
  // Khatma (quranStore.khatmas) — whole record, never field-mixed (a MAX of
  // startPage and read from two copies is a position neither device had).
  // More pages covered across all passes wins; a tie (e.g. finished vs.
  // restarted) goes to the more recent edit.
  if (typeof l.startPage === 'number' && typeof l.read === 'number' && typeof r.read === 'number') {
    const total = (x: Dict) => Number(x.completions ?? 0) * 604 + Number(x.read);
    if (total(l) !== total(r)) return total(r) > total(l) ? r : l;
    return toMs(r.updatedAt) > toMs(l.updatedAt) ? r : l;
  }
  return undefined;
}

function mergeArrays(l: unknown[], r: unknown[], history: boolean): unknown[] {
  const allObjectsWithId = (arr: unknown[]) =>
    arr.every((x) => isPlainObject(x) && (typeof x.id === 'string' || typeof x.id === 'number'));

  if (l.length > 0 && r.length > 0 && allObjectsWithId(l) && allObjectsWithId(r)) {
    const rById = new Map((r as Dict[]).map((x) => [x.id as string | number, x]));
    const out: unknown[] = (l as Dict[]).map((lx) => {
      const rx = rById.get(lx.id as string | number);
      if (!rx) return lx;
      rById.delete(lx.id as string | number);
      return mergeValue(lx, rx, history);
    });
    for (const rx of rById.values()) out.push(rx); // items the other device added
    return out;
  }

  // Primitive / mixed arrays → value union, local order first.
  const seen = new Set(l.map((x) => JSON.stringify(x)));
  const out = [...l];
  for (const x of r) {
    const sig = JSON.stringify(x);
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(x);
    }
  }
  return out;
}

function mergeValue(l: unknown, r: unknown, history: boolean): unknown {
  if (l === r || sameJson(l, r)) return l;
  if (l == null) return r ?? l;
  if (r == null) return l;

  if (isPlainObject(l) && isPlainObject(r)) {
    const known = pickKnownShape(l, r);
    if (known) return known;
    // Union of keys — a date/id present on either side survives. A
    // `settings` subtree is preferences, not worship: per-device, even inside
    // a history store («true wins» re-enabled tajweed — and so the colour
    // Mushaf font — after it was switched off; volume could only go up).
    const out: Dict = { ...l };
    for (const [k, rv] of Object.entries(r)) {
      out[k] = k in l ? mergeValue(l[k], rv, history && k !== 'settings') : rv;
    }
    return out;
  }

  if (Array.isArray(l) && Array.isArray(r)) return mergeArrays(l, r, history);

  if (history) {
    // Worship happened on SOME device → true wins; counts/positions grow.
    if (typeof l === 'boolean' && typeof r === 'boolean') return l || r;
    if (typeof l === 'number' && typeof r === 'number') return Math.max(l, r);
  }
  return l; // scalars & mismatched types → this device's value
}

interface Envelope {
  obj: Dict;
  state: unknown;
  version: number;
  wrapped: boolean;
}

/** Parse a persisted value, unwrapping the zustand `{ state, version }` envelope. */
function parseEnvelope(raw: string): Envelope | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!isPlainObject(obj)) return null;
    if ('state' in obj) {
      return {
        obj,
        state: obj.state,
        version: typeof obj.version === 'number' ? obj.version : 0,
        wrapped: true,
      };
    }
    return { obj, state: obj, version: 0, wrapped: false };
  } catch {
    return null;
  }
}

/**
 * Merge a local and a remote serialized snapshot of the same storage key.
 * Never throws; falls back to the local value when anything is unmergeable.
 */
export function mergeSyncedValue(key: string, localRaw: string, remoteRaw: string): string {
  if (localRaw === remoteRaw) return localRaw;
  const l = parseEnvelope(localRaw);
  const r = parseEnvelope(remoteRaw);
  if (!l || !r || l.wrapped !== r.wrapped) return localRaw;
  // Different persist versions = different schemas — field merge across a
  // migration is unsafe; the newer schema wins wholesale.
  if (l.version !== r.version) return l.version >= r.version ? localRaw : remoteRaw;

  try {
    const merged = mergeValue(l.state, r.state, HISTORY_KEYS.has(key));
    if (sameJson(merged, l.state)) return localRaw;
    return JSON.stringify(l.wrapped ? { ...l.obj, state: merged } : merged);
  } catch {
    return localRaw;
  }
}
