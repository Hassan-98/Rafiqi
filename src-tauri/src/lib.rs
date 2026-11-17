//! Desktop shell for رَفِيقِي (Tauri — replaced the Electron shell, 2026-11).
//!
//! - Serves the web app over `app://` (`http://app.localhost` on Windows): the
//!   confirmed OTA bundle from disk, else the dist/ embedded at build time.
//! - Injects shell.js: the same `window.desktopShell` bridge the Electron preload
//!   exposed, so the web bundle needs no Tauri-specific code.
//! - Window 1024×700 – 1920×1080; external links open in the system browser; the
//!   Google sign-in callback (com.darkmon.myzikr://) reaches the running instance.

use std::{
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
  http,
  ipc::{InvokeBody, Request},
  webview::NewWindowResponse,
  window::Color,
  AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

/// The OAuth deep-link scheme — the Android one, so Supabase's allowlist covers both.
const SCHEME: &str = "com.darkmon.myzikr";
const SHELL_JS: &str = include_str!("shell.js");
#[cfg(windows)]
const APP_URL: &str = "http://app.localhost/index.html";
#[cfg(not(windows))]
const APP_URL: &str = "app://localhost/index.html";
/// The UI is designed for tablet → full-HD widths.
const MIN_SIZE: (f64, f64) = (1024.0, 700.0);
const MAX_SIZE: (f64, f64) = (1920.0, 1080.0);
/// wry's own defaults (replaced once any args are given) + keep timers, audio and
/// the in-page reminders at full speed while the window is minimized.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,IntensiveWakeUpThrottling \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
  --autoplay-policy=no-user-gesture-required";

#[derive(Default)]
struct Shell {
  /// The OTA bundle being served; None = the embedded dist/.
  bundle: Mutex<Option<PathBuf>>,
  /// A deep link that launched the app, kept until the page asks for it.
  deep_link: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize)]
struct UpdateState {
  dir: PathBuf,
  native: String,
}

fn native_version(app: &AppHandle) -> String {
  app.package_info().version.to_string()
}

fn updates_dir(app: &AppHandle) -> PathBuf {
  app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("live-updates")
}

/// The bundle an earlier run confirmed — only under this same shell version: a new
/// installer ships its own dist/ (the rule Capacitor applies on Android).
fn confirmed_bundle(app: &AppHandle) -> Option<PathBuf> {
  let s: UpdateState = serde_json::from_slice(&fs::read(updates_dir(app).join("state.json")).ok()?).ok()?;
  (s.native == native_version(app) && s.dir.join("index.html").is_file()).then_some(s.dir)
}

// ── app:// ────────────────────────────────────────────────────────────────────
fn mime(path: &str) -> &'static str {
  let ext = path.rsplit('.').next().unwrap_or_default().to_ascii_lowercase();
  match ext.as_str() {
    "html" => "text/html; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" | "webmanifest" => "application/json",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "ico" => "image/x-icon",
    "woff2" => "font/woff2",
    "woff" => "font/woff",
    "ttf" => "font/ttf",
    "otf" => "font/otf",
    "mp3" => "audio/mpeg",
    "ogg" => "audio/ogg",
    "wav" => "audio/wav",
    "m4a" => "audio/mp4",
    "wasm" => "application/wasm",
    "txt" => "text/plain; charset=utf-8",
    _ => "application/octet-stream",
  }
}

/// `rel` under `root`, or None if it tries to step outside it.
fn bundle_file(root: &Path, rel: &str) -> Option<PathBuf> {
  let mut p = root.to_path_buf();
  for seg in rel.split(['/', '\\']).filter(|s| !s.is_empty()) {
    if seg == "." || seg == ".." || seg.contains(':') {
      return None;
    }
    p.push(seg);
  }
  Some(p)
}

