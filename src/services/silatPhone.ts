import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useSilatStore } from '@/store/silatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useToastStore } from '@/store/toastStore';
import { dayKey, parseKey } from '@/store/studyModel';
import { SILAT_LINK, displayName, personLink } from '@/store/silatModel';
import { phoneKey, pickedPhone, planCallImport, telHref, waHref, type CallLogState, type CallRow } from '@/store/silatPhoneModel';
import { navigateToDeepLink } from '@/services/notifications/actions';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

/**
 * «صلة الرحم» ↔ the phone. Bridge to the native `SilatPhone` plugin (Android:
 * SilatPhonePlugin.java): the contact picker, the dialer / WhatsApp behind a
 * reminder's buttons, and the opt-in call-log import. READ_CALL_LOG is declared
 * only by the sideload flavor (android/app/src/sideload/AndroidManifest.xml);
 * the play flavor reports callLog:false and the switch stays hidden. Web and
 * desktop keep the plain tel: / wa.me links and see none of this.
 */

export interface SilatPhoneCaps {
  pickContact: boolean;
  /** This build may read the call log (sideload flavor). */
  callLog: boolean;
  callLogGranted: boolean;
}

interface SilatPhonePlugin {
  getStatus(): Promise<SilatPhoneCaps>;
  /** {} when the picker was closed. */
  pickContact(): Promise<{ name?: string; number?: string; e164?: string }>;
  /** tel: → the dialer, pre-filled (ACTION_DIAL); https: → ACTION_VIEW. */
  open(o: { url: string }): Promise<{ opened: boolean }>;
  requestCallLog(): Promise<{ granted: boolean }>;
  /** Rows after `since` whose number's key is in `keys`. Rejects with code 'denied' without the permission. */
  readCalls(o: { since: number; keys: string[] }): Promise<{ calls: CallRow[] }>;
  openAppSettings(): Promise<void>;
}

const Native = registerPlugin<SilatPhonePlugin>('SilatPhone');
const isAndroid = () => Capacitor.getPlatform() === 'android';
const NONE: SilatPhoneCaps = { pickContact: false, callLog: false, callLogGranted: false };

/** What this build can do: all false on web/desktop and on an APK from before the plugin. */
export async function silatPhoneCaps(): Promise<SilatPhoneCaps> {
  // Dev-only preview of the Android UI in a browser (set from DevTools / CDP).
  if (import.meta.env.DEV) {
    const fake = (window as { __silatPhoneFake?: SilatPhoneCaps }).__silatPhoneFake;
    if (fake) return fake;
  }
  if (!isAndroid()) return NONE;
  try {
    return await Native.getStatus();
  } catch {
    return NONE; // UNIMPLEMENTED: an APK from before the plugin
  }
}

/** The system contact picker → {name, phone in international form when known}; null when closed. */
export async function pickContact(): Promise<{ name: string; phone: string } | null> {
  try {
    const c = await Native.pickContact();
    return c.number ? { name: (c.name ?? '').trim(), phone: pickedPhone(c.number, c.e164) } : null;
  } catch {
    return null;
  }
}

/** The dialer (pre-filled — the user presses call) or WhatsApp; an older APK falls back to the WebView's link handling. */
export async function openExternal(url: string): Promise<void> {
  try {
    if ((await Native.open({ url })).opened) return;
  } catch {
    /* older APK */
  }
  window.location.href = url;
}

export async function requestCallLog(): Promise<boolean> {
  try {
    return (await Native.requestCallLog()).granted;
  } catch {
    return false;
  }
}

export function openAppSettings(): void {
  void Native.openAppSettings().catch(() => undefined);
}

// ── the call log ─────────────────────────────────────────────────────────────

/** No `myzikr:` prefix: this phone's call log and switch, never synced to the cloud. */
const KEY = 'silat-calllog';

function load(): CallLogState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CallLogState> | null;
    return { on: !!s?.on, since: Number(s?.since) || 0, seen: Array.isArray(s?.seen) ? s.seen : [] };
  } catch {
    return { on: false, since: 0, seen: [] };
  }
}

