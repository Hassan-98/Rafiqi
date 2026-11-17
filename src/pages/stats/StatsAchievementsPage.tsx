import { useMemo } from 'react';
import { motion } from '@/lib/motion';
import { Award, BarChart3, Layers, History, Lock, Trophy } from 'lucide-react';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { ProgressGauge } from '@/components/stats/ProgressGauge';
import { BarChart } from '@/components/stats/BarChart';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { TimelineFeed, type TimelineGroup } from '@/components/stats/TimelineFeed';
import { EachPrayerStreaks } from '@/components/stats/EachPrayerStreaks';
import { useBadgeStore } from '@/store/badgeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { badgesFor, badgePoints, levelFor, categoryOf, CATEGORY_BY_ID, RARITY_LABEL_AR, RARITY_ORDER, type BadgeRarity, type BadgeDefinition } from '@/data/badges';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { toArabicDigits, dateKeyOf, bucketByDateKey } from '@/services/statsService';

// ── Static display lookups ──────────────────────────────────────────────────

const RARITY_LABELS = RARITY_LABEL_AR;

const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: 'var(--color-teal)',
  rare: 'var(--color-teal-light)',
  epic: 'var(--color-gold)',
  legendary: 'var(--color-gold-dark)',
  mythic: 'var(--color-gold-light)',
};

