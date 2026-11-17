package com.darkmon.myzikr.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.format.DateUtils;
import android.text.style.MetricAffectingSpan;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.content.res.ResourcesCompat;
import androidx.core.graphics.PathParser;

import com.darkmon.myzikr.R;

import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Paints Home's cards into a bitmap, measured from the web layout — «اليوم في التقويم»
 * (src/components/home/CalendarTodayCard.tsx) and «الصلاة القادمة» (PrayerHero.tsx).
 * Units are CSS px (= dp); rem-based Tailwind sizes follow the app's root font size
 * (theme.rem, 15 by default). A bitmap because RemoteViews can't use the app font:
 * TextView ignores font resources in the launcher's restricted context, and Alan Sans
 * (res/font, built from the app's own Fontsource files) is most of the card's look.
 * The one live element — the prayer countdown — is a Chronometer laid over its slot.
 */
final class CardPainter {

    static final int CALENDAR = 0, NEXT = 1, PRAYERS = 2, DAY = 3;

    /** Adds a widget's click intents to one sized RemoteViews. */
    interface Binder {
        void bind(RemoteViews v, Card card);
    }

    /** What was painted; overlay positions are in view px (dp × density). */
    static final class Card {
        Bitmap bmp;
        String desc = "";
        float vw, vh;
        boolean countdown;
        long target;
        float cdLeft, cdBaseline, cdSize;
        int cdColor;
        boolean cols;
        float colsLeft, colsTop, colsRight, colsBottom;
        /** «صلوات اليوم»: the أذكار pills row under the columns (same left / right). */
        float pillsTop, pillsBottom;
        final boolean[] due = new boolean[5];
    }

    private static final long HOUR = 3_600_000L;
    private static final int RIGHT = 0, LEFT = 1, CENTER = 2;
    /** Narrowest layout per card before it scales down as a whole (CSS px). */
    private static final float[] MIN_W = { 280, 250, 382, 300 }; // prayer card: Home's own width, so it scales as a whole
    private static final float[] DEF_W = { 340, 260, 340, 320 }, DEF_H = { 170, 130, 280, 180 };

    // ── Ornaments + lucide icons (the exact SVG path data the app renders) ──
    private static final String[] STAR = {
        "M12 1l3.2 7.8L23 12l-7.8 3.2L12 23l-3.2-7.8L1 12l7.8-3.2z",
        "M4.2 4.2L12 7.4l7.8-3.2-3.2 7.8 3.2 7.8L12 16.6l-7.8 3.2 3.2-7.8z" };
    private static final String[] GIRIH = {
        "M44 14l8.8 21.2L74 44l-21.2 8.8L44 74l-8.8-21.2L14 44l21.2-8.8z",
        "M22.8 22.8L44 31.6l21.2-8.8-8.8 21.2 8.8 21.2L44 56.4l-21.2 8.8 8.8-21.2z",
        "M0 0l14 14M88 0L74 14M0 88l14-14M88 88L74 74M44 0v14M44 88V74M0 44h14M88 44H74" };
    private static final String[] ARCH = { "M8 160V70C8 38 34 14 60 4c26 10 52 34 52 66v90" };
    private static final String[] ARCH_FAINT = {
        "M20 160V74c0-26 20-46 40-56 20 10 40 30 40 56v86", "M60 4v12", "M57 24a3 3 0 1 0 6 0a3 3 0 1 0-6 0" };
    private static final String[] CALENDAR_DAYS = { "M8 2v4", "M16 2v4",
        "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18",
        "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01", "M16 18h.01" };
    private static final String[] CHEVRON_LEFT = { "m15 18-6-6 6-6" };
    private static final String[] CHECK = { "M20 6 9 17l-5-5" };
    private static final String[] UTENSILS = { "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20",
        "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" };
    private static final String[] SPARKLES = {
        "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
        "M20 2v4", "M22 4h-4", "M2 20a2 2 0 1 0 4 0a2 2 0 1 0-4 0" };
    private static final String[] MOON = {
        "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" };
    private static final String[] BOOK_OPEN = { "M12 7v14",
        "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" };

    private static final Map<String, Path> PATHS = new HashMap<>();
    private static Typeface[] fonts;

    private final Context ctx;
    private final WidgetData d;
    private final WidgetData.Theme t;
    private final Canvas c; // null = measure only
    private final float k; // bitmap px per CSS px
    private final float rem;
    private final long now;
    private float u2v = 1; // view px per CSS px
    private final Card out = new Card();

    private CardPainter(Context ctx, WidgetData d, Canvas c, float k, long now) {
        this.ctx = ctx;
        this.d = d;
        this.t = d.theme;
        this.c = c;
        this.k = k;
        this.rem = t.rem > 0 ? t.rem : 15;
        this.now = now;
    }

    // ── Widget plumbing ─────────────────────────────────────────────────────

    /** The widget's RemoteViews: one per size the launcher reports (API 31+ picks per size). */
    static RemoteViews views(Context ctx, AppWidgetManager m, int id, int kind, WidgetData d, int layout, Binder b) {
        List<float[]> sizes = sizes(m, id, kind);
        long now = System.currentTimeMillis();
        // Bitmap bytes per size: the host rejects an update over 6 bytes × screen pixels in total.
        android.util.DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float budget = 0.7f * 6f * dm.widthPixels * dm.heightPixels / sizes.size();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && sizes.size() > 1) {
            Map<SizeF, RemoteViews> map = new HashMap<>();
            for (float[] s : sizes) map.put(new SizeF(s[0], s[1]), one(ctx, kind, d, layout, b, s[0], s[1], budget, now));
            return new RemoteViews(map);
        }
        float[] s = sizes.get(0);
        return one(ctx, kind, d, layout, b, s[0], s[1], budget, now);
    }

    private static RemoteViews one(Context ctx, int kind, WidgetData d, int layout, Binder b, float w, float h, float budget, long now) {
        Card card = paint(ctx, kind, d, w, h, budget, now);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        v.setImageViewBitmap(R.id.card_img, card.bmp);
        v.setContentDescription(R.id.card_img, card.desc);
        if (kind != CALENDAR) chrono(v, card, now);
        b.bind(v, card);
        return v;
    }

    /** Widget sizes in dp: the launcher's exact list (API 31+), else portrait min width × max height. */
    private static List<float[]> sizes(AppWidgetManager m, int id, int kind) {
        List<float[]> out = new ArrayList<>();
        Bundle o = m.getAppWidgetOptions(id);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && o != null) {
            ArrayList<SizeF> list = o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (list != null) {
                for (SizeF s : list) {
                    if (s.getWidth() > 1 && s.getHeight() > 1 && out.size() < 4) out.add(new float[] { s.getWidth(), s.getHeight() });
                }
            }
        }
        if (out.isEmpty()) {
            int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            out.add(new float[] { w > 0 ? w : DEF_W[kind], h > 0 ? h : DEF_H[kind] });
        }
        return out;
    }

    /**
     * Paint a card for a wDp × hDp widget. The card fills the widget; its content keeps
     * the web proportions and is centred vertically. Narrower than MIN_W or shorter than
     * the content → everything scales down together.
     */
    static Card paint(Context ctx, int kind, WidgetData d, float wDp, float hDp, float budget, long now) {
        float density = ctx.getResources().getDisplayMetrics().density;
        CardPainter dry = new CardPainter(ctx, d, null, density, now);
        float s = Math.min(1f, wDp / MIN_W[kind]);
        float natH = dry.content(kind, wDp / s, 0);
        if (natH * s > hDp) {
            s = hDp / natH;
            natH = dry.content(kind, wDp / s, 0);
            s = Math.min(s, hDp / natH);
        }
        float W = wDp / s, H = hDp / s;
        int vw = Math.max(1, Math.round(wDp * density)), vh = Math.max(1, Math.round(hDp * density));
        float q = (float) Math.min(1, Math.sqrt(budget / (4.0 * vw * vh)));
        Bitmap bmp = Bitmap.createBitmap(Math.max(1, Math.round(vw * q)), Math.max(1, Math.round(vh * q)), Bitmap.Config.ARGB_8888);
        CardPainter p = new CardPainter(ctx, d, new Canvas(bmp), density * s * q, now);
        p.u2v = density * s;
        p.surface(kind, W, H);
        p.content(kind, W, Math.max(0, (H - natH) / 2));
        p.out.bmp = bmp;
        p.out.vw = vw;
        p.out.vh = vh;
        return p.out;
    }

    /** The live countdown: a Chronometer on the painted slot — same baseline, size and colour. */
    private static void chrono(RemoteViews v, Card c, long now) {
        if (!c.countdown || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            v.setViewVisibility(R.id.card_chrono, View.GONE);
            return;
        }
        long left = Math.max(0, c.target - now);
        String fmt = chronoFormat(left);
        v.setViewVisibility(R.id.card_chrono, View.VISIBLE);
        v.setTextViewTextSize(R.id.card_chrono, TypedValue.COMPLEX_UNIT_PX, c.cdSize);
        v.setTextColor(R.id.card_chrono, c.cdColor);
        v.setViewPadding(R.id.card_chrono_box, Math.round(c.cdLeft), chronoTop(c, String.format(fmt, DateUtils.formatElapsedTime(left / 1000))), 0, 0);
        v.setChronometerCountDown(R.id.card_chrono, true);
        v.setChronometer(R.id.card_chrono, SystemClock.elapsedRealtime() + left, fmt, true);
    }

    /** The app shows «٠١:١٦:٣٧» (always HH); Chronometer prints H:MM:SS / MM:SS in the phone's digits. */
    static String chronoFormat(long left) {
        String zero = String.valueOf(zeroDigit());
        return left >= 10 * HOUR ? "%s" : left >= HOUR ? zero + "%s" : zero + zero + ":%s";
    }

    /** Top padding that puts the Chronometer's baseline (system bold, as TextView lays it out) on the slot's. */
    static int chronoTop(Card c, String sample) {
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        tp.setTextSize(c.cdSize);
        StaticLayout.Builder lb = StaticLayout.Builder.obtain(sample, 0, sample.length(), tp, 100000).setIncludePad(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lb.setUseLineSpacingFromFallbacks(true);
        return Math.round(c.cdBaseline - lb.build().getLineBaseline(0));
    }

    /** '0' in the phone's digits — Chronometer formats with the system locale. */
    private static char zeroDigit() {
        Locale l = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                ? Resources.getSystem().getConfiguration().getLocales().get(0)
                : Locale.getDefault();
        return DecimalFormatSymbols.getInstance(l).getZeroDigit();
    }

    /** Local midnight after `ms`. */
    static long midnight(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }

    /** {prayer index, epoch ms, 1 if today} of the next prayer (after Isha: tomorrow's Fajr), or null. */
    static long[] nextPrayer(WidgetData d, long now) {
        long[] times = d.prayerTimes(WidgetData.dayKey(now));
        if (times == null) return null;
        for (int i = 0; i < 5; i++) if (times[i] > now) return new long[] { i, times[i], 1 };
        long[] tm = d.prayerTimes(WidgetData.dayKey(midnight(now) + HOUR));
        return new long[] { 0, tm != null ? tm[0] : times[0] + 24 * HOUR, 0 };
    }

    /** When a prayer card next changes by itself: a prayer time, midnight, or the countdown's 10h / 1h format flip. */
    static long prayerRefreshAt(WidgetData d, long now) {
        long best = midnight(now) + 5000;
        long[] n = nextPrayer(d, now);
        if (n != null) {
            for (long at : new long[] { n[1] + 2000, n[1] - 10 * HOUR, n[1] - HOUR }) if (at > now && at < best) best = at;
        }
        return best;
    }

    // ── Cards ───────────────────────────────────────────────────────────────

    private float content(int kind, float W, float top) {
        return kind == CALENDAR ? calendar(W, top) : kind == DAY ? day(W, top) : prayer(W, top, kind == PRAYERS);
    }

    /** gradient-edge surface (calendar) or the hero surface (prayer), lattice, arch, rounded + ringed. */
    private void surface(int kind, float W, float H) {
        float rad = r(1.375f) * k;
        Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (kind == CALENDAR) {
            RectF card = px(1, 1, W - 1, H - 1);
            int[] cols = t.dark
                    ? new int[] { t.card, mix(t.accent, t.darkSurface, 0.14f) }
                    : new int[] { t.creamSoft, mix(t.goldLight, t.creamSoft, 0.18f) };
            g.setShader(gradient(card, 150, cols, null));
            c.drawRoundRect(card, rad, rad, g);
            lattice(card, t.gold);
            clearOutside(card, rad);
            // ring-1 ring-gold/30 (dark: /20) sits outside the card, over the page colour.
            Paint ring = fill(mix(t.gold, t.page, t.dark ? 0.2f : 0.3f));
            ring.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OVER));
            c.drawRoundRect(px(0, 0, W, H), rad + k, rad + k, ring);
        } else {
            RectF card = px(0, 0, W, H);
            g.setShader(gradient(card, 140, new int[] { t.heroFrom, t.accent, t.heroTo }, new float[] { 0, 0.55f, 1 }));
            c.drawRoundRect(card, rad, rad, g);
            lattice(card, t.onAccent);
            // ArchMotif: w-44, -top-6, -start-8 (RTL start = right), opacity .14, on-accent.
            float aw = r(11);
            int save = c.saveLayerAlpha(null, Math.round(0.14f * 255));
            Paint st = stroke(t.onAccent, 1.2f);
            svg(ARCH, W + r(2) - aw, -r(1.5f), aw, 120, st);
            st.setAlpha(Math.round(0.6f * 255));
            svg(ARCH_FAINT, W + r(2) - aw, -r(1.5f), aw, 120, st);
            c.restoreToCount(save);
            clearOutside(card, rad);
        }
    }

    /** CalendarTodayCard. Returns the content height (incl. the 1px ring). */
    private float calendar(float W, float top) {
        WidgetData.CalDay day = d.calendarToday();
        int goldInk = t.dark ? t.goldLight : t.goldDark; // text-gold-dark dark:text-gold-light
        float pad = r(1), x0 = 1 + pad, x1 = W - 1 - pad, w = x1 - x0;
        float y = top + 1 + pad;

        // Medallion · kicker / Hijri / Gregorian · calendar icon (items-center, gap-3.5)
        float med = 58, gap = r(0.875f), ic = 18;
        float kLh = 11 * 1.75f, hLh = r(1) * 1.5f, gLh = r(1);
        float colH = kLh + hLh + (day != null ? gLh : 0), rowH = Math.max(med, colH);
        float colR = x1 - med - gap, colW = colR - (x0 + ic + gap);
        String kicker = "اليوم في التقويم" + (day != null && !day.weekday.isEmpty() ? " · " + day.weekday : "");
        String hijri = day != null
                ? WidgetData.ar(day.day) + " " + day.month + " " + WidgetData.ar(day.year) + " هـ"
                : ctx.getString(R.string.widget_calendar_open);
        medallion(x1 - med, y + (rowH - med) / 2, med, day != null ? WidgetData.ar(day.day) : "", goldInk);
        float cy = y + (rowH - colH) / 2;
        line(kicker, colR, cy, kLh, paint(11, 400, t.muted), RIGHT, colW);
        line(hijri, colR, cy + kLh, hLh, paint(r(1), 700, t.text), RIGHT, colW);
        if (day != null) line(day.greg, colR, cy + kLh + hLh, gLh, paint(r(0.75f), 400, t.muted), RIGHT, colW);
        icon(CALENDAR_DAYS, x0, y + (rowH - ic) / 2, ic, goldInk, 2);
        y += rowH;
        StringBuilder desc = new StringBuilder(kicker).append("، ").append(hijri);
        if (day != null) desc.append("، ").append(day.greg);

        // Today's occasions: chips, flex-wrap gap-1.5, max 3.
        if (day != null && !day.chips.isEmpty()) {
            y += r(0.75f);
            float chipLh = 11 * 1.75f, chipH = chipLh + 2 * r(0.25f), cx = x1;
            for (String[] ch : day.chips) {
                int[] st = chipStyle(ch[1]);
                TextPaint tp = paint(11, 600, st[1]);
                float tw = Math.min(width(ch[0], tp), w - 2 * r(0.5f) - 12 - r(0.25f));
                float cw = 2 * r(0.5f) + 12 + r(0.25f) + tw;
                if (cx < x1 && cx - cw < x0 - 0.5f) {
                    cx = x1;
                    y += chipH + r(0.375f);
                }
                rect(cx - cw, y, cx, y + chipH, r(0.5f), st[0]);
                icon(chipIcon(ch[1]), cx - r(0.5f) - 12, y + (chipH - 12) / 2, 12, st[1], 2);
                line(ch[0], cx - r(0.5f) - 12 - r(0.25f), y + r(0.25f), chipLh, tp, RIGHT, tw);
                cx -= cw + r(0.375f);
                desc.append("، ").append(ch[0]);
            }
            y += chipH;
        }
        // The lead occasion's suggestion.
        if (day != null && !day.suggestion.isEmpty()) {
            y += r(0.5f);
            y += para(day.suggestion, x1, y, w, r(1), paint(r(0.75f), 400, t.dark ? alpha(t.text, 0.8f) : t.secondary));
        }
        // «القادم: …        بعد ٢٦ يوماً ‹» under a gold hairline.
        String[] next = nextOccasion();
        if (next != null) {
            y += r(0.75f);
            rect(x0, y, x1, y + 1, 0, alpha(t.gold, 0.2f));
            y += 1 + r(0.75f);
            float lh = r(1), g2 = r(0.5f);
            float lw = line("القادم:", x1, y, lh, paint(r(0.75f), 400, t.muted), RIGHT, 0);
            icon(CHEVRON_LEFT, x0, y + (lh - 14) / 2, 14, t.muted, 2);
            float ww = line(next[1], x0 + 14 + g2, y, lh, paint(r(0.75f), 600, goldInk), LEFT, 0);
            line(next[0], x1 - lw - g2, y, lh, paint(r(0.75f), 600, t.text), RIGHT, (x1 - lw - g2) - (x0 + 14 + g2 + ww + g2));
            y += lh;
            desc.append("، القادم: ").append(next[0]).append(" ").append(next[1]);
        }
        out.desc = desc.toString();
        return y + pad + 1 - top;
    }

    /** PrayerHero (full) or just its top row (the next-prayer widget). Returns the content height. */
    private float prayer(float W, float top, boolean full) {
        float pad = r(1.25f), x0 = pad, x1 = W - pad, w = x1 - x0;
        float y = top + pad;
        long[] times = d.prayerTimes(WidgetData.dayKey(now));
        long[] next = nextPrayer(d, now);
        boolean has = next != null;
        long at = has ? next[1] : 0;
        int ni = has ? (int) next[0] : -1;

        // Top row (items-end, justify-between): kicker / name / adhan · «بعد» + countdown.
        TextPaint dim = paint(r(0.75f), 400, alpha(t.onAccent, 0.75f));
        TextPaint cd = paint(32, 700, t.goldLight);
        String name = has ? WidgetData.PRAYER_AR[ni] : "صلوات اليوم";
        String adhan = has ? "الأذان " + d.clock(at) : "";
        float kLh = r(1), nLh = 34 * 1.25f, g1 = r(0.125f), bLh = 11 * 1.75f;
        float rightH = kLh + g1 + nLh + (has ? g1 + kLh : 0), leftH = has ? bLh + 32 : 0;
        float rowH = Math.max(rightH, leftH);
        String cdText = has ? countdown(at - now) : "";
        float leftW = has ? width(cdText, cd) : 0;
        float maxR = w - leftW - (has ? r(0.75f) : 0);
        float ry = y + rowH - rightH;
        line("الصلاة القادمة", x1, ry, kLh, dim, RIGHT, maxR);
        line(name, x1, ry + kLh + g1, nLh, paint(34, 700, t.onAccent), RIGHT, maxR);
        if (has) {
            line(adhan, x1, ry + kLh + g1 + nLh + g1, kLh, dim, RIGHT, maxR);
            float ly = y + rowH - leftH, cTop = ly + bLh;
            line("بعد", x0, ly, bLh, paint(11, 400, alpha(t.onAccent, 0.7f)), LEFT, 0);
            out.countdown = true;
            out.target = at;
            out.cdLeft = x0 * u2v;
            out.cdBaseline = baseline(cd, cTop, 32) * u2v;
            out.cdSize = 32 * u2v;
            out.cdColor = t.goldLight;
            // Before API 24 there's no countdown Chronometer: paint the time left at render.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) line(cdText, x0, cTop, 32, cd, LEFT, 0);
        }
        y += rowH;
        out.desc = "الصلاة القادمة: " + name + (has ? "، " + adhan : "");

        if (times == null) {
            y += r(0.75f);
            // Home's hint without a location; a snapshot older than its week of times just needs the app.
            String hint = d.prayerDays.isEmpty() ? "حدّد موقعك من الإعدادات لتظهر مواقيت الصلاة." : "افتح التطبيق لتحديث مواقيت الصلاة.";
            y += para(hint, x1, y, w, r(1), paint(r(0.75f), 400, alpha(t.onAccent, 0.8f)));
        } else if (full) {
            // Five prayers (grid-cols-5 gap-1, RTL: الفجر on the right) under an on-accent hairline.
            y += r(1);
            rect(x0, y, x1, y + 1, 0, alpha(t.onAccent, 0.15f));
            y += 1 + r(0.75f);
            float g = r(0.25f), cw = (w - 4 * g) / 5, dot = r(1.75f), py = r(0.625f), g2 = r(0.375f);
            float ch = 2 * py + dot + g2 + 11 + g2 + 10.5f;
            out.cols = true;
            out.colsLeft = x0 * u2v;
            out.colsRight = x1 * u2v;
            out.colsTop = y * u2v;
            out.colsBottom = (y + ch) * u2v;
            for (int i = 0; i < 5; i++) {
                float cr = x1 - i * (cw + g), cl = cr - cw, mid = (cl + cr) / 2;
                boolean due = times[i] <= now, done = d.prayerDone[i], isNext = ni == i && next[2] == 1 && !due;
                out.due[i] = due;
                int save = !due && c != null ? c.saveLayerAlpha(null, Math.round(0.8f * 255)) : -1; // opacity-80
                if (isNext) rect(cl, y, cr, y + ch, r(0.875f), alpha(t.onAccent, 0.12f));
                float dy = y + py, dc = dy + dot / 2;
                if (done) {
                    circle(mid, dc, dot / 2, t.onAccent);
                    icon(CHECK, mid - 7.5f, dc - 7.5f, 15, t.heroFrom, 3);
                } else {
                    ring(mid, dc, dot, 1, alpha(t.onAccent, due ? 0.8f : 0.25f), due);
                }
                if (isNext) svg(STAR, mid - 5.5f, dc - 5.5f, 11, 24, fill(t.goldLight));
                float ly = dy + dot + g2;
                line(WidgetData.PRAYER_AR[i], mid, ly, 11, paint(11, 600, isNext ? t.goldLight : t.onAccent), CENTER, cw);
                line(d.clock(times[i]), mid, ly + 11 + g2, 10.5f, paint(10.5f, 400, alpha(t.onAccent, 0.75f)), CENTER, cw);
                if (save >= 0) c.restoreToCount(save);
            }
            y += ch;
        }

        if (full) {
            // «٠ من ٥ فروض · اضغط على الصلاة لتسجيلها   السنن والتفاصيل ‹»
            y += r(0.75f);
            float hp = r(0.75f), vp = r(0.625f), lh = r(1);
            TextPaint semi = paint(r(0.75f), 600, t.onAccent);
            float lw = width("السنن والتفاصيل", semi) + r(0.125f) + 14;
            float tw = w - 2 * hp - lw - r(0.5f);
            int n = 0;
            for (boolean b : d.prayerDone) if (b) n++;
            SpannableStringBuilder sb = new SpannableStringBuilder(WidgetData.ar(n));
            sb.setSpan(new Face(font(ctx, 700), t.onAccent), 0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            sb.append(" من ٥ فروض · اضغط على الصلاة لتسجيلها");
            TextPaint base = paint(r(0.75f), 400, alpha(t.onAccent, 0.75f));
            float th = layout(sb, base, (int) Math.floor(tw * k), Layout.Alignment.ALIGN_NORMAL).getLineCount() * lh;
            float ph = 2 * vp + th;
            rect(x0, y, x1, y + ph, r(0.875f), alpha(t.onAccent, 0.1f));
            para(sb, x1 - hp, y + vp, tw, lh, base);
            float ly = y + (ph - lh) / 2;
            icon(CHEVRON_LEFT, x0 + hp, ly + (lh - 14) / 2, 14, t.onAccent, 2);
            line("السنن والتفاصيل", x0 + hp + 14 + r(0.125f), ly, lh, semi, LEFT, 0);
            y += ph;
        }
        return y + pad - top;
    }

    /**
     * «صلوات اليوم»: title + today's counts · «يبقى على العصر» + countdown, then the five
     * prayers (RTL: الفجر on the right) — a node for the fard and a «أذكار» pill for the
     * أذكار ما بعد الصلاة, both tappable once the prayer's time has come. Hero surface.
     */
    private float day(float W, float top) {
        float pad = r(1), x0 = pad, x1 = W - pad, w = x1 - x0;
        float y = top + pad;
        long[] times = d.prayerTimes(WidgetData.dayKey(now));
        long[] next = nextPrayer(d, now);
        boolean has = next != null, ex = d.prayerExcused;
        int ni = has ? (int) next[0] : -1, fard = 0, adhkar = 0;
        for (int i = 0; i < 5; i++) {
            if (d.prayerDone[i]) fard++;
            if (d.prayerAdhkar[i]) adhkar++;
        }

        // Header (items-end): title / counts on the right, «يبقى على …» / countdown on the left.
        TextPaint dim = paint(r(0.75f), 400, alpha(t.onAccent, 0.78f));
        TextPaint cd = paint(22, 700, t.goldLight);
        String counts = ex ? "يوم عذر شرعي، لا يُحتسب ولا يقطع سلسلتك"
                : WidgetData.ar(fard) + " من ٥ فروض، أذكار الصلاة " + WidgetData.ar(adhkar) + " من ٥";
        String nextName = has ? WidgetData.prayerName(ni, next[1], d.male) : "";
        float tLh = 22, cLh = r(1), bLh = 16, cdLh = 24;
        float rightH = tLh + cLh, leftH = has ? bLh + cdLh : 0, rowH = Math.max(rightH, leftH);
        String cdText = has ? countdown(next[1] - now) : "";
        TextPaint small = paint(11, 400, alpha(t.onAccent, 0.75f));
        float leftW = has ? Math.max(width(cdText, cd), width("يبقى على " + nextName, small)) : 0;
        float maxR = w - leftW - (has ? r(0.75f) : 0);
        float ry = y + rowH - rightH;
        line("صلوات اليوم", x1, ry, tLh, paint(17, 700, t.onAccent), RIGHT, maxR);
        line(counts, x1, ry + tLh, cLh, dim, RIGHT, maxR);
        if (has) {
            float ly = y + rowH - leftH, cTop = ly + bLh;
            line("يبقى على " + nextName, x0, ly, bLh, small, LEFT, 0);
            out.countdown = true;
            out.target = next[1];
            out.cdLeft = x0 * u2v;
            out.cdBaseline = baseline(cd, cTop, cdLh) * u2v;
            out.cdSize = 22 * u2v;
            out.cdColor = t.goldLight;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) line(cdText, x0, cTop, cdLh, cd, LEFT, 0);
        }
        y += rowH;
        StringBuilder desc = new StringBuilder("صلوات اليوم: ").append(counts);
        if (has) desc.append("، القادمة: ").append(nextName);

        if (times == null) {
            y += r(0.75f);
            String hint = d.prayerDays.isEmpty() ? "حدّد موقعك من الإعدادات لتظهر مواقيت الصلاة." : "افتح التطبيق لتحديث مواقيت الصلاة.";
            y += para(hint, x1, y, w, r(1), paint(r(0.75f), 400, alpha(t.onAccent, 0.8f)));
            out.desc = desc.toString();
            return y + pad - top;
        }

        y += r(0.625f);
        rect(x0, y, x1, y + 1, 0, alpha(t.onAccent, 0.15f));
        y += 1 + r(0.375f);
        float g = r(0.25f), cw = (w - 4 * g) / 5, dot = 26, py = r(0.375f), g2 = 4;
        float colH = py + dot + g2 + 11 + 3 + 10.5f, pillH = 18, pillGap = r(0.375f), boxH = colH + pillGap + pillH + py;
        float pillTop = y + colH + pillGap;
        out.cols = true;
        out.colsLeft = x0 * u2v;
        out.colsRight = x1 * u2v;
        out.colsTop = y * u2v;
        out.colsBottom = (y + colH) * u2v;
        out.pillsTop = (pillTop - pillGap / 2) * u2v;
        out.pillsBottom = (y + boxH) * u2v;
        int cur = -1; // the prayer whose time is running (last adhan passed)
        for (int i = 0; i < 5; i++) if (times[i] <= now) cur = i;
        TextPaint pillText = paint(10, 600, t.onAccent);
        for (int i = 0; i < 5; i++) {
            float cr = x1 - i * (cw + g), cl = cr - cw, mid = (cl + cr) / 2;
            boolean due = times[i] <= now && !ex, done = d.prayerDone[i], adh = d.prayerAdhkar[i];
            boolean isNext = ni == i && next[2] == 1 && times[i] > now, isCur = i == cur && due && !done;
            out.due[i] = due;
            int save = !due && c != null ? c.saveLayerAlpha(null, Math.round(0.8f * 255)) : -1;
            if (isNext || isCur) rect(cl, y, cr, y + boxH, r(0.875f), alpha(t.onAccent, 0.12f));
            float dc = y + py + dot / 2;
            if (done) {
                circle(mid, dc, dot / 2, t.onAccent);
                icon(CHECK, mid - 7.5f, dc - 7.5f, 15, t.heroFrom, 3);
            } else if (isCur) {
                ring(mid, dc, dot, 1.5f, t.goldLight, true);
            } else {
                ring(mid, dc, dot, 1, alpha(t.onAccent, due ? 0.8f : 0.25f), due);
            }
            if (isNext) svg(STAR, mid - 5.5f, dc - 5.5f, 11, 24, fill(t.goldLight));
            float ly = y + py + dot + g2;
            String name = WidgetData.prayerName(i, now, d.male);
            line(name, mid, ly, 11, paint(11, 600, isNext || isCur ? t.goldLight : t.onAccent), CENTER, cw);
            line(d.clock(times[i]), mid, ly + 11 + 3, 10.5f, paint(10.5f, 400, alpha(t.onAccent, 0.75f)), CENTER, cw);

            // «أذكار» pill: gold + check once said; outlined while due; faint before its time.
            float tw = width("أذكار", pillText), ck = adh ? 9 + 3 : 0, pw = Math.min(cw - 2, 2 * 7 + ck + tw);
            float pl = mid - pw / 2, pr = mid + pw / 2;
            if (adh) {
                rect(pl, pillTop, pr, pillTop + pillH, pillH / 2, t.goldLight);
                icon(CHECK, pr - 7 - 9, pillTop + (pillH - 9) / 2, 9, t.heroFrom, 3.5f);
                line("أذكار", pr - 7 - ck, pillTop, pillH, paint(10, 600, t.heroFrom), RIGHT, 0);
            } else {
                outline(pl, pillTop, pr, pillTop + pillH, pillH / 2, alpha(due ? t.goldLight : t.onAccent, due ? 0.65f : 0.25f), 1);
                line("أذكار", mid, pillTop, pillH, paint(10, 600, alpha(t.onAccent, due ? 0.9f : 0.5f)), CENTER, 0);
            }
            if (save >= 0) c.restoreToCount(save);
            desc.append("، ").append(name).append(done ? " مؤدّاة" : due ? " لم تُسجَّل" : "").append(adh ? " مع أذكارها" : "");
        }
        y += boxH;
        out.desc = desc.toString();
        return y + pad - top;
    }

    /** {title, «بعد ٢٦ يوماً»} of the next occasion after today, or null. */
    private String[] nextOccasion() {
        List<String[]> list = new ArrayList<>(d.calUpcoming);
        if (list.isEmpty() && !d.calNextKey.isEmpty()) list.add(new String[] { d.calNextTitle, d.calNextKey });
        for (String[] u : list) {
            int n = WidgetData.daysUntil(u[1]);
            if (n > 0) return new String[] { u[0], WidgetData.countdownAr(n) };
        }
        return null;
    }

    /** {background, ink} of an occasion chip — EVENT_META in src/components/calendar/eventMeta.ts. */
    private int[] chipStyle(String type) {
        if ("occasion".equals(type)) return new int[] { alpha(t.gold, t.dark ? 0.2f : 0.15f), t.dark ? t.goldLight : t.goldDark };
        if ("season".equals(type)) return new int[] { alpha(t.gold, t.dark ? 0.15f : 0.1f), t.dark ? t.goldLight : t.goldDark };
        return new int[] { alpha(t.accent, t.dark ? 0.2f : 0.1f), t.dark ? t.heroTo : t.accent };
    }

    private static String[] chipIcon(String type) {
        if ("occasion".equals(type)) return SPARKLES;
        if ("season".equals(type)) return MOON;
        if ("friday".equals(type)) return BOOK_OPEN;
        return UTENSILS;
    }

    /** «٠١:١٦:٣٧» like usePrayerTimes' formatCountdown, Arabic-Indic. */
    private static String countdown(long ms) {
        long sec = Math.max(0, ms / 1000);
        return WidgetData.ar(String.format(Locale.US, "%02d:%02d:%02d", sec / 3600, sec / 60 % 60, sec % 60));
    }

    // ── Drawing primitives (CSS px in, bitmap px out) ───────────────────────

    private float r(float rems) {
        return rems * rem;
    }

    private RectF px(float l, float tp, float rt, float b) {
        return new RectF(l * k, tp * k, rt * k, b * k);
    }

    private static Typeface font(Context ctx, int weight) {
        if (fonts == null) {
            int[] ids = { R.font.alan_sans_400, R.font.alan_sans_600, R.font.alan_sans_700 };
            Typeface[] f = new Typeface[3];
            for (int i = 0; i < 3; i++) {
                try {
                    f[i] = ResourcesCompat.getFont(ctx, ids[i]);
                } catch (Exception ignored) {
                    // fall through to the system face
                }
                if (f[i] == null) f[i] = Typeface.create(Typeface.SANS_SERIF, i == 0 ? Typeface.NORMAL : Typeface.BOLD);
            }
            fonts = f;
        }
        return fonts[weight >= 700 ? 2 : weight >= 600 ? 1 : 0];
    }

    private TextPaint paint(float size, int weight, int color) {
        // Unhinted, fractional advances — the browser's text metrics (hinting shrinks small runs).
        TextPaint p = new TextPaint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG | Paint.LINEAR_TEXT_FLAG);
        p.setHinting(Paint.HINTING_OFF);
        p.setTypeface(font(ctx, weight));
        p.setTextSize(size * k);
        p.setColor(color);
        return p;
    }

    private float width(CharSequence s, TextPaint p) {
        return Layout.getDesiredWidth(s, p) / k;
    }

    private static StaticLayout layout(CharSequence s, TextPaint p, int w, Layout.Alignment a) {
        return StaticLayout.Builder.obtain(s, 0, s.length(), p, Math.max(1, w))
                .setAlignment(a)
                .setTextDirection(TextDirectionHeuristics.RTL)
                .setIncludePad(false)
                .setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY)
                .build();
    }

    /**
     * One line of RTL text in a CSS line box [top, top + lh] (glyphs centred on the box like
     * CSS half-leading), anchored at x: RIGHT = right edge, LEFT = left edge, CENTER. Ellipsized
     * to maxW (0 = no limit) like `truncate`. Returns the width.
     */
    private float line(CharSequence s, float x, float top, float lh, TextPaint p, int align, float maxW) {
        float w = width(s, p);
        if (maxW > 0 && w > maxW + 0.01f) {
            s = TextUtils.ellipsize(s, p, Math.max(0, maxW) * k, TextUtils.TruncateAt.END);
            w = width(s, p);
        }
        if (c == null || s.length() == 0) return w;
        int wpx = (int) Math.ceil(w * k) + 2;
        Layout.Alignment a = align == RIGHT ? Layout.Alignment.ALIGN_NORMAL
                : align == LEFT ? Layout.Alignment.ALIGN_OPPOSITE : Layout.Alignment.ALIGN_CENTER;
        StaticLayout l = layout(s, p, wpx, a);
        float left = align == RIGHT ? x * k - wpx : align == LEFT ? x * k : x * k - wpx / 2f;
        c.save();
        c.translate(left, baseline(p, top, lh) * k - l.getLineBaseline(0));
        l.draw(c);
        c.restore();
        return w;
    }

    /**
     * Blink's baseline in a line box (measured off the web cards): ascent / descent rounded to
     * whole CSS px, half-leading floored — top + floor((lh − (A + D)) / 2) + A.
     */
    private float baseline(TextPaint p, float top, float lh) {
        Paint.FontMetrics fm = p.getFontMetrics();
        float a = Math.round(-fm.ascent / k), d = Math.round(fm.descent / k);
        return top + (float) Math.floor((lh - (a + d)) / 2) + a;
    }

    /** Wrapped RTL text right-aligned at x1 in a w-wide column, `lh` per line. Returns its height. */
    private float para(CharSequence s, float x1, float top, float w, float lh, TextPaint p) {
        StaticLayout l = layout(s, p, (int) Math.floor(w * k), Layout.Alignment.ALIGN_NORMAL);
        for (int i = 0; i < l.getLineCount(); i++) {
            int a = l.getLineStart(i), b = l.getLineEnd(i);
            while (b > a && Character.isWhitespace(s.charAt(b - 1))) b--;
            line(s.subSequence(a, b), x1, top + i * lh, lh, p, RIGHT, 0);
        }
        return l.getLineCount() * lh;
    }

    private static Path path(String data) {
        Path p = PATHS.get(data);
        if (p == null) {
            p = PathParser.createPathFromPathData(data);
            PATHS.put(data, p);
        }
        return p;
    }

    /** SVG paths from a vb×vb viewBox drawn into a size×size box at (x, y); strokes scale like SVG. */
    private void svg(String[] ds, float x, float y, float size, float vb, Paint paint) {
        if (c == null) return;
        c.save();
        c.translate(x * k, y * k);
        float s = size * k / vb;
        c.scale(s, s);
        for (String p : ds) c.drawPath(path(p), paint);
        c.restore();
    }

    /** A lucide icon (24-unit viewBox, round caps/joins). */
    private void icon(String[] ds, float x, float y, float size, int color, float strokeWidth) {
        Paint p = stroke(color, strokeWidth);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        svg(ds, x, y, size, 24, p);
    }

    /** Medallion: the 8-point star seal — gold/12 fill, gold 0.9-unit outline, number centred. */
    private void medallion(float x, float y, float size, String label, int ink) {
        svg(STAR, x, y, size, 24, fill(alpha(t.gold, 0.12f)));
        Paint s = stroke(t.gold, 0.9f);
        s.setStrokeJoin(Paint.Join.ROUND);
        svg(STAR, x, y, size, 24, s);
        if (!label.isEmpty()) line(label, x + size / 2, y + (size - r(1.75f)) / 2, r(1.75f), paint(r(1.125f), 700, ink), CENTER, 0);
    }

    private void rect(float l, float tp, float rt, float b, float radius, int color) {
        if (c == null) return;
        c.drawRoundRect(px(l, tp, rt, b), radius * k, radius * k, fill(color));
    }

    /** A rounded-rect border of width bw (inside the box). */
    private void outline(float l, float tp, float rt, float b, float radius, int color, float bw) {
        if (c == null) return;
        float h = bw / 2;
        c.drawRoundRect(px(l + h, tp + h, rt - h, b - h), (radius - h) * k, (radius - h) * k, stroke(color, bw * k));
    }

    private void circle(float cx, float cy, float radius, int color) {
        if (c != null) c.drawCircle(cx * k, cy * k, radius * k, fill(color));
    }

    /** A d-wide circle border of width bw (inside the box), solid or dashed like Chrome's (dash 3 : gap 2). */
    private void ring(float cx, float cy, float d, float bw, int color, boolean dashed) {
        if (c == null) return;
        Paint p = stroke(color, bw * k);
        float rr = (d - bw) / 2 * k;
        if (dashed) {
            double circ = 2 * Math.PI * rr;
            int n = Math.max(4, (int) Math.round(circ / (5 * bw * k)));
            float period = (float) (circ / n);
            p.setPathEffect(new DashPathEffect(new float[] { period * 0.6f, period * 0.4f }, 0));
        }
        c.drawCircle(cx * k, cy * k, rr, p);
    }

    /** `.lattice.lattice-fade`: the girih tile at 72px, centred, colour at 8%, fading out to the left. */
    private void lattice(RectF card, int color) {
        int save = c.saveLayerAlpha(card, Math.round(0.08f * 255));
        Paint st = stroke(color, 1.1f);
        float tile = 72 * k;
        float x0 = card.centerX() - tile / 2, y0 = card.centerY() - tile / 2;
        while (x0 > card.left) x0 -= tile;
        while (y0 > card.top) y0 -= tile;
        for (float y = y0; y < card.bottom; y += tile) {
            for (float x = x0; x < card.right; x += tile) {
                c.save();
                c.translate(x, y);
                c.scale(tile / 88f, tile / 88f);
                for (String p : GIRIH) c.drawPath(path(p), st);
                c.restore();
            }
        }
        Paint fade = new Paint();
        fade.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        fade.setShader(new LinearGradient(card.right, 0, card.right - 0.75f * card.width(), 0, 0xFF000000, 0x00000000, Shader.TileMode.CLAMP));
        c.drawRect(card, fade);
        c.restoreToCount(save);
    }

    /** Clears everything outside the rounded card (overflow-hidden + rounded corners, anti-aliased). */
    private void clearOutside(RectF card, float rad) {
        Path p = new Path();
        p.setFillType(Path.FillType.EVEN_ODD);
        p.addRect(0, 0, c.getWidth(), c.getHeight(), Path.Direction.CW);
        p.addRoundRect(card, rad, rad, Path.Direction.CW);
        Paint clr = new Paint(Paint.ANTI_ALIAS_FLAG);
        clr.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
        c.drawPath(p, clr);
    }

    /** CSS linear-gradient(deg, …) over a box: the gradient line through the centre, CSS length. */
    private static Shader gradient(RectF r, float deg, int[] colors, float[] stops) {
        double a = Math.toRadians(deg);
        float dx = (float) Math.sin(a), dy = (float) -Math.cos(a);
        float half = (Math.abs(r.width() * dx) + Math.abs(r.height() * dy)) / 2;
        return new LinearGradient(r.centerX() - dx * half, r.centerY() - dy * half, r.centerX() + dx * half, r.centerY() + dy * half,
                colors, stops, Shader.TileMode.CLAMP);
    }

    private static Paint fill(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }

    private static Paint stroke(int color, float w) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w);
        p.setColor(color);
        return p;
    }

    /** `color` at opacity a (Tailwind's colour/NN). */
    static int alpha(int color, float a) {
        return (Math.round(a * 255) << 24) | (color & 0xFFFFFF);
    }

    /** color-mix(in srgb, top a, base) as an opaque colour. */
    static int mix(int top, int base, float a) {
        int r = Math.round(((top >> 16) & 0xFF) * a + ((base >> 16) & 0xFF) * (1 - a));
        int g = Math.round(((top >> 8) & 0xFF) * a + ((base >> 8) & 0xFF) * (1 - a));
        int b = Math.round((top & 0xFF) * a + (base & 0xFF) * (1 - a));
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    /** A run in another face / colour (the bold count in the prayer card's pill). */
    private static final class Face extends MetricAffectingSpan {
        private final Typeface tf;
        private final int color;

        Face(Typeface tf, int color) {
            this.tf = tf;
            this.color = color;
        }

        @Override
        public void updateDrawState(TextPaint p) {
            p.setTypeface(tf);
            p.setColor(color);
        }

        @Override
        public void updateMeasureState(TextPaint p) {
            p.setTypeface(tf);
        }
    }
}
