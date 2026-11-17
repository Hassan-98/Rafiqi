package com.darkmon.myzikr;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.darkmon.myzikr.widget.WidgetData;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Incoming-call-style full-screen alarm. Shows over the lock screen and turns
 * the screen on, then presents the reminder in the app's redesigned look: the
 * hero accent gradient with a faint 8-point-star watermark, a gold star
 * medallion, the time in Arabic-Indic digits, the reminder in a real app card,
 * and the hero's pill actions. Colours follow the user's palette + light/dark
 * (the theme the web app writes for the widgets — WidgetData.Theme). A single
 * gentle entrance — no looping graphics. Built in code (no layout resource).
 */
public class FullScreenAlarmActivity extends Activity {

    /** Hard safety cap so a forgotten alarm never rings/vibrates forever. */
    static final long MAX_RING_MS = 5L * 60L * 1000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Vibrator vibrator;
    private MediaPlayer player;
    private int notifId;
    private int displayId;
    private boolean use24h;
    private WidgetData.Theme theme;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show the alarm ON TOP of the (even secure) lock screen and wake the
        // screen — WITHOUT asking the user to enter their PIN. We deliberately do
        // NOT call requestDismissKeyguard / FLAG_DISMISS_KEYGUARD: those force an
        // unlock prompt. showWhenLocked alone is the incoming-call behaviour.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        theme = WidgetData.load(this).theme;
        // Opaque accent window so the launch/splash drawable can never bleed through.
        getWindow().setBackgroundDrawable(new ColorDrawable(theme.heroFrom));

        String title = getIntent().getStringExtra("title");
        String body = getIntent().getStringExtra("body");
        int duration = getIntent().getIntExtra("durationMs", 10000);
        notifId = getIntent().getIntExtra("notifId", 0);
        displayId = getIntent().getIntExtra("displayId", notifId);
        use24h = getIntent().getBooleanExtra("use24h", false);
        if (title == null) title = "تنبيه رَفِيقِي";

        // This screen owns the tone now: drop the alarm's heads-up (whose looping
        // insistent sound would otherwise ring on top of ours).
        cancelAlarmNotification();

        setContentView(buildUi(title, body));
        startVibration();
        startSound();

