package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

/**
 * «القرآن» — the Quran screen's hero card: the featured khatma (its next page and
 * its own %, never page/604), today's wird and «تابع القراءة». Opens the Quran screen.
 */
public class QuranWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        WidgetData.Theme t = d.theme;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_quran);
        WidgetStyle.hero(v, t, R.id.qr_bg, R.id.qr_glow);
        WidgetStyle.tint(v, R.id.qr_star, t.onAccent);
        WidgetStyle.tint(v, R.id.qr_cta_bg, t.onAccent);
        WidgetStyle.textColor(v, WidgetStyle.alpha(t.onAccent, 0.8f), R.id.qr_kicker, R.id.qr_sub);
        WidgetStyle.textColor(v, t.onAccent, R.id.qr_title, R.id.qr_wird);
        WidgetStyle.textColor(v, t.heroFrom, R.id.qr_cta_t);

        if (d.hasKhatma) {
            v.setTextViewText(R.id.qr_kicker, "ختمتك · " + d.khatmaName);
            v.setTextViewText(R.id.qr_title, "الصفحة " + WidgetData.ar(d.khatmaNextPage));
            v.setTextViewText(R.id.qr_sub, "قرأت " + WidgetData.ar(d.khatmaRead) + " من ٦٠٤ صفحة · "
                    + WidgetData.ar(d.khatmaPct) + "٪");
            v.setTextViewText(R.id.qr_cta_t, "تابع القراءة");
        } else {
            v.setTextViewText(R.id.qr_kicker, "القرآن الكريم");
            v.setTextViewText(R.id.qr_title, "ابدأ ختمة");
            v.setTextViewText(R.id.qr_sub, "سمِّها وابدأها من أي موضع، وتابع تقدّمك فيها");
            v.setTextViewText(R.id.qr_cta_t, "افتح المصحف");
        }

        if (d.hasWird && d.wirdAmount > 0) {
            boolean done = d.wirdAchieved >= d.wirdAmount;
            v.setViewVisibility(R.id.qr_wird, View.VISIBLE);
            v.setTextViewText(R.id.qr_wird, done
                    ? "وردك اليوم تمّ ✓"
                    : "وردك اليوم: " + WidgetData.ar(Math.min(d.wirdAchieved, d.wirdAmount)) + " من "
                            + WidgetData.ar(d.wirdAmount) + " " + d.wirdUnit);
        } else {
            v.setViewVisibility(R.id.qr_wird, View.INVISIBLE);
        }

        v.setOnClickPendingIntent(R.id.qr_root, WidgetUpdater.openRoute(ctx, 611, "/quran"));
        m.updateAppWidget(id, v);
    }
}
