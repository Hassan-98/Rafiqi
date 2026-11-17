package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

import java.util.Calendar;

/**
 * «يومي» — next prayer countdown, today's progress ring, tasks done/total, and
 * shortcuts: the time-appropriate أذكار set, قيام الليل, القرآن, التسبيح.
 */
public class DashboardWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_dashboard);
        long now = System.currentTimeMillis();
        WidgetData.Theme t = d.theme;
        WidgetStyle.card(v, t, R.id.db_bg, R.id.db_ring);
        WidgetStyle.star(v, t, R.id.db_star);
        for (int tile : new int[] { R.id.db_adhkar_bg, R.id.db_qiyam_bg, R.id.db_quran_bg, R.id.db_tasbih_bg }) {
            WidgetStyle.tint(v, tile, t.chip);
        }
        WidgetStyle.textColor(v, t.text, R.id.db_pname, R.id.db_tcount, R.id.db_pct,
                R.id.db_adhkar_t, R.id.db_qiyam_t, R.id.db_quran_t, R.id.db_tasbih_t);
        WidgetStyle.textColor(v, t.muted, R.id.db_kicker, R.id.db_pat, R.id.db_tlabel);
        WidgetStyle.textColor(v, t.accent, R.id.db_countdown, R.id.db_remaining,
                R.id.db_adhkar_s, R.id.db_qiyam_s, R.id.db_quran_s, R.id.db_tasbih_s);

        // Next prayer
        if (!d.hasData || d.nextAtMs <= 0) {
            v.setTextViewText(R.id.db_pname, ctx.getString(R.string.widget_no_location));
            v.setTextViewText(R.id.db_pat, "");
            v.setViewVisibility(R.id.db_countdown, View.GONE);
            v.setViewVisibility(R.id.db_remaining, View.GONE);
        } else {
            v.setTextViewText(R.id.db_pname, d.nextName);
            v.setTextViewText(R.id.db_pat, d.clock(d.nextTime));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                v.setViewVisibility(R.id.db_remaining, View.GONE);
                v.setViewVisibility(R.id.db_countdown, View.VISIBLE);
                v.setChronometerCountDown(R.id.db_countdown, true);
                v.setChronometer(R.id.db_countdown, SystemClock.elapsedRealtime() + (d.nextAtMs - now), "%s", true);
            } else {
                v.setViewVisibility(R.id.db_countdown, View.GONE);
                v.setViewVisibility(R.id.db_remaining, View.VISIBLE);
                long min = Math.max(0, d.nextAtMs - now) / 60000;
                v.setTextViewText(R.id.db_remaining, "بعد " + WidgetData.ar(min / 60) + " س " + WidgetData.ar(min % 60) + " د");
            }
            WidgetUpdater.scheduleRefresh(ctx, DashboardWidget.class, 9501, d.nextAtMs + 2000);
        }

        // Progress ring + tasks
        double rate = Math.max(0, Math.min(1, d.progressRate));
        v.setImageViewBitmap(R.id.db_ring_img, WidgetStyle.ring(ctx, t, rate, 58));
        v.setTextViewText(R.id.db_pct, WidgetData.ar(Math.round(rate * 100)) + "٪");
        v.setTextViewText(R.id.db_tcount, WidgetData.ar(d.tasksDone) + "/" + WidgetData.ar(d.tasksTotal));

        // Time-aware adhkar (same slots as the app's pickSlot, from today's prayer times)
        String[] slot = adhkarSlot(d, now);
        v.setTextViewText(R.id.db_adhkar_s, slot[1]);

        // قيام الليل tonight
        String qiyam;
        if (d.qiyamDone) qiyam = "تمّ ✓";
        else if (d.qiyamLastThirdAt > now) qiyam = "الثلث " + d.clock(d.qiyamLastThirdAt);
        else if (d.qiyamLastThirdAt > 0 && now < d.qiyamFajrAt) qiyam = "الثلث الأخير الآن";
        else qiyam = "";
        v.setTextViewText(R.id.db_qiyam_s, qiyam);

        v.setTextViewText(R.id.db_tasbih_s, d.tasbeehName);

        v.setOnClickPendingIntent(R.id.db_prayer, WidgetUpdater.openRoute(ctx, 501, "/module/prayers"));
        v.setOnClickPendingIntent(R.id.db_tasks, WidgetUpdater.openRoute(ctx, 502, "/study?tab=tasks"));
        v.setOnClickPendingIntent(R.id.db_ringbox, WidgetUpdater.openRoute(ctx, 503, "/stats"));
        v.setOnClickPendingIntent(R.id.db_adhkar, WidgetUpdater.openRoute(ctx, 504, "/adhkar?set=" + slot[0]));
        v.setOnClickPendingIntent(R.id.db_qiyam, WidgetUpdater.openRoute(ctx, 505, "/targets?tab=qiyam"));
        v.setOnClickPendingIntent(R.id.db_quran, WidgetUpdater.openRoute(ctx, 506, "/quran"));
        v.setOnClickPendingIntent(R.id.db_tasbih, WidgetUpdater.openRoute(ctx, 507, "/tasbih"));
        m.updateAppWidget(id, v);
    }

    /**
     * {setId, label}: morning after Fajr, post-prayer from Dhuhr, evening from Asr,
     * sleep from Isha. Compared by time of day so a snapshot from yesterday still
     * picks right; falls back to 04:30/12:00/15:30/19:30 without a location.
     */
    static String[] adhkarSlot(WidgetData d, long now) {
        int fajr = 270, dhuhr = 720, asr = 930, isha = 1170;
        if (d.prayers != null && d.prayers.length == 5) {
            int f = WidgetData.minutesOf(d.prayers[0].time);
            int dh = WidgetData.minutesOf(d.prayers[1].time);
            int a = WidgetData.minutesOf(d.prayers[2].time);
            int i = WidgetData.minutesOf(d.prayers[4].time);
            if (f >= 0 && dh > f && a > dh && i > a) {
                fajr = f;
                dhuhr = dh;
                asr = a;
                isha = i;
            }
        }
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int t = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        if (t >= fajr && t < dhuhr) return new String[] { "morning", "الصباح" };
        if (t >= dhuhr && t < asr) return new String[] { "postPrayer", "بعد الصلاة" };
        if (t >= asr && t < isha) return new String[] { "evening", "المساء" };
        return new String[] { "sleep", "النوم" };
    }
}
