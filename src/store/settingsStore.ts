import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ModuleId,
  PrayerMethodId,
  MadhabSchool,
  Coordinates,
  CustomHabit,
} from '@/types';
import { scheduleHabit, cancelHabit } from '@/services/habitReminders';
import { DEFAULT_APP_FONT, type AppFontId } from '@/data/appFonts';

const DEFAULT_METHOD_ID = Number(import.meta.env.VITE_DEFAULT_PRAYER_METHOD ?? 4) as PrayerMethodId;

const DEFAULT_MODULES: ModuleId[] = ['prayers', 'dhikr', 'quran', 'qiyam', 'fasting', 'duaa', 'habits'];

/** Accessibility: body font scale. Maps to a root multiplier in index.css. */
export type FontScale = 'small' | 'normal' | 'large';

export type AppPalette = 'emerald' | 'turquoise' | 'lapis' | 'dusk' | 'clay' | 'brass' | 'sage' | 'ink';

/** Tailors features: mosque/congregation for men, excused days + feminine adhkar wording for women. */
export type Gender = 'male' | 'female';

interface SettingsState {
  userName: string;
  /** null until the user picks (asked in onboarding, settings and the prayers module). */
  gender: Gender | null;
  darkMode: boolean;
  /** Colour palette (see PALETTE_OPTIONS / index.css); default زمرد محدث. An
   *  unknown saved id just falls back to the default CSS. */
  palette: AppPalette;
  /** UI font (see src/data/appFonts.ts). Default Alan Sans. */
  appFont: AppFontId;
  hapticsEnabled: boolean;
  prayerMethod: PrayerMethodId;
  madhabSchool: MadhabSchool;
  coords: Coordinates | null;
  city: string;
  country: string;
  onboardingComplete: boolean;
  enabledModules: ModuleId[];
  quranDailyTarget: number;
  customHabits: CustomHabit[];

  // Accessibility
  fontScale: FontScale;
  reduceMotion: boolean;
  highContrast: boolean;

  /** Clock format for all time displays. */
  timeFormat: '12h' | '24h';

  /**
   * Count with the hardware volume keys on the counting screens (adhkar, أوراد,
   * السبحة). While one of those screens is open the keys ONLY count — the
   * system volume does not move. Android-only.
   */
  volumeKeyCounter: boolean;

  /** Read the «مختصر» morning/evening adhkar (see briefAdhkar) — same set, same streak. */
  adhkarBrief: boolean;

  /** «الترتيب»: upload the day's points (signed in). Off = rows deleted from the board. */
  leaderboardJoin: boolean;
  /** Show «مجهول» on the board instead of `userName`. */
  leaderboardHideName: boolean;

  /** «الحفظ والمراجعة»: all of البعيد is reviewed once every this many days (hifzModel). */
  hifzCycle: number;
  /** New pages to memorize a week; 0 = no goal. */
  hifzWeekly: number;
  /** A daily reminder of the day's review while pages are left (attention/plugins.ts). */
  hifzRemind: boolean;
  /** Its time, HH:mm; '' = half an hour after Fajr (07:00 without a location). */
  hifzRemindAt: string;

