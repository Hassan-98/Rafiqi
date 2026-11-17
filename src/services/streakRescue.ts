import { useMemo } from 'react';
import { useProgressStore, frozenDays } from '@/store/progressStore';
import { useQiyamStore, qiyamNightKey, type QiyamNight } from '@/store/qiyamStore';
import { useActivityLogStore, type ActivityEvent } from '@/store/activityLogStore';
import { useTargetsStore, liveRescue, TARGET_UNIT_LABEL, type Target } from '@/store/targetsStore';
import { findBreak, rescueMultiplier, usualAmount } from '@/services/streakRescueMath';
import { useStreakRescueStore } from '@/store/streakRescueStore';
import { dateKeyOf, toArabicDigits } from '@/services/statsService';
import { watchSlice } from '@/services/smartNotifications';
import { toast } from '@/store/toastStore';
import type { DailyProgress } from '@/types';

/**
 * «استعادة السلسلة»: when a streak breaks, offer to restore it by doing MORE
 * today — the usual amount +50% for each day missed (150%, 200%, …) — until a
 * week has passed since the break, then the offer lapses. The surplus is the
 * price of the streak, not نافلة.
 *
 * - الأذكار / القيام: the missed days get frozen in progressStore once today's
 *   amount reaches the target (see startStreakRescueSync) — every streak
 *   counter bridges frozen days.
 * - الأوراد: lives on the wird itself (Target.rescue in targetsStore): the user
 *   accepts, the day's goal rises, and meeting it joins the lost chain.
 */

export { rescueMultiplier };

export interface RescueOffer {
  /** 'dhikr' | 'qiyam' | `awrad:<targetId>` — also the dismiss key. */
  key: string;
  title: string;
  /** The streak that broke. */
  lost: number;
  /** Days since the break → the multiplier. */
  step: number;
  required: number;
  done: number;
  unit: string;
  to: string;
  /** The day the offer belongs to (a night key for qiyam). */
  dayKey: string;
  /** Days to freeze on success (dhikr/qiyam). */
  missed: string[];
  /** الأوراد: the wird, and whether its goal is already raised. */
  targetId?: string;
  accepted?: boolean;
}

interface Sources {
  dp: Record<string, DailyProgress>;
  freezes: Record<string, string[]>;
  events: ActivityEvent[];
  nights: Record<string, QiyamNight>;
  targets: Target[];
}

function dhikrOffer(s: Sources): RescueOffer | null {
  const today = dateKeyOf(new Date());
  const active = new Set(
    Object.keys(s.dp).filter((k) => s.dp[k].modules.some((m) => m.moduleId === 'dhikr' && m.completed)),
  );
  const br = findBreak(active, frozenDays('dhikr', s.freezes), today);
  if (!br) return null;
  const reps = new Map<string, number>();
  for (const e of s.events) {
    if (e.domain === 'dhikr' || e.domain === 'tasbih') reps.set(e.dateKey, (reps.get(e.dateKey) ?? 0) + e.amount);
  }
  // No per-rep history (older data) → a modest default.
  const usual = usualAmount((k) => reps.get(k) ?? 0, active, br.chainEnd) || 100;
  const step = br.missed.length;
  return {
    key: 'dhikr',
    title: 'سلسلة الأذكار',
    lost: br.lost,
    step,
    required: Math.ceil((usual * rescueMultiplier(step)) / 10) * 10,
    done: reps.get(today) ?? 0,
    unit: 'ذكراً',
    to: '/adhkar',
    dayKey: today,
    missed: br.missed,
  };
}

const rakaatOf = (n: QiyamNight | undefined) => (n ? n.rakaat + (n.witr ? 1 : 0) : 0);

