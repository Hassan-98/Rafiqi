/**
 * Android WebView bridge interface.
 *
 * The Android host app must expose a `window.Android` object implementing
 * this interface via `WebView.addJavascriptInterface(bridge, "Android")`.
 *
 * Required Android-side implementation notes:
 * ---
 * @AndroidJavascriptInterface
 * fun scheduleNotification(payload: String) {
 *   val json = JSONObject(payload)
 *   // Use WorkManager or AlarmManager to schedule local notification
 *   // deepLinkPath can be used as intent data URI for deep linking
 * }
 *
 * @AndroidJavascriptInterface
 * fun cancelNotification(id: String) {
 *   // Cancel notification by tag/id in NotificationManager
 *   // Cancel corresponding WorkManager work by unique name
 * }
 *
 * @AndroidJavascriptInterface
 * fun requestPermission() {
 *   // POST_NOTIFICATIONS permission request (Android 13+)
 *   ActivityCompat.requestPermissions(activity, arrayOf(POST_NOTIFICATIONS), REQ_CODE)
 * }
 *
 * @AndroidJavascriptInterface
 * fun getDeviceLanguage(): String {
 *   return Locale.getDefault().language // returns "ar", "en", etc.
 * }
 *
 * @AndroidJavascriptInterface
 * fun vibrate(durationMs: String) {
 *   val vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
 *   vibrator.vibrate(durationMs.toLong())
 * }
 * ---
 */
export interface AndroidBridge {
  /**
   * Schedule a local notification.
   * @param payload JSON-stringified {@link NotificationPayload}
   */
  scheduleNotification(payload: string): void;

  /**
   * Cancel a previously scheduled notification by its ID.
   * @param id The notification ID string
   */
  cancelNotification(id: string): void;

  /**
   * Request POST_NOTIFICATIONS permission on Android 13+.
   */
  requestPermission(): void;

  /**
   * Get the device's configured language code (e.g. "ar", "en").
   */
  getDeviceLanguage(): string;

  /**
   * Trigger device vibration for haptic feedback.
   * @param durationMs Duration in milliseconds as string
   */
  vibrate(durationMs: string): void;
}

declare global {
  interface Window {
    /**
     * Injected by the Android WebView host.
     * Always guard with `if (window.Android)` before calling.
     */
    Android?: AndroidBridge;
  }
}

export { };
