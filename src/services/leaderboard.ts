import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { supabase, guestClient, isSupabaseConfigured } from '@/services/supabaseClient';
import { safeStorage } from '@/store/safeStorage';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTargetsStore } from '@/store/targetsStore';
import { collectBadgeSnapshot, useBadgeMetricsStore } from '@/services/BadgeEngine';
import { watchSlice } from '@/services/smartNotifications';
import { SLEEP_ADHKAR } from '@/components/adhkar/adhkarSets';
import { morningAdhkar, eveningAdhkar, briefAdhkar } from '@/data/adhkar';
import { scoreDay, type DayScore } from '@/services/leaderboardScore';
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
export type LbStatus = 'idle' | 'ok' | 'offline' | 'missing';

interface LbState {
  status: LbStatus;
  /** The caller's standing per period (null = no points there yet). */
  mine: Partial<Record<LbPeriod, LbRow | null>>;
  /** Today's first three (Home). */
  top: LbRow[];
  checkedAt: number;
  /** «سجل الشرف»: a day's final tier (1 / 3 / 10) — recorded the day after. Persisted. */
  honors: Record<string, 1 | 3 | 10>;
}

export const useLeaderboardStore = create<LbState>()(
  persist(() => ({ status: 'idle' as LbStatus, mine: {}, top: [] as LbRow[], checkedAt: 0, honors: {} }), {
    name: 'myzikr:leaderboard',
    storage: safeStorage,
    partialize: ({ honors }) => ({ honors }),
  }),
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

// ── local points ───────────────────────────────────────────────────────────
const repsOf = (items: DhikrItem[]) => items.reduce((n, it) => n + (it.count || 1), 0);

export function localScore(dateKey: string): DayScore {
  const brief = useSettingsStore.getState().adhkarBrief;
  return scoreDay(
    {
      ...collectBadgeSnapshot(),
      targets: useTargetsStore.getState().targets,
      periods: useTargetsStore.getState().history,
      setReps: {
        morning: repsOf(briefAdhkar(morningAdhkar, brief)),
        evening: repsOf(briefAdhkar(eveningAdhkar, brief)),
        sleep: repsOf(SLEEP_ADHKAR),
      },
    },
    dateKey,
  );
}

/** Live points of a day (re-scored whenever the badge metrics republish = any logged deed). */
export function useDayScore(dateKey: string): DayScore {
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const brief = useSettingsStore((s) => s.adhkarBrief);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics/brief are the change triggers
  return useMemo(() => localScore(dateKey), [metrics, brief, dateKey]);
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
interface Who {
  db: Db;
  uid: string;
}
let signingIn: Promise<Who | null> | null = null;
/** Anonymous sign-ins off in the dashboard: don't knock on every logged deed. */
let guestOffUntil = 0;

/**
 * Who uploads and reads: the Google account when signed in (one row across
 * devices), otherwise this device's anonymous guest — created on first use, so
 * no sign-in is ever needed. Never creates a guest for someone who left the board.
 */
async function who(): Promise<Who | null> {
  // Before the stored Google session is restored, a signed-in user looks like a guest.
  if (!isSupabaseConfigured || !useAuthStore.getState().ready) return null;
  const user = useAuthStore.getState().user;
  if (user) return { db: supabase, uid: user.id };
  const db = guestClient() as unknown as Db;
  const { data } = await db.auth.getSession();
  if (data.session) return { db, uid: data.session.user.id };
  if (!useSettingsStore.getState().leaderboardJoin) return null;
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
export async function fetchBoard(p: LbPeriod, limit = 50): Promise<LbRow[] | null> {
  const id = await who();
  if (!id) return null;
  const [from, to] = periodRange(p);
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

/** The caller's standing in every period (+ yesterday's tier into «سجل الشرف»). */
export async function refreshMine(force = false): Promise<void> {
  const st = useLeaderboardStore.getState();
  if (!force && Date.now() - st.checkedAt < 60_000) return;
  useLeaderboardStore.setState({ checkedAt: Date.now() });
  const periods: LbPeriod[] = ['today', 'yesterday', 'week', 'month'];
  const boards = await Promise.all(periods.map((p) => fetchBoard(p, p === 'today' ? 3 : 0)));
  if (boards.some((b) => b === null)) return;
  const top = boards[0]!.filter((r) => r.rank <= 3).slice(0, 3);
  const mine: LbState['mine'] = {};
  periods.forEach((p, i) => (mine[p] = boards[i]!.find((r) => r.isMe) ?? null));
  const y = mine.yesterday;
  const tier = y ? tierOf(y) : null;
  const yKey = periodRange('yesterday')[0];
  useLeaderboardStore.setState((s) => ({
    mine,
    top,
    honors: tier && s.honors[yKey] !== tier ? { ...s.honors, [yKey]: tier } : s.honors,
  }));
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

/** Upload today's and yesterday's totals (when taking part — no account needed). */
export async function pushScores(): Promise<void> {
  const { leaderboardJoin, leaderboardHideName, userName } = useSettingsStore.getState();
  const id = await who();
  if (!id) return;
  const { db, uid } = id;
  if (!leaderboardJoin) {
    if (leftFor === uid) return;
    // Off = gone from the board: delete every row of ours.
    const a = await db.from('leaderboard_days').delete().eq('user_id', uid);
    const b = await db.from('leaderboard_profiles').delete().eq('user_id', uid);
    if (!a.error && !b.error) {
      leftFor = uid;
      lastSig = '';
      useLeaderboardStore.setState({ mine: {}, top: [] });
    }
    return;
  }
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
    const p = await db
      .from('leaderboard_profiles')
      .upsert({ user_id: uid, display_name: name, hide_name: leaderboardHideName, updated_at: now });
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
  const unsubs = [
    // BadgeEngine republishes after every data change (debounced) — one signal for every store.
    watchSlice(useBadgeMetricsStore, (s) => s.metrics, kick),
    watchSlice(useAuthStore, (s) => `${s.ready}|${s.user?.id}`, () => {
      lastSig = '';
      useLeaderboardStore.setState({ mine: {}, top: [], checkedAt: 0 });
      if (useAuthStore.getState().user) void retireGuest().catch(() => undefined);
      kick();
    }),
    watchSlice(
      useSettingsStore,
      (s) => `${s.userName}|${s.leaderboardJoin}|${s.leaderboardHideName}|${s.adhkarBrief}`,
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
    started = false;
  };
}