function qiyamOffer(s: Sources): RescueOffer | null {
  const tonight = qiyamNightKey();
  const active = new Set(Object.keys(s.nights));
  const br = findBreak(active, frozenDays('qiyam', s.freezes), tonight);
  if (!br) return null;
  const usual = Math.max(2, usualAmount((k) => rakaatOf(s.nights[k]), active, br.chainEnd));
  const step = br.missed.length;
  return {
    key: 'qiyam',
    title: 'سلسلة قيام الليل',
    lost: br.lost,
    step,
    required: Math.ceil(usual * rescueMultiplier(step)),
    done: rakaatOf(s.nights[tonight]),
    unit: 'ركعة',
    to: '/targets?tab=qiyam',
    dayKey: tonight,
    missed: br.missed,
  };
}

function awradOffers(s: Sources): RescueOffer[] {
  const now = Date.now();
  const today = dateKeyOf(new Date());
  return s.targets.flatMap((t) => {
    const r = liveRescue(t);
    // A past deadline means the rollover (and the offer's step) is still pending.
    if (!r || t.recurrence !== 'daily' || t.deadline <= now) return [];
    const base = t.baseTotal ?? t.total;
    return [
      {
        key: `awrad:${t.id}`,
        title: `وِرد «${t.title}»`,
        lost: r.lost,
        step: r.step,
        required: r.surcharge ? t.total : t.total + Math.ceil((base * r.step) / 2),
        done: t.current + (r.surcharge ? 0 : t.extra ?? 0),
        unit: TARGET_UNIT_LABEL[t.unit],
        to: `/targets/${t.id}`,
        dayKey: today,
        missed: [],
        targetId: t.id,
        accepted: !!r.surcharge,
      },
    ];
  });
}

function computeOffers(s: Sources): RescueOffer[] {
  return [dhikrOffer(s), qiyamOffer(s), ...awradOffers(s)].filter((o): o is RescueOffer => !!o);
}

const sourcesNow = (): Sources => ({
  dp: useProgressStore.getState().dailyProgress,
  freezes: useProgressStore.getState().freezesUsed,
  events: useActivityLogStore.getState().events,
  nights: useQiyamStore.getState().nights,
  targets: useTargetsStore.getState().targets,
});

/** Open offers, minus the ones dismissed for today. */
export function useRescueOffers(): RescueOffer[] {
  const dp = useProgressStore((s) => s.dailyProgress);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const events = useActivityLogStore((s) => s.events);
  const nights = useQiyamStore((s) => s.nights);
  const targets = useTargetsStore((s) => s.targets);
  const dismissed = useStreakRescueStore((s) => s.dismissed);
  return useMemo(
    () => computeOffers({ dp, freezes, events, nights, targets }).filter((o) => dismissed[o.key] !== o.dayKey),
    [dp, freezes, events, nights, targets, dismissed],
  );
}

const restoredToast = (title: string, lost: number) =>
  toast.success('استعدتَ سلسلتك', `${title}: عادت سلسلة ${toArabicDigits(lost)} متصلة، تقبّل الله`);

/** Freeze the missed days of any dhikr/qiyam offer whose target was reached. */
function settle() {
  const s = sourcesNow();
  const { setFrozen } = useProgressStore.getState();
  for (const o of [dhikrOffer(s), qiyamOffer(s)]) {
    if (!o || o.done < o.required) continue;
    for (const k of o.missed) setFrozen(o.key, k, true);
    restoredToast(o.title, o.lost);
  }
}

let started = false;

/** Boot once (main.tsx): settle now and whenever the measured stores change;
 *  toast when a wird's raised goal restores its chain. */
export function startStreakRescueSync(debounceMs = 800): void {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(settle, debounceMs);
  };
  // Not freezesUsed: settle writes it.
  watchSlice(useProgressStore, (s) => s.dailyProgress, kick);
  watchSlice(useActivityLogStore, (s) => s.events, kick);
  watchSlice(useQiyamStore, (s) => s.nights, kick);

  const restored = new Set(useTargetsStore.getState().targets.filter((t) => t.rescue?.restored).map((t) => t.id));
  watchSlice(useTargetsStore, (s) => s.targets, () => {
    for (const t of useTargetsStore.getState().targets) {
      if (!t.rescue?.restored || restored.has(t.id)) continue;
      restored.add(t.id);
      restoredToast(`وِرد «${t.title}»`, t.rescue.lost);
    }
  });
  settle();
}
