/**
 * Pure silence detection for «تخطّي الصمت في نهاية الآية» (no DOM, no audio)
 * — checked in scripts/quranAudio.test.ts. silenceTrim.ts feeds it decoded
 * samples; AudioController ends the ayah at the returned time.
 */

/** Last audible moment (seconds) of a clip: the end of the last 50ms window
 *  whose RMS exceeds `threshold`. null = nothing audible. */
export function lastAudibleSec(samples: Float32Array, sampleRate: number, threshold = 0.02, windowMs = 50): number | null {
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  let last = -1;
  for (let i = 0, w = 0; i < samples.length; i += win, w++) {
    const end = Math.min(samples.length, i + win);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    if (Math.sqrt(sum / (end - i)) > threshold) last = w;
  }
  return last < 0 ? null : Math.min(samples.length, (last + 1) * win) / sampleRate;
}

/** Where to end the ayah: the last audible moment + a short breath, or 0 when
 *  trimming wouldn't save anything noticeable (tail < 0.5s, or silent clip). */
export function trimmedEnd(lastAudible: number | null, durationSec: number, padSec = 0.25): number {
  if (lastAudible == null) return 0;
  const end = lastAudible + padSec;
  return durationSec - end >= 0.5 ? Math.round(end * 100) / 100 : 0;
}
