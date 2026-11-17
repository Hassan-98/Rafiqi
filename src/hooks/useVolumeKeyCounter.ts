import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { subscribeVolumeKeys, volumeKeysSupported } from '@/services/volumeKeys';

/**
 * Count with the hardware volume keys while a counting screen is open.
 *
 * Both keys count up — the setting exists so the user can raise a tasbih
 * without looking at the screen, and asking them to remember which key adds
 * would defeat that. The keys stop changing the system volume for as long as
 * the screen is mounted, and go back to normal the moment it unmounts.
 *
 * @param onCount fired once per key press (auto-repeat while held is ignored)
 * @param enabled screen-level gate — pass false while the counter is finished
 * @returns whether capture is actually live (Android + setting on + enabled)
 */
export function useVolumeKeyCounter(onCount: () => void, enabled = true): boolean {
  const settingOn = useSettingsStore((s) => s.volumeKeyCounter);
  const active = enabled && settingOn && volumeKeysSupported();

  // Keep the latest callback without re-subscribing on every render.
  const cbRef = useRef(onCount);
  cbRef.current = onCount;

  useEffect(() => {
    if (!active) return;
    return subscribeVolumeKeys(() => cbRef.current());
  }, [active]);

  return active;
}
