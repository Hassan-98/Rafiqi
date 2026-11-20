package com.darkmon.myzikr;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** «وضع الصلاة» bridge (prayerMode.ts). The work itself lives in {@link PrayerModeReceiver}. */
@CapacitorPlugin(name = "PrayerMode")
public class PrayerModePlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        JSONObject act = PrayerModeReceiver.getActive(ctx);
        boolean active = act != null && act.optLong("end") > System.currentTimeMillis();
        JSObject ret = new JSObject();
        ret.put("policyAccess", nm != null && nm.isNotificationPolicyAccessGranted());
        ret.put("active", active);
        ret.put("activeUntil", active ? act.optLong("end") : 0L);
        ret.put("activeLabel", active ? act.optString("label") : "");
        call.resolve(ret);
    }

    /** System list «الوصول إلى وضع عدم الإزعاج» — the only place this access can be granted. */
    @PluginMethod
    public void openPolicyAccess(PluginCall call) {
        Context ctx = getContext();
        try {
            ctx.startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            // Some low-RAM / OEM builds hide it — the app's details page is the next best thing.
            try {
                ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setPlan(PluginCall call) {
        String plan = call.getString("plan");
        if (plan == null) {
            call.reject("plan is required");
            return;
        }
        PrayerModeReceiver.setPlan(getContext(), plan);
        call.resolve();
    }

    /** «جرّب الآن»: a one-minute window starting now. */
    @PluginMethod
    public void test(PluginCall call) {
        long now = System.currentTimeMillis();
        try {
            JSONObject w = new JSONObject().put("start", now).put("end", now + 60_000L).put("label", "تجربة");
            JSONObject opts = new JSONObject()
                    .put("silence", call.getString("silence", "silent"))
                    .put("use24h", Boolean.TRUE.equals(call.getBoolean("use24h", false)))
                    .put("ask", false);
            String err = PrayerModeReceiver.begin(getContext(), w, opts);
            if (err != null) call.reject(err, err);
            else call.resolve();
        } catch (Exception e) {
            call.reject("test failed: " + e.getMessage(), "failed");
        }
    }

    @PluginMethod
    public void endNow(PluginCall call) {
        PrayerModeReceiver.end(getContext(), false);
        PrayerModeReceiver.rearm(getContext());
        call.resolve();
    }
}
