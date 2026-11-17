package com.darkmon.myzikr;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Schedules an exact alarm that, at the given time, fires
 * {@link FullScreenAlarmReceiver} to raise a full-screen, incoming-call-style
 * alarm screen ({@link FullScreenAlarmActivity}) — over other apps and able to
 * wake a locked device. This is in addition to the normal LocalNotification;
 * each reminder opts in via its "full-screen alarm" toggle.
 */
@CapacitorPlugin(name = "FullScreenAlarm")
public class FullScreenAlarmPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer id = call.getInt("id");
        String atStr = call.getString("atMillis");
        if (id == null || atStr == null) {
            call.reject("id and atMillis are required");
            return;
        }
        long at;
        try {
            at = Long.parseLong(atStr);
        } catch (NumberFormatException e) {
            call.reject("atMillis must be a numeric string");
            return;
        }
        FullScreenAlarmStore.Spec s = new FullScreenAlarmStore.Spec();
        s.key = "a" + id;
        s.id = id;
        s.at = at;
        s.durationMs = call.getInt("durationMs", 10000);
        s.title = call.getString("title", "تنبيه");
        s.body = call.getString("body", "");
        s.repeatDaily = Boolean.TRUE.equals(call.getBoolean("repeatDaily", false));
        s.use24h = Boolean.TRUE.equals(call.getBoolean("use24h", false));
        // Ringtone spec: "raw:<res>", "channel:<id>", "silent" or "" (device default).
        s.sound = call.getString("sound", "");
        // Sound channel the heads-up rings on when the alarm screen can't show.
        s.channelId = call.getString("channelId", "");
        Integer displayId = call.getInt("displayId");
        s.displayId = displayId == null ? -1 : displayId;

        if (s.repeatDaily) {
            // Daily alarms keep their wall-clock time (DST-safe), rolled to the next occurrence.
            s.setWallTimeFrom(at);
            s.at = FullScreenAlarmStore.nextDaily(s.hour, s.minute);
        } else if (at <= System.currentTimeMillis() + 1000) {
            // A past one-shot used to be rolled forward by whole days — i.e. it rang TOMORROW.
            call.reject("time is in the past");
            return;
        }

        Context ctx = getContext();
        try {
            FullScreenAlarmStore.cancel(ctx, id, false); // clears a pre-data-URI alarm from older builds; keeps a pending snooze
            FullScreenAlarmStore.arm(ctx, s);
            FullScreenAlarmStore.put(ctx, s);
            call.resolve();
        } catch (Exception e) {
            call.reject("schedule failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        Context ctx = getContext();
        FullScreenAlarmStore.cancel(ctx, id);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(FullScreenAlarmReceiver.TAG, id);
        call.resolve();
    }

    /** This app's notification settings — the only way back once the permission was denied. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Context ctx = getContext();
            try {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, true);
        call.resolve();
    }

    /** Report whether the OS will actually let the full-screen alarm work. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am != null && am.canScheduleExactAlarms();
        }
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            fullScreen = nm != null && nm.canUseFullScreenIntent();
        }
        boolean batteryUnrestricted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            batteryUnrestricted = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("exactAlarm", exact);
        ret.put("fullScreen", fullScreen);
        ret.put("batteryUnrestricted", batteryUnrestricted);
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        NotificationManager nmgr = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        ret.put("notificationsEnabled", nmgr == null || nmgr.areNotificationsEnabled());
        call.resolve(ret);
    }

    private void openSettings(String action, boolean withPackage) {
        Context ctx = getContext();
        try {
            Intent i = withPackage
                    ? new Intent(action, Uri.parse("package:" + ctx.getPackageName()))
                    : new Intent(action);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void requestExactAlarm(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, true);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestFullScreen(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            // Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
            openSettings("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", true);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBattery(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            openSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, true);
        }
        call.resolve();
    }

    /**
     * Candidate (package, activity) pairs for the per-OEM "Autostart" /
     * "background start" allowlist. There is NO Android API to read or grant
     * this — these aggressive skins (MIUI/ColorOS/Vivo/Huawei/…) gate background
     * alarms behind it. We try each explicit component until one launches; only
     * the device's own OEM app is present, so the rest throw and are skipped.
     */
    private static final String[][] AUTOSTART_INTENTS = new String[][]{
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
            {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
            {"com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"},
            {"com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity"},
            {"com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"},
    };

    /** Open the device's autostart/background-start allowlist screen, if any. */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Context ctx = getContext();
        for (String[] pair : AUTOSTART_INTENTS) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(pair[0], pair[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve();
                return;
            } catch (Exception ignored) {
                // Component not present on this device — try the next candidate.
            }
        }
        // No known OEM screen — fall back to the app's details page.
        openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, true);
        call.resolve();
    }

    /** Fire a full-screen alarm a few seconds from now so the user can verify it. */
    @PluginMethod
    public void test(PluginCall call) {
        FullScreenAlarmStore.Spec s = new FullScreenAlarmStore.Spec();
        s.key = "a990001";
        s.id = 990001;
        s.at = System.currentTimeMillis() + 4000;
        s.title = call.getString("title", "تجربة التنبيه");
        s.body = call.getString("body", "هكذا سيظهر التنبيه عند حلول الوقت");
        s.durationMs = call.getInt("durationMs", 10000);
        s.use24h = Boolean.TRUE.equals(call.getBoolean("use24h", false));
        s.sound = call.getString("sound", "");
        s.channelId = call.getString("channelId", "");
        try {
            FullScreenAlarmStore.arm(getContext(), s);
            call.resolve();
        } catch (Exception e) {
            call.reject("test failed: " + e.getMessage());
        }
    }
}
