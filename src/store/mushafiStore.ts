import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { safeStorage } from './safeStorage';
import { QURAN_TYPE_IDS, quranTypeOf, type QuranType } from '@/data/quranTypes';
import { PAGE_FIRST_AYAH } from '@/data/quranPages';
import { JUZ_START_PAGES } from '@/data/juz';
import { surahs } from '@/data/surahs';

/**
 * «مصحفي» — the Quran lives in a separate app (H:\Works\mushaf). Its sync
 * server (a secret 16-letter code → one JSON) is where reading is recorded:
 * pages read per day, khatmas, bookmarks, sessions. This app only READS that state —
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

/** A session's kind. NB: `hifz` here is NEW memorization — a khatma's `ty: 'hifz'` is review (مراجعة). */
export type SessionType = 'tilawa' | 'listen' | 'hifz' | 'review';

/**
 * «جلسة» in مصحفي: reading, listening, memorizing or reviewing from any place,
 * outside the khatmas — started and stopped there, or entered by hand after the fact.
 */
export interface MushafiSession {
  id: string;
  ty: SessionType;
  /** First and last ayah, inclusive: 0 = الفاتحة ١ … 6235 = الناس ٦. */
  a: number;
  z: number;
  /** Start and end (ms). A manual entry of unknown length has e === s. */
  s: number;
  e: number;
  /** 1 = entered by hand after it happened. */
  m?: 1;
  t: number;
  del?: 1;
}

export interface MushafiRemote {
  days?: Record<string, number[]>;
  khatmas?: MushafiKhatma[];
  marks?: MushafiMark[];
  sessions?: MushafiSession[];
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
  /** Which pages those were, per day — a session over the same pages isn't credited twice. */
  pagesOn: Record<string, Set<number>>;
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

/**
 * The day khatma `k`'s ribbon was first seen past each of its pages (index = page),
 * up to `top`: pages it stood past when first seen → that first day (done by then).
 * Without a ribbon log, nothing is known. Running max: a ribbon moved back doesn't un-pass.
 */
function passDays(k: MushafiKhatma, rec: Record<string, number> | undefined, top: number): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  if (!rec) return out;
  const seen = Object.keys(rec).filter((d) => d !== '_base').sort();
  let p = k.b + 1;
  for (; p <= Math.min(rec._base, top) && seen[0]; p++) out[p] = seen[0];
  let max = 0;
  for (const d of seen) {
    max = Math.max(max, rec[d]);
    for (; p <= Math.min(max, top); p++) out[p] = d;
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
    QURAN_TYPE_IDS.map((t) => [t, { type: t, pages: 0, finished: 0, running: [], days: {}, pagesOn: {} } as TypeStats]),
  ) as Record<QuranType, TypeStats>;
  const pageDays = new Map<number, string[]>();
  for (const d of Object.keys(days).sort()) {
    for (const p of days[d]) {
      const list = pageDays.get(p);
      if (list) list.push(d);
      else pageDays.set(p, [d]);
    }
  }
  const live = khatmas.filter((k) => !k.del).map((k) => ({ k, st: khatmaState(k, marks, today) }));
  const passes = live.map(({ k, st }) => ({ id: k.id, at: passDays(k, tops?.[k.id], st.top) }));
  /**
   * The reading log has no khatma on it: one day's page belongs to the khatma that
   * passed it FIRST (owner 2026-11-21: 48 pages listened scored 10 — the reading
   * khatma, ahead of the listening one, had logged them days before, and they were
   * credited to those days). So a khatma's page takes only a log after every other
   * khatma that passed it earlier, none after its own ribbon passed it, and none
   * from before its ribbon came within `near` pages of it (read ahead, see below).
   */
  const logDay = (k: MushafiKhatma, own: (string | undefined)[], base: number | undefined, near: number, p: number) => {
    const mine = own[p];
    let after = '';
    for (const o of passes) {
      const d = o.id === k.id ? undefined : o.at[p];
      if (d && (!mine || d < mine) && d > after) after = d;
    }
    // Pages it stood past when first seen were passed at an unknown time: no bound from them.
    const close = base !== undefined && p - near > base ? own[p - near] : undefined;
    return pageDays
      .get(p)
      ?.find((x) => x >= k.s && x > after && (!mine || x <= mine) && (!close || x >= close) && (!k.f || x <= k.f));
  };
  for (const [i, { k, st }] of live.entries()) {
    const t = out[st.type];
    t.pages += st.done;
    if (k.f || !st.live) t.finished++;
    else t.running.push(st);
    // A page is dated by the reading log; failing that, by the day the ribbon was seen past it.
    const rec = tops?.[k.id];
    const own = passes[i].at;
    const near = Math.max(40, 2 * st.share);
    const ribbonDay = (p: number) => (rec && p > rec._base ? own[p] : undefined);
    const byRibbon: Record<string, number> = {};
    const ribbonPages: Record<string, number[]> = {};
    const credit = (d: string, p: number) => {
      t.days[d] = (t.days[d] ?? 0) + 1;
      (t.pagesOn[d] ??= new Set()).add(p);
    };
    for (let p = k.b + 1; p <= st.top; p++) {
      const logged = logDay(k, own, rec?._base, near, p);
      if (logged) credit(logged, p);
      else {
        const d = ribbonDay(p);
        if (d) {
          byRibbon[d] = (byRibbon[d] ?? 0) + 1;
          (ribbonPages[d] ??= []).push(p);
        }
      }
    }
    // No daily ceiling (owner 2026-11-21: «ممكن أسمع ١٠٠ صفحة أو أكثر») — except a jump past
    // two days of the plan (two juz at least) on the khatma's FIRST day: a khatma entered after it
    // was read (owner 2026-11-17: one finished two weeks earlier, logged today, scored a whole
    // khatma in a day) → nothing.
    const firstDayMax = Math.max(40, 2 * Math.ceil(st.total / Math.max(1, k.d)));
    for (const [d, n] of Object.entries(byRibbon)) {
      if (d === k.s && n > firstDayMax) continue;
      t.days[d] = (t.days[d] ?? 0) + n;
      for (const p of ribbonPages[d]) (t.pagesOn[d] ??= new Set()).add(p);
    }
    // Pages read just AHEAD of the ribbon count on the day they were read (owner:
    // progress counts as you read, not only once the ribbon is moved at the end of
    // the wird) — within two days' portion of it, so a page read elsewhere (الكهف
    // on Friday) doesn't. Each page still counts once: past the ribbon it's dated
    // by the loop above, to the same day.
    if (st.live) {
      const ahead = Math.min(st.total + k.b, st.top + near);
      for (let p = st.top + 1; p <= ahead; p++) {
        const d = logDay(k, own, rec?._base, near, p);
        if (d) credit(d, p);
      }
    }
  }
  for (const t of QURAN_TYPE_IDS) out[t].running.sort((a, b) => b.owe - a.owe);
  return out;
}

