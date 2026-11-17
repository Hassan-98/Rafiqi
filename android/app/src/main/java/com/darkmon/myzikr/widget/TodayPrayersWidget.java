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
 * «صلوات اليوم» (CardPainter.DAY): today's five prayers with their أذكار ما بعد الصلاة.
 * A prayer whose time has come: its node logs the fard («prayer.toggle»), its «أذكار» pill
 * marks the adhkar («prayer.adhkar.toggle», which also logs the fard) — both queued for the
 * app (widgetBridge.ts) and overlaid by WidgetData until it drains them. The rest opens الصلوات.
 */
public class TodayPrayersWidget extends AppWidgetProvider {

    static final String ACTION_LOG = "com.darkmon.myzikr.widget.DAY_PRAYER_LOG";
    static final String ACTION_ADHKAR = "com.darkmon.myzikr.widget.DAY_PRAYER_ADHKAR";
    private static final int[] COLS = { R.id.card_col0, R.id.card_col1, R.id.card_col2, R.id.card_col3, R.id.card_col4 };
    private static final int[] PILLS = { R.id.card_pill0, R.id.card_pill1, R.id.card_pill2, R.id.card_pill3, R.id.card_pill4 };

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
        String action = intent.getAction();
        boolean log = ACTION_LOG.equals(action);
        if (!log && !ACTION_ADHKAR.equals(action)) return;
        int i = intent.getIntExtra("prayer", -1);
        WidgetData d = WidgetData.load(ctx);
        long now = System.currentTimeMillis();
        long[] times = d.prayerTimes(WidgetData.dayKey(now));
        if (i >= 0 && i < 5 && times != null && times[i] <= now && !d.prayerExcused) {
            String name = WidgetData.prayerName(i, now, d.male);
            String msg;
            if (log) {
                boolean done = !d.prayerDone[i];
                WidgetData.queuePrayerToggle(ctx, i, done);
                int n = 0;
                for (int j = 0; j < 5; j++) if (j == i ? done : d.prayerDone[j]) n++;
                msg = !done ? "أُلغي تسجيل صلاة " + name
                        : n >= 5 ? "ما شاء الله، أتممت الفروض الخمسة اليوم" : "سُجّلت صلاة " + name + "، تقبّل الله";
            } else {
                boolean done = !d.prayerAdhkar[i];
                WidgetData.queueAdhkarToggle(ctx, i, done);
                msg = done ? "سُجّلت أذكار صلاة " + name + "، تقبّل الله" : "أُلغي تسجيل أذكار صلاة " + name;
            }
            Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show();
        }
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, TodayPrayersWidget.class))) render(ctx, m, id);
        // The fard may have changed too — keep «مواقيت الصلاة» in step.
        WidgetUpdater.nudge(ctx, m, PrayerTimesWidget.class);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        PendingIntent open = WidgetUpdater.openRoute(ctx, 110, "/module/prayers");
        m.updateAppWidget(id, CardPainter.views(ctx, m, id, CardPainter.DAY, d, R.layout.widget_today_prayers,
                (v, card) -> bind(ctx, v, card, open)));
        WidgetUpdater.scheduleRefresh(ctx, TodayPrayersWidget.class, 9110, CardPainter.prayerRefreshAt(d, System.currentTimeMillis()));
    }

    private static void bind(Context ctx, RemoteViews v, CardPainter.Card card, PendingIntent open) {
        v.setOnClickPendingIntent(R.id.card_root, open);
        if (!card.cols) {
            v.setViewVisibility(R.id.card_cols, View.GONE);
            v.setViewVisibility(R.id.card_pills, View.GONE);
            return;
        }
        int left = Math.round(card.colsLeft), right = Math.round(card.vw - card.colsRight);
        v.setViewVisibility(R.id.card_cols, View.VISIBLE);
        v.setViewPadding(R.id.card_cols, left, Math.round(card.colsTop), right, Math.round(card.vh - card.colsBottom));
        v.setViewVisibility(R.id.card_pills, View.VISIBLE);
        v.setViewPadding(R.id.card_pills, left, Math.round(card.pillsTop), right, Math.round(card.vh - card.pillsBottom));
        for (int i = 0; i < 5; i++) {
            String name = WidgetData.PRAYER_AR[i];
            if (card.due[i]) {
                Intent logI = new Intent(ctx, TodayPrayersWidget.class).setAction(ACTION_LOG).putExtra("prayer", i);
                v.setOnClickPendingIntent(COLS[i], PendingIntent.getBroadcast(ctx, 720 + i, logI, WidgetUpdater.immutable()));
                v.setContentDescription(COLS[i], "سجّل صلاة " + name);
                Intent adhI = new Intent(ctx, TodayPrayersWidget.class).setAction(ACTION_ADHKAR).putExtra("prayer", i);
                v.setOnClickPendingIntent(PILLS[i], PendingIntent.getBroadcast(ctx, 730 + i, adhI, WidgetUpdater.immutable()));
                v.setContentDescription(PILLS[i], "سجّل أذكار صلاة " + name);
            } else {
                v.setOnClickPendingIntent(COLS[i], open);
                v.setContentDescription(COLS[i], name);
                v.setOnClickPendingIntent(PILLS[i], open);
                v.setContentDescription(PILLS[i], "أذكار صلاة " + name);
            }
        }
    }
}
