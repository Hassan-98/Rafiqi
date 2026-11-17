import { useEffect, useState } from 'react';
import { audioController, type ControllerSnapshot } from '@/services/AudioController';

/**
 * React hook that subscribes to the singleton AudioController state.
 * Use it from any component that needs live playback status (e.g.
 * AudioPlayerBar, VerseList, mini-player).
 */
export function useAudioController(): ControllerSnapshot {
  const [snap, setSnap] = useState<ControllerSnapshot>(() => audioController.snapshot());
  useEffect(() => audioController.subscribe(setSnap), []);
  return snap;
}

export interface AudioProgress {
  currentMs: number;
  durationMs: number;
}

/**
 * Subscribes to the AudioController's throttled time channel. Use ONLY in the
 * seek bar — it updates ~5×/sec, so keeping it off the main snapshot avoids
 * re-rendering the heavy Mushaf page during playback.
 */
export function useAudioProgress(): AudioProgress {
  const [progress, setProgress] = useState<AudioProgress>({ currentMs: 0, durationMs: 0 });
  useEffect(
    () => audioController.subscribeTime((currentMs, durationMs) => setProgress({ currentMs, durationMs })),
    [],
  );
  return progress;
}

/** Listens for word-by-word highlight changes. Returns the active word pos. */
export function useActiveWord(verseKey: string | null | undefined): number | null {
  const [pos, setPos] = useState<number | null>(null);
  useEffect(() => {
    if (!verseKey) return undefined;
    return audioController.subscribeWord((vk, p) => {
      if (vk === verseKey) setPos(p);
      else setPos(null);
    });
  }, [verseKey]);
  return pos;
}
