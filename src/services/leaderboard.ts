import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, format, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { supabase, guestClient, isSupabaseConfigured } from '@/services/supabaseClient';
import { isDesktopShell } from '@/services/NotificationService';
import { safeStorage } from '@/store/safeStorage';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTargetsStore } from '@/store/targetsStore';
import { collectBadgeSnapshot, useBadgeMetricsStore } from '@/services/BadgeEngine';
import { rescheduleSmartNotifications, watchSlice } from '@/services/smartNotifications';
import { SLEEP_ADHKAR } from '@/components/adhkar/adhkarSets';
import { morningAdhkar, eveningAdhkar, briefAdhkar } from '@/data/adhkar';
import { scoreDay, type DayScore, type ScoreInput } from '@/services/leaderboardScore';
import {
  crownOf,
  liveCrowns,
  lostSince,
  momentKey,
  winnerOf,
  type CrownKeys,
  type CrownPeriod,
  type Crowns,
  type Person,
} from '@/services/crowns';
import { toast } from '@/store/toastStore';
import { useNotificationStore } from '@/store/notificationStore';
import { registerCompanionSource } from '@/services/attention/registry';
import { raceMoments } from '@/services/raceMoments';
import type { DhikrItem } from '@/types';

/**
 * «الترتيب» client: scores the day locally (leaderboardScore.ts), uploads the
 * totals of today and yesterday (logs can be back-filled a day) to Supabase,
 * and reads rankings through the `leaderboard()` RPC — see
 * supabase/migrations/20261114120000_leaderboard.sql. Every failure is quiet:
 * offline → `status: 'offline'`, migration not applied → `'missing'` (UI hides
 * or explains); the local points always work.
 */

export type LbPeriod = 'today' | 'yesterday' | 'week' | 'month';
export interface LbRow {
  rank: number;
  points: number;
  /** null = the user hid their name → show `tag`. */
  name: string | null;
  tag: number;
  isMe: boolean;
  /** Participants in the period. */
  total: number;
}
/** 'signin': this device took part with a Google account that is signed out now (see `who`). */
export type LbStatus = 'idle' | 'ok' | 'offline' | 'missing' | 'signin';

interface LbState {
  status: LbStatus;
  /** The caller's standing per period (null = no points there yet). */
  mine: Partial<Record<LbPeriod, LbRow | null>>;
  /** Today's first three (Home). */
  top: LbRow[];
  checkedAt: number;
  /** «سجل الشرف»: a day's final tier (1 / 3 / 10) — recorded the day after. Persisted. */
  honors: Record<string, 1 | 3 | 10>;
  /** «التيجان»: who leads today / the week / the month right now (crowns.ts). */
  crowns: Crowns;
  /** Past winners for the streaks, fetched once a day per identity. Persisted. */
  crownHist: { at: string; days: (Person | null)[]; weeks: (Person | null)[] } | null;
  /** Crown moments already shown: `day|2026-11-18` (celebrated), `lost|day|…` (noted). Persisted. */
  crownMoments: string[];
  /** The points of #1 and #2 per period at the last check — the gaps in «لحظات الترتيب». */
  heads: Partial<Record<LbPeriod, { first: number; second: number | null }>>;
}

export const useLeaderboardStore = create<LbState>()(
  persist(
    (): LbState => ({ status: 'idle', mine: {}, top: [], checkedAt: 0, honors: {}, crowns: {}, crownHist: null, crownMoments: [], heads: {} }),
    {
      name: 'myzikr:leaderboard',
      storage: safeStorage,
      partialize: ({ honors, crownHist, crownMoments }) => ({ honors, crownHist, crownMoments }),
    },
  ),
);

// ── dates ──────────────────────────────────────────────────────────────────
const dk = (d: Date) => format(d, 'yyyy-MM-dd');
export function periodRange(p: LbPeriod, now = new Date()): [string, string] {
  if (p === 'today') return [dk(now), dk(now)];
  if (p === 'yesterday') return [dk(subDays(now, 1)), dk(subDays(now, 1))];
  // The month as in «الإحصائيات»: its 1st → today. The server takes ranges up to 31 days.
  if (p === 'month') return [dk(startOfMonth(now)), dk(now)];
  // The app's weeks run Saturday → Friday (badges, stats).
  return [dk(startOfWeek(now, { weekStartsOn: 6 })), dk(now)];
}

