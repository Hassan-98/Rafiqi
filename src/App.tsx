import React, { useEffect } from 'react';
import { createHashRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router';
import { motion } from '@/lib/motion';
import { BottomNavBar } from '@/components/layout/BottomNavBar';
import { HomePage } from '@/pages/HomePage';
import { StatsPage } from '@/pages/StatsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { FeaturesHubPage } from '@/pages/FeaturesHubPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { ModuleDetailPage } from '@/pages/ModuleDetailPage';
import { QuranPage, QuranOpenRedirect } from '@/pages/QuranPage';
import { AdhkarPage } from '@/pages/AdhkarPage';
import { TargetsPage } from '@/pages/TargetsPage';
import { TargetDetailPage } from '@/pages/TargetDetailPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { TasbihPage } from '@/pages/TasbihPage';
import { QiblaPage } from '@/pages/QiblaPage';
import {
  AsmaUlHusnaPage,
  AsmaUlHusnaDetailPage,
  AsmaUlHusnaFlashcardsPage,
} from '@/pages/AsmaUlHusnaPage';
import { HadithPage } from '@/pages/HadithPage';
import { HadithLibraryPage, HadithBookPage } from '@/pages/HadithLibraryPage';
import {
  DuaaLibraryPage,
  DuaaCategoryPage,
  DuaaDetailPage,
} from '@/pages/DuaaLibraryPage';
import { HijriCalendarPage } from '@/pages/HijriCalendarPage';
import { MosquesPage } from '@/pages/MosquesPage';
import { BadgeGalleryPage } from '@/pages/BadgeGalleryPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { HarvestPage } from '@/pages/HarvestPage';
import { SilatPage } from '@/pages/SilatPage';
import { ProgramsPage } from '@/pages/ProgramsPage';
import { QadaPage } from '@/pages/QadaPage';
import { FridayReviewPage } from '@/pages/FridayReviewPage';
import { HifzPage } from '@/pages/HifzPage';
import { GroupsPage } from '@/pages/GroupsPage';
import { PrayerModePage } from '@/pages/PrayerModePage';
import { MindfulPage } from '@/pages/MindfulPage';
import { ChangelogPage } from '@/pages/ChangelogPage';
import { SadaqahPage } from '@/pages/SadaqahPage';
import { ZakatPage } from '@/pages/ZakatPage';
import { BackupPage } from '@/pages/BackupPage';
import { StatsPrayersPage } from '@/pages/stats/StatsPrayersPage';
import { StatsQuranPage } from '@/pages/stats/StatsQuranPage';
import { StatsDhikrPage } from '@/pages/stats/StatsDhikrPage';
import { StatsFastingPage } from '@/pages/stats/StatsFastingPage';
import { StatsSadaqahPage } from '@/pages/stats/StatsSadaqahPage';
import { StatsLearningPage } from '@/pages/stats/StatsLearningPage';
import { StatsAchievementsPage } from '@/pages/stats/StatsAchievementsPage';
import { StatsHabitsPage } from '@/pages/stats/StatsHabitsPage';
import { StatsHistoryPage } from '@/pages/stats/StatsHistoryPage';
import { StatsAwradPage } from '@/pages/stats/StatsAwradPage';
import { StatsQiyamPage } from '@/pages/stats/StatsQiyamPage';
import { StatsNawafilPage } from '@/pages/stats/StatsNawafilPage';
import { StatsProvider } from '@/stats/StatsContext';
import { MePage } from '@/pages/MePage';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { StudyHubPage } from '@/pages/study/StudyHubPage';
import { CircleDetailPage } from '@/pages/study/CircleDetailPage';
import { applyAppFont } from '@/data/appFonts';
import { BadgeCelebration } from '@/components/reminders/BadgeCelebration';
import { useSettingsStore } from '@/store/settingsStore';
import { Toaster } from '@/components/ui/Toast';
import { startAppUpdates } from '@/services/appUpdate';
import { AlertSoundBar } from '@/components/reminders/AlertSoundBar';
import { UpdateDialog } from '@/components/update/UpdateDialog';
import { MindfulReminder } from '@/components/mindful/MindfulReminder';

// Native-feel easing for screen transitions (decelerate curve).
const PAGE_EASE = [0.22, 0.61, 0.36, 1] as const;

/**
 * App-wide root: resets scroll to the top on every screen change so each page
 * opens from its beginning (never inheriting the previous screen's scroll).
 */
function RootLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [pathname]);
  return (
    <>
      <Outlet />
      {/* «تذكرة الإتقان» — needs the router (useLocation), so it lives here, not beside <Toaster />. */}
      <MindfulReminder />
    </>
  );
}

