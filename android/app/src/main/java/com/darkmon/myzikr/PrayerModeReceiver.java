package com.darkmon.myzikr;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.Toast;

import com.darkmon.myzikr.widget.WidgetData;
import com.darkmon.myzikr.widget.WidgetUpdater;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/**
 * «وضع الصلاة»: silences the phone for each prayer window, then puts it back.
 *
 * The web layer (prayerMode.ts) sends a plan of windows; it is kept in
 * SharedPreferences so all of this runs with the app closed:
 *  - START (exact, allow-while-idle): save the current interruption filter, set
 *    ALARMS («صامت تماماً») or PRIORITY («الأولوية فقط»), arm END and show an
 *    ongoing «وضع الصلاة مفعّل حتى …» notification with «إنهاء الآن».
 *  - END (setAlarmClock: exact and Doze-proof, so the phone is never left
 *    silent): restore, then optionally ask «هل صلّيت …؟» with «صلّيت» and, for
 *    men, «في المسجد». Those taps are queued for the app (widget protocol
 *    «prayer.toggle» + our «في المسجد» queue), no app launch needed.
 *
 * Restore rules: only a filter WE changed is restored, and only if it is still
 * the one we set (a user who changed it mid-window keeps theirs). A phone that
 * was already as quiet (the user's own DND) is left alone. A window whose END
 * was missed (force-stop, phone off) is restored by {@link #rearm} on boot, on
 * every plan update (app start) and when the feature is switched off.
 */
public class PrayerModeReceiver extends BroadcastReceiver {

    static final String ACTION_START = "com.darkmon.myzikr.PRAYER_MODE_START";
    static final String ACTION_END = "com.darkmon.myzikr.PRAYER_MODE_END";
    static final String ACTION_PRAYED = "com.darkmon.myzikr.PRAYER_MODE_PRAYED";
    static final String ACTION_MOSQUE = "com.darkmon.myzikr.PRAYER_MODE_MOSQUE";

