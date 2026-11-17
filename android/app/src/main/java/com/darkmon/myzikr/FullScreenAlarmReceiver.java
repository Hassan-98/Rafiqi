package com.darkmon.myzikr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;

/**
 * Fired by AlarmManager at a reminder's time. Raises a high-priority alarm
 * notification whose full-screen intent launches {@link FullScreenAlarmActivity}
 * (over the lock screen, like an incoming call).
 *
 * Android only launches a full-screen intent when the screen is off/locked (and,
 * on 14+, when the user allows it). Otherwise it shows a heads-up instead — and
 * that heads-up used to be SILENT (the looping tone lives in the activity), so a
 * user who had the phone in hand at prayer time heard nothing. In that case the
 * notification now rides the reminder's own sound channel with FLAG_INSISTENT
 * (loops until stopped, capped), with «إيقاف» / «غفوة» buttons.
 *
 * The notification is posted under {@link #TAG}: it used to share the plain id
 * of the regular Capacitor notification and randomly replaced it.
 */
public class FullScreenAlarmReceiver extends BroadcastReceiver {

    public static final String ACTION = "com.darkmon.myzikr.FULLSCREEN_ALARM";
    static final String ACTION_STOP = "com.darkmon.myzikr.FULLSCREEN_ALARM_STOP";
    static final String ACTION_SNOOZE = "com.darkmon.myzikr.FULLSCREEN_ALARM_SNOOZE";
    static final String TAG = "myzikr_fsalarm";
    // v2: SILENT channel — the looping tone is owned by FullScreenAlarmActivity.
    static final String CHANNEL_ID = "fullscreen_alarm_v2";
    static final long SNOOZE_MS = 10L * 60L * 1000L;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        FullScreenAlarmStore.Spec spec = FullScreenAlarmStore.Spec.fromIntent(intent);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);

        if (ACTION_STOP.equals(action)) {
            if (nm != null) nm.cancel(TAG, spec.shadeId());
            return;
        }
        if (ACTION_SNOOZE.equals(action)) {
            if (nm != null) nm.cancel(TAG, spec.shadeId());
            snooze(ctx, spec);
            return;
        }

        // Book-keeping first, so a crash while posting can't lose tomorrow's alarm.
        if (spec.repeatDaily && spec.hour >= 0) {
            spec.at = FullScreenAlarmStore.nextDaily(spec.hour, spec.minute);
            try {
                FullScreenAlarmStore.arm(ctx, spec);
                FullScreenAlarmStore.put(ctx, spec);
            } catch (Exception ignored) {
            }
        } else {
            FullScreenAlarmStore.remove(ctx, spec.key);
        }

        // Briefly hold a wakelock so the screen can come on.
        boolean interactive = false;
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                interactive = pm.isInteractive();
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "myzikr:fsalarm");
                wl.acquire(15000);
            }
        } catch (Exception ignored) {
        }

        ensureChannel(ctx);
        if (nm == null) return;

        boolean canFullScreen = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
        // Heads-up instead of the alarm screen → the notification must ring itself.
        String channel = CHANNEL_ID;
        boolean ringHere = false;
        if ((interactive || !canFullScreen) && hasUsableChannel(nm, spec.channelId)) {
            channel = spec.channelId;
            ringHere = true;
        }

        Intent act = new Intent(ctx, FullScreenAlarmActivity.class);
        act.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        act.putExtra("title", spec.title);
        act.putExtra("body", spec.body);
        act.putExtra("durationMs", spec.durationMs);
        act.putExtra("notifId", spec.id);
        act.putExtra("displayId", spec.shadeId());
        act.putExtra("use24h", spec.use24h);
        act.putExtra("sound", spec.sound);
        act.putExtra("channelId", spec.channelId);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullScreenPI = PendingIntent.getActivity(ctx, spec.id, act, piFlags);

        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) launch = new Intent(ctx, MainActivity.class);
        PendingIntent openApp = PendingIntent.getActivity(ctx, spec.id, launch, piFlags);

        int iconRes = ctx.getResources().getIdentifier("ic_stat_myzikr", "drawable", ctx.getPackageName());
        if (iconRes == 0) iconRes = ctx.getApplicationInfo().icon;

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, channel)
                : new Notification.Builder(ctx);
        b.setSmallIcon(iconRes)
                .setContentTitle(spec.title)
                .setContentText(spec.body)
                .setAutoCancel(true)
                .setOngoing(!ringHere)
                .setContentIntent(openApp)
                .setFullScreenIntent(fullScreenPI, true)
                .addAction(0, "غفوة ١٠ دقائق", actionIntent(ctx, spec, ACTION_SNOOZE))
                .addAction(0, "إيقاف", actionIntent(ctx, spec, ACTION_STOP));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(FullScreenAlarmActivity.MAX_RING_MS);
        b.setCategory(Notification.CATEGORY_ALARM);
        b.setPriority(Notification.PRIORITY_MAX);
        b.setVisibility(Notification.VISIBILITY_PUBLIC);

        Notification n = b.build();
        if (ringHere) n.flags |= Notification.FLAG_INSISTENT;
        // One heads-up per SERIES: replace the previous fire (cancel first so it alerts again).
        nm.cancel(TAG, spec.shadeId());
        nm.notify(TAG, spec.shadeId(), n);

        // Also try to launch directly — works while the app is in the foreground.
        // The activity cancels the tagged notification (stops the insistent loop)
        // and plays the tone itself, so the two never ring together.
        try {
            ctx.startActivity(act);
        } catch (Exception ignored) {
        }
    }

    private static boolean hasUsableChannel(NotificationManager nm, String id) {
        if (id == null || id.isEmpty() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        NotificationChannel ch = nm.getNotificationChannel(id);
        return ch != null && ch.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT;
    }

    private static PendingIntent actionIntent(Context ctx, FullScreenAlarmStore.Spec spec, String action) {
        Intent i = new Intent(ctx, FullScreenAlarmReceiver.class);
        i.setAction(action);
        i.setData(Uri.parse("myzikr-fs://" + action + "/" + spec.id));
        spec.putExtras(i);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, spec.id, i, flags);
    }

    /** Re-fire as a ONE-SHOT under the snooze identity — the daily alarm stays intact. */
    static void snooze(Context ctx, FullScreenAlarmStore.Spec from) {
        FullScreenAlarmStore.Spec s = new FullScreenAlarmStore.Spec();
        s.key = "s" + from.id;
        s.id = from.id;
        s.at = System.currentTimeMillis() + SNOOZE_MS;
        s.title = from.title;
        s.body = from.body;
        s.durationMs = from.durationMs;
        s.repeatDaily = false;
        s.use24h = from.use24h;
        s.sound = from.sound;
        s.channelId = from.channelId;
        s.displayId = from.displayId;
        try {
            FullScreenAlarmStore.arm(ctx, s);
            FullScreenAlarmStore.put(ctx, s);
        } catch (Exception ignored) {
        }
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "تنبيه ملء الشاشة", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("تنبيه يملأ الشاشة عند حلول وقت التذكير");
        // SILENT channel: the looping alarm tone + vibration are played by the
        // full-screen activity itself.
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
