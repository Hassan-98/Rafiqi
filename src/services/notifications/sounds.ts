/**
 * Notification sound registry — the single source of truth for the app's
 * per-type ringtones.
 *
 * WHY a registry: Android freezes a notification channel's sound + importance
 * at CREATE time and ignores later edits. To offer N distinct ringtones we
 * therefore create N channels (one per sound), each with its audio frozen in.
 * `CapacitorNotificationService` creates one channel per entry here and routes
 * each notification to the channel matching its `soundKey`.
 *
 * The audio files live in `android/app/src/main/res/raw/<file>` (the real
 * on-device ringtone) and `public/sounds/<file>` (a copy used only for the
 * in-app preview). Both are generated as placeholders by
 * `scripts/gen-notification-sounds.mjs`. To use a real recording (e.g. a
 * genuine Makkah adhan) drop a same-named file into those folders and rebuild,
 * or change the `file` here (e.g. to an `.mp3`) and add that file.
 *
 * CHANGING A SOUND LATER: bump `CHANNEL_VERSION` so brand-new channel ids are
 * created (Android re-reads the audio) and add the old ids to STALE_CHANNEL_IDS.
 */

export type SoundKey =
  | 'adhan_makkah' // full adhan — the five daily prayers
  | 'adhan_short' // "اقتربت الصلاة" — pre-adhan / approaching-prayer alert
  | 'iqama' // "اقتربت إقامة الصلاة" — iqama alert
  | 'azkar' // morning/evening/post-prayer azkar
  | 'quran' // gentle tone — Qur'an wird
  | 'qiyam' // qiyam al-layl
  | 'fasting' // warm bell — fasting reminders
  | 'duaa' // du'a
  | 'target' // goals/targets reminders
  | 'habits' // reward chime — custom habits
  | 'special' // celebratory tone — Islamic-calendar days
  | 'default' // the device's default notification sound
  | 'silent'; // no sound (vibrate only)

/** Android importance levels (mirror NotificationManager.IMPORTANCE_*). */
type Importance = 2 | 3 | 4 | 5; // 2=LOW(no sound) 3=DEFAULT 4=HIGH(peek) 5=MAX(alarm)

export interface SoundDef {
  key: SoundKey;
  /** raw-resource filename incl. extension, or `null` for the system default. */
  file: string | null;
  /** Frozen Android channel id (versioned). */
  channelId: string;
  importance: Importance;
  /** Arabic name shown in the Android system channel settings. */
  nameAr: string;
  /** Arabic description shown in the Android system channel settings. */
  descAr: string;
  /** Arabic label used by the in-app sound picker. */
  labelAr: string;
  /** Short emoji/letter cue for the picker. */
  emoji: string;
}

/** Bump to force Android to recreate channels after changing a sound/importance.
 *  ALSO bump after builds that add/remove res/raw or many assets: Capacitor
 *  freezes each channel's sound as android.resource://pkg/<NUMERIC id>, and
 *  resource ids shift between such builds — stale channels then point at the
 *  wrong/no resource and EVERY notification goes silent (vibration only).
 *  v8 = recovery from exactly that (2026-06-11 asset overhaul). */
export const CHANNEL_VERSION = 'v8';
const ch = (key: string) => `myzikr_snd_${key}_${CHANNEL_VERSION}`;

/** Every sound key — used to enumerate stale prior-version channels. */
const ALL_KEYS: SoundKey[] = [
  'adhan_makkah', 'adhan_short', 'iqama', 'azkar', 'quran', 'qiyam',
  'fasting', 'duaa', 'target', 'habits', 'special', 'default', 'silent',
];

/** Old channel ids to delete on init so stale (frozen) sounds don't linger. */
export const STALE_CHANNEL_IDS = [
  'myzikr_alarm',
  'myzikr_alarm_v2',
  'myzikr_alarm_v3',
  'myzikr_reminders',
  // Prior versioned channels — their frozen audio is outdated (v4 = synthesized
  // placeholders; v5 = real adhan but musical chimes; v6 = non-musical alerts;
  // v7 = real recorded Arabic voice alerts, but its frozen NUMERIC resource
  // URIs broke when resource ids shifted in the 2026-06-11 asset overhaul).
  ...['v4', 'v5', 'v6', 'v7'].flatMap((v) => ALL_KEYS.map((k) => `myzikr_snd_${k}_${v}`)),
];

