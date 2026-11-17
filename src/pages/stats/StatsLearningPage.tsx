import { useMemo } from 'react';
import {
  Sparkles,
  BookText,
  HandHeart,
  GraduationCap,
  Star,
  Heart,
  Layers,
  Eye,
  Library,
  ScrollText,
} from 'lucide-react';
import { StatsSubPage } from '@/components/stats/StatsSubPage';
import { StatsPanel } from '@/components/stats/StatsPanel';
import { StatsHeroCard } from '@/components/stats/StatsHeroCard';
import { StatTile } from '@/components/stats/StatTile';
import { ProgressGauge } from '@/components/stats/ProgressGauge';
import { CellGridMap } from '@/components/stats/CellGridMap';
import { DonutChart } from '@/components/stats/DonutChart';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { useAsmaProgressStore } from '@/store/asmaProgressStore';
import { useHadithStore } from '@/store/hadithStore';
import { useDuaaLibraryStore } from '@/store/duaaLibraryStore';
import { DUAA_LIBRARY, DUAA_CATEGORIES } from '@/data/duaaLibrary';
import { toArabicDigits } from '@/services/statsService';

import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
const ASMA_TOTAL = 99;

// Tri-state colours for the 99-names grid.
const ASMA_GRID_COLORS = {
  a: 'var(--color-gold)', // favourited (also covers studied+favourited overlap)
  b: 'var(--color-teal)', // studied (not favourited)
  c: 'var(--color-track)', // untouched (cream)
};

// Grade → Arabic label + colour for the hadith donut.
const HADITH_GRADES: { key: 'sahih' | 'hasan' | 'daif'; label: string; color: string }[] = [
  { key: 'sahih', label: 'صحيح', color: 'var(--color-teal)' },
  { key: 'hasan', label: 'حسن', color: 'var(--color-gold)' },
  { key: 'daif', label: 'ضعيف', color: 'var(--color-danger)' },
];

