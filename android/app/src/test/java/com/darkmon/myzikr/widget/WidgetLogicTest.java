package com.darkmon.myzikr.widget;

import static org.junit.Assert.assertEquals;

import java.util.Calendar;

import org.junit.Test;

public class WidgetLogicTest {

    private static long at(int h, int m) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, h);
        c.set(Calendar.MINUTE, m);
        return c.getTimeInMillis();
    }

    private static WidgetData withPrayers(String... times) {
        WidgetData d = new WidgetData();
        d.prayers = new WidgetData.Prayer[times.length];
        for (int i = 0; i < times.length; i++) {
            d.prayers[i] = new WidgetData.Prayer();
            d.prayers[i].time = times[i];
        }
        return d;
    }

    @Test
    public void adhkarSlotFollowsPrayerTimes() {
        WidgetData d = withPrayers("05:10", "12:05", "15:20", "18:00", "19:25");
        assertEquals("sleep", DashboardWidget.adhkarSlot(d, at(5, 0))[0]);
        assertEquals("morning", DashboardWidget.adhkarSlot(d, at(5, 10))[0]);
        assertEquals("postPrayer", DashboardWidget.adhkarSlot(d, at(13, 0))[0]);
        assertEquals("evening", DashboardWidget.adhkarSlot(d, at(19, 24))[0]);
        assertEquals("sleep", DashboardWidget.adhkarSlot(d, at(23, 0))[0]);
        // no location → fallback 04:30 / 12:00 / 15:30 / 19:30
        assertEquals("morning", DashboardWidget.adhkarSlot(new WidgetData(), at(4, 30))[0]);
    }

    @Test
    public void digitsAndTimes() {
        assertEquals("١٢:٠٥", WidgetData.ar("12:05"));
        assertEquals(725, WidgetData.minutesOf("12:05"));
        assertEquals(-1, WidgetData.minutesOf("--:--"));
    }
}