/// `bytes=a-b` / `bytes=a-` / `bytes=-n` → the inclusive span, if satisfiable (first range only).
fn byte_range(header: &str, len: usize) -> Option<(usize, usize)> {
  let last = len.checked_sub(1)?;
  let (a, b) = header.strip_prefix("bytes=")?.split(',').next()?.trim().split_once('-')?;
  let (start, end) = if a.is_empty() {
    (len - b.parse::<usize>().ok()?.min(len), last)
  } else {
    (a.parse().ok()?, if b.is_empty() { last } else { b.parse::<usize>().ok()?.min(last) })
  };
  (start <= end).then_some((start, end))
}

fn serve(app: &AppHandle, req: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
  let decoded = percent_decode_str(req.uri().path()).decode_utf8_lossy();
  let path = match decoded.as_ref() {
    "" | "/" => "/index.html".to_string(),
    p => p.to_string(),
  };
  let bundle = app.state::<Shell>().bundle.lock().unwrap().clone();
  let bytes = match bundle {
    Some(root) => bundle_file(&root, &path).and_then(|f| fs::read(f).ok()),
    None => app.asset_resolver().get(path.clone()).map(|a| a.bytes),
  };
  let Some(bytes) = bytes else {
    return http::Response::builder().status(http::StatusCode::NOT_FOUND).body(Vec::new()).unwrap();
  };
  let res = http::Response::builder()
    .header(http::header::CONTENT_TYPE, mime(&path))
    .header(http::header::ACCEPT_RANGES, "bytes");
  // Media seeks (adhkar listening jumps inside bundled clips) need 206 ranges.
  let range = req.headers().get(http::header::RANGE).and_then(|v| v.to_str().ok()).and_then(|h| byte_range(h, bytes.len()));
  match range {
    Some((start, end)) => res
      .status(http::StatusCode::PARTIAL_CONTENT)
      .header(http::header::CONTENT_RANGE, format!("bytes {start}-{end}/{}", bytes.len()))
      .body(bytes[start..=end].to_vec()),
    None => res.body(bytes),
  }
  .unwrap()
}

// ── commands (shell.js) ─────────────────────────────────────────────────────────
#[tauri::command]
fn shell_native_version(app: AppHandle) -> String {
  native_version(&app)
}

#[tauri::command]
fn shell_take_deep_link(shell: tauri::State<'_, Shell>) -> Option<String> {
  shell.deep_link.lock().unwrap().take()
}

