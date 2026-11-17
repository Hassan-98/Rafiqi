package com.darkmon.myzikr.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import com.darkmon.myzikr.R;

/**
 * «مواقيت الصلاة» — Home's prayer card (CardPainter): next prayer + live countdown, the five
 * prayers, today's fard count. Like on Home, tapping a prayer whose time has come logs it
 * (queued as «prayer.toggle» for the app, see widgetBridge.ts); the rest opens the prayers.
 */
public class PrayerTimesWidget extends AppWidgetProvider {

    static final String ACTION_LOG = "com.darkmon.myzikr.widget.PRAYER_LOG";
    private static final int[] COLS = { R.id.card_col0, R.id.card_col1, R.id.card_col2, R.id.card_col3, R.id.card_col4 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        render(ctx, m, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (!ACTION_LOG.equals(intent.getAction())) return;
        int i = intent.getIntExtra("prayer", -1);
        WidgetData d = WidgetData.load(ctx);
        long now = System.currentTimeMillis();
        long[] times = d.prayerTimes(WidgetData.dayKey(now));
        if (i >= 0 && i < 5 && times != null && times[i] <= now) {
            boolean done = !d.prayerDone[i];
            WidgetData.queuePrayerToggle(ctx, i, done);
            int n = 0;
            for (int j = 0; j < 5; j++) if (j == i ? done : d.prayerDone[j]) n++;
            String name = WidgetData.PRAYER_AR[i];
            // Same words as Home's toast.
            String msg = !done ? "أُلغي تسجيل صلاة " + name
                    : n >= 5 ? "ما شاء الله، أتممت الفروض الخمسة اليوم" : "سُجّلت صلاة " + name + "، تقبّل الله";
            Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show();
        }
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, PrayerTimesWidget.class))) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        PendingIntent open = WidgetUpdater.openRoute(ctx, 102, "/module/prayers");
        m.updateAppWidget(id, CardPainter.views(ctx, m, id, CardPainter.PRAYERS, d, R.layout.widget_prayer_times,
                (v, card) -> bind(ctx, v, card, open)));
        WidgetUpdater.scheduleRefresh(ctx, PrayerTimesWidget.class, 9102, CardPainter.prayerRefreshAt(d, System.currentTimeMillis()));
    }

    private static void bind(Context ctx, RemoteViews v, CardPainter.Card card, PendingIntent open) {
        v.setOnClickPendingIntent(R.id.card_root, open);
        if (!card.cols) {
            v.setViewVisibility(R.id.card_cols, View.GONE);
            return;
        }
        v.setViewVisibility(R.id.card_cols, View.VISIBLE);
        v.setViewPadding(R.id.card_cols, Math.round(card.colsLeft), Math.round(card.colsTop),
                Math.round(card.vw - card.colsRight), Math.round(card.vh - card.colsBottom));
        for (int i = 0; i < 5; i++) {
            if (card.due[i]) {
                Intent log = new Intent(ctx, PrayerTimesWidget.class).setAction(ACTION_LOG).putExtra("prayer", i);
                v.setOnClickPendingIntent(COLS[i], PendingIntent.getBroadcast(ctx, 710 + i, log, WidgetUpdater.immutable()));
                v.setContentDescription(COLS[i], "سجّل صلاة " + WidgetData.PRAYER_AR[i]);
            } else {
                v.setOnClickPendingIntent(COLS[i], open);
                v.setContentDescription(COLS[i], WidgetData.PRAYER_AR[i]);
            }
        }
    }
}
