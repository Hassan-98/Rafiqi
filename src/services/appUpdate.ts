/**
 * Over-the-air web-bundle updates (Android + desktop).
 *
 * `update.json` on Vercel (built by scripts/pack-update.mjs) names the latest
 * bundle: a zip of dist/. The native side downloads it, checks its sha256 and
 * unzips it, then the app is served from that folder:
 *  - Android: LiveUpdatePlugin.java + Capacitor's built-in WebView plugin
 *    (setServerBasePath). Installing a new APK resets to the bundled assets.
 *  - Desktop: src-tauri (shell.js downloads, lib.rs verifies + unzips) swaps the app:// root.
 *
 * Trial boot: a freshly applied bundle is only persisted once it has rendered
 * (confirmBundle). If it crashes, restarting the app boots the previous one.
 */
import { Capacitor, WebView, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { create } from 'zustand';

/** Full URL of update.json. Unset → updates disabled. */
const MANIFEST_URL = import.meta.env.VITE_UPDATE_URL as string | undefined;
export const BUNDLE_VERSION: string = __APP_VERSION__;

export interface UpdateManifest {
  version: string;
  /** Zip URL, absolute or relative to update.json. */
  url: string;
  sha256: string;
  /** Lowest native shell version (APK versionName / desktop app version) the bundle runs on. */
  minNative?: string;
  notes?: string;
  /** Zip size in bytes (pack-update.mjs; older manifests lack it). */
  size?: number;
  /** A small update (pack-update --silent): no prompt — fetched in the background and
   *  switched to the next time the app goes to the background. */
  silent?: boolean;
}

/** Native progress (shells built after 2026-10-12; older ones send none). */
export interface UpdateProgress {
  phase: 'download' | 'extract';
  loaded: number;
  total: number;
}

const LiveUpdate = registerPlugin<{
  download(o: { url: string; version: string; sha256: string }): Promise<{ path: string }>;
  addListener(event: 'progress', cb: (p: UpdateProgress) => void): Promise<PluginListenerHandle>;
}>('LiveUpdate');

const isAndroid = Capacitor.getPlatform() === 'android';
const desktop = () => window.desktopShell?.updates;
export const updatesSupported = !!MANIFEST_URL && (isAndroid || !!desktop());

/** Numeric, segment-wise: '1.0' == '1.0.0' < '1.0.1' < '1.1'. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

async function nativeVersion(): Promise<string> {
  return isAndroid ? (await App.getInfo()).version : desktop()!.nativeVersion();
}

/** The newer, compatible bundle on the server, or null. Throws on network errors. */
export async function checkForUpdate(): Promise<UpdateManifest | null> {
  if (!updatesSupported) return null;
  const res = await fetch(MANIFEST_URL!, { cache: 'no-store' });
  if (!res.ok) throw new Error(`update.json: HTTP ${res.status}`);
  const m = (await res.json()) as UpdateManifest;
  if (compareVersions(m.version, BUNDLE_VERSION) <= 0) return null;
  if (m.minNative && compareVersions(await nativeVersion(), m.minNative) < 0) return null;
  return { ...m, url: new URL(m.url, MANIFEST_URL).href };
}

/** Download + extract + switch to the bundle. The app reloads into it on success. */
export async function applyUpdate(m: UpdateManifest, onProgress?: (p: UpdateProgress) => void): Promise<void> {
  const args = { url: m.url, version: m.version, sha256: m.sha256 };
  if (isAndroid) {
    const sub = onProgress ? await LiveUpdate.addListener('progress', onProgress).catch(() => null) : null;
    try {
      const { path } = await LiveUpdate.download(args);
      onProgress?.({ phase: 'extract', loaded: 1, total: 1 });
      await WebView.setServerBasePath({ path });
    } finally {
      void sub?.remove();
    }
  } else {
    const off = onProgress ? desktop()!.onProgress?.(onProgress) : undefined;
    try {
      await desktop()!.apply(args);
    } finally {
      off?.();
    }
  }
}

/** The running bundle rendered fine → boot it next time too. */
async function confirmBundle(): Promise<void> {
  if (isAndroid) {
    const { path } = await WebView.getServerBasePath();
    if (path.includes('/live-updates/')) await WebView.persistServerBasePath();
  } else {
    await desktop()?.confirm();
  }
}

// ── The update screen's state (components/update/UpdateDialog) ─────────────
export type UpdatePhase = 'available' | 'downloading' | 'installing' | 'restarting' | 'error' | 'done';

interface UpdateState {
  open: boolean;
  phase: UpdatePhase | null;
  manifest: UpdateManifest | null;
  /** Bytes so far / total — total 0 while unknown (older shells: no events). */
  loaded: number;
  total: number;
  error: string | null;
}

export const useUpdateStore = create<UpdateState>(() => ({
  open: false,
  phase: null,
  manifest: null,
  loaded: 0,
  total: 0,
  error: null,
}));

/** What the new bundle shows once it boots: «تم التحديث» + its notes. */
const PENDING_KEY = 'myzikr:update-pending';

/** A newer bundle exists → the update screen (start-up check or Settings). */
export function promptUpdate(m: UpdateManifest): void {
  const s = useUpdateStore.getState();
  if (s.phase === 'downloading' || s.phase === 'installing' || s.phase === 'restarting') {
    useUpdateStore.setState({ open: true });
    return;
  }
  useUpdateStore.setState({ open: true, phase: 'available', manifest: m, loaded: 0, total: m.size ?? 0, error: null });
}

/** «تحديث الآن»: download with live progress, verify, install, reload. */
export async function startUpdate(): Promise<void> {
  const m = useUpdateStore.getState().manifest;
  if (!m) return;
  useUpdateStore.setState({ phase: 'downloading', loaded: 0, total: m.size ?? 0, error: null });
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ version: m.version, notes: m.notes ?? '' }));
  } catch {
    /* the «what's new» note is a nicety */
  }
  try {
    await applyUpdate(m, (p) =>
      useUpdateStore.setState(
        p.phase === 'download'
          ? { phase: 'downloading', loaded: p.loaded, total: p.total || m.size || 0 }
          : { phase: 'installing' },
      ),
    );
    // Android reloads into the new bundle right after this; desktop already did.
    useUpdateStore.setState({ phase: 'restarting' });
  } catch (e) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    const msg = String((e as Error)?.message ?? e);
    useUpdateStore.setState({
      phase: 'error',
      error: /checksum/i.test(msg)
        ? 'وصل الملف تالفاً، أعد المحاولة.'
        : /HTTP|network|timeout|connect|Unable to resolve|failed to fetch/i.test(msg)
          ? 'انقطع الاتصال أثناء التنزيل. تأكد من الإنترنت ثم أعد المحاولة.'
          : `تعذّر تثبيت التحديث: ${msg}`,
    });
  }
}

