package com.darkmon.myzikr;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Lets the user pick ANY audio file and use it as a notification-channel sound.
 *
 * Capacitor's LocalNotifications channel API only accepts bundled `res/raw`
 * sounds, so this native plugin is required: it copies the picked file into the
 * app's private storage, exposes it via the existing FileProvider, and creates
 * a NotificationChannel whose sound is that file URI (channels freeze their
 * sound at create time, so we delete + recreate to change it).
 */
@CapacitorPlugin(name = "CustomSound")
public class CustomSoundPlugin extends Plugin {

    /** Pick an audio file, then (re)create the given channel with it as the sound. */
    @PluginMethod
    public void pickAndSetChannelSound(PluginCall call) {
        if (call.getString("channelId") == null) {
            call.reject("channelId is required");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*" });
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }

        Uri src = result.getData().getData();
        String channelId = call.getString("channelId");
        String name = call.getString("name", "تنبيه مخصّص");
        int importance = call.getInt("importance", NotificationManager.IMPORTANCE_HIGH);

        try {
            Context ctx = getContext();

            File dir = new File(ctx.getFilesDir(), "notif_sounds");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("could not create sounds dir");
                return;
            }

            String ext = "mp3";
            String type = ctx.getContentResolver().getType(src);
            if (type != null && type.contains("/")) {
                String e = type.substring(type.indexOf('/') + 1);
                if (e.matches("[a-zA-Z0-9]+")) ext = e;
            }

            File out = new File(dir, channelId + "." + ext);
            // Remove any previous custom file for this channel (other extensions too).
            File[] existing = dir.listFiles((d, n) -> n.startsWith(channelId + "."));
            if (existing != null) for (File f : existing) f.delete();

            try (InputStream in = ctx.getContentResolver().openInputStream(src);
                 OutputStream os = new FileOutputStream(out)) {
                if (in == null) {
                    call.reject("could not open the picked file");
                    return;
                }
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }

            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", out);
            // The system UI process renders the notification + plays the sound, so
            // grant it read access to our FileProvider URI.
            ctx.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                // Channels freeze their sound — delete then recreate to apply the new one.
                try {
                    nm.deleteNotificationChannel(channelId);
                } catch (Exception ignored) {
                }
                NotificationChannel ch = new NotificationChannel(channelId, name, importance);
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
                ch.setSound(uri, attrs);
                ch.enableVibration(true);
                ch.enableLights(true);
                ch.setLightColor(0xFF1A6B5A);
                nm.createNotificationChannel(ch);
            }

            JSObject ret = new JSObject();
            ret.put("channelId", channelId);
            ret.put("fileName", out.getName());
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("setChannelSound failed: " + e.getMessage());
        }
    }
}
