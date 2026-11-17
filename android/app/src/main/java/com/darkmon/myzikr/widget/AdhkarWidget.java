package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

/**
 * «الأذكار» — the set for this time of day (same slots as the dashboard / the app)
 * with its ring and status, plus the four sets as chips; done sets show ✓.
 */
public class AdhkarWidget extends AppWidgetProvider {

    private static final String[] IDS = { "morning", "evening", "postPrayer", "sleep" };
    private static final String[] TITLES = { "أذكار الصباح", "أذكار المساء", "أذكار بعد الصلاة", "أذكار النوم" };
    private static final String[] SHORT = { "الصباح", "المساء", "بعد الصلاة", "النوم" };
    private static final int[] CHIP = { R.id.ad_c_morning, R.id.ad_c_evening, R.id.ad_c_post, R.id.ad_c_sleep };
    private static final int[] CHIP_BG = { R.id.ad_c_morning_bg, R.id.ad_c_evening_bg, R.id.ad_c_post_bg, R.id.ad_c_sleep_bg };
    private static final int[] CHIP_T = { R.id.ad_c_morning_t, R.id.ad_c_evening_t, R.id.ad_c_post_t, R.id.ad_c_sleep_t };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        WidgetData.Theme t = d.theme;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_adhkar);
        WidgetStyle.card(v, t, R.id.ad_bg, R.id.ad_ring);
        WidgetStyle.star(v, t, R.id.ad_star);
        WidgetStyle.textColor(v, t.text, R.id.ad_title, R.id.ad_pct);
        WidgetStyle.textColor(v, t.muted, R.id.ad_kicker, R.id.ad_status);

        String slot = DashboardWidget.adhkarSlot(d, System.currentTimeMillis())[0];
        int cur = 0;
        for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(slot)) cur = i;

        for (int i = 0; i < IDS.length; i++) {
            int[] p = progress(d, IDS[i]);
            boolean done = p[1] > 0 && p[0] >= p[1];
            WidgetStyle.tint(v, CHIP_BG[i], i == cur ? t.accent : t.chip);
            v.setTextColor(CHIP_T[i], i == cur ? t.onAccent : done ? t.accent : t.text);
            v.setTextViewText(CHIP_T[i], done ? SHORT[i] + " ✓" : SHORT[i]);
            v.setOnClickPendingIntent(CHIP[i], WidgetUpdater.openRoute(ctx, 621 + i, "/adhkar?set=" + IDS[i]));
        }

        int[] p = progress(d, IDS[cur]);
        boolean done = p[1] > 0 && p[0] >= p[1];
        double rate = p[1] > 0 ? Math.min(1, p[0] / (double) p[1]) : 0;
        v.setImageViewBitmap(R.id.ad_ring_img, WidgetStyle.ring(ctx, t, rate, 60));
        v.setTextViewText(R.id.ad_pct, WidgetData.ar(Math.round(rate * 100)) + "٪");
        v.setTextViewText(R.id.ad_title, TITLES[cur]);
        v.setTextViewText(R.id.ad_status, done
                ? "أتممتها اليوم، تقبّل الله منك"
                : p[0] > 0
                        ? "أتممت " + WidgetData.ar(p[0]) + " من " + WidgetData.ar(p[1]) + " ذكراً"
                        : (p[1] > 0 ? WidgetData.ar(p[1]) + " ذكراً · " : "") + "لم تبدأ بعد");
        v.setOnClickPendingIntent(R.id.ad_main, WidgetUpdater.openRoute(ctx, 620, "/adhkar?set=" + IDS[cur]));
        m.updateAppWidget(id, v);
    }

    /** {done, total} for a set today (0/0 until the app writes a snapshot for today). */
    private static int[] progress(WidgetData d, String set) {
        int[] p = d.adhkar.get(set);
        return p != null ? p : new int[] { 0, 0 };
    }
}
