package com.darkmon.myzikr;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Map;

/**
 * Persistence + arming for full-screen alarms.
 *
 * AlarmManager forgets every alarm on reboot, and nothing re-armed these, so a
 * full-screen adhan/reminder silently died after the first restart. Every armed
 * alarm is now stored here and {@link AlarmRestoreReceiver} re-arms them after
 * boot, app update, clock/timezone change and exact-alarm permission changes.
 *
 * Daily alarms keep their WALL-CLOCK time (hour:minute). The old
 * `at += 24h` re-arm drifted one hour at every DST switch.
 */
final class FullScreenAlarmStore {

    private static final String PREFS = "myzikr_fsalarms";
    /** A one-shot missed while the phone was off still fires if it is at most this late. */
    static final long GRACE_MS = 10L * 60L * 1000L;

    private FullScreenAlarmStore() {}

    /** Everything needed to (re)build the alarm intent. */
    static final class Spec {
        String key; // "a<id>" = the reminder itself, "s<id>" = its snooze
        int id;
        long at;
        String title = "تنبيه رَفِيقِي";
        String body = "";
        int durationMs = 10000;
        boolean repeatDaily;
        int hour = -1;
        int minute = -1;
        boolean use24h;
        String sound = "";
        String channelId = "";
        /** Shade slot shared by the reminder's series (-1 = use `id`). */
        int displayId = -1;

