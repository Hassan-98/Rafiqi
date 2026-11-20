import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
// Self-hosted fonts — bundled into the build so Arabic renders correctly
// on-device even with no network (the Google Fonts CDN often fails to load
// inside the Android WebView, which made every UI font fall back to a poor
// system Arabic face). Vazirmatn = body/UI + headings, Amiri = scripture.
// Default UI font (settings → خط التطبيق can swap it; others load lazily).
import '@fontsource-variable/alan-sans';
import '@fontsource/vazirmatn/300.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import './index.css';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { notificationService } from '@/services/NotificationService';
import { hapticsService } from '@/services/HapticsService';
import { islamicCalendarScheduler } from '@/services/IslamicCalendarScheduler';
import { fastingReminderScheduler } from '@/services/FastingReminderScheduler';
import { prayerTimeNotificationScheduler } from '@/services/PrayerTimeNotificationScheduler';
import { handleNotificationAction, navigateToDeepLink } from '@/services/notifications/actions';
import { rearmAllReminders } from '@/services/notifications/rearm';
import { isDesktopShell } from '@/services/NotificationService';
import { startWidgetBridge, updateWidgets } from '@/services/widgetBridge';
import { useSettingsStore } from '@/store/settingsStore';
import { closeTopOverlay } from '@/lib/overlayBack';

async function bootCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // 0. Notification taps/actions FIRST — a cold start from a notification
  //    delivers its (retained) event as soon as a listener exists; waiting for
  //    channel setup + the auth import only delayed the deep link.
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    void handleNotificationAction(event);
  });

  // 1. Initialize the notification channel + action types
  try {
    await notificationService.initialize?.();
  } catch (e) {
    console.warn('[boot] notification init failed', e);
  }

  // 2. Status bar — match cream/light theme by default; App effect can swap.
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#F9F5EF' });
  } catch (e) {
    console.warn('[boot] StatusBar setup failed', e);
  }

  // 2b. Hardware back: close an open modal/sheet first; otherwise the same as
  //     Capacitor's default (history back, nothing at the root screen).
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (canGoBack) window.history.back();
  });

  // 3. Cold-start: deep-link via appUrlOpen (Android intent / notification tap)
  CapacitorApp.addListener('appUrlOpen', (event) => {
    // OAuth callback from Google → Supabase → our custom scheme. Handle the
    // token/code exchange before the generic module deep-link logic.
    if (event.url?.includes('auth-callback')) {
      void import('@/store/authStore').then((m) => m.useAuthStore.getState().handleCallbackUrl(event.url));
      return;
    }
    try {
      const url = new URL(event.url);
      // accept both myzikr://module/dhikr and capacitor://localhost/#/module/dhikr forms
      const path = url.hash?.replace(/^#/, '') || url.pathname;
      navigateToDeepLink(`/#${path.startsWith('/') ? '' : '/'}${path}`);
    } catch {
      navigateToDeepLink(event.url);
    }
  });

  // 3b. Keep the Supabase session alive on mobile: the browser-style token
  //     auto-refresh is unreliable in a WebView, so we start/stop it on app
  //     resume/pause (Supabase's recommended native pattern).
  const { supabase } = await import('@/services/supabaseClient');
  void supabase.auth.startAutoRefresh();
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void supabase.auth.startAutoRefresh();
      // Catch up on anything another device pushed while we were backgrounded.
      void import('@/services/cloudSyncService').then((c) => c.cloudSyncService.kick());
      // Re-arm reminders on RESUME too, not just cold start — a user who never
      // cold-starts hit the prayer queue-exhaustion cliff, and repeating
      // reminders lose their Doze exemption after the first fire (rearm.ts).
      // Throttled; prayers still re-arm on a new day/timezone every time.
      void rearmAllReminders();
    } else {
      void supabase.auth.stopAutoRefresh();
      // Refresh the home-screen widgets' data snapshot right as we background,
      // so MainActivity.onPause re-renders them with current values.
      updateWidgets();
    }
  });

  // 5. Hide the splash once mounted
  setTimeout(() => {
    SplashScreen.hide().catch(() => undefined);
  }, 400);

  // 6. Arm every reminder family (prayers, fasting, Islamic days, fixed-time
  //    module reminders, awrad, custom, habits). Each scheduler is idempotent.
  void rearmAllReminders({ force: true });

  // 7. Home-screen widgets: keep their data snapshot fresh for the native side.
  startWidgetBridge();
  // «وضع الصلاة»: send the native silence plan (Android); re-syncs itself on resume + settings/location/iqama changes.
  void import('@/services/prayerMode').then((m) => m.startPrayerModeSync());

  // 8. Smart notifications (streak-at-risk, qiyam last-third, weekly summary,
  //    record celebrations) — re-plans itself on store changes + resume.
  try {
    const { startSmartNotificationSync } = await import('@/services/smartNotifications');
    startSmartNotificationSync();
  } catch (e) {
    console.warn('[boot] smart notifications failed', e);
  }
}

// Mirror the hapticsEnabled setting into the singleton service. The
// settingsStore is rehydrated synchronously by zustand/persist, so reading
// `.getState()` here is safe; we also subscribe for runtime changes.
hapticsService.setEnabled(useSettingsStore.getState().hapticsEnabled);
useSettingsStore.subscribe((s) => hapticsService.setEnabled(s.hapticsEnabled));

