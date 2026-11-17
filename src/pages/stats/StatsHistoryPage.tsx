import { useMemo, useState, type ReactNode } from 'react';
import { motion } from '@/lib/motion';
import {
  Award,
  BookOpen,
  CalendarDays,
  Filter,
  HandCoins,
  Layers,
  ListFilter,
  Moon,
  MoonStar,
  Sparkles,
  Sunrise,
  Utensils,
} from 'lucide-react';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { TimelineFeed } from '@/components/stats/TimelineFeed';
import { useStatsRange } from '@/stats/StatsContext';
import { useProgressStore } from '@/store/progressStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQuranStore } from '@/store/quranStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useRamadanStore } from '@/store/ramadanStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useBadgeStore } from '@/store/badgeStore';
import { bucketByDateKey, toArabicDigits } from '@/services/statsService';
import { BADGES } from '@/data/badges';
import type { PrayerName } from '@/types';

/** Domains the unified feed can surface, used to drive the filter chips. */
type Domain = 'prayer' | 'quran' | 'fasting' | 'dhikr' | 'sadaqah' | 'achievement' | 'ramadan';

/** A single resolved timeline event before it is grouped by day. */
interface FeedEvent {
  dateKey: string;
  domain: Domain;
  icon: ReactNode;
  color: string;
  title: string;
  detail?: ReactNode;
  /** Stable ordering hint inside a day (higher shows first). */
  weight: number;
}

const PRAYERS_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const ICON_SIZE = 16;

/** Domain → display colour (matches the rest of the stats section palette). */
const DOMAIN_COLOR: Record<Domain, string> = {
  prayer: 'var(--color-teal)',
  quran: 'var(--color-teal-light)',
  fasting: 'var(--color-gold-dark)',
  dhikr: 'var(--color-gold)',
  sadaqah: 'var(--color-gold-dark)',
  achievement: 'var(--color-gold)',
  ramadan: 'var(--color-teal)',
};

interface FilterChip {
  domain: Domain;
  label: string;
  icon: ReactNode;
}

const FILTER_CHIPS: FilterChip[] = [
  { domain: 'prayer', label: 'صلاة', icon: <Sunrise size={14} /> },
  { domain: 'quran', label: 'قرآن', icon: <BookOpen size={14} /> },
  { domain: 'fasting', label: 'صيام', icon: <Utensils size={14} /> },
  { domain: 'dhikr', label: 'أذكار', icon: <Sparkles size={14} /> },
  { domain: 'sadaqah', label: 'صدقة', icon: <HandCoins size={14} /> },
  { domain: 'achievement', label: 'إنجازات', icon: <Award size={14} /> },
  { domain: 'ramadan', label: 'رمضان', icon: <MoonStar size={14} /> },
];

/** Build a Gregorian day header label like "٢٩ مايو". */
function gregorianLabelFor(dateKey: string): string {
  // dateKey is 'yyyy-MM-dd' — parse the parts directly to avoid TZ drift.
  const [, m, d] = dateKey.split('-').map((p) => Number(p));
  const day = Number.isFinite(d) ? d : 0;
  const monthIdx = Number.isFinite(m) ? m - 1 : 0;
  const month = ARABIC_MONTHS[monthIdx] ?? '';
  return `${toArabicDigits(day)} ${month}`.trim();
}

export function StatsHistoryPage() {
  return (
    <StatsSubPage title="السجل التفصيلي الكامل">
      <HistoryContent />
    </StatsSubPage>
  );
}

