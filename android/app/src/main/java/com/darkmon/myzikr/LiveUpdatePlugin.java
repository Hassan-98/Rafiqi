package com.darkmon.myzikr;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * OTA web-bundle download (src/services/appUpdate.ts): fetches the zip,
 * verifies its sha256 and extracts it to files/live-updates/&lt;version&gt;/.
 * Switching to it is Capacitor's own WebView.setServerBasePath — this plugin
 * only produces the folder. Emits "progress" events {phase: download|extract,
 * loaded, total} (~5 a second) for the update screen.
 */
@CapacitorPlugin(name = "LiveUpdate")
public class LiveUpdatePlugin extends Plugin {

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        String sha256 = call.getString("sha256");
        // version becomes a folder name — digits and dots only.
        if (url == null || !url.startsWith("https://") || version == null
                || !version.matches("[0-9.]+") || sha256 == null) {
            call.reject("https url, numeric version and sha256 are required");
            return;
        }
        new Thread(() -> {
            File root = new File(getContext().getFilesDir(), "live-updates");
            File dir = new File(root, version);
            File zip = new File(root, version + ".zip");
            try {
                root.mkdirs();
                if (!sha256.equalsIgnoreCase(downloadTo(url, zip))) throw new IOException("checksum mismatch");
                progress("extract", 0, 1, true);
                deleteRecursive(dir);
                unzip(zip, dir);
                if (!new File(dir, "index.html").exists()) throw new IOException("bundle has no index.html");
                prune(root, dir);
                JSObject ret = new JSObject();
                ret.put("path", dir.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                deleteRecursive(dir);
                call.reject("Update failed: " + e.getMessage(), e);
            } finally {
                zip.delete();
            }
        }).start();
    }

    private long lastProgress = 0;

    /** Throttled "progress" event (always sent when `force`). */
    private void progress(String phase, long loaded, long total, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastProgress < 200) return;
        lastProgress = now;
        JSObject p = new JSObject();
        p.put("phase", phase);
        p.put("loaded", loaded);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    /** Streams url → file, returning the hex sha256 of what was written. */
    private String downloadTo(String url, File out) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        try {
            if (conn.getResponseCode() != 200) throw new IOException("HTTP " + conn.getResponseCode());
            long total = Math.max(0, conn.getContentLengthLong());
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new DigestInputStream(conn.getInputStream(), md);
                 OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                long loaded = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    loaded += n;
                    progress("download", loaded, total, false);
                }
                progress("download", loaded, total, true);
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } finally {
            conn.disconnect();
        }
    }

    private static void unzip(File zip, File dir) throws IOException {
        String base = dir.getCanonicalPath() + File.separator;
        try (ZipFile zf = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry e = entries.nextElement();
                File f = new File(dir, e.getName());
                if (!f.getCanonicalPath().startsWith(base)) throw new IOException("bad zip entry " + e.getName());
                if (e.isDirectory()) {
                    f.mkdirs();
                    continue;
                }
                f.getParentFile().mkdirs();
                try (InputStream in = zf.getInputStream(e); OutputStream os = new FileOutputStream(f)) {
                    copy(in, os);
                }
            }
        }
    }

    /** Drops old bundles, keeping the new one plus the served and persisted ones. */
    private void prune(File root, File keep) {
        String served = getBridge().getServerBasePath();
        String persisted = getContext()
            .getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE)
            .getString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, "");
        File[] children = root.listFiles();
        if (children == null) return;
        for (File f : children) {
            String p = f.getAbsolutePath();
            if (f.equals(keep) || p.equals(served) || p.equals(persisted)) continue;
            deleteRecursive(f);
        }
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private static void deleteRecursive(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        f.delete();
    }
}
