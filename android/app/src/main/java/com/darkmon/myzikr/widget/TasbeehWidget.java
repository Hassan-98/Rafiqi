package com.darkmon.myzikr.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

/**
 * Home-screen widget: a quick tap tasbeeh counter. The counter lives in the
 * widget's own SharedPreferences (independent of the in-app counter) so it
 * keeps working without launching the app; the displayed dhikr name comes from
 * the shared snapshot. Tapping the name opens the app's tasbih screen.
 */
public class TasbeehWidget extends AppWidgetProvider {

    static final String ACTION_INC = "com.darkmon.myzikr.widget.TASBEEH_INC";
    static final String ACTION_RESET = "com.darkmon.myzikr.widget.TASBEEH_RESET";
    private static final String PREF = "myzikr_widget";
    private static final String KEY = "tasbeeh_count";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_INC.equals(a) || ACTION_RESET.equals(a)) {
            SharedPreferences sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
            int c = sp.getInt(KEY, 0);
            c = ACTION_RESET.equals(a) ? 0 : c + 1;
            sp.edit().putInt(KEY, c).apply();

            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, TasbeehWidget.class));
            for (int id : ids) render(ctx, m, id);
        }
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        WidgetData d = WidgetData.load(ctx);
        int c = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getInt(KEY, 0);

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasbeeh);
        WidgetData.Theme t = d.theme;
        WidgetStyle.card(v, t, R.id.tb_bg, R.id.tb_ring);
        WidgetStyle.star(v, t, R.id.tb_star);
        WidgetStyle.tint(v, R.id.tb_reset_bg, t.chip);
        WidgetStyle.hero(v, t, R.id.tb_tick_bg, R.id.tb_tick_glow);
        WidgetStyle.textColor(v, t.text, R.id.tb_name);
        WidgetStyle.textColor(v, t.accent, R.id.tb_reset_t, R.id.tb_count);
        WidgetStyle.textColor(v, t.muted, R.id.tb_target);
        WidgetStyle.textColor(v, t.onAccent, R.id.tb_tick_t);

        String name = (d.tasbeehName != null && !d.tasbeehName.isEmpty()) ? d.tasbeehName : "سبحان الله";
        v.setTextViewText(R.id.tb_name, name);
        v.setTextViewText(R.id.tb_count, WidgetData.ar(c));
        v.setTextViewText(R.id.tb_target, d.tasbeehTarget > 0 ? "الهدف " + WidgetData.ar(d.tasbeehTarget) : "");

        v.setOnClickPendingIntent(R.id.tb_tick, self(ctx, ACTION_INC, 201));
        v.setOnClickPendingIntent(R.id.tb_count_box, self(ctx, ACTION_INC, 202));
        v.setOnClickPendingIntent(R.id.tb_reset, self(ctx, ACTION_RESET, 203));
        v.setOnClickPendingIntent(R.id.tb_name, WidgetUpdater.openRoute(ctx, 204, "/tasbih"));

        m.updateAppWidget(id, v);
    }

    private static PendingIntent self(Context ctx, String action, int req) {
        Intent i = new Intent(ctx, TasbeehWidget.class);
        i.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, req, i, flags);
    }
}
