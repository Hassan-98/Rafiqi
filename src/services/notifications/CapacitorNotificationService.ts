import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { NotificationPayload } from '@/types';
import { displayIdFor, hashIdToInt, nextFireTime, type INotificationService, type PendingItem } from './types';
import { SOUND_DEFS, STALE_CHANNEL_IDS, getSoundDef, type SoundKey } from './sounds';
import { fullScreenAlarm } from './fullScreenAlarm';
import { ACTION_TYPES, actionKindFor } from './actions';

/**
 * Resolve the sound to use for a payload. Prefers the explicit `soundKey`;
 * falls back to the legacy `alarm` boolean for any older callers.
 */
function resolveSoundKey(payload: NotificationPayload): SoundKey {
  if (payload.soundKey) return payload.soundKey;
  return payload.alarm ? 'adhan_makkah' : 'default';
}

/**
 * `{ hashedInt → originalStringId }` fallback map (localStorage). The source of
 * truth for "what is armed" is the plugin's pending list, whose `extra`
 * carries `originalId`; the map only covers entries armed by old builds.
 */
const STORAGE_KEY = 'myzikr:notif-id-map';

function loadIdMap(): Record<number, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveIdMap(map: Record<number, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Remove ids from the map by RE-READING it at write time. The old code wrote
 * back a snapshot taken before an `await`, silently dropping every id that a
 * concurrent schedule added meanwhile — those notifications then became
 * un-cancellable (a disabled prayer kept ringing).
 */
function forgetIds(ids: Iterable<number>): void {
  const map = loadIdMap();
  for (const id of ids) delete map[id];
  saveIdMap(map);
}

/** Schedule facts we stash in `extra` so the pending list can be shown/diffed without parsing Java dates. */
interface StoredExtra {
  deepLinkPath?: string;
  moduleId?: string;
  originalId?: string;
  soundKey?: string;
  customChannelId?: string;
  meta?: Record<string, string>;
  at?: number;
  rep?: 'none' | 'daily' | 'weekly';
  h?: number;
  m?: number;
  wd?: number;
  /** Shade slot of the series — read by the patched plugin (patches/@capacitor__local-notifications*.patch). */
  displayId?: number;
}

/**
 * Capacitor-backed notification service.
 *
 * - `id` (string) → 31-bit int via `hashIdToInt` (same string → same OS slot,
 *   so re-scheduling overwrites instead of stacking).
 * - `repeatInterval` daily/weekly → `schedule.on` repeating; else `schedule.at`.
 * - `allowWhileIdle` → setExactAndAllowWhileIdle (wakes from Doze). NOTE the
 *   plugin re-arms each later repeat with a plain RTC setExact, so repeats are
 *   re-armed from JS on every resume too (see notifications/rearm.ts).
 */
export class CapacitorNotificationService implements INotificationService {
  private init: Promise<void> | null = null;

  isAvailable(): boolean {
    return true;
  }

  /**
   * Memoised: concurrent boot-time callers all await the SAME setup. The old
   * boolean flag flipped before the channels existed, so racing schedulers
   * went ahead while channel creation was still in flight.
   */
  initialize(): Promise<void> {
    this.init ??= this.setup();
    return this.init;
  }

  private async setup(): Promise<void> {
    const current = new Set(Object.values(SOUND_DEFS).map((d) => d.channelId));
    let existing: Set<string> | null = null;
    try {
      existing = new Set((await LocalNotifications.listChannels()).channels.map((c) => c.id));
    } catch {
      existing = null; // unknown → fall back to the exhaustive delete/create below
    }

    // Delete stale channels (older ids whose sound is frozen) so they don't
    // linger in system settings. With a channel listing this is 0–2 calls per
    // boot instead of ~60 blind deletes.
    const stale = existing
      ? [...existing].filter((id) => STALE_CHANNEL_IDS.includes(id) || (id.startsWith('myzikr_snd_') && !current.has(id)))
      : STALE_CHANNEL_IDS;
    for (const id of stale) {
      try {
        await LocalNotifications.deleteChannel({ id });
      } catch {
        /* channel may not exist */
      }
    }

    // One channel per registered sound (Android freezes sound + importance at
    // create time — see sounds.ts).
    for (const def of Object.values(SOUND_DEFS)) {
      if (existing?.has(def.channelId)) continue;
      try {
        await LocalNotifications.createChannel({
          id: def.channelId,
          name: def.nameAr,
          description: def.descAr,
          importance: def.importance,
          visibility: 1,
          lights: true,
          vibration: def.key !== 'silent',
          ...(def.file ? { sound: def.file } : {}),
        });
      } catch (e) {
        console.warn('[NotificationService] createChannel failed for', def.channelId, e);
      }
    }

    try {
      await LocalNotifications.registerActionTypes({ types: ACTION_TYPES });
    } catch (e) {
      console.warn('[NotificationService] registerActionTypes failed', e);
    }
  }

  async scheduleNotification(payload: NotificationPayload): Promise<void> {
    await this.initialize();

    const intId = hashIdToInt(payload.id);
    const triggerDate = new Date(payload.triggerTime);
    const rep = payload.repeatInterval === 'daily' || payload.repeatInterval === 'weekly' ? payload.repeatInterval : 'none';
    const repeats = rep !== 'none';

    // A one-shot in the past is never useful (the plugin rejects it anyway,
    // and the full-screen side used to roll it to TOMORROW).
    if (!repeats && !(triggerDate.getTime() > Date.now() + 1000)) return;

    const map = loadIdMap();
    map[intId] = payload.id;
    saveIdMap(map);

    const hour = triggerDate.getHours();
    const minute = triggerDate.getMinutes();
    const weekday = triggerDate.getDay() + 1; // Capacitor: 1 = Sunday … 7 = Saturday

    // 'daily'  → fire at hour:minute every day.
    // 'weekly' → hour:minute on the trigger's weekday (without the weekday the
    //            fasting Mon/Thu reminders fired ONCE and died).
    const schedule: LocalNotificationSchema['schedule'] = repeats
      ? { on: { ...(rep === 'weekly' ? { weekday } : {}), hour, minute }, allowWhileIdle: true, repeats: true }
      : { at: triggerDate, allowWhileIdle: true };

    const soundDef = getSoundDef(resolveSoundKey(payload));
    // A user-picked custom channel (CustomSoundPlugin) wins over the presets.
    const soundChannel = payload.customChannelId || soundDef.channelId;

    // Full-screen alarm FIRST: when it is armed it owns the sound (its heads-up
    // loops the reminder's channel sound; its alarm screen loops it on the
    // alarm stream), so the regular notification goes to the silent channel.
    // Both used to ring at once — two out-of-sync adhans — and the alarm's
    // notification shared this notification's id, randomly replacing it.
    let fsArmed = false;
    if (payload.fullScreen) {
      const fsSound = payload.customChannelId
        ? `channel:${payload.customChannelId}`
        : soundDef.key === 'silent'
          ? 'silent'
          : soundDef.file
            ? `raw:${soundDef.file.replace(/\.[a-z0-9]+$/i, '')}`
            : 'raw:azkar';
      fsArmed = await fullScreenAlarm.schedule({
        id: intId,
        atMillis: triggerDate.getTime(),
        durationMs: payload.fullScreenDurationMs ?? 10000,
        title: payload.title,
        body: payload.body || '',
        repeatDaily: rep === 'daily',
        sound: fsSound,
        channelId: soundDef.key === 'silent' ? '' : soundChannel,
        displayId: displayIdFor(payload.id),
      });
    } else {
      // Toggled off since last schedule — make sure no stale alarm remains.
      await fullScreenAlarm.cancel(intId);
    }

    const channelId = fsArmed ? SOUND_DEFS.silent.channelId : soundChannel;
    const body = payload.body || ' ';
    const extra: StoredExtra = {
      deepLinkPath: payload.deepLinkPath,
      moduleId: payload.moduleId,
      originalId: payload.id,
      soundKey: soundDef.key,
      // Carried so snooze reschedules with the SAME custom ringtone.
      customChannelId: payload.customChannelId,
      meta: payload.meta,
      at: triggerDate.getTime(),
      rep,
      h: hour,
      m: minute,
      ...(rep === 'weekly' ? { wd: weekday } : {}),
      displayId: displayIdFor(payload.id),
    };

    const notification: LocalNotificationSchema = {
      id: intId,
      title: payload.title,
      body,
      // Long bodies (weekly summary, hadith) expand instead of being cut off.
      ...(body.length > 60 ? { largeBody: body } : {}),
      schedule,
      smallIcon: 'ic_stat_myzikr',
      iconColor: '#1A6B5A',
      channelId,
      autoCancel: true,
      // Per-notification override (pre-Android-O hint); the channel's frozen
      // sound governs on Android O+.
      ...(!fsArmed && !payload.customChannelId && soundDef.file ? { sound: soundDef.file } : {}),
      actionTypeId: actionKindFor(payload),
      extra,
    };

    await LocalNotifications.schedule({ notifications: [notification] });
  }

  async cancelNotification(id: string): Promise<void> {
    const intId = hashIdToInt(id);
    try {
      // Dispatch both in the SAME tick: awaiting the first let a caller's
      // immediate re-schedule arm the new full-screen alarm, which this late
      // cancel then killed (cancelModule → scheduleModule).
      await Promise.all([LocalNotifications.cancel({ notifications: [{ id: intId }] }), fullScreenAlarm.cancel(intId)]);
    } catch (e) {
      console.warn(`[NotificationService] cancel ${id} failed`, e);
    }
    forgetIds([intId]);
  }

  /**
   * `[intId, originalId]` of everything still ARMED. Prefers the plugin's
   * pending list (fired one-shots are gone from it), so a prefix sweep never
   * touches an already-delivered notification — the plugin's cancel() also
   * DISMISSES a visible notification with that id, which used to cut a
   * ringing adhan whenever the app re-armed prayers.
   */
  private async armedIds(): Promise<Array<[number, string]>> {
    const map = loadIdMap();
    try {
      const { notifications } = await LocalNotifications.getPending();
      const pairs: Array<[number, string]> = [];
      for (const n of notifications) {
        const oid = (n.extra as StoredExtra | undefined)?.originalId ?? map[n.id];
        if (oid) pairs.push([n.id, oid]);
      }
      // Prune the fallback map to what is actually armed (it grew forever).
      const live = new Set(notifications.map((n) => n.id));
      const gone = Object.keys(map).map(Number).filter((id) => !live.has(id));
      if (gone.length) forgetIds(gone);
      return pairs;
    } catch {
      return Object.entries(map).map(([k, v]) => [Number(k), v]);
    }
  }

  /**
   * NOTE: async (reads the pending list first) — a caller that cancels a family
   * and then re-schedules ids of the SAME family must await this first.
   */
  private async cancelWhere(pred: (originalId: string) => boolean): Promise<void> {
    const targets = (await this.armedIds()).filter(([, oid]) => pred(oid));
    if (targets.length === 0) return;
    try {
      // Each may have an opt-in full-screen alarm armed under the SAME int id.
      await Promise.all([
        LocalNotifications.cancel({ notifications: targets.map(([id]) => ({ id })) }),
        ...targets.map(([id]) => fullScreenAlarm.cancel(id)),
      ]);
    } catch (e) {
      console.warn('[NotificationService] cancel failed', e);
    }
    forgetIds(targets.map(([id]) => id));
  }

  cancelAll(moduleId?: string): Promise<void> {
    // Ids come in two shapes: `myzikr_<module>_<suffix>` and the stable
    // dateless `myzikr_<module>`.
    return this.cancelWhere((oid) =>
      moduleId ? oid.includes(`_${moduleId}_`) || oid.endsWith(`_${moduleId}`) : true,
    );
  }

  /**
   * Cancel every ARMED notification whose original id starts with `prefix`,
   * except the ids in `keep` (a scheduler's freshly re-armed set).
   */
  cancelByPrefix(prefix: string, keep?: ReadonlySet<string>): Promise<void> {
    return this.cancelWhere((oid) => oid.startsWith(prefix) && !keep?.has(oid));
  }

  /**
   * Remove daily reminders armed by older builds that stamped the date into
   * the id (`myzikr_qiyam_20260615`) — each day added one more repeat. Matches
   * `myzikr_<key>_<exactly 8 digits>` only.
   */
  purgeLegacyDatedReminders(): Promise<void> {
    const DATED = /^myzikr_[\w.]+_\d{8}$/;
    return this.cancelWhere((oid) => DATED.test(oid));
  }

  async getPending(): Promise<PendingItem[]> {
    try {
      const { notifications } = await LocalNotifications.getPending();
      const now = new Date();
      const out: PendingItem[] = [];
      for (const n of notifications) {
        const ex = (n.extra ?? {}) as StoredExtra;
        const on = (n.schedule?.on ?? {}) as { hour?: number; minute?: number; weekday?: number };
        const rep = ex.rep ?? (n.schedule?.repeats ? (on.weekday ? 'weekly' : 'daily') : 'none');
        const at =
          nextFireTime({ at: ex.at, repeat: rep, hour: ex.h ?? on.hour, minute: ex.m ?? on.minute, weekday: ex.wd ?? on.weekday }, now) ??
          (n.schedule?.at ? new Date(n.schedule.at) : null);
        if (!at || Number.isNaN(at.getTime())) continue;
        out.push({
          id: ex.originalId ?? String(n.id),
          title: n.title,
          body: n.body?.trim() ?? '',
          at,
          repeat: rep,
          moduleId: ex.moduleId ?? '',
          soundKey: ex.soundKey,
        });
      }
      return out.sort((a, b) => a.at.getTime() - b.at.getTime());
    } catch {
      return [];
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      console.warn('[NotificationService] requestPermissions failed', e);
      return false;
    }
  }

  async vibrate(durationMs = 50): Promise<void> {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  }
}