export function StatsLearningPage() {
  // ── Store snapshots (read raw slices, aggregate in useMemo) ──────────
  const asmaStudied = useAsmaProgressStore((s) => s.studied);
  const asmaFavorites = useAsmaProgressStore((s) => s.favorites);
  const hadithFavorites = useHadithStore((s) => s.favorites);
  const hadithCache = useHadithStore((s) => s.cache);
  const duaaFavorites = useDuaaLibraryStore((s) => s.favorites);
  const duaaRecentlyViewed = useDuaaLibraryStore((s) => s.recentlyViewed);

  // ── Asma aggregation ─────────────────────────────────────────────────
  const asma = useMemo(() => {
    const studiedSet = new Set(asmaStudied);
    const favSet = new Set(asmaFavorites);
    const studiedCount = studiedSet.size;
    const favCount = favSet.size;
    // Favourite rate is relative to what has been studied (engagement depth).
    const favRate = studiedCount > 0 ? Math.round((favCount / studiedCount) * 100) : 0;

    // Build tri-state map: favourited → 'a' (gold), studied → 'b' (teal),
    // everything else falls back to 'c' (cream) inside CellGridMap.
    const states: Record<number, 'a' | 'b' | 'c'> = {};
    studiedSet.forEach((i) => {
      states[i] = 'b';
    });
    favSet.forEach((i) => {
      // Gold wins so studied+favourited overlap renders as gold.
      states[i] = 'a';
    });

    return { studiedCount, favCount, favRate, states };
  }, [asmaStudied, asmaFavorites]);

  // ── Hadith aggregation ───────────────────────────────────────────────
  const hadith = useMemo(() => {
    const favCount = hadithFavorites.length;
    const cachedCount = Object.keys(hadithCache).length;

    // Favourites grouped by grade for the donut.
    const byGrade: Record<string, number> = { sahih: 0, hasan: 0, daif: 0 };
    let ungraded = 0;
    for (const h of hadithFavorites) {
      if (h.grade && byGrade[h.grade] !== undefined) byGrade[h.grade] += 1;
      else ungraded += 1;
    }
    const gradeSlices = HADITH_GRADES.map((g) => ({
      label: g.label,
      value: byGrade[g.key],
      color: g.color,
    }));

    // Favourites grouped by book for the distribution bars.
    const bookCounts = new Map<string, number>();
    for (const h of hadithFavorites) {
      const book = h.book?.trim() || 'غير معروف';
      bookCounts.set(book, (bookCounts.get(book) ?? 0) + 1);
    }
    const bookItems = Array.from(bookCounts.entries()).map(([label, value]) => ({
      label,
      value,
      color: 'var(--color-teal)',
    }));

    return { favCount, cachedCount, gradeSlices, bookItems, ungraded };
  }, [hadithFavorites, hadithCache]);

  // ── Duaa aggregation ─────────────────────────────────────────────────
  const duaa = useMemo(() => {
    const favCount = duaaFavorites.length;
    const recentCount = duaaRecentlyViewed.length;

    // id → categoryId via DUAA_LIBRARY, then categoryId → nameAr via DUAA_CATEGORIES.
    const idToCategory = new Map(DUAA_LIBRARY.map((d) => [d.id, d.categoryId]));
    const catName = new Map(DUAA_CATEGORIES.map((c) => [c.id, c.nameAr]));

    const catCounts = new Map<string, number>();
    for (const id of duaaFavorites) {
      const catId = idToCategory.get(id);
      if (!catId) continue;
      catCounts.set(catId, (catCounts.get(catId) ?? 0) + 1);
    }

    const categoryItems = Array.from(catCounts.entries()).map(([catId, value]) => ({
      label: catName.get(catId) ?? catId,
      value,
      color: 'var(--color-gold)',
    }));

    return { favCount, recentCount, categoryItems };
  }, [duaaFavorites, duaaRecentlyViewed]);

  // ── Combined top summary ─────────────────────────────────────────────
  const summary = useMemo(
    () => ({
      asmaStudied: asma.studiedCount,
      hadithFavorites: hadith.favCount,
      duaaFavorites: duaa.favCount,
    }),
    [asma.studiedCount, hadith.favCount, duaa.favCount],
  );

  return (
    <StatsSubPage title="إحصاءات التعلّم" showPeriod={false}>
      <StatsHeroCard
        title="رحلة العلم"
        subtitle="الأسماء الحسنى والأحاديث والأدعية — منذ البداية"
        icon={<GraduationCap size={20} />}
        headline={{
          value: `${toArabicDigits(Math.round((summary.asmaStudied / ASMA_TOTAL) * 100))}٪`,
          label: `من أسماء الله الحسنى (${toArabicDigits(summary.asmaStudied)} من ${toArabicDigits(ASMA_TOTAL)})`,
        }}
        tiles={[
          { value: toArabicDigits(summary.asmaStudied), label: 'أسماء مدروسة' },
          { value: toArabicDigits(summary.hadithFavorites), label: 'أحاديث محفوظة' },
          { value: toArabicDigits(summary.duaaFavorites), label: 'أدعية مفضّلة' },
        ]}
      />

      {/* ── 1 · Asma al-Husna ───────────────────────────────────────── */}
      <StatsPanel title="أسماء الله الحسنى" icon={<Sparkles size={16} />}>
        <div className="flex flex-col items-center gap-1 pt-1">
          <ProgressGauge
            value={asma.studiedCount}
            max={ASMA_TOTAL}
            variant="ring"
            size={172}
            label="نسبة الاطلاع"
            thresholds={[
              { at: 0, color: 'var(--color-danger)' },
              { at: 40, color: 'var(--color-gold-dark)' },
              { at: 60, color: 'var(--color-gold)' },
              { at: 80, color: 'var(--color-teal)' },
            ]}
            formatValue={(pct) => (
              <span className="flex flex-col items-center leading-none">
                <span>{toArabicDigits(asma.studiedCount)}</span>
                <span className="text-[11px] text-text-muted font-normal mt-0.5">
                  من {toArabicDigits(ASMA_TOTAL)} · {toArabicDigits(pct)}٪
                </span>
              </span>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="أسماء مدروسة"
            value={toArabicDigits(asma.studiedCount)}
            accent="teal"
            icon={<BookText size={14} />}
          />
          <StatTile
            label="أسماء مفضّلة"
            value={toArabicDigits(asma.favCount)}
            accent="gold"
            icon={<Star size={14} />}
          />
          <StatTile
            label="نسبة التفضيل"
            value={`${toArabicDigits(asma.favRate)}٪`}
            accent="gold"
            icon={<Heart size={14} />}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px] text-text-muted">خريطة الأسماء التسعة والتسعين</p>
          <CellGridMap
            count={ASMA_TOTAL}
            states={asma.states}
            colors={ASMA_GRID_COLORS}
            columns={11}
            oneBased
            labelFor={(i) => `الاسم ${toArabicDigits(i)}`}
          />
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-1">
            <LegendDot color="var(--color-gold)" label="مفضّل" />
            <LegendDot color="var(--color-teal)" label="مدروس" />
            <LegendDot color="var(--color-track)" label="لم يُطّلع عليه" muted />
          </div>
          {asma.studiedCount === 0 ? (
            <p className="text-[12px] text-text-muted text-center pt-1">
              ابدأ بتصفّح أسماء الله الحسنى لتظهر هنا خريطة تقدّمك.
            </p>
          ) : null}
        </div>
      </StatsPanel>

      {/* ── 2 · Hadith ──────────────────────────────────────────────── */}
      <StatsPanel title="الأحاديث" icon={<ScrollText size={16} />}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="أحاديث محفوظة"
            value={toArabicDigits(hadith.favCount)}
            accent="gold"
            icon={<Heart size={14} />}
          />
          <StatTile
            label="إجمالي المخزّن"
            value={toArabicDigits(hadith.cachedCount)}
            accent="teal"
            icon={<Library size={14} />}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px] text-text-muted">المفضّلة حسب الدرجة</p>
          <DonutChart
            slices={hadith.gradeSlices}
            size={160}
            thickness={22}
            emptyLabel="لا أحاديث محفوظة"
            centerLabel={
              hadith.favCount > 0 ? (
                <span className="flex flex-col items-center leading-none">
                  <span className="text-2xl font-bold font-counter text-text-primary dark:text-text-on-dark">
                    {toArabicDigits(hadith.favCount)}
                  </span>
                  <span className="text-[11px] text-text-muted mt-0.5">محفوظ</span>
                </span>
              ) : null
            }
          />
          {hadith.ungraded > 0 ? (
            <p className="text-[11px] text-text-muted text-center">
              {toArabicDigits(hadith.ungraded)} حديث دون درجة مُسجّلة
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px] text-text-muted">المفضّلة حسب الكتاب</p>
          <DistributionBars
            items={hadith.bookItems}
            formatValue={(v) => toArabicDigits(v)}
            emptyLabel="لا أحاديث محفوظة بعد"
          />
        </div>
      </StatsPanel>

      {/* ── 3 · Duaa ────────────────────────────────────────────────── */}
      <StatsPanel title="الأدعية" icon={<HandHeart size={16} />}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="إجمالي المفضّلة"
            value={toArabicDigits(duaa.favCount)}
            accent="gold"
            icon={<Heart size={14} />}
          />
          <StatTile
            label="شُوهدت مؤخراً"
            value={toArabicDigits(duaa.recentCount)}
            accent="teal"
            icon={<Eye size={14} />}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px] text-text-muted">المفضّلة حسب الفئة</p>
          <DistributionBars
            items={duaa.categoryItems}
            formatValue={(v) => toArabicDigits(v)}
            emptyLabel="لا أدعية مفضّلة بعد"
          />
          {duaa.favCount === 0 ? (
            <p className="text-[12px] text-text-muted text-center pt-1">
              أضِف أدعية إلى المفضّلة لتظهر هنا حسب فئاتها.
            </p>
          ) : null}
        </div>
      </StatsPanel>

      {/* Footer accent */}
      <div className="flex items-center justify-center gap-2 text-text-muted pt-1 pb-2">
        <Layers size={14} />
        <span className="text-[11px]">رحلة العلم لا تتوقف</span>
        <GraduationCap size={14} />
      </div>
      <BadgeCategoryStrip categories={['knowledge']} />
    </StatsSubPage>
  );
}

function LegendDot({ color, label, muted = false }: { color: string; label: string; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary dark:text-text-on-dark">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: color, border: muted ? '1px solid var(--color-cream-dark)' : 'none' }}
      />
      {label}
    </span>
  );
}
