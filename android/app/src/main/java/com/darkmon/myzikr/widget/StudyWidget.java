package com.darkmon.myzikr.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

import java.util.Calendar;

/**
 * «الدرس القادم» — the live / next study session: title, platform · time, a live
 * countdown when it's within 24h, and «افتح الرابط» straight into Telegram /
 * WhatsApp / YouTube / the browser. The body opens the circle in the app.
 */
public class StudyWidget extends AppWidgetProvider {

    private static final long DAY = 24L * 60 * 60 * 1000;
    private static final String[] WEEKDAY = { "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت" };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_study);
        long now = System.currentTimeMillis();
        WidgetData.Theme t = d.theme;
        WidgetStyle.card(v, t, R.id.st_bg, R.id.st_ring);
        WidgetStyle.tint(v, R.id.st_chip, t.chip);
        WidgetStyle.tint(v, R.id.st_icon, t.accent);
        WidgetStyle.tint(v, R.id.st_open_bg, t.accent);
        WidgetStyle.textColor(v, t.gold, R.id.st_kicker);
        WidgetStyle.textColor(v, t.text, R.id.st_title);
        WidgetStyle.textColor(v, t.muted, R.id.st_meta);
        WidgetStyle.textColor(v, t.accent, R.id.st_countdown);
        WidgetStyle.textColor(v, t.onAccent, R.id.st_open_t);

        v.setViewVisibility(R.id.st_countdown, View.GONE);
        if (!d.hasStudy) {
            v.setTextViewText(R.id.st_title, ctx.getString(R.string.widget_study_none));
            v.setTextViewText(R.id.st_meta, "");
            v.setViewVisibility(R.id.st_open, View.GONE);
            v.setOnClickPendingIntent(R.id.st_root, WidgetUpdater.openRoute(ctx, 401, "/study"));
            m.updateAppWidget(id, v);
            return;
        }

        v.setTextViewText(R.id.st_title, d.studyTitle);
        String platform = d.studyPlatform.isEmpty() ? "" : d.studyPlatform + " · ";
        if (d.studyLive) {
            v.setTextViewText(R.id.st_meta, platform + ctx.getString(R.string.widget_study_live));
        } else if (d.studyAt <= now) {
            v.setTextViewText(R.id.st_meta, platform + ctx.getString(R.string.widget_study_started));
        } else {
            v.setTextViewText(R.id.st_meta, platform + when(d, d.studyAt, now));
            if (d.studyAt - now < DAY && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                v.setViewVisibility(R.id.st_countdown, View.VISIBLE);
                v.setChronometerCountDown(R.id.st_countdown, true);
                v.setChronometer(R.id.st_countdown, SystemClock.elapsedRealtime() + (d.studyAt - now), "%s", true);
            }
            // Flip to «حان موعد الدرس» (no negative countdown) when it starts.
            WidgetUpdater.scheduleRefresh(ctx, StudyWidget.class, 9401, d.studyAt + 1000);
        }

        PendingIntent link = linkIntent(ctx, d.studyLink);
        v.setViewVisibility(R.id.st_open, link != null ? View.VISIBLE : View.GONE);
        if (link != null) v.setOnClickPendingIntent(R.id.st_open, link);
        v.setOnClickPendingIntent(R.id.st_root,
                WidgetUpdater.openRoute(ctx, 402, "/study/circle/" + Uri.encode(d.studyCircleId)));
        m.updateAppWidget(id, v);
    }

    /** "اليوم ٧:٣٠ م" / "غداً ٧:٠٠ ص" / "الخميس ٨:٠٠ م" (time in the app's format). */
    private static String when(WidgetData d, long at, long now) {
        Calendar a = Calendar.getInstance();
        a.setTimeInMillis(at);
        Calendar n = Calendar.getInstance();
        n.setTimeInMillis(now);
        int days = (int) Math.round((startOfDay(a) - startOfDay(n)) / (double) DAY);
        String day = days == 0 ? "اليوم" : days == 1 ? "غداً" : WEEKDAY[a.get(Calendar.DAY_OF_WEEK) - 1];
        return day + " " + d.clock(at);
    }

    private static long startOfDay(Calendar c) {
        Calendar x = (Calendar) c.clone();
        x.set(Calendar.HOUR_OF_DAY, 0);
        x.set(Calendar.MINUTE, 0);
        x.set(Calendar.SECOND, 0);
        x.set(Calendar.MILLISECOND, 0);
        return x.getTimeInMillis();
    }

    /**
     * ACTION_VIEW for the circle's link (same normalisation as the app's openLink:
     * bare "t.me/x" → https). Only web / messenger schemes — never intent: or file:.
     */
    private static PendingIntent linkIntent(Context ctx, String link) {
        if (link == null || link.trim().isEmpty()) return null;
        String url = link.trim();
        if (!url.matches("(?i)^[a-z][\\w+.-]*:.*")) url = "https://" + url;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.matches("https?|tg|whatsapp|zoommtg|zoomus|mailto|tel")) return null;
        Intent i = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, 403, i, WidgetUpdater.immutable());
    }
}
