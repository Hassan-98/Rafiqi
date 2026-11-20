import type { LbRow } from '@/services/leaderboard';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

/**
 * «التيجان» — pure model (tested: scripts/crowns.test.ts). Whoever leads a
 * period ALONE right now wears its crown: «تاج اليوم» (today), «تاج الأسبوع»
 * (Saturday → today), «تاج الشهر» (the 1st → today). It moves the moment the
 * lead is lost and is gone when the period rolls over (`liveCrowns`). Rows come
 * from the `leaderboard()` RPC (leaderboard.ts), which never returns user ids,
 * so a person is `tag` + `name` (+ `isMe`).
 */

export type CrownPeriod = 'day' | 'week' | 'month';
export const CROWN_PERIODS: readonly CrownPeriod[] = ['day', 'week', 'month'];
export type Person = Pick<LbRow, 'name' | 'tag' | 'isMe'>;

export interface Crown {
  /** The period's first day — the crown is void once the running period has another key. */
  key: string;
  who: Person;
  points: number;
  /** The lead over #2, as a share of #2's points (0.25 = 25% ahead). */
  lead: number;
  /** Participants in the period. */
  total: number;
  /** Consecutive periods won, this one included (1 = no streak). */
  streak: number;
}
export type Crowns = Partial<Record<CrownPeriod, Crown>>;
export type CrownKeys = Record<CrownPeriod, string>;

/** A lead of at least this share over #2 earns the flourish. */
export const DOMINANT_LEAD = 0.25;
/** A field smaller than this (2–4 people) gets the quieter crown. */
export const FULL_FIELD = 5;

/** The same person on two boards. The 4-digit tag can collide, so the name must match too. */
export const samePerson = (a: Person, b: Person) => (a.isMe && b.isMe) || (a.tag === b.tag && a.name === b.name);

/** #1 of a ranking when they lead alone and at least two compete (a tie crowns no one). */
export function leaderOf(rows: readonly LbRow[]): { row: LbRow; second: number } | null {
  const [a, b] = [...rows].sort((x, y) => y.points - x.points);
  if (!a || !b || a.total < 2 || a.points <= 0 || a.points <= b.points) return null;
  return { row: a, second: b.points };
}

/** A finished period's winner (for streaks), or null. */
export function winnerOf(rows: readonly LbRow[]): Person | null {
  const l = leaderOf(rows);
  return l ? { name: l.row.name, tag: l.row.tag, isMe: l.row.isMe } : null;
}

/**
 * The crown of a running period. `past` = the winners of the periods before it,
 * newest first (yesterday, the day before…) — the run of the same person is the streak.
 */
export function crownOf(rows: readonly LbRow[], key: string, past: readonly (Person | null)[] = []): Crown | null {
  const l = leaderOf(rows);
  if (!l) return null;
  const who: Person = { name: l.row.name, tag: l.row.tag, isMe: l.row.isMe };
  let streak = 1;
  for (const w of past) {
    if (!w || !samePerson(w, who)) break;
    streak++;
  }
  return { key, who, points: l.row.points, lead: (l.row.points - l.second) / l.second, total: l.row.total, streak };
}

/** Only the crowns of the periods running now (a stale cache over midnight shows nothing). */
export function liveCrowns(c: Crowns, keys: CrownKeys): Crowns {
  const out: Crowns = {};
  for (const p of CROWN_PERIODS) if (c[p] && c[p]!.key === keys[p]) out[p] = c[p];
  return out;
}

// ── a person's emblem ──────────────────────────────────────────────────────
export interface Emblem {
  /** Held crowns, day → month. One combined emblem. */
  periods: CrownPeriod[];
  /** All three: «التاج الكامل». */
  full: boolean;
  /** ≥ 25% ahead of #2 in a full field. */
  dominant: boolean;
  /** Every crown held was won in a field of 2–4. */
  quiet: boolean;
  /** The longest run (≥ 2); the higher period wins a tie. */
  streak: { period: CrownPeriod; n: number } | null;
  /** 1 (day) … 6 (all three) — for ordering and tests. */
  weight: number;
}

const WEIGHT: Record<CrownPeriod, number> = { day: 1, week: 2, month: 3 };

export function emblemOf(c: Crowns, who: Person): Emblem | null {
  const held = CROWN_PERIODS.filter((p) => c[p] && samePerson(c[p]!.who, who));
  if (!held.length) return null;
  const crowns = held.map((p) => c[p]!);
  let streak: Emblem['streak'] = null;
  for (const p of held) {
    const n = c[p]!.streak;
    if (n >= 2 && (!streak || n >= streak.n)) streak = { period: p, n };
  }
  return {
    periods: held,
    full: held.length === 3,
    dominant: crowns.some((x) => x.total >= FULL_FIELD && x.lead >= DOMINANT_LEAD),
    quiet: crowns.every((x) => x.total < FULL_FIELD),
    streak,
    weight: held.reduce((n, p) => n + WEIGHT[p], 0),
  };
}

// ── words ──────────────────────────────────────────────────────────────────
const PERIOD_WORD: Record<CrownPeriod, string> = { day: 'اليوم', week: 'الأسبوع', month: 'الشهر' };

/** «تاج الأسبوع», «تاج اليوم والشهر», «التاج الكامل». */
export function crownTitle(periods: readonly CrownPeriod[]): string {
  if (periods.length === 3) return 'التاج الكامل';
  return `تاج ${periods.map((p) => PERIOD_WORD[p]).join(' و')}`;
}

/** «يومان متتاليان» / «٣ أسابيع متتالية» / «١١ يوماً متتالياً». */
export function streakText(period: CrownPeriod, n: number): string {
  const [two, few, many] =
    period === 'day'
      ? ['يومان متتاليان', 'أيام متتالية', 'يوماً متتالياً']
      : period === 'week'
        ? ['أسبوعان متتاليان', 'أسابيع متتالية', 'أسبوعاً متتالياً']
        : ['شهران متتاليان', 'أشهر متتالية', 'شهراً متتالياً'];
  return n === 2 ? two : `${ar(n)} ${n <= 10 ? few : many}`;
}

/** The tooltip / accessible name: «تاج الأسبوع · ٣ أسابيع متتالية · بفارق واسع». */
export function emblemLabel(e: Emblem): string {
  return [crownTitle(e.periods), e.streak ? streakText(e.streak.period, e.streak.n) : '', e.dominant ? 'بفارق واسع' : '']
    .filter(Boolean)
    .join(' · ');
}

// ── moments ────────────────────────────────────────────────────────────────
export const momentKey = (p: CrownPeriod, key: string) => `${p}|${key}`;

/** My crowns not celebrated yet (each (period, key) once, ever). */
export function newlyWon(c: Crowns, celebrated: readonly string[]): CrownPeriod[] {
  return CROWN_PERIODS.filter((p) => c[p]?.who.isMe && !celebrated.includes(momentKey(p, c[p]!.key)));
}

/** Crowns I held in a period that is still running and hold no longer — a lost lead, not a rollover. */
export function lostSince(prev: Crowns, next: Crowns, keys: CrownKeys): CrownPeriod[] {
  return CROWN_PERIODS.filter((p) => prev[p]?.who.isMe && prev[p]!.key === keys[p] && !next[p]?.who.isMe);
}
