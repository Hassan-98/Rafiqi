package com.darkmon.myzikr;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.PhoneNumberUtils;
import android.telephony.TelephonyManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.util.PermissionHelper;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * «صلة الرحم» ↔ the phone (silatPhone.ts).
 *  - pickContact: the system picker on phone rows (ACTION_PICK). It grants read
 *    access to the ONE row picked, so no READ_CONTACTS.
 *  - open: tel: → ACTION_DIAL (pre-filled; the user presses call, so no
 *    CALL_PHONE), https: → ACTION_VIEW (wa.me → WhatsApp).
 *  - readCalls: call-log rows after a time whose number matches one of the
 *    given keys. Rows matching nobody never leave this class. READ_CALL_LOG is
 *    declared ONLY by the sideload flavor (src/sideload/AndroidManifest.xml —
 *    Play restricts it); getStatus reports callLog:false elsewhere.
 */
@CapacitorPlugin(
    name = "SilatPhone",
    permissions = { @Permission(strings = { Manifest.permission.READ_CALL_LOG }, alias = "callLog") }
)
public class SilatPhonePlugin extends Plugin {

    private boolean callLogDeclared() {
        return PermissionHelper.hasDefinedPermission(getContext(), Manifest.permission.READ_CALL_LOG);
    }

    private boolean callLogGranted() {
        return callLogDeclared() && getPermissionState("callLog") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("pickContact", true);
        ret.put("callLog", callLogDeclared());
        ret.put("callLogGranted", callLogGranted());
        call.resolve(ret);
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        try {
            startActivityForResult(call, new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI), "pickResult");
        } catch (ActivityNotFoundException e) {
            call.reject("no contacts app", "unavailable");
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(ret); // closed without a pick
            return;
        }
        String[] proj = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER,
        };
        try (Cursor c = getContext().getContentResolver().query(data.getData(), proj, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String number = c.getString(1);
                String e164 = c.getString(2);
                if ((e164 == null || e164.isEmpty()) && number != null) {
                    String iso = countryIso();
                    if (iso != null) e164 = PhoneNumberUtils.formatNumberToE164(number, iso);
                }
                ret.put("name", c.getString(0));
                ret.put("number", number);
                if (e164 != null) ret.put("e164", e164);
            }
        } catch (Exception e) {
            call.reject("could not read the contact", "failed");
            return;
        }
        call.resolve(ret);
    }

    /** The SIM's country (home numbers are saved in its local form), then the network's, then the locale's. */
    private String countryIso() {
        TelephonyManager tm = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        String iso = tm != null ? tm.getSimCountryIso() : null;
        if ((iso == null || iso.isEmpty()) && tm != null) iso = tm.getNetworkCountryIso();
        if (iso == null || iso.isEmpty()) iso = Locale.getDefault().getCountry();
        return iso == null || iso.isEmpty() ? null : iso.toUpperCase(Locale.ROOT);
    }

    @PluginMethod
    public void open(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        String scheme = uri.getScheme();
        if (!"tel".equals(scheme) && !"https".equals(scheme)) {
            call.reject("unsupported url", "unsupported");
            return;
        }
        Intent intent = new Intent("tel".equals(scheme) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, uri);
        JSObject ret = new JSObject();
        try {
            Activity act = getActivity();
            if (act != null) act.startActivity(intent);
            else getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            ret.put("opened", true);
        } catch (ActivityNotFoundException e) {
            ret.put("opened", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestCallLog(PluginCall call) {
        if (!callLogDeclared() || callLogGranted()) resolveGranted(call, callLogGranted());
        else requestPermissionForAlias("callLog", call, "callLogResult");
    }

    @PermissionCallback
    private void callLogResult(PluginCall call) {
        resolveGranted(call, callLogGranted());
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void readCalls(PluginCall call) {
        if (!callLogGranted()) {
            call.reject("call log permission not granted", "denied");
            return;
        }
        long since = call.getLong("since", 0L);
        JSArray keyArr = call.getArray("keys", new JSArray());
        Set<String> keys = new HashSet<>();
        for (int i = 0; i < keyArr.length(); i++) {
            String k = keyArr.optString(i, "");
            if (!k.isEmpty()) keys.add(k);
        }
        JSArray out = new JSArray();
        if (!keys.isEmpty()) {
            String[] proj = { CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE };
            try (
                Cursor c = getContext().getContentResolver().query(
                    CallLog.Calls.CONTENT_URI, proj, CallLog.Calls.DATE + " > ?", new String[] { String.valueOf(since) }, CallLog.Calls.DATE + " ASC")
            ) {
                while (c != null && c.moveToNext()) {
                    String key = key(c.getString(1));
                    if (key == null || !keys.contains(key)) continue;
                    JSObject row = new JSObject();
                    row.put("id", c.getLong(0));
                    row.put("date", c.getLong(2));
                    row.put("duration", c.getLong(3));
                    row.put("type", c.getInt(4));
                    row.put("key", key);
                    out.put(row);
                }
            } catch (SecurityException e) {
                call.reject("call log permission not granted", "denied");
                return;
            } catch (Exception e) {
                call.reject("could not read the call log", "failed");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("calls", out);
        call.resolve(ret);
    }

    /** Same rule as phoneKey() in silatPhoneModel.ts: digits only, the last 9; null under 7 digits. */
    static String key(String number) {
        if (number == null) return null;
        StringBuilder d = new StringBuilder();
        for (int i = 0; i < number.length(); i++) {
            int v = Character.digit(number.charAt(i), 10);
            if (v >= 0) d.append((char) ('0' + v));
        }
        return d.length() >= 7 ? d.substring(Math.max(0, d.length() - 9)) : null;
    }

    /** App info — where a permission refused twice can still be granted. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            getContext().startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            );
        } catch (Exception ignored) {
        }
        call.resolve();
    }
}
