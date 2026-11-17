import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { notificationService } from '@/services/NotificationService';
import { safeStorage } from './safeStorage';
import type { SoundKey } from '@/services/notifications/sounds';

/**
 * User-created, free-form reminders that can be attached to any section of the
 * app (Quran, Adhkar, Goals, …). Unlike the fixed module reminders, these are
 * ad-hoc: the user picks a time and an optional note for any reason. Persisted
 * so daily ones survive restarts and any can be listed + cancelled later.
 */

export type ReminderSection =
  | 'dhikr' | 'quran' | 'targets' | 'prayers' | 'tasbih' | 'duaa' | 'hadith' | 'general';

export interface CustomReminder {
  id: string;
  section: ReminderSection | string;
  title: string;
  note?: string;
  /** ISO 8601 of the (next) fire time. */
  triggerTime: string;
  repeat: 'none' | 'daily';
  soundKey?: SoundKey;
  createdAt: number;
}

/** Where tapping each section's reminder should land the user. */
export const SECTION_DEEPLINK: Record<string, string> = {
  dhikr: '/#/adhkar',
  quran: '/#/quran',
  targets: '/#/targets',
  prayers: '/#/module/prayers',
  tasbih: '/#/tasbih',
  duaa: '/#/duaa',
  hadith: '/#/hadith',
  general: '/#/',
};

/** Arabic label per section — for the sheet header / list. */
export const SECTION_LABEL: Record<string, string> = {
  dhikr: 'الأذكار',
  quran: 'القرآن',
  targets: 'الأوراد',
  prayers: 'الصلاة',
  tasbih: 'التسبيح',
  duaa: 'الأدعية',
  hadith: 'الحديث',
  general: 'عام',
};

/** Sensible default ringtone per section. */
export const SECTION_SOUND: Record<string, SoundKey> = {
  dhikr: 'azkar',
  quran: 'quran',
  targets: 'target',
  prayers: 'adhan_short',
  tasbih: 'azkar',
  duaa: 'duaa',
  hadith: 'default',
  general: 'default',
};

const notifId = (id: string): string => `myzikr_custom_${id}`;

let seq = 0;
function makeId(): string {
  return `cr_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

function schedule(r: CustomReminder): void {
  void notificationService.scheduleNotification({
    id: notifId(r.id),
    title: r.title,
    body: r.note ?? '',
    triggerTime: r.triggerTime,
    repeatInterval: r.repeat,
    moduleId: 'custom',
    deepLinkPath: SECTION_DEEPLINK[r.section] ?? '/#/',
    soundKey: r.soundKey ?? SECTION_SOUND[r.section] ?? 'default',
  });
}

interface CustomRemindersState {
  reminders: CustomReminder[];
  add: (input: Omit<CustomReminder, 'id' | 'createdAt'>) => CustomReminder;
  remove: (id: string) => void;
  forSection: (section: string) => CustomReminder[];
  /** Re-arm daily + still-future one-offs; prune elapsed one-offs. Call on boot. */
  rescheduleAll: () => void;
}

export const useCustomRemindersStore = create<CustomRemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],

      add: (input) => {
        const reminder: CustomReminder = { ...input, id: makeId(), createdAt: Date.now() };
        set((s) => ({ reminders: [reminder, ...s.reminders] }));
        schedule(reminder);
        return reminder;
      },

      remove: (id) => {
        void notificationService.cancelNotification(notifId(id));
        set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
      },

      forSection: (section) => get().reminders.filter((r) => r.section === section),

      rescheduleAll: () => {
        const now = Date.now();
        const kept = get().reminders.filter(
          (r) => r.repeat === 'daily' || new Date(r.triggerTime).getTime() > now,
        );
        if (kept.length !== get().reminders.length) set({ reminders: kept });
        kept.forEach(schedule);
      },
    }),
    { name: 'myzikr:custom-reminders', storage: safeStorage },
  ),
);