/// Verify, unpack and switch to an OTA bundle shell.js downloaded; the page reloads into
/// it and calls shell_confirm_update once it rendered — a broken one never persists.
#[tauri::command]
async fn shell_install_update(app: AppHandle, request: Request<'_>) -> Result<(), String> {
  let InvokeBody::Raw(zip) = request.body() else {
    return Err("expected the bundle bytes".into());
  };
  let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
  let (version, sha) = (header("x-version"), header("x-sha256").to_ascii_lowercase());
  // The version becomes a folder name — digits and dots only.
  if version.is_empty() || !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
    return Err("bad update manifest".into());
  }
  let hex: String = Sha256::digest(zip).iter().map(|b| format!("{b:02x}")).collect();
  if hex != sha {
    return Err("checksum mismatch".into());
  }
  let root = updates_dir(&app);
  let dir = root.join(&version);
  let _ = fs::remove_dir_all(&dir);
  let unpacked = zip::ZipArchive::new(std::io::Cursor::new(zip))
    .and_then(|mut a| a.extract(&dir))
    .map_err(|e| e.to_string())
    .and_then(|_| if dir.join("index.html").is_file() { Ok(()) } else { Err("bundle has no index.html".into()) });
  if let Err(e) = unpacked {
    let _ = fs::remove_dir_all(&dir);
    return Err(e);
  }
  let shell = app.state::<Shell>();
  let running = shell.bundle.lock().unwrap().clone();
  // Keep the new bundle and the running one (still the fallback until confirmed).
  for entry in fs::read_dir(&root).into_iter().flatten().flatten() {
    let p = entry.path();
    if p != dir && Some(&p) != running.as_ref() && p.is_dir() {
      let _ = fs::remove_dir_all(&p);
    }
  }
  *shell.bundle.lock().unwrap() = Some(dir);
  if let Some(w) = app.get_webview_window("main") {
    w.navigate(Url::parse(APP_URL).unwrap()).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn shell_confirm_update(app: AppHandle, shell: tauri::State<'_, Shell>) -> Result<(), String> {
  let Some(dir) = shell.bundle.lock().unwrap().clone() else {
    return Ok(());
  };
  let state = UpdateState { dir, native: native_version(&app) };
  fs::write(updates_dir(&app).join("state.json"), serde_json::to_vec(&state).unwrap()).map_err(|e| e.to_string())
}

/// «مصحفي» (the Quran app): Mushaf.exe [page]. The page never supplies a path — the
/// user picks the exe once in a native dialog and it is kept in the app's config dir.
#[tauri::command]
async fn shell_open_mushafi(app: AppHandle, page: Option<u32>) -> Result<bool, String> {
  let cfg = app.path().app_config_dir().map_err(|e| e.to_string())?.join("mushafi.json");
  let saved = fs::read(&cfg)
    .ok()
    .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
    .and_then(|v| v["exe"].as_str().map(PathBuf::from))
    .filter(|p| p.is_file());
  let exe = match saved {
    Some(p) => p,
    None => {
      let mut dialog = app.dialog().file().set_title("أين برنامج مصحفي (Mushaf.exe)؟").add_filter("مصحفي", &["exe"]);
      if let Some(w) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&w);
      }
      let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(false);
      };
      let p = picked.into_path().map_err(|e| e.to_string())?;
      if let Some(parent) = cfg.parent() {
        let _ = fs::create_dir_all(parent);
      }
      fs::write(&cfg, serde_json::json!({ "exe": p }).to_string()).map_err(|e| e.to_string())?;
      p
    }
  };
  let mut cmd = std::process::Command::new(exe);
  if let Some(p) = page.filter(|p| (1..=604).contains(p)) {
    cmd.arg(p.to_string());
  }
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0000_0008); // DETACHED_PROCESS
  }
  cmd.spawn().map_err(|e| e.to_string())?;
  Ok(true)
}

// ── window & links ─────────────────────────────────────────────────────────────
fn is_app_url(url: &Url) -> bool {
  match url.scheme() {
    "http" | "https" => {
      let host = url.host_str().unwrap_or_default();
      host == "app.localhost" || host == "tauri.localhost" || (cfg!(dev) && (host == "localhost" || host == "127.0.0.1"))
    }
    "app" | "tauri" | "about" | "blob" | "data" => true,
    _ => false,
  }
}

fn open_external(app: &AppHandle, url: &Url) {
  if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
  }
}

fn focus_main(app: &AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.set_focus();
  }
}

/// A deep link while running → straight into the page (shell.js `emit`).
fn push_deep_link(app: &AppHandle, url: &str) {
  if !url.starts_with(&format!("{SCHEME}://")) {
    return;
  }
  match app.get_webview_window("main") {
    Some(w) => {
      let js = format!("window.__rafiqiShell && window.__rafiqiShell.emit('deep-link', {})", serde_json::Value::from(url));
      let _ = w.eval(js);
      focus_main(app);
    }
    None => *app.state::<Shell>().deep_link.lock().unwrap() = Some(url.to_string()),
  }
}

