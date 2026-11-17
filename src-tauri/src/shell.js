// Injected by the Tauri shell (lib.rs) before any page script runs: the same
// `window.desktopShell` bridge the Electron preload exposed (typed in
// src/vite-env.d.ts), so the web bundle — shared with Android and shipped OTA —
// needs no Tauri-specific code.
(() => {
  if (window.desktopShell) return;
  // Resolved at call time: Tauri's own init scripts define it before page scripts run.
  const invoke = (cmd, args, options) => window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  const subs = { 'deep-link': new Set(), progress: new Set() };
  let lastLink = null;
  const emit = (name, payload) => {
    if (name === 'deep-link') lastLink = payload;
    for (const cb of subs[name] ?? []) {
      try {
        cb(payload);
      } catch (e) {
        console.error('[shell]', e);
      }
    }
  };
  // lib.rs pushes deep links into the running page through this.
  window.__rafiqiShell = { emit };
  // Cold start through a deep link: the shell kept the URL until the page asks.
  setTimeout(() => {
    invoke('shell_take_deep_link')
      .then((url) => url && emit('deep-link', url))
      .catch(() => undefined);
  }, 0);

  window.desktopShell = {
    onDeepLink(cb) {
      subs['deep-link'].add(cb);
      if (lastLink) cb(lastLink);
      return () => subs['deep-link'].delete(cb);
    },
    mushafi: {
      open: (page) => invoke('shell_open_mushafi', { page: Number.isInteger(page) ? page : null }),
    },
    updates: {
      nativeVersion: () => invoke('shell_native_version'),
      // Downloaded here (the update host sends CORS *) so the dialog gets real
      // progress; the shell checks the sha256, unpacks and reloads into it.
      async apply({ url, version, sha256 }) {
        if (!/^https:\/\//.test(url)) throw new Error('bad update manifest');
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length')) || 0;
        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        let last = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          if (Date.now() - last > 200) {
            last = Date.now();
            emit('progress', { phase: 'download', loaded, total });
          }
        }
        emit('progress', { phase: 'extract', loaded, total });
        const zip = new Uint8Array(loaded);
        let at = 0;
        for (const c of chunks) {
          zip.set(c, at);
          at += c.length;
        }
        await invoke('shell_install_update', zip, { headers: { 'x-version': String(version), 'x-sha256': String(sha256) } });
      },
      confirm: () => invoke('shell_confirm_update'),
      onProgress(cb) {
        subs.progress.add(cb);
        return () => subs.progress.delete(cb);
      },
    },
  };

  // tauri-plugin-notification's window.Notification (its init script runs before this one)
  // drops `onclick`: tag each toast with an id; lib.rs reports a click as 'notification-click'.
  const Plugin = window.Notification;
  if (typeof Plugin === 'function') {
    const toasts = new Map();
    let seq = 0;
    window.Notification = new Proxy(Plugin, {
      construct(plugin, [title, options]) {
        const id = ++seq;
        const toast = { title, onclick: null, close: () => toasts.delete(id) };
        toasts.set(id, toast);
        if (toasts.size > 50) toasts.delete(toasts.keys().next().value);
        plugin(title, { ...options, id });
        return toast;
      },
    });
    subs['notification-click'] = new Set([(id) => toasts.get(id)?.onclick?.()]);
  }

  const mark = () => {
    if (!document.documentElement) return false;
    document.documentElement.dataset.shell = 'desktop';
    return true;
  };
  if (!mark()) document.addEventListener('DOMContentLoaded', mark, { once: true });
})();