/**
 * The running week's and month's days BEFORE yesterday (today and yesterday go
 * up on every push) — the board sums them for «الأسبوع» / «الشهر». Owner
 * 2026-11-17: «نقاطي الشهرية ٢٨٩٣ والترتيب ٦٩١» — only two days were ever sent.
 */
export function backfillDays(now = new Date()): string[] {
  const from = [periodRange('week', now)[0], periodRange('month', now)[0]].sort()[0];
  const until = periodRange('yesterday', now)[0];
  const out: string[] = [];
  for (let d = parseISO(from); dk(d) < until; d = addDays(d, 1)) out.push(dk(d));
  return out;
}

// ── local points ───────────────────────────────────────────────────────────
const repsOf = (items: DhikrItem[]) => items.reduce((n, it) => n + (it.count || 1), 0);

function scoreInput(): ScoreInput {
  return {
    ...collectBadgeSnapshot(),
    targets: useTargetsStore.getState().targets,
    periods: useTargetsStore.getState().history,
    setReps: {
      // The FULL sets, «مختصر» or not — the brief set earns its share (owner 2026-11-18).
      morning: repsOf(morningAdhkar),
      evening: repsOf(eveningAdhkar),
      sleep: repsOf(SLEEP_ADHKAR),
    },
    briefReps: { morning: repsOf(briefAdhkar(morningAdhkar, true)), evening: repsOf(briefAdhkar(eveningAdhkar, true)) },
  };
}

export function localScore(dateKey: string): DayScore {
  return scoreDay(scoreInput(), dateKey);
}

/** Live points of a day (re-scored whenever the badge metrics republish = any logged deed). */
export function useDayScore(dateKey: string): DayScore {
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  return useMemo(() => localScore(dateKey), [metrics, dateKey]);
}

/** How far back «سباقك مع نفسك» looks: a whole month + the six full months before it (31 + 184). */
export const HISTORY_DAYS = 215;
let totalsCache: { metrics: unknown; byEnd: Map<string, Record<string, number>> } | null = null;

/**
 * Every day's points over the HISTORY_DAYS ending at `now` (today, or the last
 * day of a month browsed in «الترتيب») from ONE snapshot — the self-race, the
 * harvest and the evening nudge share it, and it is re-scored only when the
 * metrics republish or the day turns.
 */
export function localTotals(now = new Date()): Record<string, number> {
  const metrics = useBadgeMetricsStore.getState().metrics;
  const end = dk(now);
  if (totalsCache?.metrics !== metrics) totalsCache = { metrics, byEnd: new Map() };
  const hit = totalsCache.byEnd.get(end);
  if (hit) return hit;
  const input = scoreInput();
  const totals: Record<string, number> = {};
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const k = dk(subDays(now, i));
    totals[k] = scoreDay(input, k).total;
  }
  totalsCache.byEnd.set(end, totals);
  return totals;
}

/** localTotals, live — up to today, or up to `end`. */
export function useLocalTotals(end?: Date): Record<string, number> {
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  return useMemo(() => localTotals(end), [metrics, end]);
}

// ── server ─────────────────────────────────────────────────────────────────
// …and 'anonymous_provider_disabled': guests can't join until anonymous sign-ins are on.
const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205', 'anonymous_provider_disabled']);
function fail(e: { code?: string; message?: string }): null {
  const missing = MISSING.has(e.code ?? '');
  useLeaderboardStore.setState({ status: missing ? 'missing' : 'offline' });
  if (!missing) console.warn('[leaderboard]', e.message ?? e);
  return null;
}

type Db = typeof supabase;
export interface Who {
  db: Db;
  uid: string;
}
let signingIn: Promise<Who | null> | null = null;
/** Device-local (not `myzikr:*`, never synced): this device has taken part as a Google account. */
const TOOK_PART_AS_GOOGLE = 'rafiqi-lb-google';
/** Anonymous sign-ins off in the dashboard: don't knock on every logged deed. */
let guestOffUntil = 0;