fn open_main_window(app: &AppHandle) -> tauri::Result<()> {
  let url = if cfg!(dev) {
    WebviewUrl::App("index.html".into())
  } else {
    WebviewUrl::CustomProtocol(Url::parse(APP_URL).unwrap())
  };
  // Like the Electron shell: most of the work area, capped at 1600×900.
  let (w, h) = app
    .primary_monitor()
    .ok()
    .flatten()
    .map(|m| {
      let s = m.work_area().size.to_logical::<f64>(m.scale_factor());
      ((s.width - 80.0).min(1600.0), (s.height - 60.0).min(900.0))
    })
    .unwrap_or((1280.0, 800.0));
  let mut args = BROWSER_ARGS.to_string();
  if cfg!(debug_assertions) {
    // CDP for tests (debug builds only).
    args.push_str(" --remote-debugging-port=9342");
  }
  let nav = app.clone();
  let popup = app.clone();
  WebviewWindowBuilder::new(app, "main", url)
    .title("رَفِيقِي")
    .inner_size(w.clamp(MIN_SIZE.0, MAX_SIZE.0), h.clamp(MIN_SIZE.1, MAX_SIZE.1))
    .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
    .max_inner_size(MAX_SIZE.0, MAX_SIZE.1)
    .center()
    .background_color(Color(0xF9, 0xF5, 0xEF, 0xFF))
    .initialization_script(SHELL_JS)
    .additional_browser_args(&args)
    // Anything outside the app opens in the system browser, never inside the shell.
    .on_navigation(move |url| {
      let inside = is_app_url(url);
      if !inside {
        open_external(&nav, url);
      }
      inside
    })
    .on_new_window(move |url, _features| {
      open_external(&popup, &url);
      NewWindowResponse::Deny
    })
    .build()?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // First: a second launch (e.g. the OAuth callback) hands its argv to this one.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| focus_main(app)))
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(Shell::default())
    .register_asynchronous_uri_scheme_protocol("app", |ctx, request, responder| {
      let app = ctx.app_handle().clone();
      std::thread::spawn(move || responder.respond(serve(&app, &request)));
    })
    .invoke_handler(tauri::generate_handler![
      shell_native_version,
      shell_take_deep_link,
      shell_install_update,
      shell_confirm_update,
      shell_open_mushafi
    ])
    .setup(|app| {
      let handle = app.handle().clone();
      *app.state::<Shell>().bundle.lock().unwrap() = confirmed_bundle(&handle);

      // Dev runs and a copied exe aren't installed: (re)claim the scheme each launch.
      #[cfg(any(windows, target_os = "linux"))]
      if let Err(e) = app.deep_link().register_all() {
        eprintln!("[shell] deep link registration failed: {e}");
      }
      let h = handle.clone();
      app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
          push_deep_link(&h, url.as_str());
        }
      });
      if let Ok(Some(urls)) = app.deep_link().get_current() {
        if let Some(u) = urls.into_iter().find(|u| u.scheme() == SCHEME) {
          *app.state::<Shell>().deep_link.lock().unwrap() = Some(u.to_string());
        }
      }
      // A toast click (only while it's on screen — Windows doesn't report Action Center
      // clicks) → raise the window and run the page's `onclick` (shell.js tagged the id).
      let h = handle.clone();
      app.notification().on_action(move |a| {
        if let (Some(n), Some(w)) = (a.notification(), h.get_webview_window("main")) {
          let _ = w.eval(format!("window.__rafiqiShell && window.__rafiqiShell.emit('notification-click', {})", n.id()));
          focus_main(&h);
        }
      })?;
      open_main_window(&handle)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running رَفِيقِي");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn byte_ranges() {
    assert_eq!(byte_range("bytes=0-", 10), Some((0, 9)));
    assert_eq!(byte_range("bytes=2-4", 10), Some((2, 4)));
    assert_eq!(byte_range("bytes=2-99", 10), Some((2, 9)));
    assert_eq!(byte_range("bytes=-3", 10), Some((7, 9)));
    assert_eq!(byte_range("bytes=10-", 10), None);
    assert_eq!(byte_range("bytes=0-", 0), None);
    assert_eq!(byte_range("items=0-1", 10), None);
  }

  #[test]
  fn bundle_paths_stay_inside() {
    let root = Path::new("C:/b");
    assert_eq!(bundle_file(root, "/sounds/a.mp3"), Some(root.join("sounds").join("a.mp3")));
    assert_eq!(bundle_file(root, "/../state.json"), None);
    assert_eq!(bundle_file(root, "/C:/Windows/win.ini"), None);
    assert_eq!(bundle_file(root, r"\\server\share"), Some(root.join("server").join("share")));
  }
}
