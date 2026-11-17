package com.darkmon.myzikr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Foreground "mediaPlayback" service that keeps the Quran / adhkar listening
 * session alive while the app is in the background or the screen is off.
 *
 * The audio itself still plays in the WebView (HTMLAudioElement) and the queue
 * logic stays in JS; this service only makes Android keep the process (and the
 * WebView renderer bound to it) running: a foreground service + a partial wake
 * lock + a Wi-Fi lock while playing, a MediaStyle notification and a framework
 * MediaSession for lock-screen / Bluetooth / headset buttons.
 *
 * NO audio focus here: the WebView requests focus itself for the <audio> it
 * plays (Chromium: full GAIN for clips of 5 s or more). A second request from
 * this service made the two fight — the WebView lost focus and paused, then the
 * service lost it back and emitted "pause": with background playback on, long
 * ayat (Husary, mujawwad reciters) stopped and wouldn't resume. Calls / other
 * media apps are handled by the WebView's own focus handling.
 * Every control is forwarded to JS as an action ("play" | "pause" | "next" |
 * "prev" | "stop") through {@link MediaPlaybackPlugin}; JS then calls update()
 * with the new state, which is the single source of truth here.
 *
 * Framework MediaSession / Notification.MediaStyle (API 21+) are used instead
 * of androidx.media so no new dependency is needed (minSdk 23).
 */
public class MediaPlaybackService extends Service {

    private static final String TAG = "MediaPlayback";
    private static final String CHANNEL_ID = "myzikr_playback";
    private static final int NOTIF_ID = 7401;
    private static final String ACTION_PREFIX = "com.darkmon.myzikr.playback.";
    /** Safety net: a leaked wake lock dies on its own; re-armed on every update. */
    private static final long LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000L;

    /** What JS last asked us to show. */
    static final class State {
        final String title;
        final String subtitle;
        final boolean playing;

        State(String title, String subtitle, boolean playing) {
            this.title = title;
            this.subtitle = subtitle;
            this.playing = playing;
        }
    }

    interface Listener {
        void onAction(String action);
    }

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    static volatile Listener listener;
    /** Main-thread only. */
    private static State state;
    private static MediaPlaybackService instance;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean noisyRegistered;
    private boolean shutDown;

    /** Headphones unplugged / Bluetooth dropped → pause instead of blaring on the speaker. */
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (state != null && state.playing) emit("pause");
        }
    };

    // ── Static API used by the plugin (any thread) ─────────────────────────

    static void show(Context ctx, State s) {
        Context app = ctx.getApplicationContext();
        MAIN.post(() -> {
            state = s;
            if (instance != null) {
                instance.apply();
                return;
            }
            try {
                ContextCompat.startForegroundService(app, new Intent(app, MediaPlaybackService.class));
            } catch (Exception e) {
                // Android 12+ refuses to start a foreground service from the
                // background; JS starts us on a user action, so this is rare.
                Log.w(TAG, "could not start playback service", e);
            }
        });
    }

    static void hide() {
        MAIN.post(() -> {
            state = null;
            if (instance != null) instance.shutdown();
            // Not created yet: onStartCommand sees state == null and shuts down.
        });
    }

    private static void emit(String action) {
        Listener l = listener;
        if (l != null) l.onAction(action);
    }

    // ── Service ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();

        session = new MediaSession(this, "myzikr");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("prev"); }
            @Override public void onStop() { emit("stop"); }
        });
        setSessionFlags(session);
        PendingIntent open = openAppIntent();
        if (open != null) session.setSessionActivity(open);
        session.setActive(true);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "myzikr:playback");
        wakeLock.setReferenceCounted(false);
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wm != null) {
            wifiLock = createWifiLock(wm);
            wifiLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action != null && action.startsWith(ACTION_PREFIX)) {
            // A notification button (the service is already in the foreground).
            String a = action.substring(ACTION_PREFIX.length());
            if ("toggle".equals(a)) a = state != null && state.playing ? "pause" : "play";
            emit(a);
            // Stop works even if the web layer can't answer any more.
            if ("stop".equals(a)) state = null;
            if (state == null) shutdown();
            return START_NOT_STICKY;
        }
        // Started via startForegroundService(): startForeground() is mandatory.
        State s = state != null ? state : new State("رَفِيقِي", "", false);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, buildNotification(s), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, buildNotification(s));
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed", e);
            shutdown();
            return START_NOT_STICKY;
        }
        if (state == null) shutdown();
        else apply();
        return START_NOT_STICKY;
    }

    /** Swiped away from recents: the WebView (and its audio) is gone too. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        state = null;
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── State → notification, session, locks ────────────────────────

    private void apply() {
        State s = state;
        if (s == null || shutDown) return;
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, s.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, s.subtitle)
                .build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
                .setState(s.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(NOTIF_ID, buildNotification(s));

        if (s.playing) {
            wakeLock.acquire(LOCK_TIMEOUT_MS);
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            if (!noisyRegistered) {
                ContextCompat.registerReceiver(this, noisyReceiver,
                        new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
                        ContextCompat.RECEIVER_NOT_EXPORTED);
                noisyRegistered = true;
            }
        } else {
            // Paused: stay in the foreground (so resuming from the notification
            // or a headset needs no new FGS start), but let the CPU/radio sleep.
            releaseLocks();
        }
    }

    /** Idempotent: removes the notification, frees everything, stops the service. */
    private void shutdown() {
        if (shutDown) return;
        shutDown = true;
        if (instance == this) instance = null;
        releaseLocks();
        session.setActive(false);
        session.release();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForegroundLegacy();
        stopSelf();
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (noisyRegistered) {
            try {
                unregisterReceiver(noisyReceiver);
            } catch (Exception ignored) {
            }
            noisyRegistered = false;
        }
    }

    // ── Notification ───────────────────────────────────────────────────────

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "التشغيل في الخلفية", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("أزرار التحكم في التلاوة والأذكار أثناء الاستماع");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification(State s) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        b.setSmallIcon(R.drawable.ic_stat_myzikr)
                .setColor(0xFF1A6B5A)
                .setContentTitle(s.title)
                .setContentText(s.subtitle)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setShowWhen(false)
                .setOngoing(true)
                .addAction(action(android.R.drawable.ic_media_previous, "السابق", "prev"))
                .addAction(s.playing
                        ? action(android.R.drawable.ic_media_pause, "إيقاف مؤقت", "toggle")
                        : action(android.R.drawable.ic_media_play, "تشغيل", "toggle"))
                .addAction(action(android.R.drawable.ic_media_next, "التالي", "next"))
                .addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "إيقاف", "stop"))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        PendingIntent open = openAppIntent();
        if (open != null) b.setContentIntent(open);
        return b.build();
    }

    private Notification.Action action(int icon, String title, String name) {
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREFIX + name);
        PendingIntent pi = PendingIntent.getService(this, name.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), title, pi).build();
    }

    private PendingIntent openAppIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) return null;
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ── Deprecated-API shims ───────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private static void setSessionFlags(MediaSession s) {
        // Always on since API 26; still needed on 23-25 for media buttons.
        s.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    }

    @SuppressWarnings("deprecation")
    private static WifiManager.WifiLock createWifiLock(WifiManager wm) {
        return wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "myzikr:playback");
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundLegacy() {
        stopForeground(true);
    }
}