/**
 * Never a real participant: the dev server (vite) or a browser driven by a
 * test (headless Chrome/CDP, Playwright → navigator.webdriver). Owner
 * 2026-11-21: a dev guest «حسن» and nameless test guests showed up as people.
 * Such a client makes no new guest, uploads nothing, and takes a guest's rows down.
 */
const NOT_REAL = import.meta.env.DEV || (typeof navigator !== 'undefined' && navigator.webdriver === true);

/** Where a profile uploads from, for the owner's audit (supabase/audit/leaderboard_participants.sql); never shown in the app. */
const client = () =>
  `${Capacitor.getPlatform() === 'android' ? 'android' : isDesktopShell() ? 'desktop' : 'web'}/${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'}`;
/** The server is still without 20261121120000_leaderboard_client.sql: upload profiles without `client`. */
let noClientColumn = false;

/**
 * Who uploads and reads: the Google account when signed in (one row across
 * devices), otherwise this device's anonymous guest — created on first use, so
 * no sign-in is ever needed. Never creates a guest for someone who left the board.
 */
export async function who(): Promise<Who | null> {
  // Before the stored Google session is restored, a signed-in user looks like a guest.
  if (!isSupabaseConfigured || !useAuthStore.getState().ready) return null;
  const user = useAuthStore.getState().user;
  if (user) {
    try {
      localStorage.setItem(TOOK_PART_AS_GOOGLE, '1');
    } catch {
      /* private mode: no guard, as before */
    }
    return { db: supabase, uid: user.id };
  }
  // A device that took part with its Google account never falls back to a guest:
  // after a sign-out or an expired session the same days went up again under a
  // new guest (owner 2026-11-18: «شيم» twice, identical points). Sign in instead.
  let tookPartAsGoogle = false;
  try {
    tookPartAsGoogle = !!localStorage.getItem(TOOK_PART_AS_GOOGLE);
  } catch {
    /* ignore */
  }
  if (tookPartAsGoogle) {
    useLeaderboardStore.setState({ status: 'signin' });
    return null;
  }
  const db = guestClient() as unknown as Db;
  const { data } = await db.auth.getSession();
  if (data.session) return { db, uid: data.session.user.id };
  if (NOT_REAL || !useSettingsStore.getState().leaderboardJoin) return null;
  if (Date.now() < guestOffUntil) return fail({ code: 'anonymous_provider_disabled' });
  signingIn ??= db.auth
    .signInAnonymously()
    .then(({ data: d, error }) => {
      if (error?.code === 'anonymous_provider_disabled') guestOffUntil = Date.now() + 30 * 60_000;
      return error || !d.user ? fail(error ?? {}) : { db, uid: d.user.id };
    })
    .catch((e: Error) => fail(e))
    .finally(() => (signingIn = null));
  return signingIn;
}

/**
 * Signed in with Google: the guest's rows would show the same person twice —
 * delete them, then drop the guest (kept if offline, to retry next time).
 * ponytail: signing OUT leaves the Google rows of this week; they age out with the week.
 */
async function retireGuest(): Promise<void> {
  const db = guestClient() as unknown as Db;
  const { data } = await db.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  const a = await db.from('leaderboard_days').delete().eq('user_id', uid);
  const b = await db.from('leaderboard_profiles').delete().eq('user_id', uid);
  if (!a.error && !b.error) await db.auth.signOut({ scope: 'local' });
}

/** The ranking of a period: top `limit` + the caller's row. null = unavailable (see status). */
export function fetchBoard(p: LbPeriod, limit = 50): Promise<LbRow[] | null> {
  const [from, to] = periodRange(p);
  return fetchRange(from, to, limit);
}

export async function fetchRange(from: string, to: string, limit: number): Promise<LbRow[] | null> {
  const id = await who();
  if (!id) return null;
  try {
    const { data, error } = await id.db.rpc('leaderboard', { p_from: from, p_to: to, p_limit: limit });
    if (error) return fail(error);
    useLeaderboardStore.setState({ status: 'ok' });
    return ((data ?? []) as { rank: number; points: number; name: string | null; tag: number; is_me: boolean; total: number }[]).map(
      (r) => ({ rank: Number(r.rank), points: Number(r.points), name: r.name, tag: r.tag, isMe: r.is_me, total: Number(r.total) }),
    );
  } catch (e) {
    return fail(e as Error);
  }
}

