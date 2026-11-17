import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';

export type HapticImpact = 'light' | 'medium' | 'heavy';
export type HapticNotice = 'success' | 'warning' | 'error';

/**
 * Thin wrapper around `@capacitor/haptics` that gracefully degrades to
 * `navigator.vibrate` in the browser and respects the user's `hapticsEnabled`
 * preference (read lazily to avoid circular imports — caller passes it).
 */
class HapticsService {
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async impact(style: HapticImpact = 'light'): Promise<void> {
    if (!this.enabled) return;
    if (Capacitor.isNativePlatform()) {
      try {
        // `Haptics.impact` (esp. Light) is imperceptible on many Android
        // devices — it never throws, it just produces a buzz too weak to
        // feel. Drive the Vibrator directly with an explicit duration so the
        // user actually feels every tap.
        const duration = style === 'heavy' ? 45 : style === 'medium' ? 28 : 16;
        await Haptics.vibrate({ duration });
        return;
      } catch {
        /* fallthrough to web */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(style === 'heavy' ? 30 : style === 'medium' ? 18 : 10);
    }
  }

  async selection(): Promise<void> {
    if (!this.enabled) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.selectionStart();
        await Haptics.selectionEnd();
        return;
      } catch {
        /* ignore */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(5);
    }
  }

  async notify(kind: HapticNotice = 'success'): Promise<void> {
    if (!this.enabled) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({
          type:
            kind === 'error'
              ? NotificationType.Error
              : kind === 'warning'
                ? NotificationType.Warning
                : NotificationType.Success,
        });
        return;
      } catch {
        /* ignore */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'error' ? [40, 40, 40] : kind === 'warning' ? [30, 20] : 24);
    }
  }

  /**
   * A strong, unmistakable error buzz (recite-test mistakes). Combines the OS
   * error-notification pattern with a long explicit vibration so it's clearly
   * felt even on Android devices with weak haptics.
   */
  async errorBuzz(): Promise<void> {
    if (!this.enabled) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {
        /* ignore */
      }
      try {
        await Haptics.vibrate({ duration: 450 });
        return;
      } catch {
        /* fallthrough to web */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 60, 120, 60, 220]);
    }
  }
}

export const hapticsService = new HapticsService();