        // Keep ringing AND showing until the user acts (dismiss / snooze) — just
        // like a phone alarm. The sound loops, so it never cuts out after a couple
        // of seconds. `duration` is treated as a *minimum*; the cap stops a
        // forgotten alarm from draining the battery.
        long autoMs = Math.max(Math.max(2000, duration), MAX_RING_MS);
        handler.postDelayed(this::dismiss, autoMs);
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    private View buildUi(String title, String body) {
        WidgetData.Theme t = theme;
        int onAccentDim = withAlpha(t.onAccent, 0xB3);

        FrameLayout frame = new FrameLayout(this);
        frame.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        // The app's hero gradient (accent dark → accent → light, diagonal).
        frame.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[] { t.heroFrom, t.accent, t.heroTo }));

        // Faint 8-point star watermark, like the ornament on the app's hero cards.
        ImageView mark = new ImageView(this);
        mark.setImageDrawable(star(t.onAccent));
        mark.setAlpha(0.07f);
        FrameLayout.LayoutParams mlp = new FrameLayout.LayoutParams(dp(340), dp(340), Gravity.TOP | Gravity.END);
        mlp.topMargin = -dp(90);
        mlp.setMarginEnd(-dp(110));
        frame.addView(mark, mlp);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int padH = dp(26);
        root.setPadding(padH, dp(40), padH, dp(34));
        frame.addView(root, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // Gold star medallion + «رَفِيقِي · تذكير».
        FrameLayout medal = new FrameLayout(this);
        GradientDrawable medalBg = new GradientDrawable();
        medalBg.setShape(GradientDrawable.OVAL);
        medalBg.setColor(withAlpha(t.onAccent, 0x1F));
        medalBg.setStroke(dp(1), withAlpha(t.gold, 0x99));
        medal.setBackground(medalBg);
        ImageView medalStar = new ImageView(this);
        medalStar.setImageDrawable(star(t.gold));
        int ms = dp(15);
        medalStar.setPadding(ms, ms, ms, ms);
        medal.addView(medalStar, new FrameLayout.LayoutParams(dp(62), dp(62)));
        root.addView(medal, new LinearLayout.LayoutParams(dp(62), dp(62)));

        TextView kicker = new TextView(this);
        kicker.setText("رَفِيقِي · تذكير");
        kicker.setTextColor(onAccentDim);
        kicker.setTextSize(13);
        kicker.setGravity(Gravity.CENTER);
        kicker.setPadding(0, dp(12), 0, 0);
        root.addView(kicker);

        // Time — the calm focal point, Arabic-Indic like the rest of the app.
        TextView time = new TextView(this);
        time.setText(formatNow());
        time.setTextColor(t.onAccent);
        time.setTextSize(64);
        time.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        time.setGravity(Gravity.CENTER);
        time.setPadding(0, dp(14), 0, 0);
        root.addView(time);

        TextView date = new TextView(this);
        date.setText(WidgetData.ar(new SimpleDateFormat("EEEE d MMMM", new Locale("ar")).format(new Date())));
        date.setTextColor(onAccentDim);
        date.setTextSize(14);
        date.setGravity(Gravity.CENTER);
        date.setPadding(0, dp(2), 0, dp(26));
        root.addView(date);

        // The reminder in a real app card: surface, hairline ring, gold star + title, muted body.
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(t.card);
        cardBg.setStroke(dp(1), t.ring);
        cardBg.setCornerRadius(dp(22));
        card.setBackground(cardBg);
        card.setElevation(dp(6));
        card.setPadding(dp(20), dp(18), dp(20), dp(20));

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        ImageView headStar = new ImageView(this);
        headStar.setImageDrawable(star(t.gold));
        LinearLayout.LayoutParams hs = new LinearLayout.LayoutParams(dp(14), dp(14));
        hs.setMarginEnd(dp(8));
        head.addView(headStar, hs);
        TextView tv = new TextView(this);
        tv.setText(title);
        tv.setTextColor(t.text);
        tv.setTextSize(20);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        head.addView(tv, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(head);

        if (body != null && !body.trim().isEmpty()) {
            TextView bv = new TextView(this);
            bv.setText(body);
            bv.setTextColor(t.muted);
            bv.setTextSize(15);
            bv.setLineSpacing(dp(5), 1f);
            bv.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
            bv.setPadding(0, dp(10), 0, 0);
            card.addView(bv);
        }
        root.addView(card, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        // Actions: the hero's solid pill (like «تابع القراءة») + a translucent secondary.
        TextView dismiss = pill("إيقاف التنبيه", true);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        dlp.topMargin = dp(28);
        dismiss.setOnClickListener(v -> dismiss());
        root.addView(dismiss, dlp);

        TextView snooze = pill("غفوة ١٠ دقائق", false);
        LinearLayout.LayoutParams szlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        szlp.topMargin = dp(12);
        snooze.setOnClickListener(v -> snooze());
        root.addView(snooze, szlp);

        // Gentle, one-time staggered entrance (calm — nothing loops).
        riseIn(medal, 0);
        riseIn(kicker, 40);
        riseIn(time, 90);
        riseIn(date, 120);
        riseIn(card, 170);
        riseIn(dismiss, 250);
        riseIn(snooze, 300);

        return frame;
    }

    private static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (alpha << 24);
    }

    /** The app's 8-point star (res/drawable/wg_star8, shared with the widgets), tinted. */
    private Drawable star(int color) {
        Drawable d = getDrawable(R.drawable.wg_star8).mutate();
        d.setTint(color);
        return d;
    }

    private TextView pill(String text, boolean primary) {
        WidgetData.Theme t = theme;
        TextView v = new TextView(this);
        v.setText(text);
        v.setGravity(Gravity.CENTER);
        v.setTextSize(17);
        v.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(28));
        if (primary) {
            bg.setColor(t.onAccent);
            v.setTextColor(t.heroFrom);
            v.setElevation(dp(4));
        } else {
            bg.setColor(withAlpha(t.onAccent, 0x1F));
            bg.setStroke(dp(1), withAlpha(t.onAccent, 0x4D));
            v.setTextColor(t.onAccent);
        }
        v.setBackground(bg);
        return v;
    }

    private void riseIn(View v, long delay) {
        v.setTranslationY(dp(22));
        v.setAlpha(0f);
        v.animate().translationY(0f).alpha(1f)
                .setStartDelay(delay).setDuration(420)
                .setInterpolator(new DecelerateInterpolator()).start();
    }

    private String formatNow() {
        Calendar c = Calendar.getInstance();
        int h = c.get(Calendar.HOUR_OF_DAY);
        int m = c.get(Calendar.MINUTE);
        if (use24h) return WidgetData.ar(String.format(Locale.US, "%02d:%02d", h, m));
        int h12 = ((h + 11) % 12) + 1;
        return WidgetData.ar(String.format(Locale.US, "%d:%02d %s", h12, m, h < 12 ? "ص" : "م"));
    }

    /** Re-fire this alarm 10 minutes from now (own snooze identity — the daily alarm stays), then close. */
    private void snooze() {
        FullScreenAlarmReceiver.snooze(this, FullScreenAlarmStore.Spec.fromIntent(getIntent().putExtra("id", notifId)));
        Toast.makeText(this, "تم التأجيل ١٠ دقائق", Toast.LENGTH_SHORT).show();
        dismiss();
    }

    private void cancelAlarmNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(FullScreenAlarmReceiver.TAG, displayId);
        } catch (Exception ignored) {
        }
    }

    // ── Sound + vibration + lifecycle ─────────────────────────────────────────
    /**
     * Play the reminder's OWN ringtone, looping on the ALARM stream so it keeps
     * sounding until the user dismisses/snoozes — audible even in silent / DND.
     *
     * The `sound` extra carries the user's per-reminder choice:
     *   - "raw:<name>"      → the preset from res/raw (adhan, azkar, …)
     *   - "channel:<id>"    → a user-picked custom file (read back from the
     *                         notification channel CustomSoundPlugin created)
     *   - "silent"          → vibration only
     *   - "" / absent       → device default alarm tone (legacy behaviour)
     *
     * Playback failures FALL BACK (chosen → bundled azkar tone → device
     * default) instead of going silent: a custom file's content:// grant can
     * expire after reboot/uninstall of the picker source, and a half-broken
     * spec used to mean either silence or a surprise system ringtone.
     */
    private void startSound() {
        String sound = getIntent().getStringExtra("sound");
        if ("silent".equals(sound)) return;

        Uri chosen = resolveSoundUri(sound);
        if (chosen != null && tryPlay(chosen)) return;
        Uri bundled = resolveSoundUri("raw:azkar");
        if (bundled != null && tryPlay(bundled)) return;
        Uri def = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (def == null) def = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (def == null) def = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (def != null) tryPlay(def);
    }

    /** Start looping playback of `uri` on the alarm stream; false on failure. */
    private boolean tryPlay(Uri uri) {
        try {
            MediaPlayer p = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                p.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            } else {
                p.setAudioStreamType(AudioManager.STREAM_ALARM);
            }
            p.setDataSource(this, uri);
            p.setLooping(true);
            p.setOnPreparedListener(MediaPlayer::start);
            p.prepareAsync();
            player = p;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Resolve a sound spec to a playable Uri, or null for the default chain. */
    private Uri resolveSoundUri(String sound) {
        if (sound == null || sound.isEmpty()) return null;
        try {
            if (sound.startsWith("raw:")) {
                String name = sound.substring(4);
                int resId = getResources().getIdentifier(name, "raw", getPackageName());
                if (resId != 0) {
                    return Uri.parse("android.resource://" + getPackageName() + "/" + resId);
                }
                return null;
            }
            if (sound.startsWith("channel:") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return null;
                android.app.NotificationChannel ch = nm.getNotificationChannel(sound.substring(8));
                return ch != null ? ch.getSound() : null;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private void stopSound() {
        if (player != null) {
            try {
                if (player.isPlaying()) player.stop();
            } catch (Exception ignored) {
            }
            try {
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
    }

    private void startVibration() {
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null) return;
            long[] pattern = { 0, 400, 600, 400, 600, 400 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
        }
    }

    private void dismiss() {
        stopSound();
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {
            }
        }
        handler.removeCallbacksAndMessages(null);
        cancelAlarmNotification();
        finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopSound();
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {
            }
        }
        handler.removeCallbacksAndMessages(null);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
