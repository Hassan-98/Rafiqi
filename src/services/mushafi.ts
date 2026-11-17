import { Capacitor, registerPlugin } from '@capacitor/core';
import { format } from 'date-fns';
import { khatmaState, mushafiToday, useMushafiStore, type MushafiRemote } from '@/store/mushafiStore';
import { useQuranStore } from '@/store/quranStore';
import { useProgressStore } from '@/store/progressStore';
import { useSettingsStore } from '@/store/settingsStore';
import { khatmaFinishedCount, type Khatma } from '@/store/khatmaModel';
import { toast } from '@/store/toastStore';

/**
 * Talking to «مصحفي»: pull its synced state, and open it (Android app /
 * desktop Mushaf.exe). See src/store/mushafiStore.ts.
 */

const SYNC_URL = 'https://mushaf-sync.vercel.app/api/sync';

let inFlight: Promise<boolean> | null = null;

/**
 * Read-only pull: posting just the code merges nothing into the server's copy
 * (and costs no write there) — it answers with the merged state of every device.
 */
export function pullMushafi(): Promise<boolean> {
  const { code } = useMushafiStore.getState();
  if (!code) return Promise.resolve(false);
  if (inFlight) return inFlight;
  useMushafiStore.getState().setStatus('syncing');
  inFlight = (async () => {
    try {
      const r = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const remote = (await r.json()) as MushafiRemote;
      // Unlinked while the request was out? Drop the answer.
      if (useMushafiStore.getState().code !== code) return false;
      useMushafiStore.getState().apply(remote, Date.now());
      projectToQuran();
      return true;
    } catch {
      useMushafiStore.getState().setStatus('fail');
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * مصحفي → the app's Quran record. Home, stats, badges, insights, widgets and
 * «رفيقك اليومي» all read quranStore (readingDays / wird / wirdHistory /
 * khatmas); they keep working because this fills it from مصحفي.
 */
export function projectToQuran(now = new Date()) {
  const m = useMushafiStore.getState();
  if (!m.code) return;
  const q = useQuranStore.getState();
  const today = format(now, 'yyyy-MM-dd');
  const fallback = q.wird?.unit === 'page' ? q.wird.amount : useSettingsStore.getState().quranDailyTarget;
  const t = mushafiToday(m.days, m.khatmas, m.marks, today, fallback);

  const readingDays = { ...q.readingDays };
  const wirdHistory = { ...q.wirdHistory };
  for (const [k, v] of Object.entries(m.days)) {
    readingDays[k] = Math.max(readingDays[k] ?? 0, v.length);
    // Days read before they reached us (first link, another device, offline):
    // ponytail: مصحفي doesn't record a past day's portion, so today's goal stands in.
    if (k < today && !wirdHistory[k] && v.length) wirdHistory[k] = { unit: 'page', amount: t.goal, achieved: v.length };
  }
  wirdHistory[today] = { unit: 'page', amount: t.goal, achieved: t.achieved };

  const mushafiKhatmas: Khatma[] = m.khatmas.map((k) => {
    const s = khatmaState(k, m.marks, today);
    return {
      id: `m_${k.id}`,
      name: s.name,
      startPage: k.b + 1,
      read: s.live ? s.done : s.total,
      total: s.total,
      completions: 0,
      createdAt: Date.parse(`${k.s}T12:00:00`),
      updatedAt: k.t,
    };
  });
  // Khatmas finished in the old built-in reader stay (they count for badges);
  // unfinished ones continue in مصحفي.
  const legacy = q.khatmas.filter((k) => !k.id.startsWith('m_') && khatmaFinishedCount(k) > 0);

  useQuranStore.setState({
    readingDays,
    wird: {
      unit: 'page',
      amount: t.goal,
      startedAt: q.wird?.startedAt ?? today,
      autoSchedule: false,
      ...(q.wird?.reminderTime ? { reminderTime: q.wird.reminderTime } : null),
      cursor: {},
    },
    wirdHistory,
    khatmas: [...legacy, ...mushafiKhatmas],
    activeKhatmaId: t.live[0] ? `m_${t.live[0].id}` : (mushafiKhatmas[mushafiKhatmas.length - 1]?.id ?? null),
  });

  // The day's «القرآن» in عباداتك / streaks — never lowers a manual «تم».
  const rate = Math.min(1, t.achieved / t.goal);
  const had = useProgressStore.getState().dailyProgress[today]?.modules.find((x) => x.moduleId === 'quran')?.completionRate ?? 0;
  if (rate > had) useProgressStore.getState().setModuleRate('quran', rate, today);
}

let lastPull = 0;
/** Pull unless one just ran — for resume / focus / timers. */
export function pullMushafiSoon(minGapMs = 60_000) {
  if (Date.now() - lastPull < minGapMs) return;
  lastPull = Date.now();
  void pullMushafi();
}

/** Keep the copy fresh: on start, on every return to the app, and every 5 minutes while it's open. */
export function startMushafiSync() {
  projectToQuran();
  pullMushafiSoon(0);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    projectToQuran(); // a new day starts its wird even before the pull lands
    // Coming back from مصحفي is exactly when new pages are waiting.
    pullMushafiSoon(15_000);
  });
  setInterval(() => {
    if (!document.hidden) pullMushafiSoon(4 * 60_000);
  }, 5 * 60_000);
  // A new code → pull at once.
  useMushafiStore.subscribe((s, prev) => {
    if (s.code && s.code !== prev.code) pullMushafiSoon(0);
  });
}

interface MushafiPlugin {
  open(opts: { page?: number }): Promise<{ opened: boolean }>;
}
const Native = registerPlugin<MushafiPlugin>('Mushafi');

interface DesktopShell {
  mushafi?: { open(page?: number): Promise<boolean> };
}

/** Open مصحفي, at `page` (standard 604 numbering) when given. */
export async function openMushafi(page?: number): Promise<boolean> {
  const p = page && page >= 1 && page <= 604 ? Math.round(page) : undefined;
  let opened = false;
  // An app shell from before 2026-11-09 has no «open مصحفي» native piece (this code can arrive by OTA).
  const outdated = () => {
    toast.info('حدّث التطبيق', 'النسخة الأحدث من التطبيق تفتح مصحفي مباشرة');
    return false;
  };
  try {
    if (Capacitor.getPlatform() === 'android') opened = (await Native.open({ page: p })).opened;
    else {
      const shell = (window as unknown as { desktopShell?: DesktopShell }).desktopShell;
      if (shell?.mushafi) opened = await shell.mushafi.open(p);
      else if (shell) return outdated();
      else {
        toast.info('افتح مصحفي من هاتفك أو حاسوبك', 'تطبيق القرآن منفصل، وتقدّمك فيه يصل هنا بالمزامنة');
        return false;
      }
    }
  } catch (e) {
    if ((e as { code?: string })?.code === 'UNIMPLEMENTED') return outdated();
    opened = false;
  }
  if (!opened && Capacitor.getPlatform() === 'android') toast.info('مصحفي غير مثبّت', 'ثبّت تطبيق مصحفي ليُفتح القرآن منه');
  return opened;
}
