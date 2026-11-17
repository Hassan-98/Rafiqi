package com.darkmon.myzikr.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;

/**
 * Makes the widgets look like the app's cards, in whatever palette + light/dark the
 * user picked (WidgetData.Theme). RemoteViews can't recolour a shape drawable, so each
 * surface is a white shape in an ImageView (res/drawable/wg_*) tinted with
 * ImageView.setColorFilter — works on every API level we support.
 */
final class WidgetStyle {

    private WidgetStyle() {}

    static void tint(RemoteViews v, int imageId, int color) {
        v.setInt(imageId, "setColorFilter", color);
    }

    static void textColor(RemoteViews v, int color, int... ids) {
        for (int id : ids) v.setTextColor(id, color);
    }

    /** `color` at opacity `a` (0..1). */
    static int alpha(int color, float a) {
        return (color & 0x00FFFFFF) | (Math.round(a * 255) << 24);
    }

    /** The app's plain card: surface + hairline ring. */
    static void card(RemoteViews v, WidgetData.Theme t, int bgId, int ringId) {
        tint(v, bgId, t.card);
        tint(v, ringId, t.ring);
    }

    /** The app's accent gradient (hero card / primary button): base + diagonal glow. */
    static void hero(RemoteViews v, WidgetData.Theme t, int baseId, int glowId) {
        tint(v, baseId, t.heroFrom);
        tint(v, glowId, t.heroTo);
    }

    /** Section-title ornament: the gold 8-point star. */
    static void star(RemoteViews v, WidgetData.Theme t, int starId) {
        tint(v, starId, t.gold);
    }

    /** The app's ProgressRing: accent arc on the warm gold track. */
    static Bitmap ring(Context ctx, WidgetData.Theme t, double rate, int sizeDp) {
        return ring(ctx, t.track, t.accent, rate, sizeDp);
    }

    static Bitmap ring(Context ctx, int trackColor, int arcColor, double rate, int sizeDp) {
        float density = ctx.getResources().getDisplayMetrics().density;
        int size = Math.round(sizeDp * density);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        float stroke = size * 0.1f;
        float pad = stroke / 2f + size * 0.02f;
        RectF r = new RectF(pad, pad, size - pad, size - pad);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(trackColor);
        c.drawArc(r, 0, 360, false, track);

        if (rate > 0) {
            Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(stroke);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(arcColor);
            c.drawArc(r, -90, (float) (360 * Math.min(1, rate)), false, arc);
        }
        return bmp;
    }
}
