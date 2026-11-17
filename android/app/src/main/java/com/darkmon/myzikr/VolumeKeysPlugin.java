package com.darkmon.myzikr;

import android.app.Activity;
import android.view.KeyEvent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the hardware volume keys to the web layer while a counting screen
 * (adhkar / أوراد / السبحة) is open, so a press adds one to the counter.
 *
 * While capturing, BOTH the down and the up event are consumed — otherwise the
 * system volume panel still pops up on release. Capture is off by default and
 * the web layer only turns it on for the lifetime of a counting screen, so the
 * keys behave normally everywhere else.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    /** Written from the UI thread, read from the key-dispatch thread. */
    private volatile boolean capturing = false;

    @Override
    public void load() {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).setVolumeKeyHandler(this::onVolumeKey);
        }
    }

    /** @return true when the event was swallowed (system volume must not move). */
    private boolean onVolumeKey(int keyCode, KeyEvent event) {
        if (!capturing) return false;
        // Fire once per physical press: repeatCount > 0 is the OS auto-repeat
        // from a held key, which would otherwise spray dozens of counts.
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            JSObject data = new JSObject();
            data.put("direction", keyCode == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
            notifyListeners("volumeKey", data);
        }
        return true;
    }

    @PluginMethod
    public void start(PluginCall call) {
        capturing = true;
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        capturing = false;
        call.resolve();
    }

    @PluginMethod
    public void isCapturing(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", capturing);
        call.resolve(ret);
    }

    @Override
    protected void handleOnPause() {
        // Nothing to release: an unfocused activity gets no key events. Kept as a
        // reminder that capture intentionally survives a pause/resume cycle so
        // returning to the counting screen still counts.
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        capturing = false;
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).setVolumeKeyHandler(null);
        }
        super.handleOnDestroy();
    }
}