/** Layout with bottom nav — used for main tabs. Content fades/lifts in on each
 *  tab change while the nav bar itself stays put (native-app feel). */
function MainLayout() {
  const { pathname } = useLocation();
  return (
    // ≥lg the bottom bar becomes a side rail (see BottomNavBar), so content
    // clears it with ps and sits in a centred, readable column.
    <div className="min-h-dvh bg-cream dark:bg-dark-bg bg-geometric lg:ps-22">
      {/* Fade only — NO transform: a transformed ancestor becomes the
          containing block of `position: fixed` children (bars, full-screen
          readers), which then pin to the content instead of the screen. */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: PAGE_EASE }}
        className="lg:max-w-5xl lg:mx-auto"
      >
        {/* Shown only while offline: what still works + a link to downloads. */}
        <div className="sticky z-20 px-4 pt-2 empty:hidden" style={{ top: 'var(--safe-top)' }}>
          <OfflineBanner />
        </div>
        <Outlet />
      </motion.div>
      <BottomNavBar />
    </div>
  );
}

/** Full-screen layout (no nav). Pushed screens slide in from the side, like a
 *  native forward navigation. */
/** `wide`: no desktop column cap (the Mushaf reader sizes its own book to
 *  the window height; the 1240px cap made it width-bound at 1920×1080). */