function HistoryContent() {
  const { range } = useStatsRange();

  // Read every store slice we merge into the feed (read-only).
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const prayerLog = usePrayerLogStore((s) => s.log);
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const counters = useTasbihStore((s) => s.counters);
  const juzCompletedByDate = useRamadanStore((s) => s.juzCompletedByDate);
  const sadaqahEntries = useSadaqahStore((s) => s.entries);
  const badgesUnlockedAt = useBadgeStore((s) => s.unlockedAt);

  // The set of dateKeys that belong to the selected period (fast membership).
  const inRange = useMemo(() => new Set(range.dateKeys), [range.dateKeys]);

  // ── Aggregate every dated event from every store into a flat list. ──────────
  const allEvents = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];

    // 1) Prayers logged — fardCount/5 per day (scan dateKeys for prayerLog).
    for (const dateKey of range.dateKeys) {
      const day = prayerLog[dateKey];
      if (!day) continue;
      const fardCount = PRAYERS_ORDER.reduce((acc, p) => acc + (day[p]?.fard ? 1 : 0), 0);
      if (fardCount <= 0) continue;
      const sunnahCount = PRAYERS_ORDER.reduce((acc, p) => {
        const e = day[p];
        if (!e) return acc;
        let c = 0;
        if (e.sunnahBefore) c += 1;
        if (e.sunnahAfter) c += 1;
        if (e.witr) c += 1;
        return acc + c;
      }, 0);
      const complete = fardCount >= 5;
      events.push({
        dateKey,
        domain: 'prayer',
        icon: <Sunrise size={ICON_SIZE} />,
        color: DOMAIN_COLOR.prayer,
        title: complete ? 'أتممتَ الصلوات الخمس' : 'صلوات مُسجَّلة',
        detail: (
          <span className="font-counter">
            {toArabicDigits(fardCount)}‏/{toArabicDigits(5)} فرائض
            {sunnahCount > 0 ? ` · ${toArabicDigits(sunnahCount)} سنن` : ''}
          </span>
        ),
        weight: complete ? 90 : 80,
      });
    }

    // 2) Quran wird achieved — wirdHistory keyed by dateKey.
    for (const [dateKey, entry] of Object.entries(wirdHistory)) {
      if (!inRange.has(dateKey)) continue;
      if (!entry || entry.achieved <= 0) continue;
      const reached = entry.achieved >= entry.amount && entry.amount > 0;
      events.push({
        dateKey,
        domain: 'quran',
        icon: <BookOpen size={ICON_SIZE} />,
        color: DOMAIN_COLOR.quran,
        title: reached ? 'أتممتَ وردك من القرآن' : 'قرأتَ وردك',
        detail: (
          <span className="font-counter">
            {toArabicDigits(entry.achieved)}
            {entry.amount > 0 ? `‏/${toArabicDigits(entry.amount)}` : ''} {UNIT_LABEL[entry.unit]}
          </span>
        ),
        weight: 70,
      });
    }

    // 3) Fasting / dhikr / qiyam — completed modules in dailyProgress.
    for (const dateKey of range.dateKeys) {
      const day = dailyProgress[dateKey];
      if (!day) continue;
      for (const mod of day.modules) {
        if (!mod.completed) continue;
        const conf = MODULE_FEED[mod.moduleId as string];
        if (!conf) continue;
        events.push({
          dateKey,
          domain: conf.domain,
          icon: conf.icon,
          color: DOMAIN_COLOR[conf.domain],
          title: conf.title,
          detail:
            mod.completionRate > 0 && mod.completionRate < 1 ? (
              <span className="font-counter">{toArabicDigits(Math.round(mod.completionRate * 100))}٪</span>
            ) : undefined,
          weight: conf.weight,
        });
      }
    }

    // 4) Sadaqah given — entries grouped by their `date` (yyyy-mm-dd).
    const sadaqahByDay = bucketByDateKey(sadaqahEntries, (e) => e.date);
    for (const [dateKey, items] of Object.entries(sadaqahByDay)) {
      if (!inRange.has(dateKey)) continue;
      for (const e of items) {
        events.push({
          dateKey,
          domain: 'sadaqah',
          icon: <HandCoins size={ICON_SIZE} />,
          color: DOMAIN_COLOR.sadaqah,
          title: 'صدقة',
          detail: (
            <span>
              <span className="font-counter">{toArabicDigits(e.amount)}</span> {e.currency}
              {e.cause ? ` · ${e.cause}` : ''}
            </span>
          ),
          weight: 60,
        });
      }
    }

    // 5) Badges unlocked — unlockedAt is an ISO timestamp per badge id.
    const badgeByDay = bucketByDateKey(
      Object.entries(badgesUnlockedAt).map(([id, at]) => ({ id, at })),
      (b) => b.at,
    );
    for (const [dateKey, items] of Object.entries(badgeByDay)) {
      if (!inRange.has(dateKey)) continue;
      for (const b of items) {
        const def = BADGES.find((x) => x.id === b.id);
        events.push({
          dateKey,
          domain: 'achievement',
          icon: <Award size={ICON_SIZE} />,
          color: DOMAIN_COLOR.achievement,
          title: def ? `وسام: ${def.titleAr}` : 'وسام جديد',
          detail: def ? (
            <span>
              <span className="me-1">{def.icon}</span>
              {def.descriptionAr}
            </span>
          ) : undefined,
          weight: 100,
        });
      }
    }

    // 6) Tasbih counters created — the only dated "bookmark/favorite added"
    //    signal available (createdAt). Treated as a dhikr-domain milestone.
    const counterByDay = bucketByDateKey(counters, (c) => c.createdAt);
    for (const [dateKey, items] of Object.entries(counterByDay)) {
      if (!inRange.has(dateKey)) continue;
      for (const c of items) {
        events.push({
          dateKey,
          domain: 'dhikr',
          icon: <Sparkles size={ICON_SIZE} />,
          color: DOMAIN_COLOR.dhikr,
          title: `سبحة جديدة: ${c.name}`,
          detail: (
            <span className="font-counter">الهدف {toArabicDigits(c.target)}</span>
          ),
          weight: 40,
        });
      }
    }

    // 7) Taraweeh / juz completed in Ramadan — juz are dated per day.
    const juzByDay = bucketByDateKey(
      Object.entries(juzCompletedByDate).flatMap(([dateKey, juzList]) =>
        juzList.map((juz) => ({ dateKey, juz })),
      ),
      (j) => j.dateKey,
    );
    for (const [dateKey, items] of Object.entries(juzByDay)) {
      if (!inRange.has(dateKey)) continue;
      const juzNumbers = items.map((i) => i.juz).sort((a, b) => a - b);
      events.push({
        dateKey,
        domain: 'ramadan',
        icon: <MoonStar size={ICON_SIZE} />,
        color: DOMAIN_COLOR.ramadan,
        title: juzNumbers.length > 1 ? 'أجزاء من القرآن في رمضان' : 'جزء من القرآن في رمضان',
        detail: (
          <span className="font-counter">
            {juzNumbers.length > 1 ? `${toArabicDigits(juzNumbers.length)} أجزاء` : `الجزء ${toArabicDigits(juzNumbers[0])}`}
          </span>
        ),
        weight: 50,
      });
    }

    return events;
  }, [
    range.dateKeys,
    inRange,
    prayerLog,
    wirdHistory,
    dailyProgress,
    sadaqahEntries,
    badgesUnlockedAt,
    counters,
    juzCompletedByDate,
  ]);

  // ── Domain filter chips (local state). Empty set = show everything. ─────────
  const [activeFilters, setActiveFilters] = useState<Set<Domain>>(new Set());

  const presentDomains = useMemo(() => {
    const set = new Set<Domain>();
    for (const ev of allEvents) set.add(ev.domain);
    return set;
  }, [allEvents]);

  const visibleChips = useMemo(
    () => FILTER_CHIPS.filter((c) => presentDomains.has(c.domain)),
    [presentDomains],
  );

  const filteredEvents = useMemo(() => {
    if (activeFilters.size === 0) return allEvents;
    return allEvents.filter((ev) => activeFilters.has(ev.domain));
  }, [allEvents, activeFilters]);

  // ── Group into reverse-chronological day buckets for the TimelineFeed. ──────
  const groups = useMemo(() => {
    const byDay = bucketByDateKey(filteredEvents, (ev) => ev.dateKey);
    return Object.keys(byDay)
      .sort((a, b) => b.localeCompare(a)) // descending dateKey
      .map((dateKey) => {
        const dayEvents = [...byDay[dateKey]].sort((a, b) => b.weight - a.weight);
        return {
          dateKey,
          gregorianLabel: gregorianLabelFor(dateKey),
          events: dayEvents.map((ev) => ({
            icon: ev.icon,
            color: ev.color,
            title: ev.title,
            detail: ev.detail,
          })),
        };
      });
  }, [filteredEvents]);

  const totalEvents = filteredEvents.length;
  const totalDays = groups.length;

  const toggleFilter = (domain: Domain) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <>
      {/* Summary header */}
      <StatsHeader period={range.label} totalEvents={totalEvents} totalDays={totalDays} />

      {/* Domain filter chips */}
      <StatsPanel
        title="تصفية حسب النوع"
        icon={<Filter size={16} />}
        action={
          activeFilters.size > 0 ? (
            <button
              type="button"
              onClick={() => setActiveFilters(new Set())}
              className="text-[11px] font-bold text-teal dark:text-teal-light"
            >
              عرض الكل
            </button>
          ) : null
        }
      >
        {visibleChips.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-2">لا توجد أنواع أحداث في هذه الفترة</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <FilterPill
              label="الكل"
              icon={<ListFilter size={14} />}
              active={activeFilters.size === 0}
              onClick={() => setActiveFilters(new Set())}
            />
            {visibleChips.map((chip) => (
              <FilterPill
                key={chip.domain}
                label={chip.label}
                icon={chip.icon}
                color={DOMAIN_COLOR[chip.domain]}
                active={activeFilters.has(chip.domain)}
                onClick={() => toggleFilter(chip.domain)}
              />
            ))}
          </div>
        )}
      </StatsPanel>

      {/* Unified reverse-chronological timeline */}
      <StatsPanel title="الخط الزمني الموحَّد" icon={<CalendarDays size={16} />}>
        {totalEvents === 0 ? (
          <EmptyHint hasAnyData={allEvents.length > 0} />
        ) : (
          <TimelineFeed groups={groups} collapsible emptyLabel="لا توجد أحداث في هذه الفترة" />
        )}
      </StatsPanel>
    </>
  );
}

