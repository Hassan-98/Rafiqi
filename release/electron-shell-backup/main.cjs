/**
 * Desktop (Electron) shell for رَفِيقِي.
 *
 * Serves the built web app (dist/) over a privileged `app://` scheme — the
 * Vite bundle uses absolute asset paths (`/assets/…`), which break under
 * plain `file://`. Routing is hash-based, so no server-side routes needed.
 *
 * Window policy: the UI is designed for tablet → full-HD widths, so the
 * window is resizable ONLY between 1024×700 (tablet) and 1920×1080 (FHD).
 *
 * OTA updates can point app:// at a downloaded bundle instead — see bundleDir.
 */
const { app, BrowserWindow, Menu, shell, protocol, net, screen, session, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { unzip } = require('./unzip.cjs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV = process.argv.includes('--dev');
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173';

// OTA web-bundle updates (src/services/appUpdate.ts): bundles are extracted
// to userData/live-updates/<version>/ and state.json names the confirmed one.
// app:// serves `bundleDir`. A newly applied bundle is kept in memory only
// until its renderer calls updates:confirm — a broken one never persists.
const UPDATES_DIR = path.join(app.getPath('userData'), 'live-updates');
const UPDATES_STATE = path.join(UPDATES_DIR, 'state.json');

function loadConfirmedBundle() {
  try {
    const s = JSON.parse(fs.readFileSync(UPDATES_STATE, 'utf8'));
    // A new installer ships its own dist/ — drop bundles confirmed under an
    // older shell (same rule Capacitor applies on Android).
    if (s.native === app.getVersion() && fs.existsSync(path.join(s.dir, 'index.html'))) return s.dir;
  } catch {
    /* no update applied yet */
  }
  return DIST_DIR;
}
let bundleDir = loadConfirmedBundle();

// «مصحفي» (the Quran app) on the desktop: Mushaf.exe [page] opens it at a page.
// The web layer never supplies a path — the user picks the exe once in a
// native dialog and it is kept in userData.
const MUSHAFI_CFG = path.join(app.getPath('userData'), 'mushafi.json');
ipcMain.handle('mushafi:open', async (event, page) => {
  let exe = null;
  try {
    exe = JSON.parse(fs.readFileSync(MUSHAFI_CFG, 'utf8')).exe;
  } catch {
    /* not chosen yet */
  }
  if (!exe || !fs.existsSync(exe)) {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'أين برنامج مصحفي (Mushaf.exe)؟',
      filters: [{ name: 'مصحفي', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return false;
    exe = r.filePaths[0];
    fs.writeFileSync(MUSHAFI_CFG, JSON.stringify({ exe }));
  }
  const args = Number.isInteger(page) && page >= 1 && page <= 604 ? [String(page)] : [];
  require('node:child_process').spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
  return true;
});

ipcMain.handle('updates:native-version', () => app.getVersion());

ipcMain.handle('updates:confirm', () => {
  if (bundleDir === DIST_DIR) return;
  fs.writeFileSync(UPDATES_STATE, JSON.stringify({ dir: bundleDir, native: app.getVersion() }));
});

ipcMain.handle('updates:apply', async (event, { url, version, sha256 }) => {
  // version becomes a folder name — digits and dots only.
  if (!/^https:\/\//.test(url) || !/^[0-9.]+$/.test(version)) throw new Error('bad update manifest');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  // Stream it so the update screen can show real progress.
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let loaded = 0;
  let last = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (Date.now() - last > 200) {
      last = Date.now();
      event.sender.send('updates:progress', { phase: 'download', loaded, total });
    }
  }
  event.sender.send('updates:progress', { phase: 'extract', loaded, total });
  const buf = Buffer.concat(chunks);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== String(sha256).toLowerCase()) {
    throw new Error('checksum mismatch');
  }
  const dir = path.join(UPDATES_DIR, version);
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    unzip(buf, dir);
    if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error('bundle has no index.html');
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  for (const name of fs.readdirSync(UPDATES_DIR)) {
    const p = path.join(UPDATES_DIR, name);
    if (p !== dir && p !== bundleDir && p !== UPDATES_STATE) fs.rmSync(p, { recursive: true, force: true });
  }
  bundleDir = dir;
  win?.loadURL('app://bundle/index.html');
});

const MIN_W = 1024;
const MIN_H = 700;
const MAX_W = 1920;
const MAX_H = 1080;

// OAuth deep-link scheme — the SAME scheme the Android build uses, so the
// Supabase redirect allowlist entry (com.darkmon.myzikr://auth-callback)
// covers both platforms. Google → Supabase → this scheme → the OS routes it
// back to the running app (Windows: a second instance carrying the URL in
// argv; macOS: the open-url event).
const PROTOCOL_SCHEME = 'com.darkmon.myzikr';

if (process.defaultApp) {
  // Unpackaged (`electron .`): the registry entry must spell out the
  // executable AND the app path or the callback launches a bare Electron.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

/** First argv entry that is a deep-link URL of our scheme, or null. */
function extractDeepLink(argv) {
  return (
    argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL_SCHEME}://`)) ?? null
  );
}

function deliverDeepLink(url) {
  if (!url || !win) return;
  win.webContents.send('deep-link', url);
}

// Must be registered before app ready: app:// needs to behave like a real
// origin (secure context, fetch, streams) for Supabase, workers and IndexedDB.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.max(MIN_W, Math.min(MAX_W, workAreaSize.width - 80, 1600));
  const height = Math.max(MIN_H, Math.min(MAX_H, workAreaSize.height - 60, 900));

  win = new BrowserWindow({
    width,
    height,
    minWidth: MIN_W,
    minHeight: MIN_H,
    maxWidth: MAX_W,
    maxHeight: MAX_H,
    fullscreenable: false,
    backgroundColor: '#F9F5EF',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon-only.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // Keep Quran / adhkar listening (audio + the JS queue timers) running
      // at full speed while the window is minimized or hidden.
      backgroundThrottling: false,
    },
  });

  // Any external link opens in the system browser, never inside the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const internal = url.startsWith('app://') || (DEV && url.startsWith(DEV_URL));
    if (!internal) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // No menu bar, but keep the useful chords: F12 devtools, Ctrl+R reload.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.control && !input.shift && input.key.toLowerCase() === 'r') {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  if (DEV) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL('app://bundle/index.html');
  }

  // Cold start via the protocol (app wasn't running): the deep link rides in
  // on this very instance's argv — deliver it once the page is up (the
  // preload buffers it until the renderer subscribes).
  const initialDeepLink = extractDeepLink(process.argv);
  if (initialDeepLink) {
    win.webContents.once('did-finish-load', () => deliverDeepLink(initialDeepLink));
  }

  win.on('closed', () => {
    win = null;
  });
}

app.on('second-instance', (_event, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  // Windows/Linux: the OAuth callback arrives as a fresh invocation whose
  // argv carries the deep-link URL; the lock forwards it here.
  deliverDeepLink(extractDeepLink(argv));
});

// macOS deep-link delivery.
app.on('open-url', (event, url) => {
  event.preventDefault();
  deliverDeepLink(url);
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const root = bundleDir;
    const file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // Permission policy: the app needs the microphone (hifz recitation),
  // notifications and geolocation (qibla/prayer times); deny the rest.
  const ALLOWED_PERMISSIONS = new Set(['media', 'notifications', 'geolocation', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