        int shadeId() {
            return displayId >= 0 ? displayId : id;
        }

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("key", key).put("id", id).put("at", at).put("title", title).put("body", body)
                        .put("durationMs", durationMs).put("repeatDaily", repeatDaily)
                        .put("hour", hour).put("minute", minute).put("use24h", use24h)
                        .put("sound", sound).put("channelId", channelId).put("displayId", displayId);
            } catch (Exception ignored) {
            }
            return o;
        }

        static Spec fromJson(String raw) {
            try {
                JSONObject o = new JSONObject(raw);
                Spec s = new Spec();
                s.key = o.optString("key");
                s.id = o.optInt("id");
                s.at = o.optLong("at");
                s.title = o.optString("title", s.title);
                s.body = o.optString("body", "");
                s.durationMs = o.optInt("durationMs", 10000);
                s.repeatDaily = o.optBoolean("repeatDaily", false);
                s.hour = o.optInt("hour", -1);
                s.minute = o.optInt("minute", -1);
                s.use24h = o.optBoolean("use24h", false);
                s.sound = o.optString("sound", "");
                s.channelId = o.optString("channelId", "");
                s.displayId = o.optInt("displayId", -1);
                return s.key.isEmpty() ? null : s;
            } catch (Exception e) {
                return null;
            }
        }

        void putExtras(Intent i) {
            i.putExtra("key", key);
            i.putExtra("id", id);
            i.putExtra("title", title);
            i.putExtra("body", body);
            i.putExtra("durationMs", durationMs);
            i.putExtra("atMillis", at);
            i.putExtra("repeatDaily", repeatDaily);
            i.putExtra("hour", hour);
            i.putExtra("minute", minute);
            i.putExtra("use24h", use24h);
            i.putExtra("sound", sound);
            i.putExtra("channelId", channelId);
            i.putExtra("displayId", displayId);
        }

        static Spec fromIntent(Intent i) {
            Spec s = new Spec();
            s.id = i.getIntExtra("id", 0);
            s.key = i.getStringExtra("key");
            if (s.key == null) s.key = "a" + s.id; // armed by an older build
            s.at = i.getLongExtra("atMillis", System.currentTimeMillis());
            String t = i.getStringExtra("title");
            if (t != null) s.title = t;
            String b = i.getStringExtra("body");
            s.body = b == null ? "" : b;
            s.durationMs = i.getIntExtra("durationMs", 10000);
            s.repeatDaily = i.getBooleanExtra("repeatDaily", false);
            s.hour = i.getIntExtra("hour", -1);
            s.minute = i.getIntExtra("minute", -1);
            s.use24h = i.getBooleanExtra("use24h", false);
            String snd = i.getStringExtra("sound");
            s.sound = snd == null ? "" : snd;
            String ch = i.getStringExtra("channelId");
            s.channelId = ch == null ? "" : ch;
            s.displayId = i.getIntExtra("displayId", -1);
            if (s.repeatDaily && s.hour < 0) s.setWallTimeFrom(s.at);
            return s;
        }

        void setWallTimeFrom(long millis) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(millis);
            hour = c.get(Calendar.HOUR_OF_DAY);
            minute = c.get(Calendar.MINUTE);
        }
    }

    /** Next occurrence of hour:minute (local wall clock) strictly after now + 1s. */
    static long nextDaily(int hour, int minute) {
        long now = System.currentTimeMillis();
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        while (c.getTimeInMillis() <= now + 1000) c.add(Calendar.DAY_OF_YEAR, 1);
        return c.getTimeInMillis();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void put(Context ctx, Spec s) {
        prefs(ctx).edit().putString(s.key, s.toJson().toString()).apply();
    }

    static void remove(Context ctx, String key) {
        prefs(ctx).edit().remove(key).apply();
    }

    private static int piFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    /**
     * The alarm's PendingIntent. The data URI gives the reminder and its snooze
     * DIFFERENT identities: they used to share one, so snoozing a daily alarm
     * overwrote tomorrow's occurrence and the daily alarm was gone for good.
     */
    static PendingIntent operation(Context ctx, Spec s, boolean noCreate) {
        Intent i = new Intent(ctx, FullScreenAlarmReceiver.class);
        i.setAction(FullScreenAlarmReceiver.ACTION);
        i.setData(Uri.parse("myzikr-fs://" + s.key));
        s.putExtras(i);
        int flags = noCreate ? PendingIntent.FLAG_NO_CREATE : piFlags();
        if (noCreate && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, s.id, i, flags);
    }

    /** Arm with setAlarmClock (exact, Doze-proof). Throws SecurityException without exact-alarm access. */
    static void arm(Context ctx, Spec s) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) throw new IllegalStateException("AlarmManager unavailable");
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) launch = new Intent(ctx, MainActivity.class);
        PendingIntent show = PendingIntent.getActivity(ctx, s.id, launch, piFlags());
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(s.at, show), operation(ctx, s, false));
    }

    /** Cancel both identities of `id` (+ the pre-data-URI identity older builds used). */
    static void cancel(Context ctx, int id) {
        cancel(ctx, id, true);
    }

    /**
     * @param withSnooze false when merely RE-arming the reminder (every app
     *                   resume does that) — a pending snooze must survive it.
     */
    static void cancel(Context ctx, int id, boolean withSnooze) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (String prefix : withSnooze ? new String[] { "a", "s" } : new String[] { "a" }) {
            Spec s = new Spec();
            s.key = prefix + id;
            s.id = id;
            PendingIntent op = operation(ctx, s, true);
            if (op != null) {
                if (am != null) am.cancel(op);
                op.cancel();
            }
            remove(ctx, s.key);
        }
        Intent legacy = new Intent(ctx, FullScreenAlarmReceiver.class);
        legacy.setAction(FullScreenAlarmReceiver.ACTION);
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent op = PendingIntent.getBroadcast(ctx, id, legacy, flags);
        if (op != null) {
            if (am != null) am.cancel(op);
            op.cancel();
        }
    }

    /** Re-arm every stored alarm (after boot / update / clock change). Past one-shots are dropped. */
    static void rearmAll(Context ctx) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> e : prefs(ctx).getAll().entrySet()) {
            if (!(e.getValue() instanceof String)) continue;
            Spec s = Spec.fromJson((String) e.getValue());
            if (s == null) {
                remove(ctx, e.getKey());
                continue;
            }
            if (s.repeatDaily && s.hour >= 0) {
                s.at = nextDaily(s.hour, s.minute);
            } else if (s.at <= now) {
                if (now - s.at > GRACE_MS) {
                    remove(ctx, s.key);
                    continue;
                }
                s.at = now + 5000; // missed by a few minutes while off — still worth ringing
            }
            try {
                arm(ctx, s);
                put(ctx, s);
            } catch (Exception ignored) {
                // No exact-alarm access right now; JS re-arms on the next app open.
            }
        }
    }
}
