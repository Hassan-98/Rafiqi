import { create } from 'zustand';
import { RESCUE_WINDOW } from '@/services/streakRescueMath';
import { persist } from 'zustand/middleware';
import { notificationService } from '@/services/NotificationService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { logActivity } from '@/store/activityLogStore';
import type { SoundKey } from '@/services/notifications/sounds';

/** What a target counts. Not limited to adhkar — duaa, or a Quran amount. */
export type TargetUnit = 'dhikr' | 'duaa' | 'ayah' | 'surah' | 'page' | 'juz' | 'times';

export const TARGET_UNIT_LABEL: Record<TargetUnit, string> = {
  dhikr: 'ذِكر',
  duaa: 'دعاء',
  ayah: 'آية',
  surah: 'سورة',
  page: 'صفحة',
  juz: 'جزء',
  times: 'مرّة',
};

/** How often a target repeats. `none` = a one-off goal with a fixed deadline. */
export type TargetRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export const TARGET_RECURRENCE_LABEL: Record<TargetRecurrence, string> = {
  none: 'مرّة واحدة',
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
};

export interface Target {
  id: string;
  title: string;
  unit: TargetUnit;
  total: number;
  current: number;
  /** Optional text/dhikr to show + recite on the target page. */
  note?: string;
  createdAt: number;
  /** Epoch ms when the target period ends. */
  deadline: number;
  /** Reminder cadence in minutes (e.g. 15, 30, 60, 1440 = daily). */
  intervalMinutes: number;
  reminderEnabled: boolean;
  soundKey?: SoundKey;
  customChannelId?: string;
  customLabel?: string;
  /** Full-screen, incoming-call-style alarm at each reminder (Android). */
  fullScreen?: boolean;
  completedAt?: number;

  // ── Recurrence ──
  /** Repeat cadence. When set (≠ 'none') the target rolls over to a new
   *  period on completion instead of finishing permanently. */
  recurrence?: TargetRecurrence;
  /** Consecutive periods completed (for recurring targets). */
  streak?: number;
  /** Bonus (نافلة) reps logged after the period goal was met. Resets each
   *  period — never carried into the next one. */
  extra?: number;
  /** When true, the part of the goal left unfinished at period end is ADDED to
   *  the next period's goal (e.g. 100/200 today → 0/300 tomorrow). */
  carryOver?: boolean;
  /** The recurring per-period base goal, kept separate from `total` so carried
   *  debt doesn't compound: each period `total = baseTotal + unfinished`. */
  baseTotal?: number;
  /** «استعادة السلسلة» — set when a daily wird's streak breaks: today's goal
   *  +50% per missed day (for up to a week) restores it. See acceptRescue. */
  rescue?: TargetRescue;

  // ── Quran scope (optional, for ayah/surah/page/juz units) ──
  quranSurah?: number;
  quranFrom?: number;
  quranTo?: number;

  // ── Attached adhkar/duaa to recite (for dhikr/duaa units) ──
  /** Texts shown alongside the counter on the target page. */
  items?: string[];
}

export interface TargetRescue {
  /** The streak that was lost. */
  lost: number;
  /** Days since the break (1 = the day after): the offer is base × (1 + step/2). */
  step: number;
  /** Added to `total` once accepted for the current period — not نافلة. */
  surcharge?: number;
  /** The raised goal was met: `streak` already holds the restored chain. */
  restored?: boolean;
}

export { RESCUE_WINDOW };

/** Carried backlog on a recurring wird (excludes a rescue surcharge). */
export const carriedOf = (t: Target): number =>
  t.baseTotal != null ? Math.max(0, t.total - t.baseTotal - (t.rescue?.surcharge ?? 0)) : 0;

/** The open rescue offer on a wird, if any (not yet restored). */
export const liveRescue = (t: Target): TargetRescue | undefined =>
  t.rescue && !t.rescue.restored ? t.rescue : undefined;

/**
 * One CLOSED period of a wird (written when a recurring target rolls over, or
 * a one-off completes) — the data source for إحصائيات الأوراد. Title/unit are
 * snapshotted so history survives edits and deletion of the wird itself.
 */
