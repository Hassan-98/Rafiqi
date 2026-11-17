package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

/**
 * «ورد وقيام» — tonight's قيام (done / the last third's time / «الآن») on a tinted
 * tile, then up to three active أوراد with their counts (unfinished first).
 */
public class AwradWidget extends AppWidgetProvider {

    private static final int[] ROW = { R.id.aw_row_0, R.id.aw_row_1, R.id.aw_row_2 };
    private static final int[] DOT = { R.id.aw_dot_0, R.id.aw_dot_1, R.id.aw_dot_2 };
    private static final int[] TITLE = { R.id.aw_title_0, R.id.aw_title_1, R.id.aw_title_2 };
    private static final int[] COUNT = { R.id.aw_count_0, R.id.aw_count_1, R.id.aw_count_2 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        WidgetData.Theme t = d.theme;
        long now = System.currentTimeMillis();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_awrad);
        WidgetStyle.card(v, t, R.id.aw_bg, R.id.aw_ring);
        WidgetStyle.star(v, t, R.id.aw_star);
        WidgetStyle.tint(v, R.id.aw_qiyam_bg, t.chip);
        WidgetStyle.textColor(v, t.text, R.id.aw_title, R.id.aw_qiyam_t);
        WidgetStyle.textColor(v, t.accent, R.id.aw_summary, R.id.aw_qiyam_s);
        WidgetStyle.textColor(v, t.muted, R.id.aw_empty);

        String qiyam;
        if (d.qiyamDone) qiyam = "تمّ ✓";
        else if (d.qiyamLastThirdAt > now) qiyam = "الثلث الأخير " + d.clock(d.qiyamLastThirdAt);
        else if (d.qiyamLastThirdAt > 0 && now < d.qiyamFajrAt) qiyam = "الثلث الأخير الآن";
        else qiyam = "سجّل قيامك";
        v.setTextViewText(R.id.aw_qiyam_s, qiyam);
        if (d.qiyamLastThirdAt > now) {
            WidgetUpdater.scheduleRefresh(ctx, AwradWidget.class, 9631, d.qiyamLastThirdAt + 1000);
        }

        v.setTextViewText(R.id.aw_summary, d.awradActive > 0
                ? "أنجزت " + WidgetData.ar(d.awradDone) + " من " + WidgetData.ar(d.awradActive)
                : "");
        for (int i = 0; i < ROW.length; i++) {
            WidgetData.Wird w = i < d.awradTop.size() ? d.awradTop.get(i) : null;
            v.setViewVisibility(ROW[i], w != null ? View.VISIBLE : View.GONE);
            if (w == null) continue;
            boolean done = w.total > 0 && w.current >= w.total;
            WidgetStyle.tint(v, DOT[i], done ? t.gold : t.accent);
            v.setTextColor(TITLE[i], done ? t.muted : t.text);
            v.setTextColor(COUNT[i], done ? t.gold : t.muted);
            v.setTextViewText(TITLE[i], w.title);
            v.setTextViewText(COUNT[i], done ? "✓" : WidgetData.ar(w.current) + "/" + WidgetData.ar(w.total));
        }
        v.setViewVisibility(R.id.aw_empty, d.awradTop.isEmpty() ? View.VISIBLE : View.GONE);

        v.setOnClickPendingIntent(R.id.aw_qiyam, WidgetUpdater.openRoute(ctx, 631, "/targets?tab=qiyam"));
        v.setOnClickPendingIntent(R.id.aw_root, WidgetUpdater.openRoute(ctx, 632, "/targets?tab=awrad"));
        m.updateAppWidget(id, v);
    }
}
