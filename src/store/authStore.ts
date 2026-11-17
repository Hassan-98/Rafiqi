import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, AUTH_REDIRECT_NATIVE } from '@/services/supabaseClient';
import { cloudSyncService } from '@/services/cloudSyncService';
import { toast } from '@/store/toastStore';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** A sign-in flow is in progress (browser open / token exchange). */
  busy: boolean;
  syncing: boolean;
  ready: boolean;
  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  handleCallbackUrl: (url: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  busy: false,
  syncing: false,
  ready: false,

  init: async () => {
    if (!isSupabaseConfigured) {
      set({ ready: true });
      return;
    }
    const { data } = await supabase.auth.getSession();
    console.info('[auth] init — session:', data.session?.user?.email ?? 'none');
    set({ session: data.session, user: data.session?.user ?? null, ready: true });
    // Already signed in from a previous run → start the live sync engine
    // (its first cycle pulls whatever the other device pushed meanwhile).
    if (data.session?.user) cloudSyncService.startAutoSync(data.session.user.id);

    supabase.auth.onAuthStateChange((event, session) => {
      console.info('[auth] event:', event, '→', session?.user?.email ?? 'none');
      set({ session, user: session?.user ?? null });
      // Only reconcile on an *actual* fresh sign-in — not on the
      // INITIAL_SESSION event fired on every cold start (would loop reloads).
      if (event === 'SIGNED_IN' && session?.user) {
        const uid = session.user.id;
        void cloudSyncService.reconcileOnLogin(uid).then(() => {
          cloudSyncService.startAutoSync(uid);
        });
      } else if (event === 'SIGNED_OUT') {
        cloudSyncService.stopAutoSync();
        cloudSyncService.clearSyncBase();
      }
    });
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      toast.error('لم يتم إعداد المزامنة السحابية');
      return;
    }
    set({ busy: true });
    try {
      const native = Capacitor.isNativePlatform();
      // The desktop shell can't receive a web redirect (its origin is the
      // app:// scheme, which Supabase rejects → falls back to the Site URL,
      // i.e. localhost). It reuses the Android deep-link scheme instead; the
      // OS routes the callback to the running app (wired in main.tsx).
      const desktop = !native && document.documentElement.dataset.shell === 'desktop';
      const external = native || desktop;
      const redirectTo = external ? AUTH_REDIRECT_NATIVE : window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: external,
        },
      });
      if (error) throw error;
      console.info('[auth] signInWithOAuth → redirectTo:', redirectTo, '| url:', data?.url);
      if (external && data?.url) {
        if (native) {
          // Open Google consent in a Custom Tab; the callback deep-link is
          // handled by `handleCallbackUrl` (wired in main.tsx).
          await Browser.open({ url: data.url });
        } else {
          // Desktop: the shell turns window.open into the system browser
          // (src-tauri on_new_window).
          window.open(data.url, '_blank');
        }
      }
    } catch (e) {
      console.warn('[auth] google sign-in failed', e);
      toast.error('تعذّر تسجيل الدخول');
    } finally {
      set({ busy: false });
    }
  },

  handleCallbackUrl: async (url) => {
    try {
      const u = new URL(url);
      const code = u.searchParams.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else if (u.hash) {
        const p = new URLSearchParams(u.hash.replace(/^#/, ''));
        const access_token = p.get('access_token');
        const refresh_token = p.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
      // Belt-and-braces: push the resolved session into the store immediately
      // (don't rely solely on the onAuthStateChange event timing), and seed
      // the cloud copy on this first sign-in.
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, user: data.session?.user ?? null });
      if (data.session?.user) {
        void cloudSyncService.reconcileOnLogin(data.session.user.id);
      }
      toast.success('تم تسجيل الدخول');
    } catch (e) {
      console.warn('[auth] callback exchange failed', e);
      toast.error('تعذّر إكمال تسجيل الدخول');
    } finally {
      try {
        await Browser.close();
      } catch {
        /* browser may already be closed */
      }
    }
  },

  signOut: async () => {
    cloudSyncService.stopAutoSync();
    cloudSyncService.clearSyncBase();
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    set({ session: null, user: null });
    toast.info('تم تسجيل الخروج');
  },

  syncNow: async () => {
    const user = get().user;
    if (!user) return;
    set({ syncing: true });
    try {
      // Merge-then-push (engine cycle) so "sync now" can never clobber newer
      // data the other device pushed while we were offline.
      const ok = (await cloudSyncService.flush()) || (await cloudSyncService.push(user.id));
      toast[ok ? 'success' : 'error'](ok ? 'تمت المزامنة' : 'تعذّرت المزامنة');
    } finally {
      set({ syncing: false });
    }
  },
}));
