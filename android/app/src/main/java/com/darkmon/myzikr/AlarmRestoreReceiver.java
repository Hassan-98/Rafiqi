package com.darkmon.myzikr;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationSchedule;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;

import java.util.Date;

/**
 * Keeps reminders alive across reboot, app update, clock/timezone changes and
 * exact-alarm permission changes.
 *
 * 1. Re-arms the full-screen alarms ({@link FullScreenAlarmStore}) — nothing
 *    did before, so they all died on the first restart.
 * 2. On BOOT only, runs BEFORE the Capacitor restore receiver (BOOT_COMPLETED
 *    is an ordered broadcast; this receiver has a higher priority) and drops
 *    one-shot notifications that were due long before now. Capacitor's
 *    receiver fires EVERY past one-shot 15 s after boot, so a phone that was
 *    off overnight woke up to a burst of stale «حان وقت أذان الفجر» /
 *    pre-adhan / iqama alerts all playing at once. Anything at most
 *    {@link FullScreenAlarmStore#GRACE_MS} late is kept and still delivered.
 */
public class AlarmRestoreReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                dropStaleOneShots(ctx);
            } catch (Exception ignored) {
            }
        }
        try {
            FullScreenAlarmStore.rearmAll(ctx);
        } catch (Exception ignored) {
        }
    }

    private static void dropStaleOneShots(Context ctx) {
        NotificationStorage storage = new NotificationStorage(ctx);
        long cutoff = System.currentTimeMillis() - FullScreenAlarmStore.GRACE_MS;
        for (String id : storage.getSavedNotificationIds()) {
            LocalNotification n = storage.getSavedNotification(id);
            if (n == null) continue;
            LocalNotificationSchedule s = n.getSchedule();
            if (s == null || Boolean.TRUE.equals(s.getRepeats()) || s.getOn() != null || s.getEvery() != null) continue;
            Date at = s.getAt();
            if (at != null && at.getTime() < cutoff) storage.deleteNotification(id);
        }
    }
}
