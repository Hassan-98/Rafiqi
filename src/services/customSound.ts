import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSoundDef, defaultSoundForKey } from './notifications/sounds';

interface CustomSoundPlugin {
  pickAndSetChannelSound(opts: {
    channelId: string;
    name: string;
    importance: number;
  }): Promise<{ channelId: string; fileName: string; uri: string }>;
}

const CustomSound = registerPlugin<CustomSoundPlugin>('CustomSound');

/** Deterministic channel id for a reminder key's custom sound. */
export function customChannelId(key: string): string {
  return `myzikr_custom_${key.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

/** Custom file sounds only work on Android (native channel + FileProvider). */
export function isCustomSoundSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Let the user pick an audio file for a reminder key and register it as that
 * key's notification-channel sound (native). Returns the channel id + a short
 * label (the file name), or null if cancelled / unsupported.
 */
export async function pickCustomSound(
  key: string,
  name: string,
): Promise<{ channelId: string; label: string } | null> {
  if (!isCustomSoundSupported()) return null;
  const channelId = customChannelId(key);
  const importance = getSoundDef(defaultSoundForKey(key)).importance;
  try {
    const res = await CustomSound.pickAndSetChannelSound({ channelId, name, importance });
    const label = decodeURIComponent(res.fileName || 'ملف صوتي').replace(/\.[a-z0-9]+$/i, '');
    return { channelId: res.channelId, label };
  } catch {
    return null; // user cancelled or the pick/setup failed
  }
}