// Prayer notifications must follow the user's location / calculation method /
// madhab. The scheduler is idempotent per calendar day, so WITHOUT this a
// settings change (e.g. travelling to a new city) kept the adhan firing at
// the OLD times until the next day's cold start. `reschedule()` clears the
// idempotency key and re-arms today + tomorrow at the fresh times.
{
  let prev = useSettingsStore.getState();
  useSettingsStore.subscribe((s) => {
    const changed =
      s.coords !== prev.coords ||
      s.prayerMethod !== prev.prayerMethod ||
      s.madhabSchool !== prev.madhabSchool;
    prev = s;
    if (changed) {
      void prayerTimeNotificationScheduler.reschedule();
      // Home-screen widgets embed prayer times — refresh their snapshot too.
      updateWidgets();
    }
  });
}

// The fasting + Islamic-day schedulers gate themselves on their toggles and
// key their idempotency on the ringtone — re-run them (forced) whenever the
// toggle OR the sound changes, so it applies now, not next month/year.
void import('@/store/notificationStore').then(({ useNotificationStore }) => {
  const sig = (key: string) => {
    const c = useNotificationStore.getState().getConfig(key);
    return `${c.enabled}|${c.time}|${c.soundKey ?? ''}|${c.customChannelId ?? ''}`;
  };
  let prevFast = sig('fasting');
  let prevSpecial = sig('special');
  useNotificationStore.subscribe(() => {
    const f = sig('fasting');
    const sp = sig('special');
    if (f !== prevFast) void fastingReminderScheduler.schedule(true);
    if (sp !== prevSpecial) void islamicCalendarScheduler.schedule(true);
    prevFast = f;
    prevSpecial = sp;
  });
});

// Desktop shell: timer-based notifications while the window is open.
// Nothing persists across launches, so everything is re-armed forcibly.
if (isDesktopShell()) {
  void (async () => {
    try {
      await notificationService.initialize?.();
      await rearmAllReminders({ force: true });
      const { startSmartNotificationSync } = await import('@/services/smartNotifications');
      startSmartNotificationSync();
    } catch (e) {
      console.warn('[boot] desktop notifications failed', e);
    }
  })();
}

// Recover localStorage space at startup: trim the Quran API response cache back
// to its budget so users who already overflowed (QuotaExceededError on
// 'myzikr:quran') can write again. Cheap no-op when the cache is already small.
void import('@/services/quranCacheEvict').then((m) => m.pruneQuranCache());

// Badges: evaluate the badge engine centrally. It was previously never called
// anywhere, so NO badge ever unlocked. Re-evaluate on every daily-progress or
// Ramadan change, plus once at boot. Loaded lazily to avoid a circular import
// at module-load time (BadgeEngine imports the progress store).
// startBadgeSync evaluates once at boot and re-evaluates on every store the
// stats-driven badges read (progress, qiyam, prayers, tasbih, quran, awrad…).
void import('@/services/BadgeEngine').then((m) => m.startBadgeSync());

// «الترتيب»: upload today's / yesterday's points on every logged deed (signed in only).
void import('@/services/leaderboard').then((m) => m.startLeaderboardSync());

// «استعادة السلسلة»: restore a broken adhkar/qiyam streak once today's raised target is met.
void import('@/services/streakRescue').then((m) => m.startStreakRescueSync());

// «مصحفي»: the Quran app records reading; pull its synced state into the
// app's Quran record on start, on every return, and every few minutes.
void import('@/services/mushafi').then((m) => m.startMushafiSync());

// Streak freezes (mercy over guilt): cover a just-missed day with a token and
// award a token per completed week. The tokens/UI existed for months with no
// caller — every surface showed a permanent zero and no streak was ever saved.
void import('@/store/progressStore').then(({ useProgressStore }) => {
  try {
    const frozen = useProgressStore.getState().maintainFreezes();
    if (frozen.length > 0) {
      void import('@/store/toastStore').then(({ toast }) =>
        toast.info('حفظنا سلسلتك 🕊️', 'غطّى رمز تجميد يومك الفائت — واصل اليوم'),
      );
    }
  } catch (e) {
    console.warn('[freezes] maintenance failed', e);
  }
});

// Auth + cloud sync: restore any existing session. When a session exists the
// authStore starts cloudSyncService's auto-sync engine, which owns ALL push/
// pull triggers (change watcher, realtime, polling, visibility, online) and
// merges before pushing — so no raw push-on-hide here anymore (it could
// clobber newer data another device pushed while this one was offline).
import('@/store/authStore').then((m) => {
  void m.useAuthStore.getState().init();
});

void bootCapacitor();

// Desktop shell: the Google OAuth callback arrives as an OS deep link
// (com.darkmon.myzikr://auth-callback?code=…) forwarded by the shell
// (src-tauri: deep-link plugin → shell.js bridge) — same exchange path as the
// Android appUrlOpen handler above.
window.desktopShell?.onDeepLink((url) => {
  if (url.includes('auth-callback')) {
    void import('@/store/authStore').then((m) => m.useAuthStore.getState().handleCallbackUrl(url));
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
