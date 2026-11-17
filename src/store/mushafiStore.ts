import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { safeStorage } from './safeStorage';
import { QURAN_TYPE_IDS, quranTypeOf, type QuranType } from '@/data/quranTypes';

/**
 * «مصحفي» — the Quran lives in a separate app (H:\Works\mushaf). Its sync
 * server (a secret 16-letter code → one JSON) is where reading is recorded:
 * pages read per day, khatmas, bookmarks. This app only READS that state —
 * it never writes Quran progress of its own.
 *
 * Shapes mirror mushaf/sync-server/api/sync.js.
 */

export interface MushafiKhatma {
  id: string;
  /** Bookmark (ribbon) id that marks where the khatma stands — '' when none. */
  m: string;
  /** Name / page — backups of the ribbon's, if it was deleted. */
  n: string;
  at: number;
  /** Start day YYYY-MM-DD, duration in days, pages before the start. */
  s: string;
  d: number;
  b: number;
  /** The ribbon's page once read. */
  rd?: number;
  /** Finished day. */
  f?: string;
  /** Kind of khatma (tilawa | listen | tafsir | hifz) — none = تلاوة. */
  ty?: string;
  t: number;
  del?: 1;
}

export interface MushafiMark {
  id: string;
  p: number;
  /** Mushaf edition the ribbon belongs to (its page numbering). */
  k?: string;
  name: string;
  color: string;
  t: number;
  del?: 1;
}

export interface MushafiRemote {
  days?: Record<string, number[]>;
  khatmas?: MushafiKhatma[];
  marks?: MushafiMark[];
}

// ── pure helpers ────────────────────────────────────────────────────────────

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "abcd-efgh jklm npqr" → "ABCDEFGHJKLMNPQR", or null when it isn't a code. */
export function normalizeMushafiCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 16 && [...c].every((ch) => CODE_ABC.includes(ch)) ? c : null;
}

export const prettyMushafiCode = (c: string) => c.match(/.{4}/g)?.join('-') ?? c;

/** Pages in an edition's numbering: التهجد is far shorter than the standard 604. */
const pagesOf = (kind?: string) => (kind === 'tahajjud' ? 244 : 604);

const dayDiff = (from: string, to: string) => {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};

export interface KhatmaState {
  id: string;
  type: QuranType;
  /** Start day. */
  started: string;
  name: string;
  color: string | null;
  /** Last page read, the khatma's total pages, pages done of them. */
  top: number;
  total: number;
  done: number;
  /** Next page to read. */
  next: number;
  live: boolean;
  /** Day index (0 = start day) and the plan length. */
  day: number;
  days: number;
  /** Today's portion: last page it reaches, pages still owed (0 = done), of which overdue. */
  end: number;
  owe: number;
  late: number;
  /** Pages of today's portion (what «ورد اليوم» measures against). */
  share: number;
  finished: string | null;
}

/**
 * مصحفي's `kstate` (app.js): the remaining pages spread evenly over the days,
 * cumulative — what you missed yesterday is added to today.
 */
export function khatmaState(k: MushafiKhatma, marks: MushafiMark[], today: string): KhatmaState {
  const m = k.m ? marks.find((x) => x.id === k.m && !x.del) : undefined;
  const q = m?.p ?? k.at;
  const L = pagesOf(m?.k);
  // The ribbon's page itself is still ahead of you — except the very last page, once read (rd).
  const top = q === L && k.rd === L ? L : q - 1;
  const day = dayDiff(k.s, today);
  const due = (n: number) => Math.min(L, k.b + Math.round(((L - k.b) * n) / k.d));
  const end = due(Math.min(day + 1, k.d));
  const live = top < L;
  return {
    id: k.id,
    type: quranTypeOf(k.ty),
    started: k.s,
    name: m?.name ?? k.n,
    color: m?.color ?? null,
    top,
    total: L - k.b,
    done: Math.max(0, top - k.b),
    next: Math.min(L, top + 1),
    live,
    day,
    days: k.d,
    end,
    owe: live ? Math.max(0, end - top) : 0,
    late: Math.max(0, due(Math.min(day, k.d)) - top),
    share: Math.max(1, end - due(Math.max(0, Math.min(day, k.d)))),
    finished: k.f ?? null,
  };
}