// ── sessions ──────────────────────────────────────────────────────────────

const NA = 6236;
let pageTable: Uint16Array | null = null;
/** Standard (604) page of ayah i. */
export function pageOfAyah(i: number): number {
  if (!pageTable) {
    const t = (pageTable = new Uint16Array(NA));
    PAGE_FIRST_AYAH.forEach((first, j) => t.fill(j + 1, first, PAGE_FIRST_AYAH[j + 1] ?? NA));
  }
  return pageTable[i];
}
const ayatOnPage = (p: number) => (PAGE_FIRST_AYAH[p] ?? NA) - PAGE_FIRST_AYAH[p - 1];
/** Each surah's first ayah index (0-based by surah). */
export const SURAH_FIRST = surahs.reduce<number[]>((a, _, j) => (a.push(j ? a[j - 1] + surahs[j - 1].versesCount : 0), a), []);
/** Ayah index → [surah, ayah] (1-based). */
export function ayahKey(i: number): [number, number] {
  let s = SURAH_FIRST.length - 1;
  while (SURAH_FIRST[s] > i) s--;
  return [s + 1, i - SURAH_FIRST[s] + 1];
}
const KAHF: [number, number] = [SURAH_FIRST[17], SURAH_FIRST[18] - 1];

export interface SessionItem extends MushafiSession {
  /** Its day: the local date it began. */
  day: string;
  /** Its length; 0 = not known (a manual entry without one). */
  minutes: number;
  /** Page → the share of it the session covered (by ayat — ponytail: a long ayah weighs as a short one). */
  pages: Map<number, number>;
  /** hifz only: the share memorized for the FIRST time — no earlier hifz/review session held it. */
  fresh: Map<number, number>;
}

