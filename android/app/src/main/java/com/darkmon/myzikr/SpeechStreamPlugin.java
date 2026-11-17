package com.darkmon.myzikr;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Continuous, real-time streaming speech recognition for the memorization
 * recite-test (التسميع).
 *
 * Android's SpeechRecognizer is utterance-based (listen → silence → result →
 * stop), so to feel continuous we drive it ourselves: partial results are
 * enabled (each word streams via `result` events as it's spoken), the silence
 * window is short, and we re-arm the recognizer NATIVELY the instant an
 * utterance ends. The JS side therefore sees a single uninterrupted stream of
 * transcript updates — no visible stop/start between phrases.
 */
@CapacitorPlugin(
    name = "SpeechStream",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") }
)
public class SpeechStreamPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private Intent intent;
    private volatile boolean running = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    // Expected upcoming words (the verse being recited). On Android 13+ they
    // are fed to the recognizer as EXTRA_BIASING_STRINGS — the on-device
    // recognizer then strongly prefers Quranic vocabulary it would otherwise
    // mis-hear. Updated from JS per page; applied on every (re-)arm.
    private final ArrayList<String> biasWords = new ArrayList<>();

    // The system plays a "beep" each time SpeechRecognizer starts listening;
    // since we re-arm constantly that beep repeats and is annoying, so we mute
    // the beep-carrying streams for the session and restore them on stop.
    //
    // ONLY MUSIC + SYSTEM: the beep rides those. NOTIFICATION/RING were
    // previously muted too — if the process died mid-session, the device was
    // left with notifications/adhan muted SYSTEM-WIDE ("vibration only") until
    // something unmuted them. load() force-unmutes everything once per app
    // start to also heal devices already stuck from older builds.
    private AudioManager audioManager;
    private boolean muted = false;
    private static final int[] BEEP_STREAMS = {
        AudioManager.STREAM_MUSIC,
        AudioManager.STREAM_SYSTEM
    };
    /** Streams older builds may have left muted — recovered in load(). */
    private static final int[] RECOVER_STREAMS = {
        AudioManager.STREAM_MUSIC,
        AudioManager.STREAM_SYSTEM,
        AudioManager.STREAM_NOTIFICATION,
        AudioManager.STREAM_RING
    };

    @Override
    public void load() {
        super.load();
        // Crash-recovery: a previous session that died before stop() left its
        // muted streams muted forever. Unmute everything we ever touched.
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                for (int s : RECOVER_STREAMS) {
                    try {
                        am.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, 0);
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void muteBeep() {
        if (muted) return;
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            for (int s : BEEP_STREAMS) {
                try {
                    audioManager.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, 0);
                } catch (Exception ignored) {
                    // some streams require DND access on newer Android — skip them
                }
            }
            muted = true;
        } catch (Exception ignored) {
        }
    }

    private void unmuteBeep() {
        if (!muted || audioManager == null) {
            muted = false;
            return;
        }
        for (int s : BEEP_STREAMS) {
            try {
                audioManager.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, 0);
            } catch (Exception ignored) {
            }
        }
        muted = false;
    }

    @PluginMethod
    public void available(PluginCall call) {
        boolean ok = SpeechRecognizer.isRecognitionAvailable(getContext());
        JSObject r = new JSObject();
        r.put("available", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) {
            resolveGranted(call, true);
        } else {
            requestPermissionForAlias("mic", call, "micCallback");
        }
    }

    @PermissionCallback
    private void micCallback(PluginCall call) {
        resolveGranted(call, getPermissionState("mic") == PermissionState.GRANTED);
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        final String language = call.getString("language", "ar-SA");
        main.post(() -> {
            try {
                stopInternal();
                running = true;
                muteBeep();

                intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                // Short silence windows → fast finalize → near-seamless re-arm.
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900L);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 800L);
                applyBias();

                arm();
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    /** Update the expected-words biasing list (applies from the next re-arm). */
    @PluginMethod
    public void setBias(PluginCall call) {
        JSArray arr = call.getArray("words");
        main.post(() -> {
            biasWords.clear();
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    try {
                        String w = arr.getString(i);
                        if (w != null && !w.isEmpty()) biasWords.add(w);
                    } catch (Exception ignored) {
                    }
                }
            }
            applyBias();
            call.resolve();
        });
    }

    /** Write (or clear) the biasing extra on the live intent. API 33+ only. */
    private void applyBias() {
        if (intent == null || Build.VERSION.SDK_INT < 33) return;
        if (biasWords.isEmpty()) {
            intent.removeExtra(RecognizerIntent.EXTRA_BIASING_STRINGS);
        } else {
            intent.putExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(biasWords));
        }
    }

    /** Create a recognizer + start listening (one utterance). Re-armed on end. */
    private void arm() {
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onPartialResults(Bundle results) {
                emit(results, false);
            }

            @Override
            public void onResults(Bundle results) {
                emit(results, true);
                rearm(80);
            }

            @Override
            public void onError(int error) {
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    JSObject r = new JSObject();
                    r.put("error", "permission");
                    notifyListeners("recError", r);
                    running = false;
                    return;
                }
                // No-match / timeout / busy / client → just re-arm and keep going.
                rearm(120);
            }

            @Override
            public void onReadyForSpeech(Bundle params) {
                notifyState("ready");
            }

            @Override
            public void onBeginningOfSpeech() {
                notifyState("speech");
            }

            @Override public void onEndOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        recognizer.startListening(intent);
    }

    /** Tear down the current recognizer and re-arm after a tiny delay. */
    private void rearm(long delayMs) {
        if (!running) return;
        try {
            if (recognizer != null) {
                recognizer.destroy();
                recognizer = null;
            }
        } catch (Exception ignored) {
        }
        main.postDelayed(() -> {
            if (!running) return;
            try {
                arm();
            } catch (Exception ignored) {
            }
        }, delayMs);
    }

    private void emit(Bundle results, boolean isFinal) {
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
        JSObject r = new JSObject();
        r.put("text", text);
        r.put("isFinal", isFinal);
        notifyListeners("result", r);
    }

    private void notifyState(String status) {
        JSObject r = new JSObject();
        r.put("status", status);
        notifyListeners("state", r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            stopInternal();
            call.resolve();
        });
    }

    private void stopInternal() {
        running = false;
        if (recognizer != null) {
            try {
                recognizer.cancel();
                recognizer.destroy();
            } catch (Exception ignored) {
            }
            recognizer = null;
        }
        unmuteBeep();
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::stopInternal);
    }
}