export interface MushafiToday {
  /** Pages read today (any edition, any reason). */
  pages: number;
  /** Today's wird in pages, and how much of it is done — مصحفي's own «ورد اليوم». */
  goal: number;
  achieved: number;
  owe: number;
  late: number;
  /** Running khatmas (inside their plan), the one owing most first. */
  live: KhatmaState[];
}

/**
 * Today's wird. With running khatmas it is their portions (what مصحفي shows:
 * done once nothing is owed, overdue pages first); without one, pages read
 * against `fallbackGoal`.
 */
export function mushafiToday(
  days: Record<string, number[]>,
  khatmas: MushafiKhatma[],
  marks: MushafiMark[],
  today: string,
  fallbackGoal: number,
): MushafiToday {
  const pages = days[today]?.length ?? 0;
  const live = khatmas
    .filter((k) => !k.del)
    .map((k) => khatmaState(k, marks, today))
    // Not started yet, or past its plan («انتهت المدة») — no portion today.
    .filter((s) => s.live && s.day >= 0 && s.day < s.days)
    .sort((a, b) => b.owe - a.owe);
  if (live.length) {
    const goal = live.reduce((n, s) => n + s.share, 0);
    const owe = live.reduce((n, s) => n + s.owe, 0);
    return { pages, goal, achieved: Math.max(0, goal - owe), owe, late: live.reduce((n, s) => n + s.late, 0), live };
  }
  const goal = Math.max(1, fallbackGoal);
  return { pages, goal, achieved: Math.min(pages, goal), owe: Math.max(0, goal - pages), late: 0, live: [] };
}

export interface TypeStats {
  type: QuranType;
  /** Pages covered in its khatmas, ever (finished ones count whole). */
  pages: number;
  finished: number;
  /** Its khatmas still going (inside or past their plan). */
  running: KhatmaState[];
  /** Pages it advanced per day — its khatmas' newly covered pages, dated by the reading log. */
  days: Record<string, number>;
}

/**
 * Per-type picture. A day's progress in a type = the pages its khatmas covered,
 * each dated by the first day مصحفي logged that page on or after the khatma
 * began (the sync carries pages per day, not per khatma).
 * ponytail: two khatmas over the same page share that page's date.
 */
/**
 * Where each khatma's ribbon stood, per day the app saw it (every pull from
 * مصحفي). It dates the progress the reading log never holds — listening, tafsir
 * by ayah, a printed mushaf with the ribbon moved by hand (owner: the Qur'an page
 * showed pages read in a khatma while the points stayed still). `_base` = where
 * the ribbon stood when first seen: what came before is credited to no day.
 */
export type RibbonTops = Record<string, Record<string, number>>;

export function noteTops(tops: RibbonTops, khatmas: MushafiKhatma[], marks: MushafiMark[], today: string): RibbonTops {
  const out: RibbonTops = {};
  for (const k of khatmas) {
    if (k.del) continue;
    const top = khatmaState(k, marks, today).top;
    const rec = { ...(tops[k.id] ?? {}) };
    if (rec._base === undefined) rec._base = k.s >= today ? k.b : top;
    rec[today] = Math.max(rec[today] ?? 0, top);
    out[k.id] = rec; // ponytail: one number per seen day per khatma — trim if it ever grows
  }
  return out;
}

