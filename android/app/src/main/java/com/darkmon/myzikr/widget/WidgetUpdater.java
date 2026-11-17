package com.darkmon.myzikr.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.darkmon.myzikr.MainActivity;

/** Helpers to refresh every widget and to build "open the app" PendingIntents. */
public class WidgetUpdater {

    /** Re-render all placed widgets of every type (called from MainActivity.onPause). */
    public static void updateAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        if (m == null) return;
        nudge(ctx, m, NextPrayerWidget.class);
        nudge(ctx, m, PrayerTimesWidget.class);
        nudge(ctx, m, TodayPrayersWidget.class);
        nudge(ctx, m, ProgressWidget.class);
        nudge(ctx, m, TasbeehWidget.class);
        nudge(ctx, m, TasksWidget.class);
        nudge(ctx, m, StudyWidget.class);
        nudge(ctx, m, DashboardWidget.class);
        nudge(ctx, m, CalendarWidget.class);
        nudge(ctx, m, QuranWidget.class);
        nudge(ctx, m, AdhkarWidget.class);
        nudge(ctx, m, AwradWidget.class);
    }

    static void nudge(Context ctx, AppWidgetManager m, Class<?> cls) {
        try {
            ComponentName cn = new ComponentName(ctx, cls);
            int[] ids = m.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            Intent i = new Intent(ctx, cls);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        } catch (Exception e) {
            // ignore
        }
    }

    static int immutable() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    /** A PendingIntent that launches the app's main activity. */
    static PendingIntent openApp(Context ctx, int reqCode) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) {
            i = new Intent(Intent.ACTION_MAIN);
            i.setPackage(ctx.getPackageName());
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, reqCode, i, immutable());
    }

    /**
     * Intent that opens the app on a hash route, e.g. "/study?tab=tasks". Delivered
     * as ACTION_VIEW to MainActivity → Capacitor `appUrlOpen` → main.tsx takes the
     * part after '#' and navigates there (cold and warm start).
     */
    static Intent routeIntent(Context ctx, String route) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("com.darkmon.myzikr://widget/#" + route), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return i;
    }

    static PendingIntent openRoute(Context ctx, int reqCode, String route) {
        return PendingIntent.getActivity(ctx, reqCode, routeIntent(ctx, route), immutable());
    }

    /** Re-render every widget of `cls` at `atMs` (prayer / lesson start). One pending alarm per reqCode. */
    static void scheduleRefresh(Context ctx, Class<?> cls, int reqCode, long atMs) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            int[] ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, cls));
            Intent i = new Intent(ctx, cls);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, i, immutable());
            // RTC (not _WAKEUP): never wakes the device; fires on the next screen-on if asleep.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC, atMs, pi);
            } else {
                am.setExact(AlarmManager.RTC, atMs, pi);
            }
        } catch (Exception e) {
            // best-effort (exact-alarm permission revoked, …); the 30-min update still catches up
        }
    }
}