function save(s: CallLogState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota — the switch reads off next time */
  }
}

export const callLogOn = (): boolean => isAndroid() && load().on;

/** Turning it on reads from the start of today (so today's calls show at once), never further back than the last read. */
export function setCallLogOn(on: boolean): void {
  const s = load();
  save(on ? { ...s, on, since: Math.max(s.since, parseKey(dayKey(Date.now())).getTime()) } : { ...s, on });
}

/**
 * What the log sheet should offer after a call / WhatsApp opened from a button,
 * or undefined when the call log will record the call by itself.
 */
export const followUpType = (t: 'call' | 'message'): 'call' | 'message' | undefined => (t === 'call' && callLogOn() ? undefined : t);

let running: Promise<void> | null = null;

/** Read the calls since the last read and log those with saved people. Safe to call repeatedly. */
export function importCallLog(): Promise<void> {
  running ??= runImport().finally(() => {
    running = null;
  });
  return running;
}

async function runImport(): Promise<void> {
  const st = load();
  if (!st.on || !isAndroid()) return;
  const { people, entries } = useSilatStore.getState();
  // Only these keys cross the bridge back: calls with anyone else never leave the native side.
  const keys = [...new Set(people.filter((p) => !p.deletedAt && !p.deceased).map((p) => phoneKey(p.phone)))].filter((k): k is string => !!k);
  let rows: CallRow[] = [];
  if (keys.length) {
    try {
      rows = (await Native.readCalls({ since: st.since, keys })).calls ?? [];
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // Permission taken back in system settings, or an APK without the plugin: the switch shows off.
      if (code === 'denied' || code === 'UNIMPLEMENTED') save({ ...load(), on: false });
      return;
    }
  }
  const { add, next } = planCallImport(rows, people, entries, st, Date.now());
  save({ ...next, on: load().on });
  if (!add.length) return;

  const log = useSilatStore.getState().log;
  const ids = add.map((a) => log(a.personId, 'call', { at: a.at, durationMin: a.durationMin, auto: a.auto }));
  const gender = useSettingsStore.getState().gender;
  const names = [...new Set(add.map((a) => people.find((p) => p.id === a.personId)).filter((p) => !!p).map((p) => displayName(p, gender)))];
  useToastStore.getState().push({
    kind: 'success',
    title: 'سُجّلت تلقائياً · تقبّل الله',
    body: add.length === 1 ? `اتصالك ب${names[0]} · ${ar(add[0].durationMin)} د` : `${add.length === 2 ? 'مكالمتان' : `${ar(add.length)} مكالمات`}: ${names.join('، ')}`,
    durationMs: 6000,
    action: { label: 'تراجع', onPress: () => ids.forEach((id) => useSilatStore.getState().removeEntry(id)) },
  });
}

let started = false;

/** On start and on every return to the app (a call just ended is the usual reason). Android only; idempotent. */
export function startCallLogSync(): void {
  if (started || !isAndroid()) return;
  started = true;
  void importCallLog();
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void importCallLog();
  });
}

// ── notification buttons ─────────────────────────────────────────────────────

/**
 * «اتصل» / «واتساب» on a «صلة الرحم» reminder. The button opens the app (the
 * notification plugin's action intents target the activity), which opens the
 * person — with «سجّل اتصال/رسالة» waiting for the return, unless the call log
 * will record the call — and hands off to the dialer or WhatsApp.
 */
export async function handleSilatNotificationAction(actionId: string, meta?: Record<string, string>): Promise<void> {
  const p = useSilatStore.getState().people.find((x) => x.id === meta?.person && !x.deletedAt);
  if (!p?.phone) {
    navigateToDeepLink(p ? personLink(p.id) : SILAT_LINK);
    return;
  }
  const type = actionId === 'silat_wa' ? 'message' : 'call';
  const log = followUpType(type);
  navigateToDeepLink(log ? `${personLink(p.id)}&log=${log}` : personLink(p.id));
  await openExternal(type === 'call' ? telHref(p.phone) : waHref(p.phone));
}
