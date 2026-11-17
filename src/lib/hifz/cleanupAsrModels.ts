import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/**
 * One-time cleanup of the REMOVED on-device ASR engines' downloads
 * (FastConformer ~131 MB under `asr/`, Quran-whisper ~58 MB under `asr2/`).
 * The engines were retired 2026-06-11 — recitation runs on the system
 * recognizer with expected-text biasing. Safe to delete this module once the
 * install base has rolled past those builds.
 */
const FLAG = 'myzikr-asr-models-cleaned-v1';

export async function cleanupRemovedAsrModels(): Promise<void> {
  try {
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, '1');
    if (Capacitor.isNativePlatform()) {
      for (const path of ['asr', 'asr2']) {
        await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true }).catch(
          () => undefined, // never existed on most devices
        );
      }
    } else if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('myzikr-asr');
    }
  } catch {
    /* best-effort */
  }
}