    private static final String PREFS = "myzikr_prayermode";
    private static final String KEY_PLAN = "plan";
    private static final String KEY_ACTIVE = "active";
    private static final String TAG = "myzikr_prayermode";
    private static final int ID_ONGOING = 7300;
    private static final int RC_START = 7301;
    private static final int RC_END = 7302;
    private static final int RC_END_NOW = 7303;
    private static final int ID_ASK = 7310; // + prayer index
    private static final String CH_ONGOING = "prayer_mode";
    private static final String CH_ASK = "prayer_mode_ask";
    private static final String[] PRAYERS = { "fajr", "dhuhr", "asr", "maghrib", "isha" };
    /** Capacitor Preferences' file: the widget action queue + our «في المسجد» queue (drained by prayerMode.ts). */
    private static final String CAP_PREFS = "CapacitorStorage";
    private static final String WIDGET_QUEUE = "widget_pending_actions";
    private static final String MOSQUE_QUEUE = "prayermode_pending";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (ACTION_START.equals(a)) {
            startDue(ctx);
            rearm(ctx);
        } else if (ACTION_END.equals(a)) {
            end(ctx, true);
            rearm(ctx);
        } else if (ACTION_PRAYED.equals(a) || ACTION_MOSQUE.equals(a)) {
            logPrayer(ctx, intent, ACTION_MOSQUE.equals(a));
        }
    }

    // ── plan ───────────────────────────────────────────────────────────────

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject read(Context ctx, String key) {
        try {
            String raw = prefs(ctx).getString(key, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject getActive(Context ctx) {
        return read(ctx, KEY_ACTIVE);
    }

    /** New plan from the app: enabled:false restores the phone and cancels everything. */
    static void setPlan(Context ctx, String json) {
        prefs(ctx).edit().putString(KEY_PLAN, json).commit();
        JSONObject plan = read(ctx, KEY_PLAN);
        if (plan == null || !plan.optBoolean("enabled")) end(ctx, false);
        rearm(ctx);
    }

    /**
     * Safety + scheduling, called on every plan update, boot, clock change and
     * after each START/END: restore a window whose END was missed, keep a
     * running one's END armed, and arm the next START.
     */
    static void rearm(Context ctx) {
        long now = System.currentTimeMillis();
        JSONObject act = getActive(ctx);
        if (act != null) {
            long end = act.optLong("end");
            if (end <= now || !armEnd(ctx, end)) end(ctx, false);
            else postOngoing(ctx, act);
        }
        cancel(ctx, RC_START, ACTION_START);
        JSONObject plan = read(ctx, KEY_PLAN);
        if (plan == null || !plan.optBoolean("enabled")) return;
        JSONArray ws = plan.optJSONArray("windows");
        if (ws == null) return;
        long next = Long.MAX_VALUE;
        for (int i = 0; i < ws.length(); i++) {
            JSONObject w = ws.optJSONObject(i);
            if (w != null && w.optLong("start") > now) next = Math.min(next, w.optLong("start"));
        }
        if (next == Long.MAX_VALUE) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || !canExact(am)) return;
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, broadcast(ctx, RC_START, ACTION_START));
        } catch (SecurityException ignored) {
            // exact alarms revoked — the page shows the permission row
        }
    }

    /** The window that has just started (latest start ≤ now that isn't over). */
    private static void startDue(Context ctx) {
        JSONObject plan = read(ctx, KEY_PLAN);
        if (plan == null || !plan.optBoolean("enabled")) return;
        JSONArray ws = plan.optJSONArray("windows");
        if (ws == null) return;
        long now = System.currentTimeMillis();
        JSONObject due = null;
        for (int i = 0; i < ws.length(); i++) {
            JSONObject w = ws.optJSONObject(i);
            if (w != null && w.optLong("start") <= now && w.optLong("end") > now) due = w;
        }
        if (due != null) begin(ctx, due, plan);
    }

    // ── silence / restore ──────────────────────────────────────────────────

    /** How quiet a filter is: ALL/UNKNOWN < PRIORITY < ALARMS < NONE. */
    private static int rank(int f) {
        switch (f) {
            case NotificationManager.INTERRUPTION_FILTER_PRIORITY: return 1;
            case NotificationManager.INTERRUPTION_FILTER_ALARMS: return 2;
            case NotificationManager.INTERRUPTION_FILTER_NONE: return 3;
            default: return 0;
        }
    }

    /**
     * Start a window. @return null, or why not: no_policy_access / no_exact_alarm.
     * `opts` carries silence / ask / male / use24h (the plan, or the test's call).
     */
    static String begin(Context ctx, JSONObject w, JSONObject opts) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.isNotificationPolicyAccessGranted()) return "no_policy_access";
        long end = w.optLong("end");
        JSONObject running = getActive(ctx);
        if (running != null) {
            if (running.optLong("end") == end) return null; // same window, already on
            end(ctx, false); // e.g. the test still running — put the phone back first so `prev` is the user's own
        }
        // Never silence without a guaranteed restore.
        if (!armEnd(ctx, end)) return "no_exact_alarm";

        int prev = nm.getCurrentInterruptionFilter();
        int target = "priority".equals(opts.optString("silence"))
                ? NotificationManager.INTERRUPTION_FILTER_PRIORITY
                : NotificationManager.INTERRUPTION_FILTER_ALARMS;
        // Already at least this quiet (the user's own DND): leave it, and leave it at the end.
        boolean touched = rank(prev) < rank(target);
        JSONObject act = new JSONObject();
        try {
            act.put("end", end)
                    .put("label", w.optString("label"))
                    .put("prayers", w.optJSONArray("prayers") == null ? new JSONArray() : w.optJSONArray("prayers"))
                    .put("prev", prev)
                    .put("target", target)
                    .put("touched", touched)
                    .put("ask", opts.optBoolean("ask"))
                    .put("male", opts.optBoolean("male"))
                    .put("use24h", opts.optBoolean("use24h"));
        } catch (Exception ignored) {
        }
        // Saved BEFORE silencing, so a crash in between still gets restored by rearm().
        prefs(ctx).edit().putString(KEY_ACTIVE, act.toString()).commit();
        if (touched) {
            try {
                nm.setInterruptionFilter(target);
            } catch (Exception ignored) {
                // access revoked a moment ago — the restore check (current == target) then skips
            }
        }
        postOngoing(ctx, act);
        return null;
    }

    /** End the running window (if any): restore, clear, optionally ask «هل صلّيت …؟». */
    static void end(Context ctx, boolean ask) {
        cancel(ctx, RC_END, ACTION_END);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(TAG, ID_ONGOING);
        JSONObject act = getActive(ctx);
        if (act == null) return;
        if (act.optBoolean("touched") && nm != null) {
            try {
                // Only undo OUR change: a filter the user moved mid-window is theirs to keep.
                if (nm.getCurrentInterruptionFilter() == act.optInt("target")) {
                    nm.setInterruptionFilter(restoreTo(ctx, act.optInt("prev")));
                }
            } catch (Exception ignored) {
            }
        }
        prefs(ctx).edit().remove(KEY_ACTIVE).commit();
        if (ask && act.optBoolean("ask")) postAsks(ctx, act);
    }

    /**
     * Apps targeting API 36+ get an implicit per-app DND rule (Android modes):
     * ALL just switches OUR rule off and leaves the user's own modes untouched,
     * while re-setting `prev` would keep our rule on. Before that the filter is
     * global, so it is put back exactly as it was.
     */
    private static int restoreTo(Context ctx, int prev) {
        if (Build.VERSION.SDK_INT >= 35 && ctx.getApplicationInfo().targetSdkVersion > 35) {
            return NotificationManager.INTERRUPTION_FILTER_ALL;
        }
        return prev == NotificationManager.INTERRUPTION_FILTER_UNKNOWN ? NotificationManager.INTERRUPTION_FILTER_ALL : prev;
    }

    // ── alarms ─────────────────────────────────────────────────────────────

    private static boolean canExact(AlarmManager am) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
    }

    private static int piFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private static PendingIntent broadcast(Context ctx, int rc, String action) {
        Intent i = new Intent(ctx, PrayerModeReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, rc, i, piFlags());
    }

    /** END rides setAlarmClock: exact, Doze-proof, no allow-while-idle quota. */
    private static boolean armEnd(Context ctx, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || !canExact(am)) return false;
        try {
            PendingIntent show = PendingIntent.getActivity(ctx, RC_END, route(ctx, "/prayer-mode"), piFlags());
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), broadcast(ctx, RC_END, ACTION_END));
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    private static void cancel(Context ctx, int rc, String action) {
        Intent i = new Intent(ctx, PrayerModeReceiver.class).setAction(action);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, rc, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi == null) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pi);
        pi.cancel();
    }

    // ── notifications ──────────────────────────────────────────────────────

    /** Opens the app on a hash route (Capacitor appUrlOpen → main.tsx navigates). */
    private static Intent route(Context ctx, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("com.darkmon.myzikr://prayer-mode/#" + path), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return i;
    }

    private static Notification.Builder builder(Context ctx, NotificationManager nm, String channel) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channel) == null) {
            boolean ongoing = CH_ONGOING.equals(channel);
            NotificationChannel ch = new NotificationChannel(channel,
                    ongoing ? "وضع الصلاة" : "هل صلّيت؟ (وضع الصلاة)",
                    ongoing ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(ongoing ? "يظهر ما دام الهاتف صامتاً للصلاة" : "سؤال بعد الصلاة لتسجيلها بلمسة");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int icon = ctx.getResources().getIdentifier("ic_stat_myzikr", "drawable", ctx.getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, channel)
                : new Notification.Builder(ctx);
        return b.setSmallIcon(icon != 0 ? icon : ctx.getApplicationInfo().icon).setColor(0xFF1A6B5A);
    }

    private static String clock(long ms, boolean use24h) {
        String s = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US).format(new Date(ms));
        StringBuilder out = new StringBuilder();
        for (char c : s.toCharArray()) out.append(c >= '0' && c <= '9' ? (char) ('٠' + (c - '0')) : c);
        return out.toString();
    }

    private static void postOngoing(Context ctx, JSONObject act) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        JSONArray ps = act.optJSONArray("prayers");
        boolean test = ps == null || ps.length() == 0;
        Notification.Builder b = builder(ctx, nm, CH_ONGOING)
                .setContentTitle("وضع الصلاة مفعّل حتى " + clock(act.optLong("end"), act.optBoolean("use24h")))
                .setContentText(test ? "تجربة لدقيقة — يعود الصوت وحده" : "صلاة " + act.optString("label") + " — يعود الصوت وحده بعدها")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_STATUS)
                .setContentIntent(PendingIntent.getActivity(ctx, ID_ONGOING, route(ctx, "/prayer-mode"), piFlags()))
                .addAction(0, "إنهاء الآن", broadcast(ctx, RC_END_NOW, ACTION_END));
        nm.notify(TAG, ID_ONGOING, b.build());
    }

    private static void postAsks(Context ctx, JSONObject act) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        JSONArray ps = act.optJSONArray("prayers");
        if (nm == null || ps == null) return;
        for (int i = 0; i < ps.length(); i++) {
            JSONObject p = ps.optJSONObject(i);
            if (p == null) continue;
            String prayer = p.optString("prayer");
            String date = p.optString("dateKey");
            int idx = Arrays.asList(PRAYERS).indexOf(prayer);
            if (idx < 0 || alreadyLogged(ctx, prayer, date)) continue;
            int id = ID_ASK + idx;
            Notification.Builder b = builder(ctx, nm, CH_ASK)
                    .setContentTitle("هل صلّيت " + p.optString("name") + "؟")
                    .setContentText("سجّلها في يومك بلمسة")
                    .setAutoCancel(true)
                    .setContentIntent(PendingIntent.getActivity(ctx, id, route(ctx, "/module/prayers"), piFlags()))
                    .addAction(0, "صلّيت", logIntent(ctx, ACTION_PRAYED, id, prayer, date));
            if (act.optBoolean("male")) b.addAction(0, "في المسجد", logIntent(ctx, ACTION_MOSQUE, id, prayer, date));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(4L * 60L * 60L * 1000L);
            nm.notify(TAG, id, b.build());
        }
    }

    private static PendingIntent logIntent(Context ctx, String action, int notifId, String prayer, String date) {
        Intent i = new Intent(ctx, PrayerModeReceiver.class)
                .setAction(action)
                .setData(Uri.parse("myzikr-pm://" + action + "/" + notifId))
                .putExtra("notifId", notifId)
                .putExtra("prayer", prayer)
                .putExtra("date", date);
        return PendingIntent.getBroadcast(ctx, notifId, i, piFlags());
    }

    /** Already logged in the app? (the widget snapshot's `prayerLog`, written by widgetBridge.ts). */
    private static boolean alreadyLogged(Context ctx, String prayer, String date) {
        try {
            JSONObject snap = new JSONObject(ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).getString("widget_snapshot", "{}"));
            JSONObject log = snap.optJSONObject("prayerLog");
            if (log == null || !date.equals(log.optString("key"))) return false;
            JSONArray fard = log.optJSONArray("fard");
            for (int i = 0; fard != null && i < fard.length(); i++) if (prayer.equals(fard.optString(i))) return true;
        } catch (Exception ignored) {
        }
        return false;
    }

    // ── «صلّيت» / «في المسجد» ──────────────────────────────────────────────

    private static void logPrayer(Context ctx, Intent intent, boolean mosque) {
        String prayer = intent.getStringExtra("prayer");
        String date = intent.getStringExtra("date");
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(TAG, intent.getIntExtra("notifId", 0));
        if (prayer == null || date == null) return;
        SharedPreferences sp = ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
        // Same lock + protocol as the widgets' queue (widgetBridge.ts «prayer.toggle»): the app
        // applies it on its next start/resume, and the widgets overlay it right away.
        synchronized (WidgetData.class) {
            try {
                JSONObject a = new JSONObject()
                        .put("type", "prayer.toggle")
                        .put("id", prayer)
                        .put("at", System.currentTimeMillis())
                        .put("done", true)
                        .put("date", date);
                append(sp, WIDGET_QUEUE, a);
                if (mosque) append(sp, MOSQUE_QUEUE, new JSONObject().put("prayer", prayer).put("date", date));
            } catch (Exception ignored) {
                return;
            }
        }
        try {
            WidgetUpdater.updateAll(ctx);
        } catch (Exception ignored) {
        }
        Toast.makeText(ctx, "تقبّل الله", Toast.LENGTH_SHORT).show();
    }

    private static void append(SharedPreferences sp, String key, JSONObject item) {
        JSONArray arr;
        try {
            arr = new JSONArray(sp.getString(key, "[]"));
        } catch (Exception e) {
            arr = new JSONArray();
        }
        arr.put(item);
        sp.edit().putString(key, arr.toString()).commit();
    }
}
