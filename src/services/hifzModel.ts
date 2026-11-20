/**
 * «الحفظ والمراجعة» — PURE: مصحفي's hifz and review sessions in; what you hold by heart,
 * what to review today, and what to memorize next out. HifzPage shows it,
 * scripts/hifz.test.ts checks it.
 *
 * The review, as hifz teachers teach it (القريب والبعيد):
 *  - القريب: a page memorized new (a hifz session) in the last RECENT_DAYS days → every day.
 *  - البعيد: the rest of what you hold, all of it once every `cycle` days. Each day has its
 *    share (held ÷ cycle), the pages longest without review first. Untouched for more
 *    than `cycle` days → late.
 * A page is held when every ayah of it was in a hifz or review session (reviewing what
 * you memorized long ago records it), and is reviewed when ALL its ayat are.
 */
import { startOfDay } from 'date-fns';
import { PAGE_FIRST_AYAH } from '@/data/quranPages';
import { JUZ_START_PAGES } from '@/data/juz';
import { surahs } from '@/data/surahs';
import { SURAH_FIRST, ayahKey, sessionStats, type MushafiSession, type SessionItem } from '@/store/mushafiStore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

const NA = 6236;
const DAY = 86_400_000;
/** القريب: memorized in these last days → reviewed every day. */
export const RECENT_DAYS = 7;
/** The review cycles offered (days). */
export const CYCLES = [7, 10, 14, 21, 30] as const;

/** Local day number of a time. */
export const dayNo = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / DAY);

/** Inclusive ayah / page spans. */
export const pageAyat = (p: number): [number, number] => [PAGE_FIRST_AYAH[p - 1], (PAGE_FIRST_AYAH[p] ?? NA) - 1];
export const pagesAyat = (from: number, to: number): [number, number] => [pageAyat(from)[0], pageAyat(to)[1]];
export const juzPages = (j: number): [number, number] => [JUZ_START_PAGES[j - 1], (JUZ_START_PAGES[j] ?? 605) - 1];
export const surahAyat = (s: number): [number, number] => [SURAH_FIRST[s - 1], SURAH_FIRST[s - 1] + surahs[s - 1].versesCount - 1];
/** Surah + ayah (1-based, clamped into the surah) → ayah index. */
export const ayahIndex = (s: number, x: number) => SURAH_FIRST[s - 1] + Math.min(Math.max(1, Math.round(x) || 1), surahs[s - 1].versesCount) - 1;

