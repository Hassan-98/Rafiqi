import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darkmon.myzikr',
  appName: 'رَفِيقِي',
  webDir: 'dist',
  android: {
    backgroundColor: '#F9F5EF',
    allowMixedContent: false,
    // NEVER turn captureInput on. It swaps Chromium's real keyboard connection
    // for a dummy BaseInputConnection (CapacitorWebView.onCreateInputConnection):
    // the keyboard no longer sees the field's text or caret, and every Arabic
    // commit is APPENDED to the end via `activeElement.value += …` (no input
    // event → React never learns the text). Result on Android: the caret jumps
    // to the end, mid-word edits are impossible, and text vanishes on blur.
    captureInput: false,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
    // Default flavor for `cap run android` etc. The gradle project has two
    // distribution flavors: `sideload` (direct APK — keeps the battery-
    // optimization exclusion) and `play` (Play Store — that permission is
    // stripped). APK outputs live under apk/<flavor>/debug/ now, NOT
    // apk/debug/ — the old app-debug.apk path stopped updating when the
    // flavors were introduced.
    flavor: 'sideload',
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_myzikr',
      iconColor: '#1A6B5A',
      // Global fallback sound; per-channel sounds (see sounds.ts) override this.
      sound: 'adhan_makkah.mp3',
    },
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      // Emerald-night to match the lantern icon + the full-bleed splash image,
      // so the Android-12 system splash (centered icon on this colour) blends in.
      backgroundColor: '#0C463C',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F5EF',
      overlaysWebView: false,
    },
  },
};

export default config;
