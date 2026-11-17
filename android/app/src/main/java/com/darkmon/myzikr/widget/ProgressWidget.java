package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

/** Home-screen widget: today's overall worship completion as the app's progress ring, on an app card. */
public class ProgressWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        double rate = Math.max(0, Math.min(1, d.progressRate));

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_progress);
        WidgetData.Theme t = d.theme;
        WidgetStyle.card(v, t, R.id.pg_bg, R.id.pg_ring);
        WidgetStyle.star(v, t, R.id.pg_star);
        WidgetStyle.textColor(v, t.text, R.id.pg_pct, R.id.pg_label);
        WidgetStyle.textColor(v, t.muted, R.id.pg_sub);
        v.setImageViewBitmap(R.id.pg_ring_img, WidgetStyle.ring(ctx, t, rate, 84));
        v.setTextViewText(R.id.pg_pct, WidgetData.ar(Math.round(rate * 100)) + "٪");
        v.setTextViewText(R.id.pg_sub, WidgetData.ar(d.progressCompleted) + " من " + WidgetData.ar(d.progressTotal));
        v.setOnClickPendingIntent(R.id.pg_root, WidgetUpdater.openRoute(ctx, 103, "/stats"));
        m.updateAppWidget(id, v);
    }
}
