import { useEffect, useMemo, useState } from 'react';
import {
  Sunrise, Sunset, Star, MoonStar, Sparkles, Home, Megaphone, Landmark, DoorOpen, Droplets, AlarmClock,
  UtensilsCrossed, Hand, Repeat, Layers, ScrollText, BookOpen, Users, BookCheck, Compass, ShieldCheck,
  Flower2, Moon, Gem, Heart, BookOpenText, Bookmark,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { dhikrApiService } from '@/services/DhikrApiService';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { briefAdhkar, sleepAdhkar } from '@/data/adhkar';
import type { LibraryCategory } from '@/data/adhkarLibrary';
import { useCustomAzkarStore } from '@/store/customAzkarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { forGender } from './feminize';
import { POST_PRAYER_NAME, POST_PRAYER_ORDER, postPrayerItems, postPrayerSetId, prayerForAdhkar } from './postPrayer';
import { useI18n } from '@/hooks/useI18n';
import type { DhikrItem, PrayerName } from '@/types';

export type BuiltinSetId = 'morning' | 'evening' | 'sleep' | 'postPrayer';

export interface SetDescriptor {
  id: string;
  label: string;
  Icon: LucideIcon;
  items: DhikrItem[];
  custom?: boolean;
  /** From the «المزيد» library (islambook categories). */
  library?: boolean;
  /** When this set is read — shown on its tile. */
  when?: string;
  /** أذكار ما بعد ONE prayer (`postPrayer-<prayer>`) — opened from the
   *  «أذكار الصلاة» tile or a prayer, never listed on their own. */
  prayer?: PrayerName;
}

/** Is one dhikr finished — counter filled to its target, or explicitly skipped. */
export function isItemDone(
  item: DhikrItem,
  counts: Record<string, number>,
  skipped: Record<string, boolean>,
): boolean {
  return (counts[item.id] ?? 0) >= item.count || !!skipped[item.id];
}

/**
 * Seconds one repetition takes: a tap/breath plus a calm reading pace. The
 * per-word rate sits between a quick reader and the bundled Hisn al-Muslim
 * clips (≈0.6 s/word); the per-repetition cost is set so «سبحان الله وبحمده»
 * ×100 reads ≈5 min — the owner's real-world figure (2026-10; a flat
 * words-per-minute rate said 2, the clips' pace 6).
 */
const SECONDS_PER_REP = 1.65;
const SECONDS_PER_WORD = 0.45;

/** Words in a dhikr — punctuation-only tokens («،») don't count. */
const wordCount = (arabic: string) => arabic.split(/\s+/).filter((t) => /[ء-ي]/.test(t)).length;

/** Minutes left to finish the set at a calm recitation pace (0 when done). */
export function remainingMinutes(
  items: DhikrItem[],
  counts: Record<string, number>,
  skipped: Record<string, boolean>,
): number {
  let seconds = 0;
  for (const it of items) {
    if (isItemDone(it, counts, skipped)) continue;
    const reps = Math.max(0, it.count - (counts[it.id] ?? 0));
    seconds += reps * (SECONDS_PER_REP + SECONDS_PER_WORD * wordCount(it.arabic));
  }
  return seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
}

/** أذكار النوم (islambook.com/azkar/11) — see src/data/adhkar.ts. */
export const SLEEP_ADHKAR: DhikrItem[] = sleepAdhkar;

const LIBRARY_ICONS: Record<string, LucideIcon> = {
  home: Home,
  megaphone: Megaphone,
  landmark: Landmark,
  door: DoorOpen,
  droplets: Droplets,
  alarm: AlarmClock,
  utensils: UtensilsCrossed,
  hand: Hand,
  repeat: Repeat,
  layers: Layers,
  scroll: ScrollText,
  star: Star,
  book: BookOpen,
  users: Users,
  bookCheck: BookCheck,
  compass: Compass,
  shield: ShieldCheck,
  flower: Flower2,
  moon: Moon,
  gem: Gem,
  heart: Heart,
  sparkles: Sparkles,
  bookOpen: BookOpenText,
  bookmark: Bookmark,
};

/** Every built-in pool, for the custom-set picker. */
export async function allBuiltinItems(): Promise<DhikrItem[]> {
  const [m, e, p] = await Promise.all([
    dhikrApiService.getMorning(),
    dhikrApiService.getEvening(),
    dhikrApiService.getPostPrayer(),
  ]);
  const seen = new Set<string>();
  return [...m, ...e, ...SLEEP_ADHKAR, ...p].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

/** Built-in, custom and «المزيد» library sets, in reading order, worded for the
 *  user's gender. `ready` once built-ins and the (lazily loaded) library are in. */
export function useAdhkarSets(): { sets: SetDescriptor[]; ready: boolean } {
  const { t } = useI18n();
  const customSets = useCustomAzkarStore((s) => s.sets);
  const gender = useSettingsStore((s) => s.gender);
  const brief = useSettingsStore((s) => s.adhkarBrief);
  const [builtin, setBuiltin] = useState<Record<'morning' | 'evening' | 'postPrayer', DhikrItem[]> | null>(null);
  const [library, setLibrary] = useState<LibraryCategory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      dhikrApiService.getMorning(),
      dhikrApiService.getEvening(),
      dhikrApiService.getPostPrayer(),
    ]).then(([morning, evening, postPrayer]) => {
      if (!cancelled) setBuiltin({ morning, evening, postPrayer });
    });
    void import('@/data/adhkarLibrary')
      .then((m) => !cancelled && setLibrary(m.ADHKAR_LIBRARY))
      .catch(() => !cancelled && setLibrary([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const sets = useMemo<SetDescriptor[]>(
    () =>
      [
        { id: 'morning', label: t('dhikr_morning'), Icon: Sunrise, items: briefAdhkar(builtin?.morning ?? [], brief), when: 'بعد الفجر' },
        { id: 'evening', label: t('dhikr_evening'), Icon: Sunset, items: briefAdhkar(builtin?.evening ?? [], brief), when: 'بعد العصر' },
        { id: 'sleep', label: 'أذكار النوم', Icon: MoonStar, items: SLEEP_ADHKAR, when: 'قبل النوم' },
        { id: 'postPrayer', label: t('dhikr_post_prayer'), Icon: Star, items: builtin?.postPrayer ?? [], when: 'دبر كل صلاة' },
        ...POST_PRAYER_ORDER.map((p) => ({
          id: postPrayerSetId(p),
          label: `أذكار بعد ${POST_PRAYER_NAME[p]}`,
          Icon: Star,
          items: postPrayerItems(p, builtin?.postPrayer ?? []),
          prayer: p,
        })),
        ...customSets.map((s) => ({ id: s.id, label: s.name, Icon: Sparkles, items: s.items, custom: true })),
        ...(library ?? []).map((c) => ({
          id: `lib-${c.id}`,
          label: c.title,
          Icon: LIBRARY_ICONS[c.icon] ?? Sparkles,
          items: c.items,
          library: true,
        })),
      ].map((s) => ({ ...s, items: forGender(s.items, gender) })),
    [builtin, customSets, library, gender, brief, t],
  );

  return { sets, ready: builtin !== null && library !== null };
}

// ── «الآن» — which set fits this moment of the day ──────────────────────────
export interface NowSlot {
  setId: BuiltinSetId;
  /** e.g. "بعد العصر · حتى العشاء" */
  kicker: string;
  /** The prayer whose أذكار fit now (the last adhan passed) and its day. */
  prayer: { prayer: PrayerName; dateKey: string };
  /** Today's prayers whose adhan has come (none before Fajr). */
  passed: PrayerName[];
}

interface DayTimes {
  fajr: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

/** Pure: morning after Fajr, post-prayer tasbih around Dhuhr, evening after
 *  Asr, sleep after Isha (until the next Fajr). */
export function pickSlot(now: Date, t: DayTimes): NowSlot {
  const n = now.getTime();
  const prayer = prayerForAdhkar(now, t);
  const passed = POST_PRAYER_ORDER.filter((p) => t[p].getTime() <= n);
  if (n >= t.fajr.getTime() && n < t.dhuhr.getTime()) return { setId: 'morning', kicker: 'بعد الفجر · حتى الظهر', prayer, passed };
  if (n >= t.dhuhr.getTime() && n < t.asr.getTime()) return { setId: 'postPrayer', kicker: 'بعد الظهر · دبر الصلاة', prayer, passed };
  if (n >= t.asr.getTime() && n < t.isha.getTime()) return { setId: 'evening', kicker: 'بعد العصر · حتى العشاء', prayer, passed };
  return { setId: 'sleep', kicker: 'بعد العشاء · قبل النوم', prayer, passed };
}

/** Rough prayer times when no location is set. */
function fallbackTimes(now: Date): DayTimes {
  const at = (h: number, m = 0) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return { fajr: at(4, 30), dhuhr: at(12), asr: at(15, 30), maghrib: at(18), isha: at(19, 30) };
}

/** The current slot, from real prayer times when coords exist. Re-checks every minute. */
export function useNowSlot(): NowSlot {
  const coords = useSettingsStore((s) => s.coords);
  const method = useSettingsStore((s) => s.prayerMethod);
  const madhab = useSettingsStore((s) => s.madhabSchool);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const day = now.toDateString();
  const times = useMemo(() => {
    if (!coords) return null;
    try {
      return prayerTimeService.getTimes(coords, new Date(day), method, madhab);
    } catch {
      return null;
    }
  }, [coords, method, madhab, day]);
  return useMemo(() => pickSlot(now, times ?? fallbackTimes(now)), [now, times]);
}
