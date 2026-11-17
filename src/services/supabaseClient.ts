import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Supabase client for auth + cloud sync. Reads the public URL + publishable
 * key from the env (both are safe to ship in the client; the DB password and
 * Google client secret must NEVER be here — they live server-side / in the
 * Supabase dashboard only).
 *
 * `detectSessionInUrl: true` lets the WEB flow finish automatically: when
 * Google redirects back to the origin with `?code=`, supabase-js exchanges it
 * on load. On NATIVE the redirect arrives as a deep link (handled manually in
 * `authStore`), and the WebView URL never carries the code — so this flag only
 * ever helps web and is harmless on native. PKCE keeps it secret-less.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';

export const isSupabaseConfigured = Boolean(url && key);

/**
 * On native, the Android WebView's `localStorage` is not a durable place for
 * the auth session — it can be evicted, which signs the user out after a while.
 * Persist the session in Capacitor Preferences (native SharedPreferences)
 * instead. On web we leave storage undefined → supabase-js uses localStorage.
 */
const capacitorStorage = {
  getItem: async (k: string) => (await Preferences.get({ key: k })).value,
  setItem: async (k: string, v: string) => {
    await Preferences.set({ key: k, value: v });
  },
  removeItem: async (k: string) => {
    await Preferences.remove({ key: k });
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: Capacitor.isNativePlatform() ? capacitorStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

let guest: ReturnType<typeof createClient> | null = null;
/**
 * «الترتيب» without an account: an anonymous Supabase user kept by this device,
 * on its OWN storage key — the Google session and cloud sync never see it.
 * Needs «Allow anonymous sign-ins» on in the Supabase dashboard.
 */
export function guestClient() {
  return (guest ??= createClient(url, key, {
    auth: {
      storage: Capacitor.isNativePlatform() ? capacitorStorage : undefined,
      storageKey: 'myzikr-lb-guest',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }));
}

/** The Google Web client ID (public) — used as the OAuth audience. */
export const GOOGLE_WEB_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ?? '';

/** Deep-link the OAuth provider redirects back to on native. */
export const AUTH_REDIRECT_NATIVE = 'com.darkmon.myzikr://auth-callback';
