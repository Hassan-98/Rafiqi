/// <reference types="vite/client" />

/** Injected by the desktop shell (src-tauri/src/shell.js); absent on web/native. */
interface Window {
  desktopShell?: {
    /** Subscribe to OS deep-link URLs; returns an unsubscribe function. */
    onDeepLink: (cb: (url: string) => void) => () => void;
    /** OTA web-bundle updates (src/services/appUpdate.ts). */
    updates: {
      nativeVersion(): Promise<string>;
      apply(o: { url: string; version: string; sha256: string }): Promise<void>;
      confirm(): Promise<void>;
      /** Download/extract progress; absent on shells built before 2026-10-12. */
      onProgress?(cb: (p: { phase: 'download' | 'extract'; loaded: number; total: number }) => void): () => void;
    };
    /** Another site's page as text, HTTPS only (lesson links); absent on shells built before 2026-11-19. */
    fetchText?(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<string>;
  };
}

/** package.json version, injected by vite.config.ts — the running web bundle's version. */
declare const __APP_VERSION__: string;
