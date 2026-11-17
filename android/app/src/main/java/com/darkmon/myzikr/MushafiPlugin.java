package com.darkmon.myzikr;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens «مصحفي» (com.hassan.mushaf, the Quran app) — mushaf://page/N or
 * mushaf://open. Resolves {opened:false} when it isn't installed so the web
 * layer can say so (startActivity needs no <queries> entry; only lookups do).
 */
@CapacitorPlugin(name = "Mushafi")
public class MushafiPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        int page = call.getInt("page", 0);
        Uri uri = Uri.parse(page >= 1 && page <= 604 ? "mushaf://page/" + page : "mushaf://open");
        Intent intent = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        JSObject ret = new JSObject();
        try {
            getActivity().startActivity(intent);
            ret.put("opened", true);
        } catch (ActivityNotFoundException e) {
            ret.put("opened", false);
        }
        call.resolve(ret);
    }
}
