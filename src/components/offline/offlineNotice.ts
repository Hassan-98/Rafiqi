import { useToastStore } from '@/store/toastStore';

export type OfflineKind = 'page' | 'tafsir' | 'audio' | 'adhkar';

/** Deep link into the downloads center, focused on the right pack. */
export const downloadsHref = (kind?: OfflineKind) => `/downloads${kind ? `?pack=${kind}` : ''}`;

export function openDownloads(kind?: OfflineKind): void {
  window.location.hash = `#${downloadsHref(kind)}`; // hash router
}

export const OFFLINE_COPY: Record<OfflineKind, { title: string; body: string }> = {
  page: { title: 'هذه الصفحة غير منزّلة', body: 'أنت دون اتصال. نزّل المصحف كاملاً لتقرأ في أي وقت' },
  tafsir: { title: 'التفسير غير منزّل', body: 'أنت دون اتصال. نزّل التفسير الميسّر ليعمل دون إنترنت' },
  audio: { title: 'التلاوة غير منزّلة', body: 'أنت دون اتصال. نزّل تلاوة القارئ لتستمع دون إنترنت' },
  adhkar: { title: 'تلاوة الأذكار غير منزّلة', body: 'أنت دون اتصال. نزّل الأذكار الصوتية لتستمع دون إنترنت' },
};

const lastShown: Partial<Record<OfflineKind, number>> = {};

/** Offline + resource not on disk → one clear toast with «نزّله الآن» (throttled per kind). */
export function notifyOfflineMissing(kind: OfflineKind): void {
  const now = Date.now();
  if (now - (lastShown[kind] ?? 0) < 20_000) return;
  lastShown[kind] = now;
  const c = OFFLINE_COPY[kind];
  useToastStore.getState().push({
    kind: 'warning',
    title: c.title,
    body: c.body,
    durationMs: 6000,
    action: { label: 'نزّله الآن', onPress: () => openDownloads(kind) },
  });
}

/** Thrown by the Quran data paths when offline and the resource isn't downloaded. */
export class OfflineMissingError extends Error {
  constructor(public kind: OfflineKind) {
    super(`offline: ${kind} not downloaded`);
    this.name = 'OfflineMissingError';
  }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
