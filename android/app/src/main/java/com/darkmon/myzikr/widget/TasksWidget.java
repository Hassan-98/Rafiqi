package com.darkmon.myzikr.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import com.darkmon.myzikr.R;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * «مهامي» — the persistent task list with a tick box. A tick is optimistic: it is
 * queued as a `task.toggle` (explicit `done`) in `widget_pending_actions`, which
 * WidgetData overlays on the snapshot right away and the app applies on its
 * next start/resume. An open task's next steps sit under it and tick the same
 * way (`task.step.toggle`). Tapping a title opens that task in the app; «+»
 * opens the add-task sheet.
 */
public class TasksWidget extends AppWidgetProvider {

    static final String ACTION_ITEM = "com.darkmon.myzikr.widget.TASK_ITEM";
    static final String EXTRA_OP = "op";
    static final String EXTRA_ID = "taskId";
    static final String EXTRA_STEP = "stepId";
    static final String EXTRA_DONE = "done";
    static final String OP_TOGGLE = "toggle";
    static final String OP_STEP = "step";
    static final String OP_OPEN = "open";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
        m.notifyAppWidgetViewDataChanged(ids, R.id.tk_list);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (!ACTION_ITEM.equals(intent.getAction())) return;
        String id = intent.getStringExtra(EXTRA_ID);
        if (id == null || id.isEmpty()) return;

        String op = intent.getStringExtra(EXTRA_OP);
        if (OP_OPEN.equals(op)) {
            // Collection items only allow one (broadcast) template, so the title tap
            // trampolines here; the launcher's click grants the activity start.
            try {
                ctx.startActivity(WidgetUpdater.routeIntent(ctx, "/study?tab=tasks&task=" + Uri.encode(id)));
            } catch (Exception ignored) {
            }
            return;
        }

        boolean done = intent.getBooleanExtra(EXTRA_DONE, true);
        if (OP_STEP.equals(op)) {
            String step = intent.getStringExtra(EXTRA_STEP);
            if (step == null || step.isEmpty()) return;
            WidgetData.queueStepToggle(ctx, id, step, done);
        } else {
            WidgetData.queueTaskToggle(ctx, id, done);
        }
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, TasksWidget.class));
        onUpdate(ctx, m, ids);
        WidgetUpdater.nudge(ctx, m, DashboardWidget.class);
    }

    static void render(Context ctx, AppWidgetManager m, int widgetId) {
        WidgetData d = WidgetData.load(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasks);
        WidgetData.Theme t = d.theme;
        WidgetStyle.card(v, t, R.id.tk_bg, R.id.tk_ring);
        WidgetStyle.star(v, t, R.id.tk_star);
        WidgetStyle.tint(v, R.id.tk_count_bg, t.chip);
        WidgetStyle.tint(v, R.id.tk_add_bg, t.accent);
        WidgetStyle.tint(v, R.id.tk_line, t.ring);
        WidgetStyle.textColor(v, t.text, R.id.tk_title);
        WidgetStyle.textColor(v, t.muted, R.id.tk_date, R.id.tk_empty);
        WidgetStyle.textColor(v, t.accent, R.id.tk_count);
        WidgetStyle.textColor(v, t.onAccent, R.id.tk_add_t);

        v.setTextViewText(R.id.tk_date, WidgetData.ar(new SimpleDateFormat("EEEE d MMMM", new Locale("ar")).format(new Date())));
        v.setTextViewText(R.id.tk_count, WidgetData.ar(d.tasksDone) + "/" + WidgetData.ar(d.tasksTotal));

        Intent svc = new Intent(ctx, TasksWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME))); // one factory per widget
        v.setRemoteAdapter(R.id.tk_list, svc);
        v.setEmptyView(R.id.tk_list, R.id.tk_empty);

        // Fill-in intents need a MUTABLE template (explicit component → allowed on API 34+).
        Intent tpl = new Intent(ctx, TasksWidget.class).setAction(ACTION_ITEM);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        v.setPendingIntentTemplate(R.id.tk_list, PendingIntent.getBroadcast(ctx, 300, tpl, flags));

        v.setOnClickPendingIntent(R.id.tk_add, WidgetUpdater.openRoute(ctx, 301, "/study?tab=tasks&task=new"));
        v.setOnClickPendingIntent(R.id.tk_head, WidgetUpdater.openRoute(ctx, 302, "/study?tab=tasks"));
        v.setOnClickPendingIntent(R.id.tk_empty, WidgetUpdater.openRoute(ctx, 301, "/study?tab=tasks&task=new"));
        m.updateAppWidget(widgetId, v);
    }
}