export interface TargetPeriodRecord {
  targetId: string;
  title: string;
  unit: TargetUnit;
  /** When the period closed (the elapsed deadline / completion time). */
  endedAt: number;
  /** Period goal including carried debt. */
  goal: number;
  /** The per-period base goal (excludes carry). */
  base: number;
  /** Amount achieved within the goal. */
  done: number;
  /** Bonus (نافلة) beyond the goal. */
  extra: number;
  completed: boolean;
}

/** Cap so years of periods can't bloat storage (≈ a year of daily awrad). */
const MAX_HISTORY = 500;

/** Which units are Quran-related (get a "go to Quran" action + range fields). */
export const QURAN_UNITS: TargetUnit[] = ['ayah', 'surah', 'page', 'juz'];
/** Which units attach a list of adhkar/duaa to recite. */
export const RECITE_UNITS: TargetUnit[] = ['dhikr', 'duaa'];

export type NewTargetInput = Omit<Target, 'id' | 'current' | 'createdAt' | 'completedAt'> &
  Partial<Pick<Target, 'current'>>;

// ── reminder scheduling ──────────────────────────────────────────────────────
// Cap so a tight interval over a long span can't flood — Android allows ~500
// alarms per app in total (prayers alone take up to 75). Re-armed on every
// app resume (notifications/rearm.ts), so a smaller window loses nothing.
const MAX_OCCURRENCES = 24;

function remainingTimeAr(ms: number): string {
  if (ms <= 0) return 'انتهى وقت الهدف';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `يتبقّى ${toArabicDigits(mins)} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `يتبقّى ${toArabicDigits(hours)} ساعة`;
  const days = Math.round(hours / 24);
  return `يتبقّى ${toArabicDigits(days)} يوم`;
}

function cancelReminders(id: string): Promise<void> {
  return Promise.resolve(notificationService.cancelAll(`target_${id}`));
}

async function scheduleReminders(t: Target): Promise<void> {
  // Await the sweep: it reads the pending list first, so without the await it
  // could land AFTER the fresh occurrences below and cancel them.
  await cancelReminders(t.id);
  if (!t.reminderEnabled || t.completedAt) return;
  const now = Date.now();
  if (t.deadline <= now) return;
  const intervalMs = Math.max(1, t.intervalMinutes) * 60_000;
  const remaining = Math.max(0, t.total - t.current);
  // Goal met for this (period) — stop nagging until it rolls over / is reset.
  if (remaining <= 0) return;

  let fire = now + intervalMs;
  let k = 0;
  while (fire <= t.deadline && k < MAX_OCCURRENCES) {
    void notificationService.scheduleNotification({
      id: `myzikr_target_${t.id}_${k}`,
      title: `🎯 ${t.title}`,
      body: `${toArabicDigits(remaining)} ${TARGET_UNIT_LABEL[t.unit]} متبقّية · ${remainingTimeAr(t.deadline - fire)}`,
      triggerTime: new Date(fire).toISOString(),
      repeatInterval: 'none',
      moduleId: 'targets',
      deepLinkPath: `/#/targets/${t.id}`,
      soundKey: t.soundKey ?? 'target',
      customChannelId: t.customChannelId,
      fullScreen: t.fullScreen,
    });
    fire += intervalMs;
    k += 1;
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;
}

/** Last ms of the local day `n` days after the one holding `ts` — the next
 *  local midnight − 1 ms. Never `setHours(23,59,59,999)` / `+ 86_400_000`: on
 *  a fall-back night (Egypt 2026-10-29, 24:00 → 23:00) the day is 25 h and
 *  23:59:59.999 happens twice, so a daily wird closed an hour early and a
 *  phantom one-hour «day» followed — two resets, every streak broken. */
function endOfDay(ts: number, n = 0): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n + 1).getTime() - 1;
}

/** End of the next period strictly after `fromTs`, for a recurring target. */
export function nextDeadline(recurrence: TargetRecurrence, fromTs: number): number {
  const d = new Date(fromTs);
  switch (recurrence) {
    case 'daily': {
      const end = endOfDay(fromTs);
      return end > fromTs ? end : endOfDay(fromTs, 1);
    }
    case 'weekly':
      return fromTs + 7 * 86_400_000;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    default:
      return fromTs;
  }
}

