import { useEffect } from 'react';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * Keep the screen on while the host page is mounted — for reading surfaces
 * (Quran reader, hifz) where the user looks at the screen for minutes without
 * touching it, and the OS idle-dim/lock mid-recitation is wrong.
 *
 * Android: FLAG_KEEP_SCREEN_ON on the activity window — automatically stops
 * mattering when the app is backgrounded, so it never drains the battery from
 * the background. Web: the Screen Wake Lock API where available (the plugin
 * re-acquires it on visibility return). Silently no-ops where unsupported.
 */
export function useKeepAwake(): void {
  useEffect(() => {
    let cancelled = false;
    let engaged = false;
    void (async () => {
      try {
        const { isSupported } = await KeepAwake.isSupported();
        if (!isSupported || cancelled) return;
        await KeepAwake.keepAwake();
        engaged = true;
        // Unmounted while the request was in flight → release immediately.
        if (cancelled) await KeepAwake.allowSleep();
      } catch {
        /* unsupported platform — never block the page */
      }
    })();
    return () => {
      cancelled = true;
      if (engaged) void KeepAwake.allowSleep().catch(() => undefined);
    };
  }, []);
}