export function quranTypeStats(
  days: Record<string, number[]>,
  khatmas: MushafiKhatma[],
  marks: MushafiMark[],
  today: string,
  tops?: RibbonTops,
): Record<QuranType, TypeStats> {
  const out = Object.fromEntries(
    QURAN_TYPE_IDS.map((t) => [t, { type: t, pages: 0, finished: 0, running: [], days: {} } as TypeStats]),
  ) as Record<QuranType, TypeStats>;
  const pageDays = new Map<number, string[]>();
  for (const d of Object.keys(days).sort()) {
    for (const p of days[d]) {
      const list = pageDays.get(p);
      if (list) list.push(d);
      else pageDays.set(p, [d]);
    }
  }
  for (const k of khatmas) {
    if (k.del) continue;
    const st = khatmaState(k, marks, today);
    const t = out[st.type];
    t.pages += st.done;
    if (k.f || !st.live) t.finished++;
    else t.running.push(st);
    // A page is dated by the reading log; failing that, by the day the ribbon was seen past it.
    const rec = tops?.[k.id];
    const seen = rec ? Object.keys(rec).filter((d) => d !== '_base').sort() : [];
    const ribbonDay = (p: number) => (rec && p > rec._base ? seen.find((d) => rec[d] >= p) : undefined);
    const byRibbon: Record<string, number> = {};
    for (let p = k.b + 1; p <= st.top; p++) {
      const logged = pageDays.get(p)?.find((x) => x >= k.s && (!k.f || x <= k.f));
      if (logged) t.days[logged] = (t.days[logged] ?? 0) + 1;
      else {
        const d = ribbonDay(p);
        if (d) byRibbon[d] = (byRibbon[d] ?? 0) + 1;
      }
    }
    // A hand-moved ribbon dates at most a heavy day — two days of the plan, two juz at least.
    // More on the khatma's FIRST day = a khatma entered after it was read (owner 2026-11-17: one
    // finished two weeks earlier, logged today, scored a whole khatma in a day) → nothing; on a
    // later day = catching up → the cap. The reading log is never capped.
    const cap = Math.max(40, 2 * Math.ceil(st.total / Math.max(1, k.d)));
    for (const [d, n] of Object.entries(byRibbon)) {
      const credit = n <= cap ? n : d === k.s ? 0 : cap;
      if (credit) t.days[d] = (t.days[d] ?? 0) + credit;
    }
    // Pages read just AHEAD of the ribbon count on the day they were read (owner:
    // progress counts as you read, not only once the ribbon is moved at the end of
    // the wird) — within two days' portion of it, so a page read elsewhere (الكهف
    // on Friday) doesn't. Each page still counts once: past the ribbon it's dated
    // by the loop above, to the same day.
    if (st.live) {
      const ahead = Math.min(st.total + k.b, st.top + Math.max(40, 2 * st.share));
      for (let p = st.top + 1; p <= ahead; p++) {
        const d = pageDays.get(p)?.find((x) => x >= k.s);
        if (d) t.days[d] = (t.days[d] ?? 0) + 1;
      }
    }
  }
  for (const t of QURAN_TYPE_IDS) out[t].running.sort((a, b) => b.owe - a.owe);
  return out;
}

/** Types with a khatma open on `day` (begun, not yet finished). */
export function typesActiveOn(khatmas: MushafiKhatma[], day: string): Set<QuranType> {
  const set = new Set<QuranType>();
  for (const k of khatmas) if (!k.del && k.s <= day && (!k.f || day <= k.f)) set.add(quranTypeOf(k.ty));
  return set;
}

// ── store ───────────────────────────────────────────────────────────────────

interface MushafiState {
  /** The sync code (shared with مصحفي), or null = not linked. */
  code: string | null;
  /** Pages read per day, union of every device. */
  days: Record<string, number[]>;
  khatmas: MushafiKhatma[];
  marks: MushafiMark[];
  /** Each khatma's ribbon per day seen (noteTops). */
  tops: RibbonTops;
  syncedAt: number | null;
  status: 'idle' | 'syncing' | 'ok' | 'fail';
  setCode: (code: string | null) => void;
  apply: (remote: MushafiRemote, at: number) => void;
  setStatus: (s: MushafiState['status']) => void;
}

export const useMushafiStore = create<MushafiState>()(
  persist(
    (set) => ({
      code: null,
      days: {},
      khatmas: [],
      marks: [],
      tops: {},
      syncedAt: null,
      status: 'idle',
      setCode: (code) => set(code ? { code, status: 'idle' } : { code: null, khatmas: [], marks: [], tops: {}, syncedAt: null, status: 'idle' }),
      apply: (remote, at) =>
        set((s) => {
          // The server keeps ~130 days; ours only grows (older days stay for stats).
          const days = { ...s.days };
          for (const [k, v] of Object.entries(remote.days ?? {})) days[k] = [...new Set([...(days[k] ?? []), ...v])].sort((a, b) => a - b);
          const khatmas = (remote.khatmas ?? []).filter((k) => !k.del);
          const marks = (remote.marks ?? []).filter((m) => !m.del);
          return {
            days,
            khatmas,
            marks,
            tops: noteTops(s.tops, khatmas, marks, format(at, 'yyyy-MM-dd')),
            syncedAt: at,
            status: 'ok',
          };
        }),
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'myzikr:mushafi',
      storage: safeStorage,
      partialize: ({ code, days, khatmas, marks, tops, syncedAt }) => ({ code, days, khatmas, marks, tops, syncedAt }),
    },
  ),
);

/** Pages read on a day in مصحفي. */
export const mushafiPagesOn = (dateKey: string) => useMushafiStore.getState().days[dateKey]?.length ?? 0;
