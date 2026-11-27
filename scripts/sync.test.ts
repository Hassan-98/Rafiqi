/**
 * Executable check for the "progress rolls back after a network blip" bug:
 * a failed fetch/push must never advance the sync baseline, and a save made
 * while a push is in flight must still be uploaded — never overwritten by the
 * older cloud copy on the next cycle.
 *
 * Run: npx esbuild scripts/sync.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/sync.test.mjs
 *        "--define:import.meta.env={\"VITE_SUPABASE_URL\":\"http://x\",\"VITE_SUPABASE_PUBLISHABLE_KEY\":\"k\"}"
 *      node .tmp-test/sync.test.mjs
 */
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  get length() { return mem.size; },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
g.window = g;
const bus = new EventTarget();
g.addEventListener = bus.addEventListener.bind(bus);
g.dispatchEvent = bus.dispatchEvent.bind(bus);
g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
if (!('navigator' in g)) g.navigator = { onLine: true };

const KEY = 'myzikr:test-progress';
let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const { supabase } = await import('@/services/supabaseClient');
  const { cloudSyncService } = await import('@/services/cloudSyncService');

  // ── Fake cloud row + switchable network ───────────────────────────────
  let online = true;
  let remote: Record<string, string> = {};
  let remoteAt = new Date(0).toISOString();
  let duringPush: (() => void) | null = null;
  const fail = { data: null, error: { message: 'offline' } };
  (supabase as unknown as { from: unknown }).from = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          online ? { data: { data: { ...remote }, updated_at: remoteAt }, error: null } : fail,
      }),
    }),
    upsert: async (row: { data: Record<string, string>; updated_at: string }) => {
      duringPush?.();
      duringPush = null;
      if (!online) return fail;
      remote = { ...row.data };
      remoteAt = row.updated_at;
      return { data: null, error: null };
    },
  });

  const svc = cloudSyncService as unknown as { activeUserId: string | null; syncCycle(): Promise<void> };
  svc.activeUserId = 'u1';
  const cycle = () => svc.syncCycle();
  const val = (n: number) => JSON.stringify({ state: { count: n }, version: 0 });

  // Converged start: P0 everywhere.
  localStorage.setItem(KEY, val(0));
  await cycle();
  check('initial push reaches the cloud', remote[KEY] === val(0));

  // 1) Save offline, reconnect → local must survive and be uploaded.
  localStorage.setItem(KEY, val(1));
  online = false;
  await cycle();
  online = true;
  await cycle();
  check('offline save survives reconnect', localStorage.getItem(KEY) === val(1), `local=${localStorage.getItem(KEY)}`);
  check('offline save is pushed after reconnect', remote[KEY] === val(1), `remote=${remote[KEY]}`);

  // 2) Save while a push is in flight → must not be folded into the baseline.
  localStorage.setItem(KEY, val(2));
  duringPush = () => localStorage.setItem(KEY, val(3));
  await cycle(); // pushes P2; P3 lands mid-push
  await cycle(); // must push P3, not adopt P2 over it
  check('mid-push save survives next cycle', localStorage.getItem(KEY) === val(3), `local=${localStorage.getItem(KEY)}`);
  check('mid-push save is eventually pushed', remote[KEY] === val(3), `remote=${remote[KEY]}`);

  // 3) Push fails while fetch works (link drops mid-cycle).
  localStorage.setItem(KEY, val(4));
  duringPush = () => { online = false; };
  await cycle();
  online = true;
  await cycle();
  check('failed push keeps local on next cycle', localStorage.getItem(KEY) === val(4), `local=${localStorage.getItem(KEY)}`);
  check('failed push is retried', remote[KEY] === val(4), `remote=${remote[KEY]}`);

  // 4) DailyProgress merge keeps a module only one side has (قيام case).
  const { mergeSyncedValue } = await import('@/services/syncMerge');
  const day = (mods: [string, number][]) =>
    JSON.stringify({
      state: {
        dailyProgress: {
          '2026-09-27': {
            dateKey: '2026-09-27',
            modules: mods.map(([moduleId, completionRate]) => ({ moduleId, completionRate, completed: completionRate >= 1 })),
            overallRate: mods.reduce((s, [, r]) => s + r, 0) / mods.length,
          },
        },
      },
      version: 0,
    });
  const merged = JSON.parse(
    mergeSyncedValue('myzikr:progress', day([['habits', 0.5], ['qiyam', 1]]), day([['prayers', 1], ['dhikr', 1]])),
  );
  const ids = merged.state.dailyProgress['2026-09-27'].modules.map((m: { moduleId: string }) => m.moduleId).sort();
  check('day merge keeps qiyam from the lower-average side', ids.join(',') === 'dhikr,habits,prayers,qiyam', ids.join(','));

  // 5) Settings inside a history store stay per-device: switching tajweed off
  //    here must survive a cloud copy that still has it on.
  const quran = (tajweedEnabled: boolean, volume: number, pages: number[]) =>
    JSON.stringify({ state: { settings: { tajweedEnabled, volume }, readPages: pages }, version: 3 });
  const q = JSON.parse(mergeSyncedValue('myzikr:quran', quran(false, 0.4, [1, 2]), quran(true, 1, [2, 3]))).state;
  check('history-store settings keep the local value', q.settings.tajweedEnabled === false && q.settings.volume === 0.4, JSON.stringify(q.settings));
  check('history-store data still unions', [...q.readPages].sort().join(',') === '1,2,3', JSON.stringify(q.readPages));

  // 6) Adhkar read on the other device must reach this device's LIVE activity
  //    log (programs/badges read it, not localStorage), and a tap still waiting
  //    on the debounced write must survive the merge.
  const { useActivityLogStore } = await import('@/store/activityLogStore');
  useActivityLogStore.getState().log({ domain: 'dhikr', refId: 'evening', title: 'م', amount: 1 });
  const phone = { id: 'a_phone', ts: Date.now(), dateKey: 'x', domain: 'dhikr', refId: 'morning', title: 'ص', amount: 1 };
  remote = { ...remote, 'myzikr:activity-log': JSON.stringify({ state: { events: [phone] }, version: 0 }) };
  remoteAt = new Date().toISOString();
  await cycle();
  const refs = useActivityLogStore.getState().events.map((e) => e.refId).sort().join(',');
  check('other device adhkar reach the live activity log', refs === 'evening,morning', refs);

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

void main();
