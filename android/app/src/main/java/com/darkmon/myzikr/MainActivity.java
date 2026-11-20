package com.darkmon.myzikr;

import android.os.Bundle;
import android.view.KeyEvent;

import com.darkmon.myzikr.widget.WidgetUpdater;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Lets {@link VolumeKeysPlugin} claim the volume keys for counting. */
    public interface VolumeKeyHandler {
        /** @return true to swallow the event (system volume must not change). */
        boolean onVolumeKey(int keyCode, KeyEvent event);
    }

    private volatile VolumeKeyHandler volumeKeyHandler;

    public void setVolumeKeyHandler(VolumeKeyHandler handler) {
        this.volumeKeyHandler = handler;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local plugins before the bridge initializes.
        registerPlugin(CustomSoundPlugin.class);
        registerPlugin(SpeechStreamPlugin.class);
        registerPlugin(FullScreenAlarmPlugin.class);
        registerPlugin(VolumeKeysPlugin.class);
        registerPlugin(MediaPlaybackPlugin.class);
        registerPlugin(LiveUpdatePlugin.class);
        registerPlugin(MushafiPlugin.class);
        registerPlugin(PrayerModePlugin.class);
        registerPlugin(SilatPhonePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Intercept the volume keys before the window handles them. dispatchKeyEvent
     * (not onKeyDown) is the hook that works here: the WebView consumes key
     * events on its own, so onKeyDown never sees them reliably.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) {
            VolumeKeyHandler handler = volumeKeyHandler;
            if (handler != null && handler.onVolumeKey(code, event)) return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Refresh the home-screen widgets with the latest snapshot the web layer
        // wrote (widgetBridge.ts) as the app moves to the background.
        try {
            WidgetUpdater.updateAll(getApplicationContext());
        } catch (Exception ignored) {
        }
    }
}