/** Map progress moduleIds to feed presentation. */
const MODULE_FEED: Record<string, { domain: Domain; icon: ReactNode; title: string; weight: number }> = {
  fasting: { domain: 'fasting', icon: <Utensils size={ICON_SIZE} />, title: 'صيام تطوّع', weight: 65 },
  dhikr: { domain: 'dhikr', icon: <Sparkles size={ICON_SIZE} />, title: 'أتممتَ أذكارك', weight: 55 },
  qiyam: { domain: 'dhikr', icon: <Moon size={ICON_SIZE} />, title: 'قيام الليل', weight: 58 },
};

/** Wird unit → Arabic label. */
const UNIT_LABEL: Record<'page' | 'ayat' | 'juz' | 'hizb' | 'surah', string> = {
  page: 'صفحة',
  ayat: 'آية',
  juz: 'جزء',
  hizb: 'حزب',
  surah: 'سورة',
};

function StatsHeader({
  period,
  totalEvents,
  totalDays,
}: {
  period: string;
  totalEvents: number;
  totalDays: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative overflow-hidden rounded-[var(--radius-card)] bg-[image:var(--gradient-teal)] text-on-accent p-4 flex items-center gap-4 shadow-[var(--shadow-md)]"
    >
      <div className="shrink-0 w-12 h-12 rounded-2xl bg-on-accent/12 text-gold-light grid place-items-center">
        <Layers size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs opacity-90">{period}</p>
        <p className="text-sm font-bold mt-0.5">
          <span className="font-counter">{toArabicDigits(totalEvents)}</span> حدث على مدار{' '}
          <span className="font-counter">{toArabicDigits(totalDays)}</span>{' '}
          {totalDays === 1 ? 'يوم' : 'أيام'}
        </p>
        <p className="text-[11px] opacity-80 mt-0.5">كل عبادة سجَّلتها، مجمَّعة يوماً بيوم</p>
      </div>
    </motion.div>
  );
}

function FilterPill({
  label,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
        active
          ? 'bg-teal text-on-accent border-teal'
          : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/80 border-black/[0.06] dark:border-white/[0.08]',
      ].join(' ')}
      style={active && color ? { background: color, borderColor: color } : undefined}
    >
      <span style={!active && color ? { color } : undefined}>{icon}</span>
      {label}
    </motion.button>
  );
}

function EmptyHint({ hasAnyData }: { hasAnyData: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-teal/8 dark:bg-dark-border grid place-items-center text-teal dark:text-teal-light">
        <CalendarDays size={22} />
      </div>
      <p className="text-sm text-text-secondary">
        {hasAnyData ? 'لا توجد أحداث مطابقة للتصفية في هذه الفترة' : 'لا توجد أحداث مُسجَّلة في هذه الفترة'}
      </p>
      <p className="text-[12px] text-text-muted">
        {hasAnyData
          ? 'جرِّب إزالة بعض عوامل التصفية أو تغيير الفترة الزمنية'
          : 'سجِّل صلواتك ووردك وأذكارك لتظهر هنا يوماً بيوم'}
      </p>
    </div>
  );
}
