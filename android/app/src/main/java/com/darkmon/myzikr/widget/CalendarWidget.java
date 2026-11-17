package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

import com.darkmon.myzikr.R;

/**
 * «اليوم في التقويم» — Home's CalendarTodayCard as a widget (painted by CardPainter): Hijri
 * medallion + dates, today's occasion chips and the next occasion. Opens the calendar.
 */
public class CalendarWidget extends AppWidgetProvider {

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
        m.updateAppWidget(id, CardPainter.views(ctx, m, id, CardPainter.CALENDAR, d, R.layout.widget_calendar,
                (v, card) -> v.setOnClickPendingIntent(R.id.card_root, WidgetUpdater.openRoute(ctx, 601, "/calendar"))));
        // The date, occasions and countdown roll over at midnight even with the app closed.
        WidgetUpdater.scheduleRefresh(ctx, CalendarWidget.class, 9601, CardPainter.midnight(System.currentTimeMillis()) + 5000);
    }
}
