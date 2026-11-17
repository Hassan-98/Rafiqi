// ─── Language & Locale ────────────────────────────────────────────────────────
// The app is locked to Arabic / RTL. These types remain as a single-value
// literal so existing references keep type-checking without changes.

export type Language = 'ar';
export type Direction = 'rtl';

// ─── Prayer Times ─────────────────────────────────────────────────────────────

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type SunnahType = 'before' | 'after' | 'both';

/** Supported calculation methods (aligns with adhan-js + AlAdhan API IDs) */
export type PrayerMethodId =
  | 0  // Shia Ithna-Ansari
  | 1  // Muslim World League
  | 2  // ISNA (North America)
  | 3  // Egyptian General Authority
  | 4  // Umm Al-Qura (Makkah)
  | 5  // University of Islamic Sciences, Karachi
  | 7  // Institute of Geophysics, Tehran
  | 8  // Gulf Region
  | 9  // Kuwait
  | 10 // Qatar
  | 11 // Majlis Ugama Islam Singapura
  | 12 // Union Organization Islamic de France
  | 13 // Diyanet İşleri Başkanlığı
  | 14 // Spiritual Administration of Muslims of Russia
  | 15 // Dubai
  | 16 // Jabatan Kemajuan Islam Malaysia
  | 17 // Tunisia
  | 18 // Algeria
  | 19 // KEMENAG Indonesia
  | 20 // Morocco
  | 21 // Communauté Musulmane de Portugal
  | 22 // Ministry of Awqaf, Jordan
  | 23 // (Custom)
  | 99; // Custom offsets

export interface PrayerMethod {
  id: PrayerMethodId;
  nameAr: string;
  nameEn: string;
}

export interface PrayerTime {
  name: PrayerName;
  time: Date;
  completed: boolean;
  sunnahCompleted?: boolean;
}