function NoNavLayout({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      {/* Desktop: centre full-screen pages in a column wide enough for the
          Mushaf two-page spread (1080px) instead of stretching to 1920. */}
      {/* Fade only — see MainLayout: a transform here pinned the reader's
          fixed bottom bar to the page content (cut off below the screen). */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: PAGE_EASE }}
        className={wide ? undefined : 'lg:max-w-310 lg:mx-auto'}
      >
        {children}
      </motion.div>
    </div>
  );
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
  { path: '/onboarding', element: <OnboardingPage /> },

  // Target detail — full-screen (no bottom nav)
  {
    path: '/targets/:id',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <TargetDetailPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },

  // The Quran is read in «مصحفي» (a separate app): old reader links open it
  // at that page; the rest of the old Quran section lands on «القرآن».
  { path: '/quran/read/:surahId', element: <QuranOpenRedirect /> },
  { path: '/quran/bookmarks', element: <Navigate to="/quran" replace /> },
  { path: '/quran/memorize/:surahId?', element: <Navigate to="/hifz" replace /> },
  // «الحفظ والمراجعة»: from مصحفي's hifz/review sessions (and recorded here).
  {
    path: '/hifz',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HifzPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  { path: '/quran/downloads', element: <Navigate to="/downloads" replace /> },
  {
    path: '/downloads',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <DownloadsPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },

  // Worship tools (Phase 2)
  {
    path: '/study/circle/:id',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <CircleDetailPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/tasbih',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <TasbihPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/qibla',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <QiblaPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },

  // 99 Names of Allah
  {
    path: '/asma',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <AsmaUlHusnaPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/asma/flashcards',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <AsmaUlHusnaFlashcardsPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/asma/:index',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <AsmaUlHusnaDetailPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  // Hisnul Muslim duaa library
  {
    path: '/duaa-library',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <DuaaLibraryPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/duaa-library/:categoryId',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <DuaaCategoryPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/duaa-library/:categoryId/:id',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <DuaaDetailPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  // Hadith of the day + archive
  {
    path: '/hadith',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HadithPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  // الحديث النبوي — the nine books, offline + search
  {
    path: '/sunnah',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HadithLibraryPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/sunnah/:book',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HadithBookPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  // Hijri calendar (Phase 3)
  {
    path: '/calendar',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HijriCalendarPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/mosques',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <MosquesPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/badges',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <BadgeGalleryPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/changelog',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <ChangelogPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/silat',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <SilatPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/programs',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <ProgramsPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/qada',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <QadaPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/friday-review',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <FridayReviewPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/groups',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <GroupsPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/mindful',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <MindfulPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/prayer-mode',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <PrayerModePage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/leaderboard',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <LeaderboardPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/harvest',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <HarvestPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/sadaqah',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <SadaqahPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/zakat',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <ZakatPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },
  {
    path: '/backup',
    element: (
      <RequireOnboarding>
        <NoNavLayout>
          <BackupPage />
        </NoNavLayout>
      </RequireOnboarding>
    ),
  },

  // Statistics deep-dive sub-pages. The StatsProvider is hoisted HERE (not
  // inside StatsSubPage) so each page's `useStatsRange()` call and its
  // PeriodSelector share one synced provider — see StatsSubPage note.
  {
    path: '/stats/qiyam',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsQiyamPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/nawafil',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsNawafilPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/prayers',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsPrayersPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/quran',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsQuranPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/dhikr',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsDhikrPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/fasting',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsFastingPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/sadaqah',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsSadaqahPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/learning',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsLearningPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/achievements',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsAchievementsPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/habits',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsHabitsPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/history',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsHistoryPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },
  {
    path: '/stats/awrad',
    element: (
      <RequireOnboarding>
        <StatsProvider><StatsAwradPage /></StatsProvider>
      </RequireOnboarding>
    ),
  },

  // Module detail also runs without the bottom nav
  {
    path: '/module/:id',
    element: (
      <RequireOnboarding>
        <ModuleDetailPage />
      </RequireOnboarding>
    ),
  },

  // Main tabs (اليوم / الأوراد / الأذكار / القرآن / العادات / الإعدادات) +
  // tab-shell pages that kept the bottom bar without a tab of their own
  // (الإحصاء / المزيد — reached from Home's وصول سريع and the hub).
  {
    path: '/',
    element: (
      <RequireOnboarding>
        <MainLayout />
      </RequireOnboarding>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'quran', element: <QuranPage /> },
      { path: 'adhkar', element: <AdhkarPage /> },
      { path: 'targets', element: <TargetsPage /> },
      // Habits now live in «المهام والعادات»; keep old links / reminder deep links working.
      { path: 'habits', element: <Navigate to="/study?tab=habits" replace /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'more', element: <FeaturesHubPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'me', element: <MePage /> },
      { path: 'study', element: <StudyHubPage /> },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const palette = useSettingsStore((s) => s.palette);
  const appFont = useSettingsStore((s) => s.appFont);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const highContrast = useSettingsStore((s) => s.highContrast);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    if (palette && palette !== 'emerald') document.documentElement.dataset.palette = palette;
    else delete document.documentElement.dataset.palette;
    // Keep the native status bar in step with the theme — it used to be set
    // once at boot (light) and stayed light over a dark UI after toggling.
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: darkMode ? Style.Dark : Style.Light });
        // Match the page colour of the active palette + mode.
        const bg = getComputedStyle(document.documentElement)
          .getPropertyValue(darkMode ? '--color-dark-bg' : '--color-cream')
          .trim();
        await StatusBar.setBackgroundColor({ color: bg || (darkMode ? '#08120F' : '#F4F0E6') });
      } catch {
        /* web/desktop — no status bar */
      }
    })();
  }, [darkMode, palette]);

  // OTA updates. Runs from App's effect, not main.tsx, on purpose: it only
  // fires once the tree rendered, which is what confirms a new bundle as good.
  useEffect(() => {
    void startAppUpdates();
  }, []);

  // «خط التطبيق»: lazy-load the chosen UI font and swap the font tokens.
  useEffect(() => {
    void applyAppFont(appFont);
  }, [appFont]);

  // Accessibility: reflect settings on <html> so index.css can react globally.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontScale = fontScale;
    root.classList.toggle('reduce-motion', reduceMotion);
    root.classList.toggle('high-contrast', highContrast);
  }, [fontScale, reduceMotion, highContrast]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <AlertSoundBar />
      <BadgeCelebration />
      <UpdateDialog />
    </>
  );
}