export interface SessionStats {
  /** Oldest first. */
  items: SessionItem[];
  byDay: Map<string, SessionItem[]>;
  /** Per page (index page−1): when the whole page was last memorized or reviewed — its oldest ayah's last time; 0 = not every ayah of it is memorized. */
  pageTouched: number[];
  /** Pages memorized whole (every ayah in a hifz or review session), and whole ajzaa. */
  memorized: number;
  juz: number;
  /** Fridays on which the day's tilawa/listen sessions together covered all of سورة الكهف. */
  kahfFridays: Set<string>;
}

const statsCache = new WeakMap<readonly MushafiSession[], SessionStats>();

/**
 * The sessions, read once per list (cached): each one's pages, what a hifz session memorized
 * for the first time, the memorized pages and ajzaa, and the Fridays with الكهف.
 * Memorized = in ANY hifz or review session — reviewing what you memorized long ago records it.
 */
export function sessionStats(sessions: readonly MushafiSession[]): SessionStats {
  const hit = statsCache.get(sessions);
  if (hit) return hit;
  const touched = new Float64Array(NA); // last hifz/review per ayah; 0 = never
  const items: SessionItem[] = [];
  const byDay = new Map<string, SessionItem[]>();
  const kahf = new Map<string, Uint8Array>();
  for (const x of [...sessions].filter((v) => !v.del && v.a <= v.z).sort((p, q) => p.s - q.s)) {
    const pages = new Map<number, number>();
    const fresh = new Map<number, number>();
    const day = format(x.s, 'yyyy-MM-dd');
    for (let i = x.a; i <= Math.min(x.z, NA - 1); i++) {
      const p = pageOfAyah(i);
      pages.set(p, (pages.get(p) ?? 0) + 1); // ayat now, shares below: a whole page is exactly 1
      if (x.ty === 'hifz' && !touched[i]) fresh.set(p, (fresh.get(p) ?? 0) + 1);
      if (x.ty === 'hifz' || x.ty === 'review') touched[i] = Math.max(touched[i], x.e);
      if ((x.ty === 'tilawa' || x.ty === 'listen') && i >= KAHF[0] && i <= KAHF[1] && new Date(x.s).getDay() === 5) {
        let seen = kahf.get(day);
        if (!seen) kahf.set(day, (seen = new Uint8Array(KAHF[1] - KAHF[0] + 1)));
        seen[i - KAHF[0]] = 1;
      }
    }
    for (const m of [pages, fresh]) for (const [p, n] of m) m.set(p, n / ayatOnPage(p));
    const it: SessionItem = { ...x, day, minutes: Math.max(0, (x.e - x.s) / 60_000), pages, fresh };
    items.push(it);
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }
  const pageTouched = PAGE_FIRST_AYAH.map((first, j) => {
    let lo = Infinity;
    for (let i = first; i < (PAGE_FIRST_AYAH[j + 1] ?? NA); i++) lo = Math.min(lo, touched[i]);
    return lo;
  });
  const juz = JUZ_START_PAGES.filter((first, j) => {
    for (let p = first; p < (JUZ_START_PAGES[j + 1] ?? 605); p++) if (!pageTouched[p - 1]) return false;
    return true;
  }).length;
  const out: SessionStats = {
    items,
    byDay,
    pageTouched,
    memorized: pageTouched.filter(Boolean).length,
    juz,
    kahfFridays: new Set([...kahf].filter(([, seen]) => seen.every(Boolean)).map(([d]) => d)),
  };
  statsCache.set(sessions, out);
  return out;
}

export interface SessionCredit {
  /** Pages, after what the same day's khatmas already counted (each page once). */
  tilawa: number;
  listen: number;
  /** Reviewed — a review session, and a hifz session over what was memorized before. */
  review: number;
  /** Memorized for the first time. */
  hifz: number;
}

/**
 * What one session adds beyond the khatmas (`qt`, quranTypeStats): a page a khatma
 * already credited that day isn't counted again — reading your khatma's wird inside
 * a session counts once. Reading = against every reading khatma; listening = against
 * listening ones; review = against review (ty hifz) ones. New memorization stands alone.
 */
