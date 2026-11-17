package com.darkmon.myzikr.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Parsed view of the JSON snapshot the web app writes to Capacitor Preferences.
 *
 * The @capacitor/preferences plugin stores values in the SharedPreferences file
 * "CapacitorStorage" with no key prefix, so we read the "widget_snapshot" key
 * directly. See src/services/widgetBridge.ts for the writer.
 */
public class WidgetData {

    public static class Prayer {
        public String name = "";
        public String time = "";
        public boolean current = false;
        public boolean passed = false;
    }

    /** A finished one-off stays on the widget this long after completion. */
    static final long DONE_TTL_MS = 24L * 60 * 60 * 1000;

    public static class Task {
        public String id = "";
        public String title = "";
        public boolean done = false;
        public String time = "";
        public String priority = "normal";
        public boolean recurring = false;
        /** The first few steps (snapshot `steps`); counts cover all of them. */
        public List<Step> steps = new ArrayList<>();
        public int stepsDone = 0;
        public int stepsTotal = 0;
    }

    /** One step (subtask) of a task, per the task's current occurrence. */
    public static class Step {
        public String id = "";
        public String title = "";
        public boolean done = false;
    }

    /**
     * The app's active palette + light/dark as opaque colours (snapshot `theme`, see
     * widgetBridge.ts). Defaults = the light «زمرد محدث» card, used until the app writes one.
     */
    public static class Theme {
        public boolean dark = false;
        public int card = 0xFFFFFFFF;
        public int text = 0xFF13201C;
        public int muted = 0xFF7C8F89;
        public int accent = 0xFF11725C;
        public int onAccent = 0xFFFFFFFF;
        public int gold = 0xFFB8923F;
        public int heroFrom = 0xFF0A5243;
        public int heroTo = 0xFF1F8D71;
        public int chip = 0xFFE7F1EE;
        public int ring = 0xFFEEEFEE;
        public int track = 0xFFF1E9D8;
        // Raw tokens for the card replicas (CardPainter).
        /** The app's root font size in CSS px (15 = «عادي»); every rem-based size scales with it. */
        public float rem = 15;
        /** Page background (cream / dark-bg) — what the cards' translucent ring sits on. */
        public int page = 0xFFF4F0E6;
        public int secondary = 0xFF455D56;
        public int goldLight = 0xFFD8BA72;
        public int goldDark = 0xFF8A6A24;
        public int creamSoft = 0xFFFAF7F0;
        public int darkSurface = 0xFF0E1C18;
    }

    /** One calendar day (Hijri with the app's offset + religious occasions). */
    public static class CalDay {
        public String key = "";
        public int day = 0;
        public String month = "";
        public int year = 0;
        public List<String> events = new ArrayList<>();
        // Home «اليوم في التقويم» card fields.
        public String weekday = "";
        public String greg = "";
        /** {title, type} of up to 3 occasion chips, card order. */
        public List<String[]> chips = new ArrayList<>();
        public String suggestion = "";
    }

    /** Today + 2 days of prayer times (epoch ms, fajr…isha) keyed 'yyyy-MM-dd'. */
    public java.util.Map<String, long[]> prayerDays = new java.util.HashMap<>();
    /** Fard prayers logged today (snapshot `prayerLog` + queued widget taps), fajr…isha. */
    public boolean[] prayerDone = new boolean[5];
    /** Prayers followed by their أذكار today (snapshot `prayerLog.adhkar` + queued taps). */
    public boolean[] prayerAdhkar = new boolean[5];
    /** Today is an excused day (women) — nothing to log. */
    public boolean prayerExcused = false;
    /** Men see Dhuhr as «الجمعة» on Fridays. */
    public boolean male = false;
    public static final String[] PRAYER_IDS = { "fajr", "dhuhr", "asr", "maghrib", "isha" };
    public static final String[] PRAYER_AR = { "الفجر", "الظهر", "العصر", "المغرب", "العشاء" };