  // Actions
  setUserName: (name: string) => void;
  setGender: (gender: Gender) => void;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;
  setPalette: (palette: AppPalette) => void;
  setAppFont: (font: AppFontId) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setPrayerMethod: (method: PrayerMethodId) => void;
  setMadhabSchool: (school: MadhabSchool) => void;
  setCoords: (coords: Coordinates | null) => void;
  setCity: (city: string) => void;
  setCountry: (country: string) => void;
  completeOnboarding: () => void;
  toggleModule: (id: ModuleId) => void;
  setModuleEnabled: (id: ModuleId, enabled: boolean) => void;
  setQuranDailyTarget: (pages: number) => void;
  addCustomHabit: (habit: CustomHabit) => void;
  updateCustomHabit: (id: string, updates: Partial<CustomHabit>) => void;
  removeCustomHabit: (id: string) => void;
  setFontScale: (scale: FontScale) => void;
  setReduceMotion: (on: boolean) => void;
  setHighContrast: (on: boolean) => void;
  setTimeFormat: (fmt: '12h' | '24h') => void;
  setVolumeKeyCounter: (on: boolean) => void;
  setAdhkarBrief: (on: boolean) => void;
  setLeaderboardJoin: (on: boolean) => void;
  setLeaderboardHideName: (on: boolean) => void;
  setHifzPlan: (p: Partial<Pick<SettingsState, 'hifzCycle' | 'hifzWeekly' | 'hifzRemind' | 'hifzRemindAt'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      userName: '',
      gender: null,
      // Night-first identity: new installs open in the dark emerald theme.
      // Existing users keep their persisted choice (this default only applies
      // before any toggle). Users can switch to the cream "day" mode anytime.
      darkMode: true,
      palette: 'emerald',
      appFont: DEFAULT_APP_FONT,
      hapticsEnabled: true,
      prayerMethod: DEFAULT_METHOD_ID,
      madhabSchool: 'shafi',
      coords: null,
      city: '',
      country: '',
      onboardingComplete: false,
      enabledModules: DEFAULT_MODULES,
      quranDailyTarget: 2,
      customHabits: [],

      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
      timeFormat: '12h',
      volumeKeyCounter: false,
      adhkarBrief: false,
      leaderboardJoin: true,
      leaderboardHideName: false,
      hifzCycle: 14,
      hifzWeekly: 0,
      hifzRemind: true,
      hifzRemindAt: '',

      setUserName: (name) => set({ userName: name }),
      setGender: (gender) => set({ gender }),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      setDarkMode: (dark) => set({ darkMode: dark }),
      setPalette: (palette) => set({ palette }),
      setAppFont: (appFont) => set({ appFont }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setPrayerMethod: (method) => set({ prayerMethod: method }),
      setMadhabSchool: (school) => set({ madhabSchool: school }),
      setCoords: (coords) => set({ coords }),
      setCity: (city) => set({ city }),
      setCountry: (country) => set({ country }),
      completeOnboarding: () => set({ onboardingComplete: true }),

      toggleModule: (id) =>
        set((s) => ({
          enabledModules: s.enabledModules.includes(id)
            ? s.enabledModules.filter((m) => m !== id)
            : [...s.enabledModules, id],
        })),

      setModuleEnabled: (id, enabled) =>
        set((s) => ({
          enabledModules: enabled
            ? s.enabledModules.includes(id)
              ? s.enabledModules
              : [...s.enabledModules, id]
            : s.enabledModules.filter((m) => m !== id),
        })),

      setQuranDailyTarget: (pages) => set({ quranDailyTarget: pages }),

      addCustomHabit: (habit) => {
        set((s) => ({ customHabits: [...s.customHabits, habit] }));
        scheduleHabit(habit);
      },

      updateCustomHabit: (id, updates) => {
        const prev = get().customHabits.find((h) => h.id === id);
        set((s) => ({
          customHabits: s.customHabits.map((h) =>
            h.id === id ? { ...h, ...updates } : h,
          ),
        }));
        const next = get().customHabits.find((h) => h.id === id);
        if (next) scheduleHabit(next, prev?.reminder?.times ?? []);
      },

      removeCustomHabit: (id) => {
        const habit = get().customHabits.find((h) => h.id === id);
        if (habit) cancelHabit(habit);
        set((s) => ({ customHabits: s.customHabits.filter((h) => h.id !== id) }));
      },

      setFontScale: (fontScale) => set({ fontScale }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setVolumeKeyCounter: (volumeKeyCounter) => set({ volumeKeyCounter }),
      setAdhkarBrief: (adhkarBrief) => set({ adhkarBrief }),
      setLeaderboardJoin: (leaderboardJoin) => set({ leaderboardJoin }),
      setLeaderboardHideName: (leaderboardHideName) => set({ leaderboardHideName }),
      setHifzPlan: (p) => set(p),
    }),
    {
      name: 'myzikr:settings',
      version: 4,
      migrate: (persisted, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') {
          return persisted as unknown as SettingsState;
        }
        const next = { ...(persisted as Record<string, unknown>) };
        if (fromVersion < 2) {
          // v1 → v2: strict Arabic-only; drop legacy `language`, add `hapticsEnabled`.
          delete next.language;
          if (typeof next.hapticsEnabled !== 'boolean') next.hapticsEnabled = true;
        }
        if (fromVersion < 3) {
          // v2 → v3: add accessibility settings with safe defaults. Existing
          // users keep their current (light/dark) choice untouched.
          if (typeof next.fontScale !== 'string') next.fontScale = 'normal';
          if (typeof next.reduceMotion !== 'boolean') next.reduceMotion = false;
          if (typeof next.highContrast !== 'boolean') next.highContrast = false;
        }
        if (fromVersion < 4) {
          // v3 → v4: volume-key counting is opt-in — it takes the volume keys
          // away from the system, so it must never turn itself on.
          if (typeof next.volumeKeyCounter !== 'boolean') next.volumeKeyCounter = false;
        }
        return next as unknown as SettingsState;
      },
    },
  ),
);
