import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/store/toastStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { periodRange, pushScores, useLeaderboardStore, who, type LbRow, type Who } from '@/services/leaderboard';
import { errorText, inviteText, isMissing } from '@/services/groupsLogic';
import { useGroupsStore, type GroupPeriod, type GroupState, type GroupSummary } from '@/store/groupsStore';

export * from '@/store/groupsStore';

/**
 * «المجموعات» client. Same identity as «الترتيب» (`who()`: the Google account,
 * else this device's guest), every call through the SECURITY DEFINER RPCs of
 * supabase/migrations/20261118120000_groups.sql. The last data is cached
 * (`myzikr:groups`, src/store/groupsStore.ts) so a group opens offline; failures are quiet for reads
 * (status → inline note) and an Arabic toast for actions — never raw errors.
 */

// ── identity ───────────────────────────────────────────────────────────────
// Device-local on purpose (no `myzikr:` prefix → cloud sync never overwrites it).
const CLAIMS_KEY = 'myzikr-groups-claims';
function readClaims(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeClaims(c: string[]): void {
  try {
    if (c.length) localStorage.setItem(CLAIMS_KEY, JSON.stringify(c));
    else localStorage.removeItem(CLAIMS_KEY);
  } catch {
    /* storage blocked: the guest's groups just won't follow a sign-in */
  }
}

/**
 * A guest who signs in with Google gets a new identity — and would lose their
 * groups (and ownership, juz, counts). The guest's claim secrets, kept on this
 * device, move all of it to the account (once).
 */
async function claimGuest(id: Who): Promise<void> {
  if (!useAuthStore.getState().user) return;
  const claims = readClaims();
  if (!claims.length) return;
  const { error } = await id.db.rpc('claim_groups', { p_claims: claims });
  if (!error) writeClaims([]);
}

async function identity(): Promise<Who | null> {
  if (!isSupabaseConfigured || !useAuthStore.getState().ready) return null;
  const id = await who();
  if (!id) {
    const guestAway = !useAuthStore.getState().user && !useSettingsStore.getState().leaderboardJoin;
    const lbMissing = useLeaderboardStore.getState().status === 'missing';
    useGroupsStore.setState({ status: guestAway ? 'away' : lbMissing ? 'missing' : 'offline' });
    return null;
  }
  await claimGuest(id).catch(() => undefined);
  return id;
}

// ── calls ──────────────────────────────────────────────────────────────────
export type GroupFn =
  | 'create_group'
  | 'join_group'
  | 'leave_group'
  | 'rename_group'
  | 'remove_member'
  | 'regenerate_code'
  | 'delete_group'
  | 'start_khatma'
  | 'cancel_khatma'
  | 'take_juz'
  | 'release_juz'
  | 'set_juz_done'
  | 'start_goal'
  | 'add_goal_count'
  | 'close_goal';

type PgError = { code?: string; message?: string };

/** null = failed (status set; `toastErrors` → an Arabic toast). */
async function rpc<T>(fn: string, args: Record<string, unknown> | undefined, toastErrors: boolean): Promise<{ data: T } | null> {
  const id = await identity();
  if (!id) {
    if (toastErrors) toast.error(errorText(null));
    return null;
  }
  let error: PgError | null;
  try {
    const res = await id.db.rpc(fn, args);
    if (!res.error) {
      useGroupsStore.setState({ status: 'ok' });
      return { data: res.data as T };
    }
    error = res.error;
  } catch (e) {
    error = { message: (e as Error)?.message };
  }
  if (isMissing(error)) {
    useGroupsStore.setState({ status: 'missing' });
    if (toastErrors) toast.info('المجموعات قيد التجهيز');
    return null;
  }
  // A raised code (P0001) is an answer from the server, not a lost connection.
  if (error?.code !== 'P0001') {
    useGroupsStore.setState({ status: 'offline' });
    console.warn('[groups]', fn, error?.code ?? '', error?.message ?? '');
  }
  if (error?.message === 'not_member') forget(String(args?.p_group ?? ''));
  if (toastErrors) toast.error(errorText(error));
  return null;
}

/** Drop a group we are no longer in from the cache. */
export function forget(groupId: string): void {
  if (!groupId) return;
  useGroupsStore.setState((s) => {
    const groups = { ...s.groups };
    delete groups[groupId];
    const boards = Object.fromEntries(Object.entries(s.boards).filter(([k]) => !k.startsWith(`${groupId}|`)));
    return { groups, boards, list: s.list?.filter((g) => g.id !== groupId) ?? null };
  });
}

export async function loadGroups(): Promise<void> {
  const r = await rpc<GroupSummary[]>('my_groups', undefined, false);
  if (!r) return;
  const list = Array.isArray(r.data) ? r.data : [];
  // Still a guest: keep the claim secrets so a later Google sign-in keeps these groups.
  if (!useAuthStore.getState().user) writeClaims(list.map((g) => g.claim).filter((c): c is string => !!c));
  useGroupsStore.setState({ list: list.map(({ claim: _claim, ...g }) => g) });
}

/** false = not a member any more (already forgotten). */
export async function loadGroup(groupId: string): Promise<boolean> {
  const r = await rpc<GroupState>('group_state', { p_group: groupId }, false);
  if (r?.data) useGroupsStore.setState((s) => ({ groups: { ...s.groups, [groupId]: r.data } }));
  return !!r || !!useGroupsStore.getState().groups[groupId];
}

export async function loadBoard(groupId: string, period: GroupPeriod, pushFirst = false): Promise<void> {
  // Our own row current before reading (deduped inside pushScores).
  if (pushFirst) await pushScores().catch(() => undefined);
  const [from, to] = periodRange(period);
  const r = await rpc<{ rank: number; points: number; name: string | null; tag: number; is_me: boolean; total: number }[]>(
    'group_leaderboard',
    { p_group: groupId, p_from: from, p_to: to },
    false,
  );
  if (!r) return;
  const rows: LbRow[] = (r.data ?? []).map((x) => ({
    rank: Number(x.rank),
    points: Number(x.points),
    name: x.name,
    tag: x.tag,
    isMe: x.is_me,
    total: Number(x.total),
  }));
  useGroupsStore.setState((s) => ({ boards: { ...s.boards, [`${groupId}|${period}`]: rows } }));
}

/**
 * Any change (take a juz, add a count, rename…): Arabic toast on failure, and
 * the group (when given) re-read either way so the page shows the truth.
 */
export async function act<T = unknown>(fn: GroupFn, args: Record<string, unknown>, groupId?: string): Promise<{ data: T } | null> {
  const r = await rpc<T>(fn, args, true);
  if (groupId && useGroupsStore.getState().groups[groupId]) await loadGroup(groupId);
  return r;
}

// ── invite ─────────────────────────────────────────────────────────────────
export async function copyText(text: string, done = 'تم النسخ'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('تعذّر النسخ');
  }
}

export async function shareInvite(name: string, code: string): Promise<void> {
  const text = inviteText(name, code);
  const title = 'دعوة إلى مجموعة في رفيقي';
  try {
    if (Capacitor.isNativePlatform()) return void (await Share.share({ title, text }));
    if (navigator.share) return void (await navigator.share({ title, text }));
  } catch {
    return; // cancelled
  }
  await copyText(text, 'نُسخت الدعوة، ألصقها لمن تحب');
}
