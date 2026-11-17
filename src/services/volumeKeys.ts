import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Bridge to the native `VolumeKeys` plugin (Android only).
 *
 * While capture is on, the activity swallows VOLUME_UP / VOLUME_DOWN entirely:
 * the system volume does NOT move and every press is forwarded here instead.
 * That is deliberate — the counting screens borrow the keys so a user can keep
 * their eyes closed (or the phone in a pocket) while counting a dhikr.
 *
 * Capture is reference-counted and only ever runs while a counting screen is
 * mounted, so the keys behave normally everywhere else in the app.
 */

export type VolumeKeyDirection = 'up' | 'down';

interface VolumeKeysPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'volumeKey',
    cb: (data: { direction: VolumeKeyDirection }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const VolumeKeys = registerPlugin<VolumeKeysPlugin>('VolumeKeys');

/** Only Android can hand hardware volume keys to the web layer. */
export function volumeKeysSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

type Handler = (direction: VolumeKeyDirection) => void;

const handlers = new Set<Handler>();
let listener: Promise<PluginListenerHandle> | null = null;

function attach(): void {
  if (listener) return;
  listener = VolumeKeys.addListener('volumeKey', ({ direction }) => {
    // Copy first: a handler may unsubscribe itself while we iterate.
    for (const h of [...handlers]) h(direction);
  });
  void VolumeKeys.start().catch(() => {
    /* plugin missing (older build) — keys keep their normal behaviour */
  });
}

function detach(): void {
  const pending = listener;
  listener = null;
  void VolumeKeys.stop().catch(() => {});
  void pending?.then((h) => h.remove()).catch(() => {});
}

/**
 * Take over the volume keys for as long as the returned disposer is unused.
 * No-op (returns a disposer that does nothing) off Android.
 */
export function subscribeVolumeKeys(handler: Handler): () => void {
  if (!volumeKeysSupported()) return () => {};
  handlers.add(handler);
  attach();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) detach();
  };
}
