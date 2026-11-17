import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mergeSyncedValue } from './syncMerge';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Cloud sync. The whole app state lives in `localStorage` under `myzikr:*`
 * keys (zustand persist). We mirror that blob to a single Supabase row per
 * user (`user_state.data` jsonb) so a user can restore / sync across devices.
 *
 * Strategy on a fresh sign-in (see `reconcileOnLogin`): we NEVER blindly
 * overwrite local data. If the cloud is empty we seed it from this device; if
 * this device has no worship history we adopt the cloud copy; if BOTH hold
 * real data we content-merge them (union of history, "more worship wins" —
 * see syncMerge.ts) and always write a recoverable safety snapshot first.
 *
 * AFTER sign-in, `startAutoSync` keeps signed-in devices converged live:
 *  - local changes are detected (per-key hashes) and pushed, debounced;
 *  - remote changes arrive via Supabase Realtime + a polling fallback and are
 *    merged per-key with a 3-way diff against the last-synced baseline
 *    (`myzikr:_syncBase`), then the affected zustand stores are rehydrated
 *    in place — no page reload;
 *  - true conflicts (same key changed on both sides since the baseline) are
 *    MERGED at content level (`syncMerge.ts`): history maps/arrays are
 *    unioned, "more worship wins" for known shapes, settings stay local.
 *    Whole-key local-wins was catastrophic: a stale device that merely
 *    stamped "today" at launch counted as "locally changed" for the whole
 *    progress store and pushed months-old data over the newer cloud copy —
 *    which the up-to-date device then adopted, wiping both.
 *
 * Requires this table (run once in the Supabase SQL editor):
 *
 *   create table if not exists public.user_state (
 *     user_id uuid primary key references auth.users(id) on delete cascade,
 *     data jsonb not null default '{}',
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.user_state enable row level security;
 *   create policy "own state" on public.user_state
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * For LIVE push between devices also enable Realtime on the table (optional —
 * without it devices still converge via the 60s poll + focus/resume pulls):
 *
 *   alter publication supabase_realtime add table public.user_state;
 */

const PREFIX = 'myzikr:';
const LAST_PUSH_KEY = 'myzikr:_lastCloudPush';
/** Recoverable snapshot of local state taken right before any cloud adoption. */
const SAFETY_SNAPSHOT_KEY = 'myzikr:_preCloudPullBackup';
/** Per-key hashes of the last state both sides agreed on (3-way merge base). */
const SYNC_BASE_KEY = 'myzikr:_syncBase';
/** Quran API response cache (`myzikr:quran_…`) — large + purely derived. */
const CACHE_PREFIX = 'myzikr:quran_';
/** Keys that point at on-device files / are sync-internal — never sync them. */
const NON_SYNCABLE = new Set([
  LAST_PUSH_KEY,
  SAFETY_SNAPSHOT_KEY,
  SYNC_BASE_KEY,
  'myzikr:downloads',
  // Device-local notification plan for study/task reminders.
  'myzikr:study-notif',
]);

/**
 * Should this localStorage key be mirrored to the cloud? Excludes the multi-MB
 * Quran API cache (re-fetchable, and uploading it burns mobile data + risks
 * blowing the localStorage quota on pull) and the device-local downloads
 * registry (syncing it makes another device show surahs as downloaded that
 * don't physically exist there).
 */
function isSyncableKey(k: string): boolean {
  if (!k.startsWith(PREFIX)) return false;
  if (NON_SYNCABLE.has(k)) return false;
  if (k.startsWith(CACHE_PREFIX)) return false;
  return true;
}

function collectLocalState(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isSyncableKey(k)) {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
  }
  return out;
}