/** The caller's standing in every period (+ yesterday's tier into «سجل الشرف», + the crowns). */
export async function refreshMine(force = false): Promise<void> {
  const st = useLeaderboardStore.getState();
  if (!force && Date.now() - st.checkedAt < 60_000) return;
  useLeaderboardStore.setState({ checkedAt: Date.now() });
  const periods: LbPeriod[] = ['today', 'yesterday', 'week', 'month'];
  // Top two everywhere (top three today, for Home): #1, the lead over #2, the field size.
  const boards = await Promise.all(periods.map((p) => fetchBoard(p, p === 'today' ? 3 : 2)));
  if (boards.some((b) => b === null)) return;
  const [today, yesterday, week, month] = boards as LbRow[][];
  const top = today.filter((r) => r.rank <= 3).slice(0, 3);
  const mine: LbState['mine'] = {};
  const heads: LbState['heads'] = {};
  periods.forEach((p, i) => {
    mine[p] = boards[i]!.find((r) => r.isMe) ?? null;
    const [a, b] = [...boards[i]!].sort((x, y) => y.points - x.points);
    if (a) heads[p] = { first: a.points, second: b?.points ?? null };
  });
  const y = mine.yesterday;
  const tier = y ? tierOf(y) : null;
  const yKey = periodRange('yesterday')[0];

  const keys = crownKeys();
  const hist = await crownHistory(keys.day);
  const crowns: Crowns = {};
  const put = (p: CrownPeriod, rows: LbRow[], past: (Person | null)[]) => {
    const c = crownOf(rows, keys[p], past);
    if (c) crowns[p] = c;
  };
  put('day', today, [winnerOf(yesterday), ...(hist?.days ?? [])]);
  put('week', week, hist?.weeks ?? []);
  put('month', month, []);

  // A crown I held this period and lost just now: one gentle note per period.
  const s = useLeaderboardStore.getState();
  const lost = lostSince(liveCrowns(s.crowns, keys), crowns, keys).filter((p) => !s.crownMoments.includes(`lost|${momentKey(p, keys[p])}`));
  if (lost.length) {
    const where = lost.length === 3 ? 'في اليوم والأسبوع والشهر' : lost.map((p) => CROWN_WHERE[p]).join(' و');
    toast.info(`تقدّم غيرك ${where}`, 'ما زال في الوقت متّسع، والسباق إلى الخير لا ينتهي');
  }

  useLeaderboardStore.setState((s2) => ({
    mine,
    heads,
    top,
    crowns,
    crownHist: hist ?? s2.crownHist,
    crownMoments: lost.length ? [...s2.crownMoments, ...lost.map((p) => `lost|${momentKey(p, keys[p])}`)].slice(-40) : s2.crownMoments,
    honors: tier && s2.honors[yKey] !== tier ? { ...s2.honors, [yKey]: tier } : s2.honors,
  }));
}

const CROWN_WHERE: Record<CrownPeriod, string> = { day: 'اليوم', week: 'في الأسبوع', month: 'في الشهر' };

/** The first day of each running period — a crown is void once its key is not the current one. */
export function crownKeys(now = new Date()): CrownKeys {
  return { day: periodRange('today', now)[0], week: periodRange('week', now)[0], month: periodRange('month', now)[0] };
}

/**
 * The winners of the six days before yesterday and the three weeks before this
 * one, for the streaks — fetched once a day per identity (they barely move),
 * kept across launches. ponytail: a streak longer than the window shows as ×٨ / ×٤.
 */
async function crownHistory(day: string): Promise<LbState['crownHist']> {
  const id = await who();
  if (!id) return null;
  const at = `${day}|${id.uid}`;
  const had = useLeaderboardStore.getState().crownHist;
  if (had?.at === at) return had;
  const now = parseISO(day);
  const ws = parseISO(periodRange('week', now)[0]);
  const ranges: [string, string][] = [
    ...[2, 3, 4, 5, 6, 7].map((n): [string, string] => [dk(subDays(now, n)), dk(subDays(now, n))]),
    ...[1, 2, 3].map((n): [string, string] => [dk(subDays(ws, 7 * n)), dk(subDays(ws, 7 * n - 6))]),
  ];
  const boards = await Promise.all(ranges.map(([from, to]) => fetchRange(from, to, 2)));
  if (boards.some((b) => b === null)) return null;
  const w = boards.map((b) => winnerOf(b!));
  return { at, days: w.slice(0, 6), weeks: w.slice(6) };
}