const isRecurring = (t: Target): boolean => !!t.recurrence && t.recurrence !== 'none';

/** Start the next period of a recurring target. Progress and bonus reset to 0;
 *  the streak grows only if the period just ended was actually completed. When
 *  `carryOver` is on, the unfinished amount is added to the next period's goal
 *  (added on top of the immutable `baseTotal`, so the debt doesn't compound).
 *  The closed period is appended to `sink` for the أوراد stats history. */
function rolloverTarget(t: Target, sink?: TargetPeriodRecord[]): Target {
  // A rescue surcharge is neither part of the period's goal nor carried debt.
  const goal = t.total - (t.rescue?.surcharge ?? 0);
  const wasCompleted = t.current >= goal;
  const baseTotal = t.baseTotal ?? t.total;
  const unfinished = Math.max(0, goal - t.current);
  const total = t.carryOver ? baseTotal + unfinished : baseTotal;
  const live = liveRescue(t);
  const rescue: TargetRescue | undefined = live
    ? live.step < RESCUE_WINDOW
      ? { lost: live.lost, step: live.step + 1 }
      : undefined
    : !wasCompleted && t.recurrence === 'daily' && (t.streak ?? 0) >= 2
      ? { lost: t.streak ?? 0, step: 1 }
      : undefined;
  sink?.push({
    targetId: t.id,
    title: t.title,
    unit: t.unit,
    endedAt: t.deadline,
    goal,
    base: baseTotal,
    done: Math.min(t.current, goal),
    extra: t.extra ?? 0,
    completed: wasCompleted,
  });
  return {
    ...t,
    total,
    baseTotal,
    current: 0,
    extra: 0,
    completedAt: undefined,
    // Advance from the period that just ENDED, not from `now` — so when several
    // periods elapsed while the app was closed each one rolls over in turn and
    // (when carryOver is on) contributes its unfinished amount to the carry,
    // instead of collapsing them all into a single rollover.
    deadline: nextDeadline(t.recurrence ?? 'none', t.deadline),
    streak: wasCompleted ? (t.streak ?? 0) + 1 : 0,
    rescue,
  };
}

/** The raised goal was just met → the lost chain joins the current one. */
function settleRescue(t: Target): Target {
  const r = t.rescue;
  if (!r?.surcharge || r.restored || t.current < t.total) return t;
  return { ...t, streak: r.lost + (t.streak ?? 0), rescue: { ...r, restored: true } };
}

/** Lazily roll a recurring target forward for EVERY period that already
 *  elapsed (not just one), so a wird left untouched across several days starts
 *  the new period with each missed day's remainder carried in. Guarded against
 *  a pathological gap (app unopened for a very long time). */
function withFreshPeriod(t: Target, sink?: TargetPeriodRecord[]): Target {
  if (!isRecurring(t)) return t;
  let cur = t;
  let guard = 0;
  while (cur.deadline <= Date.now() && guard < 366) {
    cur = rolloverTarget(cur, sink);
    guard += 1;
  }
  // Hit the catch-up cap (e.g. closed for over a year) — snap the next deadline
  // to the upcoming boundary so it doesn't stay stuck in the past.
  if (cur.deadline <= Date.now()) {
    cur = { ...cur, deadline: nextDeadline(cur.recurrence ?? 'none', Date.now()) };
  }
  return cur;
}

/** History record for a one-off wird that just hit its goal. */
function oneOffRecord(t: Target, current: number, completedAt: number): TargetPeriodRecord {
  return {
    targetId: t.id,
    title: t.title,
    unit: t.unit,
    endedAt: completedAt,
    goal: t.total,
    base: t.total,
    done: Math.min(current, t.total),
    extra: 0,
    completed: true,
  };
}

/** Apply a +/- delta to a recurring target. The in-period counter fills up to
 *  `total`; any surplus overflows into `extra` (نافلة). Decrements drain the
 *  bonus first, then the in-period counter. */
