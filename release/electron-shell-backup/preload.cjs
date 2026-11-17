/**
 * Marks the document as running inside the desktop shell so the web app can
 * adapt (CSS hooks via html[data-shell='desktop'], feature checks in JS), and
 * exposes a minimal deep-link bridge for the OAuth callback. No Node APIs are
 * exposed to the page.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Buffer the latest deep link: on a cold start the main process delivers it
// on did-finish-load, which can race the renderer's subscribe call.
let pendingDeepLink = null;
const deepLinkListeners = new Set();

ipcRenderer.on('deep-link', (_event, url) => {
  pendingDeepLink = url;
  deepLinkListeners.forEach((cb) => cb(url));
});

contextBridge.exposeInMainWorld('desktopShell', {
  /**
   * Subscribe to deep-link URLs (com.darkmon.myzikr://…). Replays the
   * buffered link immediately if one arrived before the subscription.
   * Returns an unsubscribe function.
   */
  onDeepLink(cb) {
    deepLinkListeners.add(cb);
    if (pendingDeepLink) cb(pendingDeepLink);
    return () => deepLinkListeners.delete(cb);
  },
  /** Open «مصحفي» (Mushaf.exe), optionally at a page — see src/services/mushafi.ts. */
  mushafi: {
    open: (page) => ipcRenderer.invoke('mushafi:open', page),
  },
  /** OTA web-bundle updates — see src/services/appUpdate.ts / main.cjs. */
  updates: {
    nativeVersion: () => ipcRenderer.invoke('updates:native-version'),
    apply: (manifest) => ipcRenderer.invoke('updates:apply', manifest),
    confirm: () => ipcRenderer.invoke('updates:confirm'),
    onProgress(cb) {
      const h = (_event, p) => cb(p);
      ipcRenderer.on('updates:progress', h);
      return () => ipcRenderer.removeListener('updates:progress', h);
    },
  },
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.shell = 'desktop';
});