export const SOUND_DEFS: Record<SoundKey, SoundDef> = {
  adhan_makkah: {
    key: 'adhan_makkah',
    file: 'adhan_makkah.mp3',
    channelId: ch('adhan_makkah'),
    importance: 5,
    nameAr: 'أذان مكة',
    descAr: 'صوت الأذان لأوقات الصلاة الخمس',
    labelAr: 'أذان مكة',
    emoji: '🕋',
  },
  adhan_short: {
    key: 'adhan_short',
    file: 'prayer_soon.mp3',
    channelId: ch('adhan_short'),
    importance: 5,
    nameAr: 'اقتراب الصلاة',
    descAr: 'تنبيه باقتراب وقت الصلاة (ما قبل الأذان)',
    labelAr: 'اقتربت الصلاة',
    emoji: '🕌',
  },
  iqama: {
    key: 'iqama',
    file: 'iqama.mp3',
    channelId: ch('iqama'),
    importance: 5,
    nameAr: 'إقامة الصلاة',
    descAr: 'تنبيه باقتراب إقامة الصلاة',
    labelAr: 'اقتربت الإقامة',
    emoji: '🧎',
  },
  azkar: {
    key: 'azkar',
    file: 'azkar.mp3',
    channelId: ch('azkar'),
    importance: 4,
    nameAr: 'الأذكار',
    descAr: 'تنبيه أذكار الصباح والمساء وأدبار الصلوات',
    labelAr: 'تنبيه الأذكار',
    emoji: '📿',
  },
  quran: {
    key: 'quran',
    file: 'tone_quran.wav',
    channelId: ch('quran'),
    importance: 4,
    nameAr: 'نغمة الورد القرآني',
    descAr: 'نغمة لطيفة لتذكير الورد القرآني',
    labelAr: 'نغمة القرآن',
    emoji: '📖',
  },
  qiyam: {
    key: 'qiyam',
    file: 'qiyam.mp3',
    channelId: ch('qiyam'),
    importance: 4,
    nameAr: 'قيام الليل',
    descAr: 'تنبيه قيام الليل',
    labelAr: 'تنبيه قيام الليل',
    emoji: '⭐',
  },
  fasting: {
    key: 'fasting',
    file: 'tone_fasting.mp3',
    channelId: ch('fasting'),
    importance: 4,
    nameAr: 'نغمة الصيام',
    descAr: 'نغمة دافئة لتذكيرات الصيام (السحور والأيام الفاضلة)',
    labelAr: 'نغمة الصيام',
    emoji: '🌙',
  },
  duaa: {
    key: 'duaa',
    file: 'duaa.mp3',
    channelId: ch('duaa'),
    importance: 4,
    nameAr: 'الدعاء',
    descAr: 'تنبيه الدعاء',
    labelAr: 'تنبيه الدعاء',
    emoji: '🤲',
  },
  target: {
    key: 'target',
    file: 'target.mp3',
    channelId: ch('target'),
    importance: 4,
    nameAr: 'الأوراد',
    descAr: 'تنبيه الأوراد اليومية والمتجددة',
    labelAr: 'تنبيه الأوراد',
    emoji: '🎯',
  },
  habits: {
    key: 'habits',
    file: 'chime_habits.wav',
    channelId: ch('habits'),
    importance: 4,
    nameAr: 'رنين العادات',
    descAr: 'نغمة لتذكير العادات اليومية',
    labelAr: 'رنين العادات',
    emoji: '✨',
  },
  special: {
    key: 'special',
    file: 'tone_special.mp3',
    channelId: ch('special'),
    importance: 4,
    nameAr: 'نغمة المناسبات',
    descAr: 'نغمة للمناسبات والأيام الإسلامية',
    labelAr: 'نغمة المناسبات',
    emoji: '🌕',
  },
  default: {
    key: 'default',
    file: null,
    channelId: ch('default'),
    importance: 4,
    nameAr: 'صوت النظام',
    descAr: 'صوت الإشعارات الافتراضي للجهاز',
    labelAr: 'صوت النظام الافتراضي',
    emoji: '🔔',
  },
  silent: {
    key: 'silent',
    file: null,
    channelId: ch('silent'),
    importance: 2,
    nameAr: 'صامت',
    descAr: 'بدون صوت — اهتزاز فقط',
    labelAr: 'صامت (اهتزاز فقط)',
    emoji: '🔕',
  },
};

/** Ordered list of sounds offered in the in-app picker. */
export const SELECTABLE_SOUNDS: SoundKey[] = [
  'adhan_makkah',
  'adhan_short',
  'iqama',
  'azkar',
  'quran',
  'qiyam',
  'fasting',
  'duaa',
  'target',
  'habits',
  'special',
  'default',
  'silent',
];

/** Explicit per-reminder-key default sounds (keys match notificationStore). */
const DEFAULT_SOUND_BY_KEY: Record<string, SoundKey> = {
  'prayers.fajr': 'adhan_makkah',
  'prayers.dhuhr': 'adhan_makkah',
  'prayers.asr': 'adhan_makkah',
  'prayers.maghrib': 'adhan_makkah',
  'prayers.isha': 'adhan_makkah',
  'prayers.pre': 'adhan_short',
  'prayers.iqama': 'iqama',
  'dhikr.morning': 'azkar',
  'dhikr.evening': 'azkar',
  'dhikr.postPrayer': 'azkar',
  quran: 'quran',
  qiyam: 'qiyam',
  duha: 'qiyam',
  fasting: 'fasting',
  duaa: 'duaa',
  target: 'target',
  habits: 'habits',
  special: 'special',
};

/** Resolve the sensible default sound for a reminder/config key. */
export function defaultSoundForKey(key: string): SoundKey {
  if (DEFAULT_SOUND_BY_KEY[key]) return DEFAULT_SOUND_BY_KEY[key];
  if (key.startsWith('prayers.')) return 'adhan_makkah';
  if (key.startsWith('dhikr.')) return 'azkar';
  return 'default';
}

/** Look up a sound def, falling back to the system default. */
export function getSoundDef(key: SoundKey | undefined | null): SoundDef {
  return (key && SOUND_DEFS[key]) || SOUND_DEFS.default;
}

/** Web URL (public/sounds) for the in-app preview of a sound, or null. */
export function previewUrl(key: SoundKey): string | null {
  const def = SOUND_DEFS[key];
  return def.file ? `/sounds/${def.file}` : null;
}
