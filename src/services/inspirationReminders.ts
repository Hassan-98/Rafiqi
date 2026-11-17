/**
 * «آية وحديث» notifications.
 *
 * A local notification must carry its text when it is SCHEDULED, so instead
 * of one repeating reminder we pre-schedule a rolling horizon (next
 * HORIZON_DAYS days of slots, ≤ MAX_SLOTS) with one-shot notifications.
 *
 * IDS ARE STABLE SLOT INDEXES — `myzikr_insp_0 … myzikr_insp_23` — never a
 * date (see memory: notif-stable-id-rule). Every re-plan (boot, resume,
 * settings change) overwrites the same ids, and ids past the new plan's
 * length are cancelled, so nothing ever stacks.
 *
 * Content per slot is seeded by the slot's timestamp, so re-planning on every
 * resume keeps an upcoming slot's ayah/hadith the same. Slots that passed
 * since the last plan are treated as delivered and go into the recent ring,
 * which later picks avoid.
 */
import {
  dayContext,
  getRecent,
  hashSeed,
  isQudsi,
  loadCorpus,
  markSeen,
  pickSeeded,
  seededRandom,
  shareText,
  type InspirationItem,
  type InspirationKind,
} from './inspirationService';
import { useInspirationStore, type InspirationSettings } from '@/store/inspirationStore';
import type { NotificationPayload } from '@/types';

export const INSP_ID_PREFIX = 'myzikr_insp_';
export const MAX_SLOTS = 24;
export const HORIZON_DAYS = 3;
/** Notification bodies stay readable; long Nawawi texts live in the library. */
const NOTIF_MAX_LEN = 450;
const PLAN_KEY = 'myzikr:inspiration-plan';

export interface QuietHours {
  start: string; // HH:mm
  end: string;
}

export interface PlannedSlot {
  id: string;
  at: Date;
  item: InspirationItem;
  label?: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function inQuiet(minuteOfDay: number, q: QuietHours): boolean {
  const s = toMin(q.start);
  const e = toMin(q.end);
  if (s === e) return false;
  return s < e ? minuteOfDay >= s && minuteOfDay < e : minuteOfDay >= s || minuteOfDay < e;
}

/** Minutes-of-day for one day's slots. */
export function dailyMinutes(s: InspirationSettings): number[] {
  if (s.interval === 'daily') return [toMin(s.dailyTime)];
  const start = toMin(s.windowStart);
  let end = toMin(s.windowEnd);
  if (end <= start) end += 24 * 60; // window crosses midnight
  if (s.interval === 'twice') return end - 60 > start ? [start, end - 60] : [start];
  const step = { h2: 120, h3: 180, h6: 360 }[s.interval] ?? 180;
  const out: number[] = [];
  for (let t = start; t <= end; t += step) out.push(t);
  return out;
}

/** Upcoming slot times from `from`. Quiet hours apply to the interval modes, not an explicit daily time. */
export function slotTimes(s: InspirationSettings, from: Date, quiet: QuietHours | null, days = HORIZON_DAYS): Date[] {
  const mins = dailyMinutes(s);
  const out: Date[] = [];
  const minLead = from.getTime() + 60_000;
  for (let d = 0; d <= days; d++) {
    for (const m of mins) {
      const at = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d, 0, m, 0, 0);
      if (at.getTime() <= minLead) continue;
      if (at.getTime() > from.getTime() + days * 86_400_000) continue;
      if (quiet && s.interval !== 'daily' && inQuiet(at.getHours() * 60 + at.getMinutes(), quiet)) continue;
      out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, MAX_SLOTS);
}

function kindFor(s: InspirationSettings, rand: () => number): InspirationKind {
  if (s.mix === 'ayat') return 'ayah';
  if (s.mix === 'hadith') return 'hadith';
  return rand() < 0.5 ? 'ayah' : 'hadith';
}

/** Pure planner: slot times → day-appropriate, non-repeating items. */
export function planInspiration(
  s: InspirationSettings,
  items: InspirationItem[],
  from: Date,
  opts: { quiet?: QuietHours | null; recent?: string[] } = {},
): PlannedSlot[] {
  const used = new Set(opts.recent ?? []);
  return slotTimes(s, from, opts.quiet ?? null).flatMap((at, i) => {
    const rand = seededRandom(hashSeed(`insp:${at.getTime()}`));
    const ctx = s.dayAware ? dayContext(at) : { tags: [], strength: 0 };
    const item = pickSeeded(items, ctx, rand, { kind: kindFor(s, rand), maxLen: NOTIF_MAX_LEN, exclude: used });
    if (!item) return [];
    used.add(item.id);
    return [{ id: `${INSP_ID_PREFIX}${i}`, at, item, label: ctx.label }];
  });
}

export function notificationTitle(item: InspirationItem, label?: string): string {
  const base = item.kind === 'ayah' ? 'آية للتدبّر' : isQudsi(item) ? 'حديث قدسي' : 'حديث نبوي';
  return label ? `${base} · ${label}` : base;
}

export function toPayload(p: PlannedSlot): NotificationPayload {
  const { item } = p;
  return {
    id: p.id,
    title: notificationTitle(item, p.label),
    body: shareText(item),
    triggerTime: p.at.toISOString(),
    repeatInterval: 'none',
    moduleId: 'inspiration',
    deepLinkPath: `/#/hadith?id=${encodeURIComponent(item.id)}`,
    soundKey: 'quran',
  };
}

// ─── Runtime ───────────────────────────────────────────────────────────────

interface StoredPlan {
  count: number;
  slots: { at: number; itemId: string }[];
}

function readPlan(): StoredPlan {
  try {
    const v = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null') as StoredPlan | null;
    if (v && typeof v.count === 'number' && Array.isArray(v.slots)) return v;
  } catch {
    /* fall through */
  }
  return { count: 0, slots: [] };
}

function writePlan(p: StoredPlan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(p));
  } catch {
    /* best-effort */
  }
}