/** A badge's door (category), for the per-category coverage breakdown. */
const moduleOf = (badge: BadgeDefinition) => categoryOf(badge);

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** 'yyyy-MM-dd' → "٢٣ مايو ٢٠٢٦" (Arabic-digit Gregorian label). */
function formatArabicDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return dateKey;
  return `${toArabicDigits(d)} ${MONTH_NAMES_AR[m - 1] ?? ''} ${toArabicDigits(y)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────

export function StatsAchievementsPage() {
  // Lifetime badge state — no period dependency (this page is lifetime-only).
  const unlocked = useBadgeStore((s) => s.unlocked);
  const unlockedAt = useBadgeStore((s) => s.unlockedAt);
  const gender = useSettingsStore((s) => s.gender);

  const stats = useMemo(() => {
    const unlockedSet = new Set(unlocked);
    const BADGES = badgesFor(gender);
    const total = BADGES.length;
    const unlockedCount = BADGES.filter((b) => unlockedSet.has(b.id)).length;
    const coveragePct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

    // Unlocked badge defs paired with their unlock timestamp (only those we
    // both have a definition and a recorded time for).
    const unlockedWithTime = BADGES.filter((b) => unlockedSet.has(b.id))
      .map((b) => ({ badge: b, at: unlockedAt[b.id] }))
      .filter((x): x is { badge: BadgeDefinition; at: string } => Boolean(x.at));

    const sortedByTimeDesc = [...unlockedWithTime].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    const times = unlockedWithTime
      .map((x) => new Date(x.at).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    const firstUnlock = times.length > 0 ? new Date(times[0]) : null;
    const lastUnlock = times.length > 0 ? new Date(times[times.length - 1]) : null;

    // Unlock velocity = badges per month over the active span (first → now,
    // floored at one month so a fresh user doesn't show an inflated rate).
    let velocityPerMonth = 0;
    if (firstUnlock && unlockedWithTime.length > 0) {
      const spanMs = Date.now() - firstUnlock.getTime();
      const months = Math.max(1, spanMs / (1000 * 60 * 60 * 24 * 30.4375));
      // Use the timestamped count so the numerator matches the time span
      // denominator (first timestamped unlock → now). Badges without a
      // recorded timestamp aren't part of this span.
      velocityPerMonth = unlockedWithTime.length / months;
    }

    // ── By rarity ──
    const rarityUnlocked: Record<BadgeRarity, number> = {
      common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0,
    };
    const rarityTotal: Record<BadgeRarity, number> = {
      common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0,
    };
    for (const b of BADGES) {
      rarityTotal[b.rarity] += 1;
      if (unlockedSet.has(b.id)) rarityUnlocked[b.rarity] += 1;
    }
    const rarityBars = RARITY_ORDER.filter((r) => rarityTotal[r] > 0).map((r) => ({
      label: RARITY_LABELS[r],
      value: rarityUnlocked[r],
      color: RARITY_COLORS[r],
    }));

    // ── By module (coverage = unlocked / total per module) ──
    const moduleUnlocked: Partial<Record<ReturnType<typeof moduleOf>, number>> = {};
    const moduleTotal: Partial<Record<ReturnType<typeof moduleOf>, number>> = {};
    for (const b of BADGES) {
      const mod = moduleOf(b);
      moduleTotal[mod] = (moduleTotal[mod] ?? 0) + 1;
      if (unlockedSet.has(b.id)) moduleUnlocked[mod] = (moduleUnlocked[mod] ?? 0) + 1;
    }
    const moduleItems = (Object.keys(moduleTotal) as ReturnType<typeof moduleOf>[]).map((mod) => ({
      label: CATEGORY_BY_ID[mod].label,
      value: moduleUnlocked[mod] ?? 0,
      max: moduleTotal[mod] ?? 0,
      color: (moduleUnlocked[mod] ?? 0) >= (moduleTotal[mod] ?? 0)
        ? 'var(--color-gold)'
        : 'var(--color-teal)',
    }));

    // ── Unlock log (grouped by day, newest first) ──
    const groupedByDay = bucketByDateKey(sortedByTimeDesc, (x) => dateKeyOf(new Date(x.at)));
    const dayKeysDesc = Object.keys(groupedByDay).sort((a, b) => (a < b ? 1 : -1));
    const timelineGroups: TimelineGroup[] = dayKeysDesc.map((dayKey) => ({
      dateKey: dayKey,
      gregorianLabel: formatArabicDate(dayKey),
      events: groupedByDay[dayKey].map((x) => ({
        icon: <BadgeEmblem icon={x.badge.icon} rarity={x.badge.rarity} unlocked size={22} />,
        color: RARITY_COLORS[x.badge.rarity],
        title: x.badge.titleAr,
        detail: (
          <span>
            {x.badge.descriptionAr}
            <span className="text-text-muted"> · {RARITY_LABELS[x.badge.rarity]}</span>
          </span>
        ),
      })),
    }));

    // ── Upcoming (locked) badges, easiest rarity first ──
    const lockedBadges = BADGES.filter((b) => !unlockedSet.has(b.id) && !b.hidden).sort(
      (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
    );

    return {
      total,
      unlockedCount,
      coveragePct,
      firstUnlock,
      lastUnlock,
      velocityPerMonth,
      rarityBars,
      moduleItems,
      timelineGroups,
      lockedBadges,
    };
  }, [unlocked, unlockedAt, gender]);

  const hasAny = stats.unlockedCount > 0;

  return (
    <StatsSubPage title="الإنجازات والأوسمة" showPeriod={false}>
      {/* 1 · Hero (gold) */}
      <StatsHeroCard
        title="الإنجازات والأوسمة"
        subtitle="رحلة مكافآتك على المداومة — مدى الحياة"
        accent="gold"
        icon={<Trophy size={20} />}
        gauge={
          <ProgressGauge
            value={stats.unlockedCount}
            max={stats.total}
            variant="ring"
            size={150}
            label="من الأوسمة"
            trackColor="color-mix(in srgb, var(--color-on-accent) 22%, transparent)"
            thresholds={[
              { at: 0, color: 'var(--color-gold-light)' },
            ]}
            formatValue={() => (
              <span className="text-on-accent">
                {toArabicDigits(stats.unlockedCount)}
                <span className="text-base opacity-80">/{toArabicDigits(stats.total)}</span>
              </span>
            )}
          />
        }
        tiles={[
          {
            value: levelFor(badgePoints(unlocked, gender)).level.titleAr,
            label: `المستوى · ${toArabicDigits(badgePoints(unlocked, gender))} نقطة`,
          },
          {
            value: stats.lastUnlock ? formatArabicDate(dateKeyOf(stats.lastUnlock)) : '—',
            label: 'آخر وسام',
          },
          {
            value: `${toArabicDigits(stats.velocityPerMonth.toFixed(1))}`,
            label: 'وسام / شهر',
          },
        ]}
      />

      {!hasAny ? (
        <StatsPanel bare>
          <p className="text-sm text-text-secondary text-center py-2 leading-relaxed">
            لم تفتح أي وسام بعد. داوم على عباداتك وستبدأ الأوسمة بالظهور هنا —
            ابدأ بسلسلة أسبوع كامل من الصلوات الخمس.
          </p>
        </StatsPanel>
      ) : null}

      {/* Each prayer's own chain — the closest badges for most people. */}
      <EachPrayerStreaks />

      {/* 2 · By rarity */}
      <StatsPanel title="حسب الندرة" icon={<BarChart3 size={16} />}>
        <BarChart
          data={stats.rarityBars}
          orientation="vertical"
          height={150}
          formatValue={(v) => toArabicDigits(Math.round(v))}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          {RARITY_ORDER.map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: RARITY_COLORS[r] }}
              />
              <span className="text-[11px] text-text-secondary dark:text-text-on-dark">
                {RARITY_LABELS[r]}
              </span>
            </div>
          ))}
        </div>
      </StatsPanel>

      {/* 3 · By module (coverage) */}
      <StatsPanel title="حسب الباب" icon={<Layers size={16} />}>
        <DistributionBars
          items={stats.moduleItems}
          sort
          formatValue={(v) => toArabicDigits(v)}
          emptyLabel="لا توجد أوسمة بعد"
        />
        <p className="text-[11px] text-text-muted pt-1">
          النسبة تمثل الأوسمة المفتوحة من إجمالي أوسمة كل باب.
        </p>
      </StatsPanel>

      {/* 4 · Unlock log */}
      <StatsPanel title="سجل الفتح" icon={<History size={16} />}>
        <TimelineFeed
          groups={stats.timelineGroups}
          collapsible={stats.timelineGroups.length > 4}
          emptyLabel="لم تفتح أي وسام بعد"
        />
      </StatsPanel>

      {/* 5 · Upcoming (locked) badges */}
      <StatsPanel title="الأوسمة القادمة" icon={<Lock size={16} />}>
        {stats.lockedBadges.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-3 leading-relaxed">
            ما شاء الله — فتحتَ جميع الأوسمة المتاحة. أحسنتَ على هذه المداومة!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {stats.lockedBadges.slice(0, 24).map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-2xl border border-dashed border-text-muted/30 bg-cream-dark/40 dark:bg-dark-bg/40 p-3 flex flex-col items-center text-center gap-1 grayscale opacity-70"
              >
                <BadgeEmblem icon={b.icon} rarity={b.rarity} unlocked={false} size={40} />
                <span className="text-[12px] font-semibold text-text-secondary dark:text-text-on-dark leading-tight">
                  {b.titleAr}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    color: RARITY_COLORS[b.rarity],
                    background: 'color-mix(in srgb, currentColor 14%, transparent)',
                  }}
                >
                  {RARITY_LABELS[b.rarity]}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </StatsPanel>

      {/* 6 · Lifetime note */}
      <StatsPanel bare>
        <div className="flex items-start gap-2 text-text-muted">
          <Award size={15} className="shrink-0 mt-0.5 text-gold-dark" />
          <p className="text-[12px] leading-relaxed">
            الأوسمة تُحسب مدى الحياة ولا تتأثر بالفترة المختارة، لذا لا يظهر محدّد
            الفترة في هذه الصفحة. فتحتَ {toArabicDigits(stats.unlockedCount)} من
            أصل {toArabicDigits(stats.total)} وسام ({toArabicDigits(stats.coveragePct)}٪).
          </p>
        </div>
      </StatsPanel>
    </StatsSubPage>
  );
}