/** The crowns of the running periods (none while out of the board). */
export function useCrowns(): Crowns {
  const crowns = useLeaderboardStore((s) => s.crowns);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  return useMemo(() => (join ? liveCrowns(crowns, crownKeys()) : {}), [crowns, join]);
}

/** 1 / 3 / 10 — only where enough people compete for the place to mean something. */
export function tierOf(r: LbRow): 1 | 3 | 10 | null {
  if (r.rank === 1 && r.total >= 2) return 1;
  if (r.rank <= 3 && r.total >= 5) return 3;
  if (r.rank <= 10 && r.total >= 15) return 10;
  return null;
}

export interface Standing {
  tier: 1 | 3 | 10;
  period: LbPeriod;
  row: LbRow;
}
/** The best current place to celebrate (today, the week, the month, then yesterday). */
export function bestStanding(mine: LbState['mine']): Standing | null {
  let best: Standing | null = null;
  for (const period of ['today', 'week', 'month', 'yesterday'] as LbPeriod[]) {
    const row = mine[period];
    const tier = row ? tierOf(row) : null;
    if (row && tier && (!best || tier < best.tier)) best = { tier, period, row };
  }
  return best;
}

let lastSig = '';
let leftFor = '';
/** Older days already on the board (`uid|day` → points), so a re-push skips them. */
const backSent: Record<string, number> = {};
/** The server refused older days (window not widened yet / offline): retry next launch. */
let backBlocked = '';

/** Upload today's and yesterday's totals (when taking part — no account needed). */
export async function pushScores(): Promise<void> {
  const { leaderboardJoin, leaderboardHideName, userName } = useSettingsStore.getState();
  const id = await who();
  if (!id) return;
  const { db, uid } = id;
  if (!leaderboardJoin || (NOT_REAL && db !== supabase)) {
    if (leftFor === uid) return;
    // Off = gone from the board: delete every row of ours.
    const a = await db.from('leaderboard_days').delete().eq('user_id', uid);
    const b = await db.from('leaderboard_profiles').delete().eq('user_id', uid);
    if (!a.error && !b.error) {
      leftFor = uid;
      lastSig = '';
      useLeaderboardStore.setState({ mine: {}, top: [], crowns: {}, heads: {} });
    }
    return;
  }
  // A dev/test client signed in with Google reads the board but never overwrites the real account's days.
  if (NOT_REAL) return void refreshMine();
  leftFor = '';
  const [today] = periodRange('today');
  const [yesterday] = periodRange('yesterday');
  const name = userName.trim().slice(0, 40) || null;
  // No daily ceiling (owner 2026-11-17) — see the upload's fallback below.
  const days = [today, yesterday].map((day) => ({ user_id: uid, day, points: localScore(day).total }));
  const sig = JSON.stringify([uid, name, leaderboardHideName, days]);
  if (sig === lastSig) return void refreshMine();
  const now = new Date().toISOString();
  try {
    const profile = { user_id: uid, display_name: name, hide_name: leaderboardHideName, updated_at: now };
    let p = await db.from('leaderboard_profiles').upsert(noClientColumn ? profile : ({ ...profile, client: client() } as typeof profile));
    if (p.error?.code === 'PGRST204') {
      noClientColumn = true;
      p = await db.from('leaderboard_profiles').upsert(profile);
    }
    if (p.error) return void fail(p.error);
    const up = (rows: typeof days) =>
      db.from('leaderboard_days').upsert(
        rows.map((x) => ({ ...x, updated_at: now })),
        { onConflict: 'user_id,day' },
      );
    let d = await up(days);
    // A server still on the old `points ≤ 600` CHECK (before 20261117120000_leaderboard_uncapped.sql)
    // rejects the whole upload — send it capped rather than not at all.
    if (d.error?.code === '23514') d = await up(days.map((x) => ({ ...x, points: Math.min(600, x.points) })));
    if (d.error) return void fail(d.error);
    lastSig = sig;
    // The rest of the week and month — needs the write window of
    // supabase/migrations/20261118130000_leaderboard_backfill.sql; before it the
    // server refuses quietly and today/yesterday (above) still went up.
    if (backBlocked !== uid) {
      const back = backfillDays()
        .map((day) => ({ user_id: uid, day, points: localScore(day).total }))
        .filter((x) => x.points > 0 && backSent[`${uid}|${x.day}`] !== x.points);
      if (back.length) {
        const b = await up(back);
        if (b.error) backBlocked = uid;
        else for (const x of back) backSent[`${uid}|${x.day}`] = x.points;
      }
    }
    await refreshMine(true);
  } catch (e) {
    fail(e as Error);
  }
}