function applyRecurringDelta(t: Target, by: number): Target {
  let current = t.current;
  let extra = t.extra ?? 0;
  if (by >= 0) {
    const room = Math.max(0, t.total - current);
    const toCurrent = Math.min(by, room);
    current += toCurrent;
    extra += by - toCurrent;
  } else {
    let toRemove = -by;
    const fromExtra = Math.min(toRemove, extra);
    extra -= fromExtra;
    toRemove -= fromExtra;
    current = Math.max(0, current - toRemove);
  }
  return { ...t, current, extra };
}

/** Real daily periods are 23–25 h; two closing closer than this = a phantom. */
const PHANTOM_GAP = 12 * 3_600_000;

/**
 * One-time repair of what the old fall-back bug (see endOfDay) left behind:
 * folds each phantom period into its real day (stats counted it twice), gives
 * back the streak it broke — and the rescue offer / carried goal it opened —
 * and snaps a stale deadline so a device that hasn't rolled over yet never
 * makes the phantom at all.
 */
export function repairDstPhantoms(
  targets: Target[],
  history: TargetPeriodRecord[],
): { targets: Target[]; history: TargetPeriodRecord[] } {
  const drop = new Set<TargetPeriodRecord>();
  const swap = new Map<TargetPeriodRecord, TargetPeriodRecord>();
  const fixed = targets.map((raw) => {
    if (raw.recurrence !== 'daily') return raw;
    const t: Target = { ...raw, deadline: endOfDay(raw.deadline) };
    // This wird's closed days, newest first, each phantom folded into its day.
    const days: TargetPeriodRecord[] = [];
    let hit: { newer: number; broke: boolean; firstDone: boolean } | undefined;
    for (const h of history.filter((x) => x.targetId === t.id).sort((a, b) => b.endedAt - a.endedAt)) {
      const later = days[days.length - 1];
      if (!later || later.endedAt - h.endedAt >= PHANTOM_GAP) {
        days.push(h);
        continue;
      }
      const sum = h.done + later.done;
      const day: TargetPeriodRecord = {
        ...later,
        goal: h.goal,
        base: h.base,
        done: Math.min(h.goal, sum),
        extra: h.extra + later.extra + Math.max(0, sum - h.goal),
        completed: h.completed || later.completed || sum >= h.goal,
      };
      days[days.length - 1] = day;
      swap.set(later, day);
      drop.add(h);
      hit ??= { newer: days.length - 1, broke: !(h.completed && later.completed), firstDone: h.completed };
    }
    // Only when the real day was done and nothing since broke the chain again.
    if (!hit?.broke || !days.slice(0, hit.newer + 1).every((d) => d.completed)) return t;
    const run = days.findIndex((d) => !d.completed);
    // The break opened a rescue (step 1, +1 per rollover since) whose `lost` is
    // the exact chain before it — even past the history cap.
    const step = hit.newer + (hit.firstDone ? 1 : 2);
    const live = liveRescue(t);
    const own = live?.step === step ? live : undefined;
    // That day was done, so nothing was really left to carry into the open period.
    const total = t.total - (own?.surcharge ?? 0) - (hit.newer === 0 && t.carryOver ? carriedOf(t) : 0);
    const current = Math.min(t.current, total);
    return {
      ...t,
      streak: Math.max(t.streak ?? 0, run < 0 ? days.length : run, own ? own.lost + step - 1 : 0),
      rescue: own ? undefined : t.rescue,
      total,
      current,
      extra: (t.extra ?? 0) + t.current - current,
    };
  });
  return {
    targets: fixed,
    history: history.flatMap((h) => (drop.has(h) ? [] : [swap.get(h) ?? h])),
  };
}

interface TargetsState {
  targets: Target[];
  /** Closed periods, newest first (capped) — feeds إحصائيات الأوراد. */
  history: TargetPeriodRecord[];
  addTarget: (input: NewTargetInput) => string;
  updateTarget: (id: string, patch: Partial<Target>) => void;
  removeTarget: (id: string) => void;
  addProgress: (id: string, by: number) => void;
  setProgress: (id: string, value: number) => void;
  /** Adjust the carried-over backlog on a recurring wird (total = base + carried).
   *  Pass 0 to clear it entirely and return the goal to its per-period base. */
  setCarry: (id: string, carried: number) => void;
  complete: (id: string) => void;
  /** Take the streak-rescue offer: raise today's goal by base × step/2 (any
   *  نافلة already logged today folds into the raised goal). */
  acceptRescue: (id: string) => void;
  /** Re-arm every active target's reminders (call on app launch). */
  rescheduleAll: () => void;
}