    /** PRAYER_AR, with Dhuhr as «الجمعة» on a Friday for men (like the app's prayerName). */
    static String prayerName(int i, long atMs, boolean male) {
        if (i == 1 && male) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(atMs);
            if (c.get(Calendar.DAY_OF_WEEK) == Calendar.FRIDAY) return "الجمعة";
        }
        return PRAYER_AR[i];
    }
    /** {title, key} of the next occasions after today (calendar.upcoming). */
    public List<String[]> calUpcoming = new ArrayList<>();

    /** One active wird for the «ورد وقيام» widget. */
    public static class Wird {
        public String title = "";
        public int current = 0;
        public int total = 0;
    }

    // Section widgets (see widgetBridge.ts «Section widgets»).
    public List<CalDay> calDays = new ArrayList<>();
    /** The user's Hijri sighting offset in days (snapshot calendar.offset). */
    public int hijriOffset = 0;
    public String calNextTitle = "";
    public String calNextKey = "";
    public boolean hasKhatma = false;
    public String khatmaName = "";
    public int khatmaPct = 0;
    public int khatmaRead = 0;
    public int khatmaNextPage = 1;
    public boolean hasWird = false;
    public int wirdAmount = 0;
    public int wirdAchieved = 0;
    public String wirdUnit = "";
    /** setId → {done, total}; empty when the snapshot is from another day. */
    public java.util.Map<String, int[]> adhkar = new java.util.HashMap<>();
    public int awradActive = 0;
    public int awradDone = 0;
    public List<Wird> awradTop = new ArrayList<>();

    public Theme theme = new Theme();
    /** The app's «صيغة الوقت» (12h is the app default). */
    public boolean use24h = false;

    public boolean hasData = false;
    public String location = "";
    public String nextName = "";
    public String nextTime = "";
    public long nextAtMs = 0;
    public Prayer[] prayers = new Prayer[0];
    public double progressRate = 0;
    public int progressCompleted = 0;
    public int progressTotal = 0;
    public String tasbeehName = "";
    public int tasbeehTarget = 33;
    public long updatedAt = 0;

    // «العلم والمهام» (see widgetBridge.ts). Pending widget toggles are overlaid.
    public List<Task> tasks = new ArrayList<>();
    public int tasksDone = 0;
    public int tasksTotal = 0;
    public boolean hasStudy = false;
    public String studyCircleId = "";
    public String studyTitle = "";
    public String studyPlatform = "";
    public long studyAt = 0;
    public String studyLink = "";
    public boolean studyLive = false;

    // قيام الليل for the CURRENT night (left at defaults when the snapshot is from another night).
    public boolean qiyamDone = false;
    public long qiyamLastThirdAt = 0;
    public long qiyamFajrAt = 0;

    static final String PREFS = "CapacitorStorage";
    static final String ACTIONS_KEY = "widget_pending_actions";

    public static WidgetData load(Context ctx) {
        WidgetData d = new WidgetData();
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString("widget_snapshot", null);
            if (raw == null) return d;

            JSONObject o = new JSONObject(raw);
            try {
                parseCalendar(o, d);
            } catch (Exception ignored) {
                // calendarToday() falls back to a native Umm al-Qura date
            }
            d.updatedAt = o.optLong("updatedAt", 0);
            d.use24h = "24h".equals(o.optString("timeFormat", "12h"));
            JSONObject th = o.optJSONObject("theme");
            if (th != null) {
                Theme t = d.theme;
                t.dark = th.optBoolean("dark", false);
                t.card = color(th, "card", t.card);
                t.text = color(th, "text", t.text);
                t.muted = color(th, "muted", t.muted);
                t.accent = color(th, "accent", t.accent);
                t.onAccent = color(th, "onAccent", t.onAccent);
                t.gold = color(th, "gold", t.gold);
                t.heroFrom = color(th, "heroFrom", t.heroFrom);
                t.heroTo = color(th, "heroTo", t.heroTo);
                t.chip = color(th, "chip", t.chip);
                t.ring = color(th, "ring", t.ring);
                t.track = color(th, "track", t.track);
                t.rem = (float) th.optDouble("rem", t.rem);
                t.page = color(th, "page", t.page);
                t.secondary = color(th, "secondary", t.secondary);
                t.goldLight = color(th, "goldLight", t.goldLight);
                t.goldDark = color(th, "goldDark", t.goldDark);
                t.creamSoft = color(th, "creamSoft", t.creamSoft);
                t.darkSurface = color(th, "darkSurface", t.darkSurface);
            }
            d.location = o.optString("location", "");

            JSONObject np = o.optJSONObject("nextPrayer");
            if (np != null) {
                d.nextName = np.optString("name", "");
                d.nextTime = np.optString("time", "");
                d.nextAtMs = np.optLong("atMs", 0);
            }

            JSONArray arr = o.optJSONArray("prayers");
            if (arr != null) {
                d.prayers = new Prayer[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject p = arr.getJSONObject(i);
                    Prayer pr = new Prayer();
                    pr.name = p.optString("name", "");
                    pr.time = p.optString("time", "");
                    pr.current = p.optBoolean("current", false);
                    pr.passed = p.optBoolean("passed", false);
                    d.prayers[i] = pr;
                }
            }

            JSONObject pg = o.optJSONObject("progress");
            if (pg != null) {
                d.progressRate = pg.optDouble("rate", 0);
                d.progressCompleted = pg.optInt("completed", 0);
                d.progressTotal = pg.optInt("total", 0);
            }

            JSONObject tb = o.optJSONObject("tasbeeh");
            if (tb != null) {
                d.tasbeehName = tb.optString("name", "");
                d.tasbeehTarget = tb.optInt("target", 33);
            }

            long now = System.currentTimeMillis();
            String today = dayKey(now);
            boolean staleDay = !today.equals(dayKey(d.updatedAt));
            JSONArray ts = o.optJSONArray("tasksToday");
            int reopened = 0;
            int expired = 0;
            if (ts != null) {
                for (int i = 0; i < ts.length(); i++) {
                    JSONObject t = ts.getJSONObject(i);
                    // A one-off done over a day ago leaves the widget, even if the app
                    // hasn't rewritten the snapshot since (same rule as hiddenFromWidget).
                    long doneAt = t.optLong("doneAt", 0);
                    if (doneAt > 0 && t.optBoolean("done", false) && now - doneAt > DONE_TTL_MS) {
                        expired++;
                        continue;
                    }
                    Task tk = new Task();
                    tk.id = t.optString("id", "");
                    tk.title = t.optString("title", "");
                    tk.done = t.optBoolean("done", false);
                    tk.time = t.optString("time", "");
                    tk.priority = t.optString("priority", "normal");
                    tk.recurring = t.optBoolean("recurring", false);
                    // «مهامي» is persistent: every task stays listed, one-offs keep their state.
                    // A snapshot from an earlier day can't know a recurring task's current
                    // occurrence, so show it open until the app rewrites the snapshot.
                    if (staleDay && tk.done && tk.recurring) {
                        tk.done = false;
                        reopened++;
                    }
                    JSONArray ss = t.optJSONArray("steps");
                    if (ss != null) {
                        for (int j = 0; j < ss.length(); j++) {
                            JSONObject s = ss.optJSONObject(j);
                            if (s == null) continue;
                            Step st = new Step();
                            st.id = s.optString("id", "");
                            st.title = s.optString("title", "");
                            // Steps are per occurrence too: stale + recurring → open.
                            st.done = s.optBoolean("done", false) && !(staleDay && tk.recurring);
                            tk.steps.add(st);
                        }
                    }
                    tk.stepsTotal = Math.max(t.optInt("stepsTotal", 0), tk.steps.size());
                    tk.stepsDone = staleDay && tk.recurring ? 0 : Math.min(t.optInt("stepsDone", 0), tk.stepsTotal);
                    d.tasks.add(tk);
                }
            }
            int done = o.optInt("tasksDone", 0);
            int total = o.optInt("tasksTotal", 0);
            d.tasksDone = Math.max(0, done - reopened - expired);
            d.tasksTotal = Math.max(0, total - expired);
            overlayPending(sp, d, today);

            JSONObject ns = o.optJSONObject("nextStudy");
            if (ns != null) {
                d.hasStudy = true;
                d.studyCircleId = ns.optString("circleId", "");
                d.studyTitle = ns.optString("title", "");
                d.studyPlatform = ns.optString("platformLabel", "");
                d.studyAt = ns.optLong("at", 0);
                d.studyLink = ns.optString("link", "");
                d.studyLive = ns.optBoolean("live", false);
            }

            JSONObject q = o.optJSONObject("qiyamTonight");
            if (q != null && nightKey(now).equals(q.optString("night", ""))) {
                d.qiyamDone = q.optBoolean("done", false);
                d.qiyamLastThirdAt = q.optLong("lastThirdAt", 0);
                d.qiyamFajrAt = q.optLong("fajrAt", 0);
            }

            JSONArray pd = o.optJSONArray("prayerDays");
            if (pd != null) {
                for (int i = 0; i < pd.length(); i++) {
                    JSONObject day = pd.optJSONObject(i);
                    JSONArray tm = day != null ? day.optJSONArray("times") : null;
                    if (tm == null || tm.length() != 5) continue;
                    long[] ms = new long[5];
                    for (int j = 0; j < 5; j++) ms[j] = tm.optLong(j, 0);
                    d.prayerDays.put(day.optString("key", ""), ms);
                }
            }
            JSONObject pl = o.optJSONObject("prayerLog");
            if (pl != null) d.male = pl.optBoolean("male", false);
            if (pl != null && today.equals(pl.optString("key", ""))) {
                markPrayers(pl.optJSONArray("fard"), d.prayerDone);
                markPrayers(pl.optJSONArray("adhkar"), d.prayerAdhkar);
                d.prayerExcused = pl.optBoolean("excused", false);
            }
            overlayPrayers(sp, d, today);

            JSONObject qr = o.optJSONObject("quran");
            if (qr != null) {
                JSONObject k = qr.optJSONObject("khatma");
                if (k != null) {
                    d.hasKhatma = true;
                    d.khatmaName = k.optString("name", "");
                    d.khatmaPct = k.optInt("pct", 0);
                    d.khatmaRead = k.optInt("read", 0);
                    d.khatmaNextPage = k.optInt("nextPage", 1);
                }
                JSONObject w = qr.optJSONObject("wird");
                if (w != null) {
                    d.hasWird = true;
                    d.wirdAmount = w.optInt("amount", 0);
                    // Achievement is per day: a snapshot from yesterday means nothing read yet today.
                    d.wirdAchieved = staleDay ? 0 : w.optInt("achieved", 0);
                    d.wirdUnit = w.optString("unit", "");
                }
            }

            JSONObject ad = o.optJSONObject("adhkar");
            if (ad != null && today.equals(ad.optString("key", ""))) {
                JSONObject sets = ad.optJSONObject("sets");
                if (sets != null) {
                    JSONArray names = sets.names();
                    if (names != null) {
                        for (int i = 0; i < names.length(); i++) {
                            JSONObject st = sets.optJSONObject(names.getString(i));
                            if (st != null) d.adhkar.put(names.getString(i), new int[] { st.optInt("done", 0), st.optInt("total", 0) });
                        }
                    }
                }
            }

            JSONObject aw = o.optJSONObject("awrad");
            if (aw != null) {
                d.awradActive = aw.optInt("active", 0);
                d.awradDone = aw.optInt("done", 0);
                JSONArray top = aw.optJSONArray("top");
                if (top != null) {
                    for (int i = 0; i < top.length(); i++) {
                        JSONObject t = top.getJSONObject(i);
                        Wird w = new Wird();
                        w.title = t.optString("title", "");
                        w.current = t.optInt("current", 0);
                        w.total = t.optInt("total", 0);
                        d.awradTop.add(w);
                    }
                }
            }

            d.hasData = true;
        } catch (Exception e) {
            // Corrupt / absent snapshot — return defaults (hasData = false).
        }
        return d;
    }

    /**
     * The calendar section, parsed on its own so a problem anywhere else in the
     * snapshot can't blank the date widget.
     */
    private static void parseCalendar(JSONObject o, WidgetData d) throws Exception {
    JSONObject cal = o.optJSONObject("calendar");
    if (cal != null) {
        d.hijriOffset = cal.optInt("offset", 0);
        JSONArray days = cal.optJSONArray("days");
        if (days != null) {
            for (int i = 0; i < days.length(); i++) {
                JSONObject c = days.getJSONObject(i);
                CalDay cd = new CalDay();
                cd.key = c.optString("key", "");
                cd.day = c.optInt("day", 0);
                cd.month = c.optString("month", "");
                cd.year = c.optInt("year", 0);
                JSONArray ev = c.optJSONArray("events");
                if (ev != null) for (int j = 0; j < ev.length(); j++) cd.events.add(ev.optString(j, ""));
                cd.weekday = c.optString("weekday", "");
                cd.greg = c.optString("greg", "");
                cd.suggestion = c.isNull("suggestion") ? "" : c.optString("suggestion", "");
                JSONArray ch = c.optJSONArray("chips");
                if (ch != null) {
                    for (int j = 0; j < ch.length(); j++) {
                        JSONObject e = ch.optJSONObject(j);
                        if (e != null) cd.chips.add(new String[] { e.optString("title", ""), e.optString("type", "") });
                    }
                }
                d.calDays.add(cd);
            }
        }
        JSONObject nx = cal.optJSONObject("next");
        if (nx != null) {
            d.calNextTitle = nx.optString("title", "");
            d.calNextKey = nx.optString("key", "");
        }
        JSONArray up = cal.optJSONArray("upcoming");
        if (up != null) {
            for (int i = 0; i < up.length(); i++) {
                JSONObject u = up.optJSONObject(i);
                if (u != null) d.calUpcoming.add(new String[] { u.optString("title", ""), u.optString("key", "") });
            }
        }
    }
    }

    /** Today's calendar entry (the snapshot carries a week so it survives the app staying closed), or null. */
    public CalDay calendarToday() {
        String today = dayKey(System.currentTimeMillis());
        for (CalDay c : calDays) if (today.equals(c.key)) return c;
        return nativeToday();
    }

    private static final String[] HIJRI_MONTHS = {
            "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
            "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة" };
    private static final String[] WEEKDAYS = { "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت" };

    /**
     * Today computed on the device when the snapshot has no entry for it (the app
     * not opened since the widget was placed, a stale or unreadable snapshot):
     * Umm al-Qura — the same ICU calendar the app uses (Intl islamic-umalqura) —
     * shifted by the user's sighting offset, at local noon like the app's toHijri().
     * Occasions stay empty until the app writes them. Null only below API 24.
     */
    private CalDay nativeToday() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.N) return null;
        try {
            Calendar noon = Calendar.getInstance();
            noon.set(Calendar.HOUR_OF_DAY, 12);
            noon.set(Calendar.MINUTE, 0);
            noon.set(Calendar.SECOND, 0);
            noon.set(Calendar.MILLISECOND, 0);
            CalDay c = new CalDay();
            c.key = dayKey(noon.getTimeInMillis());
            c.weekday = WEEKDAYS[noon.get(Calendar.DAY_OF_WEEK) - 1];
            c.greg = ar(new SimpleDateFormat("d MMMM yyyy", new Locale("ar")).format(noon.getTime())) + " م";

            noon.add(Calendar.DAY_OF_MONTH, hijriOffset);
            android.icu.util.IslamicCalendar h = new android.icu.util.IslamicCalendar();
            h.setCalculationType(android.icu.util.IslamicCalendar.CalculationType.ISLAMIC_UMALQURA);
            h.setTimeInMillis(noon.getTimeInMillis());
            c.day = h.get(android.icu.util.Calendar.DAY_OF_MONTH);
            c.month = HIJRI_MONTHS[h.get(android.icu.util.Calendar.MONTH)];
            c.year = h.get(android.icu.util.Calendar.YEAR);
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    /** The five prayer times (epoch ms) of a 'yyyy-MM-dd' day, or null (no location / beyond the snapshot). */
    public long[] prayerTimes(String key) {
        long[] t = prayerDays.get(key);
        if (t != null || prayers.length != 5 || !key.equals(dayKey(updatedAt))) return t;
        // Snapshot from an app version without `prayerDays`: rebuild today's from "HH:mm".
        Calendar c = Calendar.getInstance();
        t = new long[5];
        for (int i = 0; i < 5; i++) {
            int m = minutesOf(prayers[i].time);
            if (m < 0) return null;
            c.setTimeInMillis(updatedAt);
            c.set(Calendar.HOUR_OF_DAY, m / 60);
            c.set(Calendar.MINUTE, m % 60);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            t[i] = c.getTimeInMillis();
        }
        return t;
    }

    /** Set flags[i] for every prayer id listed in `ids` (missing array → untouched). */
    private static void markPrayers(JSONArray ids, boolean[] flags) {
        if (ids == null) return;
        for (int j = 0; j < ids.length(); j++) {
            int i = java.util.Arrays.asList(PRAYER_IDS).indexOf(ids.optString(j, ""));
            if (i >= 0) flags[i] = true;
        }
    }

    /** Queue a fard log from the prayer card (protocol «prayer.toggle» in widgetBridge.ts). */
    static void queuePrayerToggle(Context ctx, int prayer, boolean done) {
        queueAction(ctx, "prayer.toggle", PRAYER_IDS[prayer], null, done);
    }

    /** Queue a prayer's أذكار from «صلوات اليوم» (protocol «prayer.adhkar.toggle» in widgetBridge.ts). */
    static void queueAdhkarToggle(Context ctx, int prayer, boolean done) {
        queueAction(ctx, "prayer.adhkar.toggle", PRAYER_IDS[prayer], null, done);
    }

    /** Apply queued prayer taps the app hasn't drained yet — with the store's rules:
     *  adhkar ⇒ fard (not on an excused day), un-logging the fard clears its adhkar. */
    private static void overlayPrayers(SharedPreferences sp, WidgetData d, String today) {
        try {
            JSONArray arr = new JSONArray(sp.getString(ACTIONS_KEY, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject a = arr.optJSONObject(i);
                if (a == null || !today.equals(a.optString("date"))) continue;
                String type = a.optString("type");
                boolean fard = "prayer.toggle".equals(type);
                if (!fard && !"prayer.adhkar.toggle".equals(type)) continue;
                int p = java.util.Arrays.asList(PRAYER_IDS).indexOf(a.optString("id"));
                if (p < 0) continue;
                if (fard) {
                    d.prayerDone[p] = a.optBoolean("done", !d.prayerDone[p]);
                    if (!d.prayerDone[p]) d.prayerAdhkar[p] = false;
                } else {
                    d.prayerAdhkar[p] = a.optBoolean("done", !d.prayerAdhkar[p]);
                    if (d.prayerAdhkar[p] && !d.prayerExcused) d.prayerDone[p] = true;
                }
            }
        } catch (Exception ignored) {
            // corrupt queue — the app clears it on its next drain
        }
    }

    /** Whole days from today to a 'yyyy-MM-dd' key (negative = past), or Integer.MIN_VALUE. */
    static int daysUntil(String key) {
        try {
            Date target = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(key);
            Date today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(dayKey(System.currentTimeMillis()));
            return (int) Math.round((target.getTime() - today.getTime()) / 86400000.0);
        } catch (Exception e) {
            return Integer.MIN_VALUE;
        }
    }

    /** "اليوم" / "غداً" / "بعد يومين" / "بعد ٥ أيام" / "بعد ٢٦ يوماً" — like the app's countdownAr. */
    static String countdownAr(int n) {
        if (n == 0) return "اليوم";
        if (n == 1) return "غداً";
        if (n == 2) return "بعد يومين";
        return n <= 10 ? "بعد " + ar(n) + " أيام" : "بعد " + ar(n) + " يوماً";
    }

    /** Apply queued widget ticks (tasks and steps) the app hasn't drained yet, so a tick sticks. */
    private static void overlayPending(SharedPreferences sp, WidgetData d, String today) {
        try {
            String raw = sp.getString(ACTIONS_KEY, null);
            if (raw == null) return;
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject a = arr.optJSONObject(i);
                if (a == null) continue;
                String type = a.optString("type");
                boolean isStep = "task.step.toggle".equals(type);
                if (!isStep && !"task.toggle".equals(type)) continue;
                if (!today.equals(a.optString("date", today))) continue;
                String id = a.optString("id", "");
                for (Task t : d.tasks) {
                    if (!t.id.equals(id)) continue;
                    if (isStep) {
                        String stepId = a.optString("stepId", "");
                        for (Step s : t.steps) {
                            if (!s.id.equals(stepId)) continue;
                            boolean next = a.has("done") ? a.optBoolean("done") : !s.done;
                            if (next != s.done) t.stepsDone = Math.max(0, Math.min(t.stepsDone + (next ? 1 : -1), t.stepsTotal));
                            s.done = next;
                        }
                        continue;
                    }
                    boolean next = a.has("done") ? a.optBoolean("done") : !t.done;
                    if (next != t.done) d.tasksDone += next ? 1 : -1;
                    t.done = next;
                }
            }
            d.tasksDone = Math.max(0, Math.min(d.tasksDone, d.tasksTotal));
        } catch (Exception ignored) {
            // corrupt queue — the app clears it on its next drain
        }
    }

    /** Append an idempotent task.toggle for the app to apply (protocol in widgetBridge.ts). */
    static void queueTaskToggle(Context ctx, String id, boolean done) {
        queueAction(ctx, "task.toggle", id, null, done);
    }

    /** Append an idempotent task.step.toggle — one step of task `id` (protocol in widgetBridge.ts). */
    static void queueStepToggle(Context ctx, String id, String stepId, boolean done) {
        queueAction(ctx, "task.step.toggle", id, stepId, done);
    }

    private static void queueAction(Context ctx, String type, String id, String stepId, boolean done) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        synchronized (WidgetData.class) {
            JSONArray arr;
            try {
                arr = new JSONArray(sp.getString(ACTIONS_KEY, "[]"));
            } catch (Exception e) {
                arr = new JSONArray();
            }
            try {
                long now = System.currentTimeMillis();
                JSONObject a = new JSONObject();
                a.put("type", type);
                a.put("id", id);
                if (stepId != null) a.put("stepId", stepId);
                a.put("at", now);
                a.put("done", done);
                a.put("date", dayKey(now));
                arr.put(a);
            } catch (Exception e) {
                return;
            }
            sp.edit().putString(ACTIONS_KEY, arr.toString()).commit();
        }
    }

    /** Local 'yyyy-MM-dd' with ASCII digits — must match the JS dayKey(). */
    static String dayKey(long ms) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(ms));
    }

    /** The night a moment belongs to (before noon → the previous evening), like qiyamNightKey(). */
    static String nightKey(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        if (c.get(Calendar.HOUR_OF_DAY) < 12) c.add(Calendar.DAY_OF_MONTH, -1);
        return dayKey(c.getTimeInMillis());
    }

    /** Western → Arabic-Indic digits. */
    public static String ar(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            b.append(ch >= '0' && ch <= '9' ? (char) ('٠' + (ch - '0')) : ch);
        }
        return b.toString();
    }

    static String ar(long n) {
        return ar(String.valueOf(n));
    }

    private static int color(JSONObject o, String key, int fallback) {
        try {
            return Color.parseColor(o.getString(key));
        } catch (Exception e) {
            return fallback;
        }
    }

    /** A time in the app's format, Arabic-Indic: "٥:٣٠ م" (12h) or "١٧:٣٠" (24h). */
    String clock(int minutesOfDay) {
        int h = minutesOfDay / 60 % 24;
        int m = minutesOfDay % 60;
        if (use24h) return ar(String.format(Locale.US, "%02d:%02d", h, m));
        int h12 = (h + 11) % 12 + 1;
        return ar(String.format(Locale.US, "%d:%02d %s", h12, m, h < 12 ? "ص" : "م"));
    }

    /** {@link #clock(int)} of an epoch ms. */
    String clock(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return clock(c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE));
    }

    /** {@link #clock(int)} of a raw snapshot "HH:mm" (unparseable → shown as-is). */
    String clock(String hhmm) {
        int m = minutesOf(hhmm);
        return m < 0 ? ar(hhmm) : clock(m);
    }

    /** Minutes since midnight of an "HH:mm" string, or -1. */
    static int minutesOf(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim());
        } catch (Exception e) {
            return -1;
        }
    }
}