/** Parse a zustand-persist value, unwrapping the `{ state, version }` envelope. */
function parsePersisted(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const state = p && typeof p === 'object' && 'state' in p ? p.state : p;
    return (state as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

/** djb2 — tiny, fast, plenty for change detection on JSON blobs. */
function hashValue(s: string | undefined): string {
  if (s == null) return '∅';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function hashMap(state: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(state)) out[k] = hashValue(v);
  return out;
}

/** Epoch ms from an ISO stamp. Supabase returns `+00:00`, we write `Z` —
 *  never compare those as strings. */
function isoMs(s: string | null | undefined): number {
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * storage key → its zustand store hook (lazy). After cloud values are written
 * into localStorage, calling `persist.rehydrate()` makes the live UI pick them
 * up without a reload. Keys without a loader are applied storage-only.
 */
const STORE_LOADERS: Record<string, () => Promise<unknown>> = {
  // Preference stores (NOT history — plain local-wins scalars).
  'myzikr:adhkar-audio': () => import('@/store/adhkarListenStore').then((m) => m.useAdhkarListenStore),
  'myzikr:inspiration': () => import('@/store/inspirationStore').then((m) => m.useInspirationStore),
  'myzikr:tajweed-colors': () => import('@/store/tajweedColorsStore').then((m) => m.useTajweedColorsStore),
  'myzikr:calendar': () => import('@/services/calendarEvents').then((m) => m.useCalendarPrefs),
  'myzikr:asma': () => import('@/store/asmaProgressStore').then((m) => m.useAsmaProgressStore),
  'myzikr:badges': () => import('@/store/badgeStore').then((m) => m.useBadgeStore),
  'myzikr:bookmarks': () => import('@/store/bookmarksStore').then((m) => m.useBookmarksStore),
  'myzikr:custom-azkar': () => import('@/store/customAzkarStore').then((m) => m.useCustomAzkarStore),
  'myzikr:custom-reminders': () =>
    import('@/store/customRemindersStore').then((m) => m.useCustomRemindersStore),
  'myzikr:dhikr-sessions': () =>
    import('@/store/dhikrSessionStore').then((m) => m.useDhikrSessionStore),
  'myzikr:duaa-library': () => import('@/store/duaaLibraryStore').then((m) => m.useDuaaLibraryStore),
  'myzikr:hadith': () => import('@/store/hadithStore').then((m) => m.useHadithStore),
  'myzikr:memorization': () =>
    import('@/store/memorizationStore').then((m) => m.useMemorizationStore),
  'myzikr:notifications': () =>
    import('@/store/notificationStore').then((m) => m.useNotificationStore),
  'myzikr:prayer-log': () => import('@/store/prayerLogStore').then((m) => m.usePrayerLogStore),
  'myzikr:progress': () => import('@/store/progressStore').then((m) => m.useProgressStore),
  'myzikr:qiyam': () => import('@/store/qiyamStore').then((m) => m.useQiyamStore),
  'myzikr:study': () => import('@/store/studyStore').then((m) => m.useStudyStore),
  'myzikr:tasks': () => import('@/store/tasksStore').then((m) => m.useTasksStore),
  'myzikr:house': () => import('@/store/houseStore').then((m) => m.useHouseStore),
  'myzikr:quran': () => import('@/store/quranStore').then((m) => m.useQuranStore),
  'myzikr:ramadan': () => import('@/store/ramadanStore').then((m) => m.useRamadanStore),
  'myzikr:sadaqah': () => import('@/store/sadaqahStore').then((m) => m.useSadaqahStore),
  'myzikr:settings': () => import('@/store/settingsStore').then((m) => m.useSettingsStore),
  'myzikr:targets': () => import('@/store/targetsStore').then((m) => m.useTargetsStore),
  'myzikr:tasbih': () => import('@/store/tasbihStore').then((m) => m.useTasbihStore),
};

interface PersistApi {
  persist?: { rehydrate: () => void | Promise<void> };
}

async function rehydrateKeys(keys: string[]): Promise<void> {
  for (const k of keys) {
    const load = STORE_LOADERS[k];
    if (!load) continue;
    try {
      const store = (await load()) as PersistApi;
      await store.persist?.rehydrate();
    } catch (e) {
      console.warn('[cloudSync] rehydrate failed for', k, e);
    }
  }
}

interface RemoteSnapshot {
  data: Record<string, string>;
  updatedAt: string | null;
}

class CloudSyncService {
  // ── Auto-sync engine state ──────────────────────────────────────────
  private activeUserId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private localWatchTimer: ReturnType<typeof setInterval> | null = null;
  private remotePollTimer: ReturnType<typeof setInterval> | null = null;
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleBusy = false;
  private cycleQueued = false;
  /** updated_at stamp of OUR last upsert — used to ignore realtime echoes. */
  private lastPushStamp: string | null = null;
  /** Remote updated_at we have already merged. */
  private lastSeenRemoteAt: string | null = null;
  /** Signature of local state after the last cycle (cheap change detector). */
  private lastLocalSig: string | null = null;
  /** Reconcile dedupe — `SIGNED_IN` and the OAuth callback both call
   *  `reconcileOnLogin`, which used to race two pulls (and two reloads). */
  private reconcilePromise: Promise<void> | null = null;
  private reconciledFor: string | null = null;

  /** Push a snapshot (default: the current local state) to the cloud.
   *  Returns true on success. Callers that advance the sync baseline must
   *  pass the SAME snapshot they hash — never re-read local after the await. */
  async push(userId: string, data: Record<string, string> = collectLocalState()): Promise<boolean> {
    if (!isSupabaseConfigured || !userId) return false;
    const stamp = new Date().toISOString();
    const { error } = await supabase
      .from('user_state')
      .upsert({ user_id: userId, data, updated_at: stamp }, { onConflict: 'user_id' });
    if (error) {
      console.warn('[cloudSync] push failed', error.message);
      return false;
    }
    this.lastPushStamp = stamp;
    this.lastSeenRemoteAt = stamp;
    try {
      localStorage.setItem(LAST_PUSH_KEY, stamp);
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Fetch the remote snapshot + its server timestamp. `null` = the cloud row
   *  is genuinely empty; `undefined` = the fetch FAILED (offline, expired
   *  token…). The two must never be conflated: treating a failed fetch as
   *  "empty cloud" is what advanced the baseline and rolled progress back. */
  private async fetchRemote(userId: string): Promise<RemoteSnapshot | null | undefined> {
    const { data, error } = await supabase
      .from('user_state')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[cloudSync] fetch failed', error.message);
      return undefined;
    }
    const blob = (data?.data ?? null) as Record<string, string> | null;
    if (!blob || Object.keys(blob).length === 0) return null;
    return { data: blob, updatedAt: (data?.updated_at as string) ?? null };
  }

  /** Pull the remote snapshot into localStorage (overwrites syncable keys). */
  async pull(userId: string): Promise<boolean> {
    if (!isSupabaseConfigured || !userId) return false;
    const remote = await this.fetchRemote(userId);
    if (!remote) return false;
    this.applyRemote(remote.data);
    return true;
  }

  /** Overwrite local syncable keys with the remote blob's values. */
  private applyRemote(blob: Record<string, string>): void {
    for (const [k, v] of Object.entries(blob)) {
      if (isSyncableKey(k) && typeof v === 'string') {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Merge every remote key into local storage: missing keys are adopted,
   * existing ones are content-merged (union of history — see syncMerge.ts).
   * Returns how many keys actually changed on this device.
   */
  private mergeRemoteIntoLocal(blob: Record<string, string>): number {
    let changed = 0;
    for (const [k, v] of Object.entries(blob)) {
      if (!isSyncableKey(k) || typeof v !== 'string') continue;
      const lv = localStorage.getItem(k);
      const next = lv == null ? v : mergeSyncedValue(k, lv, v);
      if (next !== lv) {
        try {
          localStorage.setItem(k, next);
          changed += 1;
        } catch {
          /* ignore */
        }
      }
    }
    return changed;
  }

  /**
   * Save a recoverable copy of current local state before any cloud adoption.
   * Throttled: back-to-back sync cycles must not overwrite the launch-time
   * snapshot (the one most likely to predate a bad merge) with already-merged
   * state — that would destroy the only recovery copy.
   */
  private saveSafetySnapshot(): void {
    try {
      const raw = localStorage.getItem(SAFETY_SNAPSHOT_KEY);
      if (raw) {
        const at = isoMs((JSON.parse(raw) as { at?: string }).at);
        if (Date.now() - at < 12 * 60 * 60 * 1000) return;
      }
    } catch {
      /* unreadable → overwrite it */
    }
    try {
      localStorage.setItem(
        SAFETY_SNAPSHOT_KEY,
        JSON.stringify({ at: new Date().toISOString(), data: collectLocalState() }),
      );
    } catch {
      /* best-effort */
    }
  }

  /**
   * Does this device hold real worship history worth protecting? Used to decide
   * whether a cloud snapshot may be adopted wholesale (fresh device) or must be
   * merged non-destructively (device already in use).
   */
  private hasMeaningfulLocalData(): boolean {
    const progress = parsePersisted('myzikr:progress');
    if (progress && Object.keys((progress.dailyProgress as object) ?? {}).length > 0) return true;
    const memo = parsePersisted('myzikr:memorization');
    if (memo && Object.keys((memo.bookmarks as object) ?? {}).length > 0) return true;
    const prayer = parsePersisted('myzikr:prayer-log');
    if (prayer) {
      for (const v of Object.values(prayer)) {
        if (v && typeof v === 'object' && Object.keys(v as object).length > 0) return true;
      }
    }
    const targets = parsePersisted('myzikr:targets');
    if (targets && Array.isArray(targets.targets) && targets.targets.length > 0) return true;
    const sadaqah = parsePersisted('myzikr:sadaqah');
    if (sadaqah) {
      for (const v of Object.values(sadaqah)) {
        if (Array.isArray(v) && v.length > 0) return true;
      }
    }
    // "Small" but irreplaceable user data: a device holding ONLY bookmarks,
    // tasbih history, favorites, or custom content used to be treated as
    // fresh and silently overwritten by an old cloud snapshot.
    const bookmarks = parsePersisted('myzikr:bookmarks');
    if (bookmarks) {
      for (const v of Object.values(bookmarks)) {
        if (Array.isArray(v) && v.length > 0) return true;
      }
    }
    const tasbih = parsePersisted('myzikr:tasbih');
    if (tasbih && typeof tasbih.totalLifetimeCount === 'number' && tasbih.totalLifetimeCount > 0) {
      return true;
    }
    const duaa = parsePersisted('myzikr:duaa-library');
    if (duaa && Array.isArray(duaa.favorites) && duaa.favorites.length > 0) return true;
    const hadith = parsePersisted('myzikr:hadith');
    if (hadith && Array.isArray(hadith.favorites) && hadith.favorites.length > 0) return true;
    const customAzkar = parsePersisted('myzikr:custom-azkar');
    if (customAzkar && Array.isArray(customAzkar.sets) && customAzkar.sets.length > 0) return true;
    const customReminders = parsePersisted('myzikr:custom-reminders');
    if (customReminders) {
      for (const v of Object.values(customReminders)) {
        if (Array.isArray(v) && v.length > 0) return true;
      }
    }
    return false;
  }

  /**
   * On a fresh sign-in, reconcile local and cloud state WITHOUT ever silently
   * destroying local data (the previous implementation pulled remote-wins and
   * reloaded, wiping months of local data for anyone signing into an account
   * that held an old or empty snapshot).
   *
   * - Cloud empty            → seed it from this device.
   * - No local history       → adopt the cloud copy (the normal new-device case).
   * - Both have real data    → content-merge every key (missing keys adopted,
   *                            shared keys unioned — syncMerge.ts), write a
   *                            recoverable safety snapshot first, then push
   *                            the merged result.
   */
  async reconcileOnLogin(userId: string): Promise<void> {
    if (!isSupabaseConfigured || !userId) return;
    // Dedupe: the SIGNED_IN listener and the OAuth callback handler both call
    // this — run once per user per session, and share the in-flight promise.
    if (this.reconciledFor === userId) return;
    if (this.reconcilePromise) return this.reconcilePromise;
    this.reconcilePromise = this.performReconcile(userId).finally(() => {
      this.reconcilePromise = null;
    });
    return this.reconcilePromise;
  }

  private async performReconcile(userId: string): Promise<void> {
    const remote = await this.fetchRemote(userId);
    // Unknown cloud state (offline) → don't mark reconciled; the auto-sync
    // cycle content-merges once the network is back.
    if (remote === undefined) return;
    this.reconciledFor = userId;

    if (!remote) {
      // Cloud has nothing → seed from local. Never destructive.
      const snapshot = collectLocalState();
      if (await this.push(userId, snapshot)) this.writeBase(hashMap(snapshot));
      return;
    }

    if (!this.hasMeaningfulLocalData()) {
      // Fresh device → safe to adopt the cloud snapshot (still snapshot first).
      this.saveSafetySnapshot();
      this.applyRemote(remote.data);
      this.writeBase(hashMap(collectLocalState()));
      window.location.reload();
      return;
    }

    // Both local and cloud hold real data → CONTENT-merge them (union of
    // history, "more worship wins"). The old "keep local, fill only missing
    // keys, push" wiped the newer cloud copy whenever a stale device signed
    // in: its old stores overwrote the other device's months of progress.
    this.saveSafetySnapshot();
    const changed = this.mergeRemoteIntoLocal(remote.data);
    const snapshot = collectLocalState();
    if (await this.push(userId, snapshot)) this.writeBase(hashMap(snapshot));
    if (changed > 0) window.location.reload();
  }

  // ── Continuous auto-sync (post-sign-in) ─────────────────────────────

  /**
   * Begin keeping this device converged with the cloud copy. Idempotent;
   * safe to call on every session restore. Runs an immediate cycle (so a
   * device that was closed while the other one progressed catches up at
   * launch), then watches both directions.
   */
  startAutoSync(userId: string): void {
    if (!isSupabaseConfigured || !userId) return;
    if (this.activeUserId === userId) return;
    this.stopAutoSync();
    this.activeUserId = userId;
    this.lastLocalSig = null;

    // Startup convergence.
    this.scheduleCycle(0);

    // Local watcher: detect changed stores → debounced merge+push.
    this.localWatchTimer = setInterval(() => {
      if (this.localSignature() !== this.lastLocalSig) this.scheduleCycle(2_500);
    }, 15_000);

    // Remote poll: realtime fallback for projects without the publication.
    this.remotePollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void this.checkRemote();
    }, 60_000);

    this.subscribeRealtime(userId);
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Stop watching (sign-out). Local data stays; the merge base is cleared so
   *  a different account can never be diffed against this one's baseline. */
  stopAutoSync(): void {
    this.activeUserId = null;
    // A different account signing in later must reconcile from scratch.
    this.reconciledFor = null;
    if (this.localWatchTimer) clearInterval(this.localWatchTimer);
    if (this.remotePollTimer) clearInterval(this.remotePollTimer);
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    this.localWatchTimer = this.remotePollTimer = null;
    this.cycleTimer = null;
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Drop the merge baseline (call alongside sign-out). */
  clearSyncBase(): void {
    try {
      localStorage.removeItem(SYNC_BASE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Ask the engine to converge soon (app resume, manual sync button, …). */
  kick(): void {
    if (this.activeUserId) this.scheduleCycle(0);
  }

  /** Merge-then-push now. Used by the manual "sync now" button. */
  async flush(): Promise<boolean> {
    if (!this.activeUserId) return false;
    await this.syncCycle();
    return true;
  }

  private onOnline = (): void => {
    this.scheduleCycle(1_000);
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      // Going to background / window closing soon — converge immediately.
      this.scheduleCycle(0);
    } else {
      void this.checkRemote();
    }
  };

  private subscribeRealtime(userId: string): void {
    try {
      this.channel = supabase
        .channel(`user_state_${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_state', filter: `user_id=eq.${userId}` },
          (payload) => {
            const at = (payload.new as { updated_at?: string } | null)?.updated_at ?? null;
            if (at && isoMs(at) === isoMs(this.lastPushStamp)) return; // our own write echoed back
            this.scheduleCycle(800);
          },
        )
        .subscribe();
    } catch (e) {
      console.warn('[cloudSync] realtime unavailable — polling only', e);
    }
  }

  /** Cheap "did anything change locally?" probe (updated_at-only request). */
  private async checkRemote(): Promise<void> {
    const uid = this.activeUserId;
    if (!uid) return;
    const { data, error } = await supabase
      .from('user_state')
      .select('updated_at')
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data?.updated_at) return;
    if (isoMs(data.updated_at as string) > isoMs(this.lastSeenRemoteAt)) {
      this.scheduleCycle(0);
    }
  }

  private scheduleCycle(delayMs: number): void {
    if (!this.activeUserId) return;
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    this.cycleTimer = setTimeout(() => {
      this.cycleTimer = null;
      void this.syncCycle();
    }, delayMs);
  }

  private localSignature(state: Record<string, string> = collectLocalState()): string {
    return Object.entries(state)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}:${hashValue(v)}`)
      .join('|');
  }

  private readBase(): Record<string, string> {
    try {
      const raw = localStorage.getItem(SYNC_BASE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  private writeBase(base: Record<string, string>): void {
    try {
      localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(base));
    } catch {
      /* best-effort */
    }
  }

  /**
   * One convergence round: 3-way merge of local vs remote against the last
   * synced baseline, live-rehydrate any adopted stores, push if local holds
   * anything the cloud doesn't have yet, then advance the baseline.
   */
  private async syncCycle(): Promise<void> {
    const uid = this.activeUserId;
    if (!uid) return;
    if (this.cycleBusy) {
      this.cycleQueued = true;
      return;
    }
    this.cycleBusy = true;
    try {
      const remote = await this.fetchRemote(uid);
      if (remote === undefined) {
        // Server state unknown → change NOTHING (no push, no baseline move)
        // and retry. Local edits stay "unsynced" until a real round-trip.
        this.scheduleCycle(30_000);
        return;
      }
      const local = collectLocalState();
      const base = this.readBase();
      const adopted: string[] = [];
      let needPush = false;

      if (!remote) {
        needPush = Object.keys(local).length > 0;
      } else {
        const conflicts: string[] = [];
        const keys = new Set([...Object.keys(local), ...Object.keys(remote.data)]);
        for (const k of keys) {
          if (!isSyncableKey(k)) continue;
          const lv = local[k];
          const rv = remote.data[k];
          if (lv === rv) continue;
          const baseHash = base[k] ?? hashValue(undefined);
          const localChanged = hashValue(lv) !== baseHash;
          const remoteChanged = hashValue(rv) !== baseHash;

          if (!localChanged && remoteChanged) {
            // Only the other device moved → adopt its value (or deletion).
            try {
              this.saveSafetySnapshot();
              if (rv == null) localStorage.removeItem(k);
              else localStorage.setItem(k, rv);
              adopted.push(k);
            } catch {
              /* quota — skip */
            }
          } else if (localChanged && remoteChanged && lv != null && rv != null) {
            // Both sides moved since the baseline → merge the CONTENTS so
            // neither device's history is discarded (see syncMerge.ts).
            const merged = mergeSyncedValue(k, lv, rv);
            if (merged !== lv) {
              try {
                this.saveSafetySnapshot();
                localStorage.setItem(k, merged);
                adopted.push(k);
              } catch {
                /* quota — skip */
              }
            }
            if (merged !== rv) needPush = true;
            conflicts.push(k);
          } else if (localChanged && remoteChanged && lv == null && rv != null) {
            // We deleted the key while the other device changed it → the edit
            // outranks the wipe: resurrect the remote copy.
            try {
              this.saveSafetySnapshot();
              localStorage.setItem(k, rv);
              adopted.push(k);
            } catch {
              /* quota — skip */
            }
          } else {
            // Only we moved — or remote deleted a key we changed: keep the
            // surviving local copy (never adopt a wipe over an edit).
            needPush = true;
          }
        }
        if (conflicts.length > 0) {
          console.info('[cloudSync] merged concurrent edits for:', conflicts.join(', '));
          void import('@/store/toastStore').then(({ toast }) =>
            toast.info('تعديلات متزامنة من جهاز آخر', 'تم دمج تقدّم الجهازين معاً'),
          );
        }
        if (remote.updatedAt) this.lastSeenRemoteAt = remote.updatedAt;
      }

      // Snapshot NOW (synchronously, before any await): this exact state is
      // what gets pushed and what the baseline records. Re-reading local
      // after the awaits folded taps made mid-push into the baseline without
      // ever uploading them — the next cycle then "adopted" the older cloud
      // copy over them (progress rolling back after a network blip).
      const snapshot = collectLocalState();
      if (adopted.length > 0) await rehydrateKeys(adopted);
      const ok = needPush ? await this.push(uid, snapshot) : true;
      if (ok) {
        this.writeBase(hashMap(snapshot));
        this.lastLocalSig = this.localSignature(snapshot);
      } else {
        // Push failed: keep the old baseline so local still reads as changed,
        // and retry (the `online` event alone never fires on a dead-but-up link).
        this.lastLocalSig = null;
        this.scheduleCycle(30_000);
      }
    } catch (e) {
      console.warn('[cloudSync] sync cycle failed', e);
    } finally {
      this.cycleBusy = false;
      if (this.cycleQueued) {
        this.cycleQueued = false;
        this.scheduleCycle(500);
      }
    }
  }
}

export const cloudSyncService = new CloudSyncService();