/**
 * «تحديث» (Home card, the page — owner: no more leaving and reopening the app):
 * the latest pages from مصحفي, our points up again, the places back down.
 */
export async function refreshBoard(): Promise<void> {
  await import('@/services/mushafi').then((m) => m.pullMushafi()).catch(() => false);
  lastSig = '';
  await pushScores();
}

// «لحظات الترتيب» (raceMoments.ts): the self-race evening, a crown at stake, Saturday's new week —
// a «رفيقك اليومي» source, registered here (not in attention/plugins.ts) so the notification
// engine never imports the board and its Supabase client.
registerCompanionSource({
  id: 'race',
  nudges: (ctx) => {
    if (useNotificationStore.getState().smart?.race === false) return [];
    const lb = useLeaderboardStore.getState();
    return raceMoments({
      now: ctx.now,
      totals: localTotals(ctx.now),
      board: useSettingsStore.getState().leaderboardJoin && lb.status === 'ok',
      checkedAt: lb.checkedAt,
      mine: lb.mine,
      heads: lb.heads,
      isha: ctx.times?.isha ?? null,
      female: ctx.gender === 'female',
    });
  },
});

let started = false;

/** Keep the board in step: re-score on any logged deed, prefs, sign-in, resume. Call once at boot. */
export function startLeaderboardSync(debounceMs = 3000): () => void {
  if (started || !isSupabaseConfigured) return () => undefined;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pushScores(), debounceMs);
  };
  // «لحظات الترتيب» (services/raceMoments.ts) read my points and places: re-plan when they move.
  let moments: ReturnType<typeof setTimeout> | null = null;
  const replan = () => {
    if (moments) clearTimeout(moments);
    moments = setTimeout(() => void rescheduleSmartNotifications(), 5000);
  };
  const unsubs = [
    watchSlice(useLeaderboardStore, (s) => JSON.stringify([s.status, s.heads, ...(['today', 'week', 'month'] as const).map((p) => s.mine[p]?.rank)]), replan),
    watchSlice(useBadgeMetricsStore, (s) => s.metrics, replan),
    // BadgeEngine republishes after every data change (debounced) — one signal for every store.
    watchSlice(useBadgeMetricsStore, (s) => s.metrics, kick),
    watchSlice(useAuthStore, (s) => `${s.ready}|${s.user?.id}`, () => {
      lastSig = '';
      useLeaderboardStore.setState({ mine: {}, top: [], crowns: {}, heads: {}, checkedAt: 0 });
      if (useAuthStore.getState().user) void retireGuest().catch(() => undefined);
      kick();
    }),
    watchSlice(
      useSettingsStore,
      (s) => `${s.userName}|${s.leaderboardJoin}|${s.leaderboardHideName}`,
      kick,
    ),
  ];
  const onVisible = () => document.visibilityState === 'visible' && kick();
  document.addEventListener('visibilitychange', onVisible);
  // Others move too: refresh the standing every few minutes while open.
  const tick = setInterval(() => document.visibilityState === 'visible' && void refreshMine(), 5 * 60_000);
  kick();
  return () => {
    unsubs.forEach((u) => u());
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(tick);
    if (timer) clearTimeout(timer);
    if (moments) clearTimeout(moments);
    started = false;
  };
}