export function sessionCredit(x: SessionItem, qt?: Record<QuranType, TypeStats>): SessionCredit {
  const on = (...tys: QuranType[]) => {
    const set = new Set<number>();
    for (const ty of tys) for (const p of qt?.[ty].pagesOn[x.day] ?? []) set.add(p);
    return set;
  };
  const sum = (m: Map<number, number>, skip?: Set<number>) => {
    let n = 0;
    for (const [p, f] of m) if (!skip?.has(p)) n += f;
    return n;
  };
  const c: SessionCredit = { tilawa: 0, listen: 0, review: 0, hifz: 0 };
  if (x.ty === 'tilawa') c.tilawa = sum(x.pages, on('tilawa', 'tafsir', 'hifz'));
  else if (x.ty === 'listen') c.listen = sum(x.pages, on('listen'));
  else if (x.ty === 'review') c.review = sum(x.pages, on('hifz'));
  else {
    c.hifz = sum(x.fresh);
    const again = new Map([...x.pages].map(([p, f]) => [p, f - (x.fresh.get(p) ?? 0)]));
    c.review = sum(again, on('hifz'));
  }
  return c;
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
  /** مصحفي's sessions (none deleted), with the ones recorded here not yet on the server. */
  sessions: MushafiSession[];
  /** Recorded or deleted here (HifzPage), sent with the next pull until the server answers with them. */
  pending: MushafiSession[];
  /** Each khatma's ribbon per day seen (noteTops). */
  tops: RibbonTops;
  syncedAt: number | null;
  status: 'idle' | 'syncing' | 'ok' | 'fail';
  setCode: (code: string | null) => void;
  apply: (remote: MushafiRemote, at: number) => void;
  /** New sessions, or deletions ({id, t, del: 1}) — shown at once, sent on the next pull. */
  addSessions: (xs: MushafiSession[]) => void;
  /** The server has these (same id and t): stop sending them. */
  sent: (xs: MushafiSession[]) => void;
  setStatus: (s: MushafiState['status']) => void;
}

/** Per id the newest (by t). */
export function newestById(...lists: readonly MushafiSession[][]): MushafiSession[] {
  const by = new Map<string, MushafiSession>();
  for (const l of lists) for (const x of l) if (!by.has(x.id) || x.t > by.get(x.id)!.t) by.set(x.id, x);
  return [...by.values()];
}

export const useMushafiStore = create<MushafiState>()(
  persist(
    (set) => ({
      code: null,
      days: {},
      khatmas: [],
      marks: [],
      sessions: [],
      pending: [],
      tops: {},
      syncedAt: null,
      status: 'idle',
      setCode: (code) =>
        set(
          code
            ? { code, status: 'idle' }
            : { code: null, khatmas: [], marks: [], sessions: [], pending: [], tops: {}, syncedAt: null, status: 'idle' },
        ),
      apply: (remote, at) =>
        set((s) => {
          // The server keeps ~130 days; ours only grows (older days stay for stats).
          const days = { ...s.days };
          for (const [k, v] of Object.entries(remote.days ?? {})) days[k] = [...new Set([...(days[k] ?? []), ...v])].sort((a, b) => a - b);
          const khatmas = (remote.khatmas ?? []).filter((k) => !k.del);
          const marks = (remote.marks ?? []).filter((m) => !m.del);
          // A server from before the sessions sends none: keep ours. Ours not yet sent stay on top.
          const sessions = newestById(remote.sessions ?? s.sessions, s.pending).filter((x) => !x.del);
          return {
            days,
            khatmas,
            marks,
            sessions,
            tops: noteTops(s.tops, khatmas, marks, format(at, 'yyyy-MM-dd')),
            syncedAt: at,
            status: 'ok',
          };
        }),
      addSessions: (xs) =>
        set((s) => ({
          sessions: newestById(s.sessions, xs).filter((x) => !x.del),
          pending: newestById(s.pending, xs),
        })),
      sent: (xs) =>
        set((s) => ({ pending: s.pending.filter((p) => !xs.some((x) => x.id === p.id && x.t === p.t)) })),
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'myzikr:mushafi',
      storage: safeStorage,
      partialize: ({ code, days, khatmas, marks, sessions, pending, tops, syncedAt }) => ({
        code,
        days,
        khatmas,
        marks,
        sessions,
        pending,
        tops,
        syncedAt,
      }),
    },
  ),
);

/** Pages read on a day in مصحفي. */
export const mushafiPagesOn = (dateKey: string) => useMushafiStore.getState().days[dateKey]?.length ?? 0;