async function quietHours(): Promise<QuietHours | null> {
  try {
    const { getSmartPrefs } = await import('@/store/notificationStore');
    const p = getSmartPrefs();
    return p.quietEnabled ? { start: p.quietStart, end: p.quietEnd } : null;
  } catch {
    return null;
  }
}

/** Upcoming plan without scheduling anything (settings preview «القادم»). */
export async function previewInspiration(s: InspirationSettings = useInspirationStore.getState().settings, now = new Date()): Promise<PlannedSlot[]> {
  if (!s.enabled) return [];
  const items = await loadCorpus();
  return planInspiration(s, items, now, { quiet: await quietHours(), recent: getRecent() });
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Re-plan and (re)arm the rolling horizon. Idempotent; call on boot, on app
 * resume, and after any settings change. Calls are serialised.
 */
export function rescheduleInspiration(now = new Date()): Promise<PlannedSlot[]> {
  const run = async (): Promise<PlannedSlot[]> => {
    const { notificationService } = await import('@/services/NotificationService');
    const prev = readPlan();
    // Slots that fired since the last plan were seen — keep them out of new picks.
    markSeen(prev.slots.filter((x) => x.at <= now.getTime()).map((x) => x.itemId));

    const s = useInspirationStore.getState().settings;
    const plan = s.enabled ? await previewInspiration(s, now) : [];
    if (notificationService.isAvailable()) {
      for (const p of plan) await notificationService.scheduleNotification(toPayload(p));
      for (let i = plan.length; i < prev.count; i++) {
        await notificationService.cancelNotification(`${INSP_ID_PREFIX}${i}`);
      }
    }
    writePlan({ count: plan.length, slots: plan.map((p) => ({ at: p.at.getTime(), itemId: p.item.id })) });
    return plan;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

/** A one-off sample in ~5 seconds, so the user can see how it looks. */
export async function sendInspirationTest(): Promise<boolean> {
  const { notificationService } = await import('@/services/NotificationService');
  if (!notificationService.isAvailable()) return false;
  if (!(await notificationService.requestPermission())) return false;
  const s = useInspirationStore.getState().settings;
  const items = await loadCorpus();
  const at = new Date(Date.now() + 5000);
  const ctx = s.dayAware ? dayContext(at) : { tags: [], strength: 0 };
  const item = pickSeeded(items, ctx, Math.random, { kind: kindFor(s, Math.random), maxLen: NOTIF_MAX_LEN, exclude: new Set(getRecent()) });
  if (!item) return false;
  await notificationService.scheduleNotification({
    ...toPayload({ id: `${INSP_ID_PREFIX}test`, at, item, label: ctx.label }),
    moduleId: 'test',
  });
  return true;
}