/** First boot of a just-installed bundle → «تم التحديث» with its notes. */
function showWhatsNew(): void {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_KEY);
    const p = JSON.parse(raw) as { version: string; notes: string };
    if (p.version !== BUNDLE_VERSION) return;
    useUpdateStore.setState({ open: true, phase: 'done', manifest: { version: p.version, notes: p.notes, url: '', sha256: '' }, error: null });
  } catch {
    /* ignore */
  }
}

/**
 * Silent update: fetch it now without a word, switch the next time the app is
 * hidden (Android reloads the WebView, desktop swaps app://) so nobody sees the
 * reload; no «تم التحديث» either — the notes are in «سجل التحديثات». The trial
 * boot still guards it: a bundle that fails to render is not kept.
 */
async function installSilently(m: UpdateManifest): Promise<void> {
  const args = { url: m.url, version: m.version, sha256: m.sha256 };
  let switchTo: () => Promise<unknown>;
  if (isAndroid) {
    const { path } = await LiveUpdate.download(args);
    switchTo = () => WebView.setServerBasePath({ path });
  } else {
    // ponytail: desktop downloads and swaps in one call — both happen while hidden.
    switchTo = () => desktop()!.apply(args);
  }
  const onHide = () => {
    if (document.visibilityState !== 'hidden') return;
    document.removeEventListener('visibilitychange', onHide);
    void switchTo().catch((e) => console.warn('[update] silent switch failed', e));
  };
  document.addEventListener('visibilitychange', onHide);
}

let started = false;
/** App start: confirm the running bundle, then check quietly. */
export async function startAppUpdates(): Promise<void> {
  if (!updatesSupported || started) return;
  started = true;
  try {
    await confirmBundle();
    showWhatsNew();
    const m = await checkForUpdate();
    if (m?.silent) await installSilently(m);
    else if (m) promptUpdate(m);
  } catch (e) {
    console.warn('[update] check failed', e);
  }
}