export const pagesTxt = (n: number) =>
  n === 1 ? 'صفحة واحدة' : n === 2 ? 'صفحتان' : n >= 3 && n <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`;

/** «الملك كاملة» · «الملك ١–١٥» · «الكهف ١ – مريم ١٠». */
export function rangeTxt(a: number, z: number): string {
  const [s1, x1] = ayahKey(a);
  const [s2, x2] = ayahKey(z);
  const n = surahs[s1 - 1].nameArabic;
  if (s1 !== s2) return `${n} ${ar(x1)} – ${surahs[s2 - 1].nameArabic} ${ar(x2)}`;
  return x1 === 1 && x2 === surahs[s1 - 1].versesCount ? `${n} كاملة` : `${n} ${ar(x1)}${z > a ? `–${ar(x2)}` : ''}`;
}

export interface Range {
  from: number;
  to: number;
}
/** Pages → runs of consecutive pages. */
export function runs(pages: readonly number[]): Range[] {
  const out: Range[] = [];
  for (const p of [...pages].sort((a, b) => a - b)) {
    const r = out[out.length - 1];
    if (r && p === r.to + 1) r.to = p;
    else out.push({ from: p, to: p });
  }
  return out;
}

/** ok: held, not due · today: in today's review · late: البعيد untouched past the cycle. */
export type PageState = 'none' | 'ok' | 'today' | 'late';
export interface PageInfo {
  page: number;
  held: boolean;
  /** Last reviewed whole (its least recent ayah); 0 = not held. */
  last: number;
  /** Held whole since (its last ayah's first time). */
  since: number;
  /** Days it was gone over whole (memorized or reviewed). */
  times: number;
  /** القريب. */
  recent: boolean;
  state: PageState;
}

export interface DayHifz {
  /** Pages memorized new / gone over again, by ayat. */
  fresh: number;
  review: number;
  minutes: number;
}

export interface HifzModel {
  /** Index page − 1. */
  pages: PageInfo[];
  held: number;
  juz: { held: number; total: number }[];
  /** Index surah − 1: ayat held, and the oldest last review among them (0 = none held). */
  surahs: { held: number; total: number; last: number }[];
  today: {
    /** Still to review today. */
    recent: Range[];
    far: Range[];
    left: number;
    /** Held pages gone over today. */
    done: number;
    /** البعيد's daily share, and its size. */
    share: number;
    farCount: number;
    recentCount: number;
    late: number;
  };
  /** The ayah to memorize next; null = no hifz yet, or all of it held. */
  next: number | null;
  days: Map<string, DayHifz>;
  /** The hifz and review sessions, newest first. */
  log: SessionItem[];
}

/** The day's review as a reminder — what is left, by passage; null = nothing left. */
export function reviewReminder(m: HifzModel): { title: string; body: string } | null {
  const t = m.today;
  if (!t.left) return null;
  const parts = [...t.recent, ...t.far].map((r) => rangeTxt(...pagesAyat(r.from, r.to)));
  const body = parts.slice(0, 3).join('، ') + (parts.length > 3 ? '…' : '') + (t.late ? ` · ${pagesTxt(t.late)} متأخرة` : '');
  return { title: `مراجعة حفظك اليوم: ${pagesTxt(t.left)}`, body };
}

const cache = new WeakMap<readonly MushafiSession[], { key: string; m: HifzModel }>();

export function hifzModel(sessions: readonly MushafiSession[], now: number, cycle: number): HifzModel {
  const today = dayNo(now);
  const key = `${today}:${cycle}:${Math.floor(now / 60_000)}`;
  const hit = cache.get(sessions);
  if (hit?.key === key) return hit.m;

  // Per ayah: first and last time memorized/reviewed, on how many days, and whether a hifz session was first.
  const first = new Float64Array(NA);
  const last = new Float64Array(NA);
  const lastDay = new Int32Array(NA);
  const times = new Uint16Array(NA);
  const byHifz = new Uint8Array(NA);
  const list = sessions
    .filter((x) => !x.del && (x.ty === 'hifz' || x.ty === 'review') && x.a <= x.z)
    .sort((p, q) => p.s - q.s);
  for (const x of list) {
    const d = dayNo(x.e);
    for (let i = x.a; i <= Math.min(x.z, NA - 1); i++) {
      if (!first[i]) {
        first[i] = x.e;
        byHifz[i] = x.ty === 'hifz' ? 1 : 0;
      }
      if (x.e > last[i]) last[i] = x.e;
      if (lastDay[i] !== d) {
        lastDay[i] = d;
        times[i]++;
      }
    }
  }

  const sod = startOfDay(now).getTime();
  const recentFrom = sod - (RECENT_DAYS - 1) * DAY;
  const pages: PageInfo[] = [];
  for (let p = 1; p <= 604; p++) {
    const [a, z] = pageAyat(p);
    let lo = Infinity;
    let hi = 0;
    let n = Infinity;
    let fresh = false;
    for (let i = a; i <= z; i++) {
      lo = Math.min(lo, last[i]);
      hi = Math.max(hi, first[i]);
      n = Math.min(n, times[i]);
      if (byHifz[i] && first[i] >= recentFrom) fresh = true;
    }
    const held = lo > 0;
    pages.push({ page: p, held, last: held ? lo : 0, since: held ? hi : 0, times: held ? n : 0, recent: held && fresh, state: 'none' });
  }

  const held = pages.filter((p) => p.held);
  const isToday = (p: PageInfo) => p.last >= sod;
  const recent = held.filter((p) => p.recent);
  const far = held.filter((p) => !p.recent);
  const share = far.length ? Math.ceil(far.length / cycle) : 0;
  const farDone = far.filter(isToday).length;
  const picks = far
    .filter((p) => !isToday(p))
    .sort((p, q) => p.last - q.last || p.page - q.page)
    .slice(0, Math.max(0, share - farDone));
  const recentDue = recent.filter((p) => !isToday(p));
  const picked = new Set(picks.map((p) => p.page));
  let late = 0;
  for (const p of held) {
    const isLate = !p.recent && today - dayNo(p.last) > cycle;
    if (isLate) late++;
    p.state = isLate ? 'late' : picked.has(p.page) || (p.recent && !isToday(p)) ? 'today' : 'ok';
  }

  const juz = Array.from({ length: 30 }, (_, j) => {
    const [p0, p1] = juzPages(j + 1);
    return { held: held.filter((p) => p.page >= p0 && p.page <= p1).length, total: p1 - p0 + 1 };
  });
  const surahRows = surahs.map((_, s) => {
    const [a, z] = surahAyat(s + 1);
    let n = 0;
    let lo = Infinity;
    for (let i = a; i <= z; i++)
      if (first[i]) {
        n++;
        lo = Math.min(lo, last[i]);
      }
    return { held: n, total: z - a + 1, last: n ? lo : 0 };
  });

  // Next: on from the latest hifz session, to the end of its surah; then the surah you're
  // heading to — forward (the one before is held) or backward (from the end of the Mushaf).
  let next: number | null = null;
  const lastHifz = [...list].reverse().find((x) => x.ty === 'hifz');
  if (lastHifz) {
    const gap = (s: number) => {
      if (s < 1 || s > 114) return -1;
      const [a, z] = surahAyat(s);
      for (let i = a; i <= z; i++) if (!first[i]) return i;
      return -1;
    };
    const [s] = ayahKey(lastHifz.z);
    for (let i = lastHifz.z + 1; i <= surahAyat(s)[1] && next == null; i++) if (!first[i]) next = i;
    if (next == null) {
      const forward = s === 1 || gap(s - 1) < 0;
      for (const t of forward ? [s + 1, s - 1] : [s - 1, s + 1]) {
        const g = gap(t);
        if (g >= 0) {
          next = g;
          break;
        }
      }
    }
    if (next == null) for (let i = 0; i < NA && next == null; i++) if (!first[i]) next = i;
  }

  const days = new Map<string, DayHifz>();
  const log: SessionItem[] = [];
  for (const x of sessionStats(sessions).items) {
    if (x.ty !== 'hifz' && x.ty !== 'review') continue;
    log.push(x);
    let all = 0;
    let fr = 0;
    for (const f of x.pages.values()) all += f;
    for (const f of x.fresh.values()) fr += f;
    const d = days.get(x.day) ?? { fresh: 0, review: 0, minutes: 0 };
    d.fresh += fr;
    d.review += all - fr;
    d.minutes += x.minutes;
    days.set(x.day, d);
  }
  log.reverse();

  const m: HifzModel = {
    pages,
    held: held.length,
    juz,
    surahs: surahRows,
    today: {
      recent: runs(recentDue.map((p) => p.page)),
      far: runs(picks.map((p) => p.page)),
      left: recentDue.length + picks.length,
      done: held.filter(isToday).length,
      share,
      farCount: far.length,
      recentCount: recent.length,
      late,
    },
    next,
    days,
    log,
  };
  cache.set(sessions, { key, m });
  return m;
}
