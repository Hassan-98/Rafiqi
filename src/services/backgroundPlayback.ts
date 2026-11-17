import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';

/**
 * Background listening (Android): while Quran or adhkar listening is active, a
 * native foreground "mediaPlayback" service (MediaPlaybackService.java) keeps
 * the app + WebView running with the screen off, holds a wake lock, shows a
 * media notification and owns the lock-screen / Bluetooth / headset buttons.
 * The audio and the queue logic stay in JS; the service only forwards button
 * presses back here as actions (audio focus is left to the WebView).
 *
 * One owner at a time (the Quran player or adhkar listening) — the last one to
 * call showBackground gets the actions. No-op on web; the desktop shell keeps
 * playing when minimized (WebView2 throttling flags in src-tauri/src/lib.rs).
 */

export type BgAction = 'play' | 'pause' | 'next' | 'prev' | 'stop';
export type BgOwner = 'quran' | 'adhkar';
export interface BgMeta {
  title: string;
  subtitle: string;
  playing: boolean;
}

interface MediaPlaybackPlugin {
  update(meta: BgMeta): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: 'action', cb: (d: { action: BgAction }) => void): Promise<PluginListenerHandle>;
}

const MediaPlayback = registerPlugin<MediaPlaybackPlugin>('MediaPlayback');

export const backgroundPlaybackSupported = (): boolean => Capacitor.getPlatform() === 'android';

let owner: BgOwner | null = null;
let handler: ((a: BgAction) => void) | null = null;
let lastSent = '';
let listening = false;

/** «التشغيل في الخلفية» — per device, on by default. */
export const useBackgroundPlaybackStore = create<{ enabled: boolean; setEnabled: (v: boolean) => void }>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => {
        set({ enabled });
        if (!enabled && owner) hideBackground(owner);
      },
    }),
    { name: 'myzikr:bg-playback', storage: safeStorage },
  ),
);

/** Start or refresh the background session (deduped — cheap to call on every state change). */
export function showBackground(who: BgOwner, meta: BgMeta, onAction: (a: BgAction) => void): void {
  if (!backgroundPlaybackSupported() || !useBackgroundPlaybackStore.getState().enabled) return;
  owner = who;
  handler = onAction;
  if (!listening) {
    listening = true;
    void MediaPlayback.addListener('action', ({ action }) => handler?.(action)).catch(() => undefined);
  }
  const key = JSON.stringify(meta);
  if (key === lastSent) return;
  lastSent = key;
  void MediaPlayback.update(meta).catch(() => undefined); // older APK without the plugin
}

/** End the session — only if `who` still owns it (a newer owner keeps it). */
export function hideBackground(who: BgOwner): void {
  if (owner !== who) return;
  owner = null;
  handler = null;
  lastSent = '';
  void MediaPlayback.stop().catch(() => undefined);
}