export interface PrayerTimesResult {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
  date: Date;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ─── Dhikr & Adhkar ───────────────────────────────────────────────────────────

export type DhikrCategory = 'morning' | 'evening' | 'postPrayer' | 'general';

export interface DhikrItem {
  id: string;
  category: DhikrCategory;
  /** Heading shown above the text (e.g. «دعاء لبس الثوب»). */
  title?: string;
  arabic: string;
  transliteration: string;
  translation: string;
  count: number; // required repetitions
  source?: string; // hadith source
  benefit?: string; // spiritual benefit description
}

export interface DhikrSession {
  categoryDate: string; // `${category}-${dateKey}`
  category: DhikrCategory;
  completedIds: string[]; // dhikr IDs completed
  totalCount: number;
}

// ─── Quran Wird ───────────────────────────────────────────────────────────────

export interface Surah {
  number: number;
  nameArabic: string;
  nameSimple: string;
  nameTranslation: string;
  versesCount: number;
  pages: [number, number]; // [start, end]
  revelationPlace: 'makkah' | 'madinah';
}

export interface QuranWird {
  dateKey: string;
  dailyTarget: number; // pages
  pagesRead: number;
  surahsCompleted: number[];
  notes?: string;
}

// ─── Qiyam al-Layl ────────────────────────────────────────────────────────────

export interface QiyamEntry {
  dateKey: string;
  completed: boolean;
  rakaatCount: number;
  witrCompleted: boolean;
  notes?: string;
}

// ─── Fasting ──────────────────────────────────────────────────────────────────

export type FastType = 'monday' | 'thursday' | 'ayyamAlBid' | 'shawwal' | 'arafah' | 'ashura' | 'custom';

export interface FastEntry {
  dateKey: string;
  type: FastType;
  label?: string; // for custom type
  completed: boolean;
  intention: boolean; // niyyah made
}

// ─── Duaa Journal ─────────────────────────────────────────────────────────────

export interface DuaaEntry {
  id: string;
  text: string;
  category: string;
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string;
  answered?: boolean;
  answeredAt?: string;
}

// ─── Custom Habits ────────────────────────────────────────────────────────────

export type HabitFrequency = 'daily' | 'weekly' | 'custom';

/**
 * Per-habit notification schedule. The user can pick one or more daily times
 * (e.g. 00:00 + 12:00) and a ringtone — either a preset (`soundKey`) or a
 * file picked from the device (`customChannelId` + `customSoundLabel`). Each
 * time fires a separate daily notification; see `services/habitReminders.ts`.
 */
export interface HabitReminder {
  enabled: boolean;
  /** Daily fire times as "HH:mm" (24h), e.g. ["00:00", "12:00"]. */
  times: string[];
  /** Preset ringtone key. Ignored when `customChannelId` is set. */
  soundKey?: import('@/services/notifications/sounds').SoundKey;
  /** Native channel id of a user-picked custom sound file (Android). */
  customChannelId?: string;
  /** Display label of the user-picked custom sound file. */
  customSoundLabel?: string;
}

export interface CustomHabit {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string; // emoji
  frequency: HabitFrequency;
  targetDays?: number[]; // 0=Sun..6=Sat for weekly/custom
  color?: string; // hex
  createdAt: string;
  /** Optional notification schedule for this habit. */
  reminder?: HabitReminder;
}

export interface HabitEntry {
  habitId: string;
  dateKey: string;
  completed: boolean;
  completedAt?: string;
}

// ─── Modules ──────────────────────────────────────────────────────────────────

export type ModuleId =
  | 'prayers'
  | 'dhikr'
  | 'quran'
  | 'qiyam'
  | 'fasting'
  | 'duaa'
  | 'habits';

export interface ModuleConfig {
  id: ModuleId;
  nameAr: string;
  nameEn: string;
  icon: string; // emoji
  enabled: boolean;
  order: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type RepeatInterval = 'none' | 'daily' | 'weekly' | number; // number = ms

export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  triggerTime: string; // ISO 8601
  repeatInterval?: RepeatInterval;
  moduleId: ModuleId | string;
  deepLinkPath: string;
  /**
   * Which ringtone (and therefore which Android channel) to use. See
   * `services/notifications/sounds.ts`. When omitted, `alarm` is used as a
   * legacy fallback (true → 'adhan_makkah', false → 'default').
   */
  soundKey?: import('@/services/notifications/sounds').SoundKey;
  /**
   * A native, user-picked custom channel id (see customSound.ts). When set it
   * overrides `soundKey` — the notification fires on this channel, whose sound
   * is the file the user chose.
   */
  customChannelId?: string;
  /** Legacy: true → loud adhan; false/undefined → quiet reminder. Prefer `soundKey`. */
  alarm?: boolean;
  /**
   * Show a full-screen, incoming-call-style alarm screen when this reminder
   * fires (over other apps, waking the device). Android only.
   */
  fullScreen?: boolean;
  /** How long the full-screen alarm stays before auto-dismissing (ms, default 10000). */
  fullScreenDurationMs?: number;
  /** Small string facts carried to the action handler (e.g. prayer + dateKey for «صلّيت»). */
  meta?: Record<string, string>;
}

export interface ModuleNotificationConfig {
  moduleId: ModuleId;
  enabled: boolean;
  time: string; // HH:mm 24h
  prayerOffset?: number; // minutes before/after prayer (for prayer reminders)
}

// ─── User Settings ────────────────────────────────────────────────────────────

export type MadhabSchool = 'shafi' | 'hanafi';

export interface UserSettings {
  userName: string;
  darkMode: boolean;
  hapticsEnabled: boolean;
  prayerMethod: PrayerMethodId;
  madhabSchool: MadhabSchool;
  coords: Coordinates | null;
  city: string;
  country: string;
  onboardingComplete: boolean;
  enabledModules: ModuleId[];
  quranDailyTarget: number; // pages
  customHabits: CustomHabit[];
}

// ─── Progress & Statistics ────────────────────────────────────────────────────

export interface ModuleCompletion {
  moduleId: ModuleId | string;
  completed: boolean;
  completionRate: number; // 0–1
  completedAt?: string;
}

export interface DailyProgress {
  dateKey: string; // YYYY-MM-DD
  modules: ModuleCompletion[];
  overallRate: number; // 0–1
}

export interface StreakData {
  moduleId: ModuleId | string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
}

// ─── Chart Data ───────────────────────────────────────────────────────────────

export interface HeatmapCell {
  date: string;
  value: number; // 0–1
  label?: string;
}

export interface TrendPoint {
  date: string;
  value: number;
}

// ─── Quran Reader (Ayat-style) ────────────────────────────────────────────────

export type Qari =
  | 'alafasy'
  | 'husary'
  | 'minshawi'
  | 'abdulbasit'
  | 'sudais'
  | 'shuraim'
  | 'shatri'
  | 'rifai'
  | 'tablawi'
  | 'maher'
  | 'dossari'
  | 'husary_muallim'
  | 'fares'
  | 'ghamdi'
  | 'ajmy'
  | 'basfar'
  | 'juhany'
  | 'jibreel'
  | 'qatami'
  | 'ali_jaber'
  | 'bukhatir'
  | 'ayyoub'
  | 'hudhaify'
  | 'akhdar'
  | 'qahtani'
  | 'matroud'
  | 'yaser_salamah'
  | 'banna'
  | 'mustafa_ismail'
  | 'minshawi_mujawwad'
  | 'husary_mujawwad'
  | 'abdulbasit_murattal';

/** Per-ayah recitation IDs verified against
 *  api.quran.com/api/v4/resources/recitations. These reciters also carry
 *  word-by-word timing segments. */
export const RECITER_IDS: Partial<Record<Qari, number>> = {
  abdulbasit: 1, // AbdulBaset AbdulSamad (Mujawwad)
  sudais: 3, // Abdur-Rahman as-Sudais
  shatri: 4, // Abu Bakr al-Shatri
  rifai: 5, // Hani ar-Rifai
  husary: 6, // Mahmoud Khalil Al-Husary
  husary_muallim: 12, // Al-Husary — Muallim (teaching recitation)
  alafasy: 7, // Mishari Rashid al-`Afasy — legacy only (removed from the picker by owner)
  minshawi: 9, // Mohamed Siddiq al-Minshawi (Murattal)
  shuraim: 10, // Sa`ud ash-Shuraim
  tablawi: 11, // Mohamed al-Tablawi
};

/**
 * Reciters not on quran.com's per-ayah list are served from everyayah.com
 * (verified reachable), using per-ayah MP3s at
 * `https://everyayah.com/data/{folder}/{SSS}{AAA}.mp3`. No word-by-word
 * segments for these.
 */
export const EVERYAYAH_FOLDERS: Partial<Record<Qari, string>> = {
  maher: 'Maher_AlMuaiqly_64kbps',
  dossari: 'Yasser_Ad-Dussary_128kbps',
  fares: 'Fares_Abbad_64kbps',
  ghamdi: 'Ghamadi_40kbps',
  ajmy: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
  basfar: 'Abdullah_Basfar_192kbps',
  juhany: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps',
  jibreel: 'Muhammad_Jibreel_128kbps',
  qatami: 'Nasser_Alqatami_128kbps',
  ali_jaber: 'Ali_Jaber_64kbps',
  bukhatir: 'Salaah_AbdulRahman_Bukhatir_128kbps',
  ayyoub: 'Muhammad_Ayyoub_128kbps',
  hudhaify: 'Hudhaify_128kbps',
  akhdar: 'Ibrahim_Akhdar_32kbps',
  qahtani: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps',
  matroud: 'Abdullah_Matroud_128kbps',
  yaser_salamah: 'Yaser_Salamah_128kbps',
  banna: 'Mahmoud_Ali_Al_Banna_32kbps',
  mustafa_ismail: 'Mustafa_Ismail_48kbps',
  minshawi_mujawwad: 'Minshawy_Mujawwad_192kbps',
  husary_mujawwad: 'Husary_128kbps_Mujawwad',
  abdulbasit_murattal: 'Abdul_Basit_Murattal_192kbps',
};

/** quran.com `tafsirs` IDs for the three Arabic tafsirs we support. */
export type TafsirId = 16 | 94 | 14;

export const TAFSIRS: Record<TafsirId, { ar: string; slug: string }> = {
  16: { ar: 'التفسير الميسر', slug: 'muyassar' },
  94: { ar: 'تفسير السعدي', slug: 'saadi' },
  14: { ar: 'مختصر تفسير ابن كثير', slug: 'ibn-kathir' },
};

export interface Word {
  id: number;
  position: number; // 1-based within the verse
  verseKey: string; // '2:255'
  textUthmani: string;
  textIndopak?: string;
  /**
   * KFGQPC V1 glyph string (Private-Use-Area). When the page-specific QCF V1
   * font (`QCFv1Page{N}`) is loaded these characters render as the precise
   * Madani Mushaf glyphs for that word. Always paired with `textUthmani` as
   * the human-readable fallback for copy/share/tafsir lookup.
   */
  codeV1?: string;
  /** QCF V2/V4 glyph (drawn with the V4 tajweed page fonts). */
  codeV2?: string;
  translation?: string; // English gloss
  transliteration?: string;
  arabicMeaning?: string;
  charType: 'word' | 'end' | string;
  audioUrl?: string;
  /**
   * `location` is the word's quran.com address — format is `surah:verse:position`
   * (NOT page:line). Use `lineNumber` below for the actual Mushaf line.
   */
  location?: string;
  /** Mushaf line number this word belongs to (1..15 typically per Madani page). */
  lineNumber?: number;
  /** The Madani Mushaf page number this word appears on. */
  pageNumber?: number;
}

export interface VerseWithWords {
  id: number;
  verseKey: string;
  verseNumber: number;
  textUthmani: string;
  textUthmaniTajweed?: string;
  textIndopak?: string;
  words: Word[];
  pageNumber: number;
  juzNumber: number;
  hizbNumber: number;
  rubElHizbNumber: number;
}

export interface TafsirEntry {
  verseKey: string;
  tafsirId: TafsirId;
  resourceName: string;
  /** Sanitized HTML — render via `dangerouslySetInnerHTML`. */
  html: string;
}

export interface AudioSegment {
  wordPosition: number;
  startMs: number;
  endMs: number;
}

export interface AudioTrack {
  verseKey: string;
  url: string;
  durationMs?: number;
  segments?: AudioSegment[];
}

export interface QuranBookmark {
  id: string;
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  note?: string;
  createdAt: string;
  color?: 'teal' | 'gold' | 'red' | 'blue';
}

export interface QuranReadingPosition {
  surah: number;
  ayah: number;
  scrollOffset: number;
  updatedAt: string;
}

export type QuranReaderTheme = 'cream' | 'sepia' | 'night' | 'black' | 'mint' | 'sand' | 'dusk';
export type MushafScript = 'uthmani' | 'indopak';
export type WirdUnit = 'page' | 'ayat' | 'juz' | 'hizb' | 'surah';

export interface WirdConfig {
  unit: WirdUnit;
  amount: number;
  startedAt: string;
  autoSchedule: boolean;
  reminderTime?: string; // HH:mm
  /**
   * The day (yyyy-MM-dd) the current `cursor` portion is assigned to. Used by
   * the lazy day-rollover (`rolloverWird`) to advance the cursor once a
   * completed day has passed — without advancing mid-day (which would make
   * today's card jump to tomorrow's portion). Absent on legacy configs;
   * stamped to "today" the next time the wird is saved or rolled over.
   */
  cursorDate?: string;
  cursor: {
    page?: number;
    ayahKey?: string;
    juz?: number;
    hizb?: number;
    surah?: number;
  };
}

export interface QuranSearchResult {
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  text: string;
  highlighted?: string;
}
