package com.darkmon.myzikr.widget;

import android.content.Context;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.darkmon.myzikr.R;

import java.util.ArrayList;
import java.util.List;

/** Rows for the «مهامي» list (reads the snapshot + pending-toggle overlay). */
public class TasksWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    /** The row's step slots (a RemoteViews row can't hold a nested list). */
    private static final int[] STEP = { R.id.ti_s1, R.id.ti_s2, R.id.ti_s3 };
    private static final int[] STEP_CHECK = { R.id.ti_s1_c, R.id.ti_s2_c, R.id.ti_s3_c };
    private static final int[] STEP_TICK = { R.id.ti_s1_k, R.id.ti_s2_k, R.id.ti_s3_k };
    private static final int[] STEP_TITLE = { R.id.ti_s1_t, R.id.ti_s2_t, R.id.ti_s3_t };

    static CharSequence struck(String text) {
        SpannableString s = new SpannableString(text);
        s.setSpan(new StrikethroughSpan(), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    /** «وخطوة أخرى» / «وخطوتان أخريان» / «و٣ خطوات أخرى» / «و١٢ خطوة أخرى». */
    static String moreStepsAr(int n) {
        if (n == 1) return "وخطوة أخرى";
        if (n == 2) return "وخطوتان أخريان";
        return "و" + WidgetData.ar(n) + (n <= 10 ? " خطوات" : " خطوة") + " أخرى";
    }

    static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private List<WidgetData.Task> items = new ArrayList<>();
        private WidgetData data = new WidgetData();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            data = WidgetData.load(ctx);
            items = data.tasks;
        }

        @Override public void onDestroy() { items = new ArrayList<>(); }
        @Override public int getCount() { return items.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_task_item);
            if (position < 0 || position >= items.size()) return v;
            WidgetData.Task t = items.get(position);

            WidgetData.Theme th = data.theme;
            // Round check like the app's: a muted ring when open, filled accent + tick when done.
            v.setViewVisibility(R.id.ti_off, t.done ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.ti_on, t.done ? View.VISIBLE : View.GONE);
            v.setViewVisibility(R.id.ti_tick, t.done ? View.VISIBLE : View.GONE);
            WidgetStyle.tint(v, R.id.ti_off, th.muted);
            WidgetStyle.tint(v, R.id.ti_on, th.accent);
            WidgetStyle.tint(v, R.id.ti_tick, th.onAccent);
            WidgetStyle.tint(v, R.id.ti_pri, th.gold);
            v.setTextColor(R.id.ti_time, th.muted);
            v.setTextViewText(R.id.ti_title, t.done ? struck(t.title) : t.title);
            v.setTextColor(R.id.ti_title, t.done ? th.muted : th.text);
            v.setViewVisibility(R.id.ti_pri, "high".equals(t.priority) && !t.done ? View.VISIBLE : View.GONE);
            if (t.time == null || t.time.isEmpty()) {
                v.setViewVisibility(R.id.ti_time, View.GONE);
            } else {
                v.setViewVisibility(R.id.ti_time, View.VISIBLE);
                v.setTextViewText(R.id.ti_time, data.clock(t.time));
            }

            Intent toggle = new Intent()
                    .putExtra(TasksWidget.EXTRA_OP, TasksWidget.OP_TOGGLE)
                    .putExtra(TasksWidget.EXTRA_ID, t.id)
                    .putExtra(TasksWidget.EXTRA_DONE, !t.done);
            v.setOnClickFillInIntent(R.id.ti_check, toggle);
            Intent open = new Intent()
                    .putExtra(TasksWidget.EXTRA_OP, TasksWidget.OP_OPEN)
                    .putExtra(TasksWidget.EXTRA_ID, t.id);
            v.setOnClickFillInIntent(R.id.ti_root, open);

            // Steps: «done/total» beside the time; an open task lists the 3 the app picked (from
            // its first open step), each tickable (`task.step.toggle`); the «+n» line falls
            // through to the row's open.
            if (t.stepsTotal > 0) {
                v.setViewVisibility(R.id.ti_steps, View.VISIBLE);
                v.setTextViewText(R.id.ti_steps, WidgetData.ar(t.stepsDone) + "/" + WidgetData.ar(t.stepsTotal));
                v.setTextColor(R.id.ti_steps, t.stepsDone >= t.stepsTotal ? th.accent : th.muted);
            } else {
                v.setViewVisibility(R.id.ti_steps, View.GONE);
            }
            int shown = t.done ? 0 : Math.min(t.steps.size(), STEP.length);
            for (int i = 0; i < STEP.length; i++) {
                v.setViewVisibility(STEP[i], i < shown ? View.VISIBLE : View.GONE);
                if (i >= shown) continue;
                WidgetData.Step s = t.steps.get(i);
                v.setImageViewResource(STEP_CHECK[i], s.done ? R.drawable.wg_circle : R.drawable.wg_circle_ring);
                WidgetStyle.tint(v, STEP_CHECK[i], s.done ? th.accent : th.muted);
                v.setViewVisibility(STEP_TICK[i], s.done ? View.VISIBLE : View.GONE);
                WidgetStyle.tint(v, STEP_TICK[i], th.onAccent);
                v.setTextViewText(STEP_TITLE[i], s.done ? struck(s.title) : s.title);
                v.setTextColor(STEP_TITLE[i], s.done ? th.muted : th.text);
                Intent step = new Intent()
                        .putExtra(TasksWidget.EXTRA_OP, TasksWidget.OP_STEP)
                        .putExtra(TasksWidget.EXTRA_ID, t.id)
                        .putExtra(TasksWidget.EXTRA_STEP, s.id)
                        .putExtra(TasksWidget.EXTRA_DONE, !s.done);
                v.setOnClickFillInIntent(STEP[i], step);
            }
            int more = shown > 0 ? t.stepsTotal - shown : 0;
            v.setViewVisibility(R.id.ti_more, more > 0 ? View.VISIBLE : View.GONE);
            if (more > 0) {
                v.setTextViewText(R.id.ti_more, moreStepsAr(more));
                v.setTextColor(R.id.ti_more, th.accent);
            }
            return v;
        }
    }
}
