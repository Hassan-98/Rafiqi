package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

import com.darkmon.myzikr.R;

/** «الصلاة القادمة» — the top of Home's prayer card (CardPainter) with a live countdown. */
public class NextPrayerWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        m.updateAppWidget(id, CardPainter.views(ctx, m, id, CardPainter.NEXT, d, R.layout.widget_next_prayer,
                (v, card) -> v.setOnClickPendingIntent(R.id.card_root, WidgetUpdater.openRoute(ctx, 101, "/module/prayers"))));
        // Roll to the next prayer on time even when the app stays closed.
        WidgetUpdater.scheduleRefresh(ctx, NextPrayerWidget.class, 9101, CardPainter.prayerRefreshAt(d, System.currentTimeMillis()));
    }
}