export const useTargetsStore = create<TargetsState>()(
  persist(
    (set, get) => {
      /**
       * Apply a mutation to one target, persist, then re-arm its reminders.
       * The mutation may append closed-period records to `sink` (rollovers /
       * one-off completions); they land in `history` in the same set().
       */
      const mutate = (id: string, fn: (t: Target, sink: TargetPeriodRecord[]) => Target) => {
        let changed: Target | undefined;
        const sink: TargetPeriodRecord[] = [];
        set((s) => {
          const targets = s.targets.map((t) => {
            if (t.id !== id) return t;
            changed = fn(t, sink);
            return changed;
          });
          return {
            targets,
            history: sink.length ? [...sink, ...s.history].slice(0, MAX_HISTORY) : s.history,
          };
        });
        if (changed) rearmSoon(changed.id);
      };

      /**
       * Debounced per target: every counter tap mutates the wird, and each
       * re-arm cancels + re-schedules up to MAX_OCCURRENCES alarms — a
       * scheduling storm on the native bridge while counting.
       */
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      const rearmSoon = (id: string) => {
        clearTimeout(timers.get(id));
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            const t = get().targets.find((x) => x.id === id);
            if (t) void scheduleReminders(t);
          }, 1200),
        );
      };

      return {
        targets: [],
        history: [],

        addTarget: (input) => {
          const recurring = !!input.recurrence && input.recurrence !== 'none';
          const target: Target = {
            ...input,
            id: makeId(),
            current: input.current ?? 0,
            createdAt: Date.now(),
            streak: recurring ? 0 : undefined,
            // Remember the per-period base so carry-over debt doesn't compound.
            baseTotal: recurring ? input.total : undefined,
          };
          set((s) => ({ targets: [target, ...s.targets] }));
          void scheduleReminders(target);
          return target.id;
        },

        updateTarget: (id, patch) =>
          mutate(id, (raw, sink) => {
            // Roll an elapsed period BEFORE applying the edit — every other
            // mutation path does this; without it, editing an expired
            // recurring wird left it showing a stale past-deadline period.
            const t = withFreshPeriod(raw, sink);
            const next = { ...t, ...patch };
            // Editing the goal amount resets the per-period base (and clears any
            // carried debt) — the new number is what each period should target.
            if (patch.total !== undefined) {
              next.baseTotal = patch.total;
              // A new goal replaces an accepted (unmet) rescue goal too.
              const r = liveRescue(next);
              if (r?.surcharge) next.rescue = { lost: r.lost, step: r.step };
            }
            return next;
          }),

        removeTarget: (id) => {
          clearTimeout(timers.get(id));
          void cancelReminders(id);
          set((s) => ({ targets: s.targets.filter((t) => t.id !== id) }));
        },

        addProgress: (id, by) => {
          if (by > 0) {
            const cur = get().targets.find((x) => x.id === id);
            if (cur) {
              logActivity({
                domain: 'awrad',
                refId: cur.id,
                title: cur.title,
                amount: by,
                unit: TARGET_UNIT_LABEL[cur.unit],
                kind: 'progress',
              });
            }
          }
          mutate(id, (raw, sink) => {
            const t = withFreshPeriod(raw, sink);
            // Recurring: once the period goal is met, surplus reps become نافلة
            // (tracked in `extra`) and the target stays in its current period —
            // it only rolls over when the deadline passes.
            if (isRecurring(t)) return settleRescue(applyRecurringDelta(t, by));
            const current = Math.max(0, Math.min(t.total, t.current + by));
            const completedAt = current >= t.total ? t.completedAt ?? Date.now() : undefined;
            if (!t.completedAt && completedAt) sink.push(oneOffRecord(t, current, completedAt));
            return { ...t, current, completedAt };
          });
        },

        setProgress: (id, value) => {
          const raw = get().targets.find((x) => x.id === id);
          // Against the CURRENT period: a stale (not yet rolled) one would swallow the delta.
          const prev = raw && withFreshPeriod(raw);
          if (prev) {
            const delta = Math.max(0, Math.round(value)) - prev.current;
            if (delta > 0) {
              logActivity({
                domain: 'awrad',
                refId: prev.id,
                title: prev.title,
                amount: delta,
                unit: TARGET_UNIT_LABEL[prev.unit],
                kind: 'progress',
              });
            }
          }
          mutate(id, (raw, sink) => {
            const t = withFreshPeriod(raw, sink);
            const v = Math.max(0, Math.round(value));
            if (isRecurring(t)) {
              // The manual value is the in-period count; anything above the goal
              // spills into the bonus counter.
              return settleRescue({ ...t, current: Math.min(t.total, v), extra: Math.max(0, v - t.total) });
            }
            const current = Math.min(t.total, v);
            const completedAt = current >= t.total ? t.completedAt ?? Date.now() : undefined;
            if (!t.completedAt && completedAt) sink.push(oneOffRecord(t, current, completedAt));
            return { ...t, current, completedAt };
          });
        },

        setCarry: (id, carried) =>
          mutate(id, (raw, sink) => {
            const t = withFreshPeriod(raw, sink);
            // Carry lives on top of the immutable per-period base; clearing it
            // (carried = 0) drops the accumulated backlog without touching the
            // wird's original goal. Progress done this period is kept but capped.
            const base = t.baseTotal ?? t.total;
            const total = base + Math.max(0, Math.round(carried)) + (t.rescue?.surcharge ?? 0);
            return { ...t, baseTotal: base, total, current: Math.min(t.current, total) };
          }),

        complete: (id) => {
          // «أتممته» logs what it adds, like the counter (stats, weekly awrad points).
          const raw = get().targets.find((x) => x.id === id);
          const fresh = raw && withFreshPeriod(raw);
          if (fresh && fresh.total > fresh.current) {
            logActivity({
              domain: 'awrad',
              refId: fresh.id,
              title: fresh.title,
              amount: fresh.total - fresh.current,
              unit: TARGET_UNIT_LABEL[fresh.unit],
              kind: 'progress',
            });
          }
          mutate(id, (raw, sink) => {
            const t = withFreshPeriod(raw, sink);
            // Recurring: mark the period's goal as met (opens the bonus counter)
            // without rolling over — that happens at the deadline.
            if (isRecurring(t)) return settleRescue({ ...t, current: t.total });
            const completedAt = t.completedAt ?? Date.now();
            if (!t.completedAt) sink.push(oneOffRecord(t, t.total, completedAt));
            return { ...t, current: t.total, completedAt };
          });
        },

        acceptRescue: (id) =>
          mutate(id, (raw, sink) => {
            const t = withFreshPeriod(raw, sink);
            const r = liveRescue(t);
            if (!r || r.surcharge) return t;
            const surcharge = Math.ceil(((t.baseTotal ?? t.total) * r.step) / 2);
            const total = t.total + surcharge;
            const pooled = t.current + (t.extra ?? 0);
            const current = Math.min(total, pooled);
            return settleRescue({ ...t, total, current, extra: pooled - current, rescue: { ...r, surcharge } });
          }),

        rescheduleAll: () => {
          // Roll over EVERY elapsed period for each recurring target (streak grows
          // only for periods that were completed — see rolloverTarget). Using
          // withFreshPeriod here catches up multi-day gaps so carry-over debt
          // isn't lost when the app wasn't opened for a while.
          const now = Date.now();
          get().targets.forEach((t) => {
            if (isRecurring(t) && t.deadline <= now) {
              mutate(t.id, (cur, sink) => withFreshPeriod(cur, sink));
            }
          });
          get().targets.forEach((t) => void scheduleReminders(t));
        },
      };
    },
    {
      name: 'myzikr:targets',
      // v1: repair the DST fall-back phantom day (repairDstPhantoms). The bump
      // also makes sync take this copy wholesale over a stale v0 cloud one.
      version: 1,
      migrate: (persisted) => {
        const st = (persisted ?? {}) as Partial<Pick<TargetsState, 'targets' | 'history'>>;
        return { ...st, ...repairDstPhantoms(st.targets ?? [], st.history ?? []) } as never;
      },
    },
  ),
);
