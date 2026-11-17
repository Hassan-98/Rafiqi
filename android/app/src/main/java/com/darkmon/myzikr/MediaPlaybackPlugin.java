package com.darkmon.myzikr;

import android.os.Build;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge for {@link MediaPlaybackService} (src/services/backgroundPlayback.ts).
 *
 * update({title, subtitle, playing}) starts the foreground service on first
 * call and refreshes it afterwards; stop() tears it down. Notification /
 * lock-screen / headset buttons come back as an
 * "action" event: {action: "play" | "pause" | "next" | "prev" | "stop"}.
 *
 * Background JS: Capacitor only pauses WebView timers on onPause when the
 * "KeepRunning" preference is false — it defaults to true and this app never
 * sets it, so timers/audio keep running. The renderer runs in its own process;
 * pinning its priority to IMPORTANT (not waived when hidden) keeps it bound at
 * our foreground-service importance while the activity is in the background.
 */
@CapacitorPlugin(name = "MediaPlayback")
public class MediaPlaybackPlugin extends Plugin {

    @Override
    public void load() {
        MediaPlaybackService.listener = action -> {
            JSObject data = new JSObject();
            data.put("action", action);
            notifyListeners("action", data);
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getActivity().runOnUiThread(() -> {
                WebView wv = getBridge().getWebView();
                if (wv != null) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            });
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        MediaPlaybackService.show(getContext(), new MediaPlaybackService.State(
                call.getString("title", ""),
                call.getString("subtitle", ""),
                Boolean.TRUE.equals(call.getBoolean("playing", true))));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        MediaPlaybackService.hide();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        MediaPlaybackService.listener = null;
        MediaPlaybackService.hide();
    }
}
