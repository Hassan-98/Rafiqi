import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useQuranStore } from '@/store/quranStore';
import { useBookmarksStore } from '@/store/bookmarksStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useRamadanStore } from '@/store/ramadanStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useBadgeStore } from '@/store/badgeStore';
import { useAsmaProgressStore } from '@/store/asmaProgressStore';
import { useDuaaLibraryStore } from '@/store/duaaLibraryStore';
import { useHadithStore } from '@/store/hadithStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useMemorizationStore } from '@/store/memorizationStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useCustomAzkarStore } from '@/store/customAzkarStore';
import { useCustomRemindersStore } from '@/store/customRemindersStore';
import { useDhikrSessionStore } from '@/store/dhikrSessionStore';

interface BackupEnvelope {
  version: 3;
  app: 'myzikr';
  exportedAt: string;
  data: {
    settings: ReturnType<typeof useSettingsStore.getState>;
    progress: ReturnType<typeof useProgressStore.getState>;
    notifications: ReturnType<typeof useNotificationStore.getState>;
    quran: ReturnType<typeof useQuranStore.getState>;
    bookmarks: ReturnType<typeof useBookmarksStore.getState>;
    tasbih: ReturnType<typeof useTasbihStore.getState>;
    ramadan: ReturnType<typeof useRamadanStore.getState>;
    sadaqah: ReturnType<typeof useSadaqahStore.getState>;
    badges: ReturnType<typeof useBadgeStore.getState>;
    asma: ReturnType<typeof useAsmaProgressStore.getState>;
    duaaLibrary: ReturnType<typeof useDuaaLibraryStore.getState>;
    hadith: ReturnType<typeof useHadithStore.getState>;
    // Added in v3 — these were silently excluded before, so restore on a new
    // device lost prayer history, Quran memorization progress, goals, and
    // user-authored azkar/reminders despite the "صدّر كل ما يخصّك" promise.
    prayerLog: ReturnType<typeof usePrayerLogStore.getState>;
    memorization: ReturnType<typeof useMemorizationStore.getState>;
    targets: ReturnType<typeof useTargetsStore.getState>;
    customAzkar: ReturnType<typeof useCustomAzkarStore.getState>;
    customReminders: ReturnType<typeof useCustomRemindersStore.getState>;
    dhikrSessions: ReturnType<typeof useDhikrSessionStore.getState>;
  };
}

const STORE_GETTERS = [
  ['settings', useSettingsStore],
  ['progress', useProgressStore],
  ['notifications', useNotificationStore],
  ['quran', useQuranStore],
  ['bookmarks', useBookmarksStore],
  ['tasbih', useTasbihStore],
  ['ramadan', useRamadanStore],
  ['sadaqah', useSadaqahStore],
  ['badges', useBadgeStore],
  ['asma', useAsmaProgressStore],
  ['duaaLibrary', useDuaaLibraryStore],
  ['hadith', useHadithStore],
  ['prayerLog', usePrayerLogStore],
  ['memorization', useMemorizationStore],
  ['targets', useTargetsStore],
  ['customAzkar', useCustomAzkarStore],
  ['customReminders', useCustomRemindersStore],
  ['dhikrSessions', useDhikrSessionStore],
] as const;

function stripActions<T extends object>(state: T): Partial<T> {
  // Persisted Zustand state may include functions; drop them so JSON is clean.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== 'function') out[k] = v;
  }
  return out as Partial<T>;
}

class BackupService {
  /** Serialize the current state of all stores into a JSON envelope. */
  buildEnvelope(): BackupEnvelope {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const [key, store] of STORE_GETTERS) {
      data[key] = stripActions(store.getState());
    }
    return {
      version: 3,
      app: 'myzikr',
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * Export the envelope as a JSON file. On native, writes to Documents and
   * opens the OS share sheet. In browser, triggers a `<a download>`.
   */
  async export(): Promise<void> {
    const json = JSON.stringify(this.buildEnvelope(), null, 2);
    const fileName = `myzikr-backup-${new Date().toISOString().slice(0, 10)}.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: 'نسخة احتياطية',
          text: 'نسخة احتياطية من تطبيق رَفِيقِي',
          url: result.uri,
          dialogTitle: 'حفظ النسخة الاحتياطية',
        });
      } catch (e) {
        throw new Error(`Failed to write backup: ${(e as Error).message}`);
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Validate a backup file and return a preview (date + store count) WITHOUT
   * applying anything — restore is destructive, so the UI must be able to
   * show the user what they're about to apply before committing.
   */
  inspectJson(json: string): { exportedAt: string | null; storeCount: number } {
    const env = JSON.parse(json) as Partial<BackupEnvelope>;
    if (env?.app !== 'myzikr' || !env.data) {
      throw new Error('ملف نسخة احتياطية غير صالح');
    }
    const storeCount = STORE_GETTERS.filter(([key]) => {
      const entry = (env.data as Record<string, unknown>)[key];
      return !!entry && typeof entry === 'object';
    }).length;
    return { exportedAt: typeof env.exportedAt === 'string' ? env.exportedAt : null, storeCount };
  }

  /**
   * Silently stash the CURRENT state under a localStorage key before a
   * destructive restore/pull, so one mistaken tap is recoverable. The stash
   * key is not a store key, so the restore itself never overwrites it.
   */
  stashSafetySnapshot(key = 'myzikr:_preRestoreBackup'): void {
    try {
      localStorage.setItem(key, JSON.stringify(this.buildEnvelope()));
    } catch (e) {
      // Quota — a failed safety net must not block the user's explicit action.
      console.warn('[BackupService] safety snapshot failed', e);
    }
  }

  /**
   * Restore from a JSON string. Returns the count of stores restored. Throws
   * on malformed input.
   */
  async restoreFromJson(json: string): Promise<number> {
    const env = JSON.parse(json) as Partial<BackupEnvelope>;
    if (env?.app !== 'myzikr' || !env.data) {
      throw new Error('ملف نسخة احتياطية غير صالح');
    }
    let count = 0;
    for (const [key, store] of STORE_GETTERS) {
      const entry = (env.data as Record<string, unknown>)[key];
      if (entry && typeof entry === 'object') {
        try {
          // Capture the store's action functions FIRST. A replacing setState
          // (`replace=true`) drops every function, so we must read them BEFORE
          // replacing — the previous implementation read them after and always
          // got an empty set, leaving each store actionless until the page
          // reload (any tap/effect calling an action would throw in between).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const before = (store as any).getState();
          const fns: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(before)) {
            if (typeof v === 'function') fns[k] = v;
          }
          // Restore data on top of the live actions in a single replace.
          // (entry holds no functions — stripActions removed them on export —
          // so spreading it after fns can never clobber an action.)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // Initial state underneath: a backup from before a field existed
          // (e.g. quran.khatmas) restores it to its default, not `undefined`.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (store as any).setState({ ...(store as any).getInitialState(), ...fns, ...entry }, true);
          count += 1;
        } catch (e) {
          console.warn('[BackupService] restore failed for', key, e);
        }
      }
    }
    return count;
  }

  /** Read a file via Capacitor Filesystem (path is a Documents URI). */
  async restoreFromFile(uriOrPath: string): Promise<number> {
    if (!Capacitor.isNativePlatform()) throw new Error('ادعم استعادة الملف على الجوّال فقط');
    const file = await Filesystem.readFile({ path: uriOrPath, encoding: Encoding.UTF8 });
    const content = typeof file.data === 'string' ? file.data : '';
    return this.restoreFromJson(content);
  }
}

export const backupService = new BackupService();
