import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from '@/lib/motion';
import { Search, X, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/TextInput';
import { hapticsService } from '@/services/HapticsService';
import { FEATURE_CATEGORIES, ALL_FEATURES, type FeatureItem } from '@/data/featureCatalog';
import { toArabicDigits } from '@/utils/arabicFormat';

/** One-line descriptions for catalog items that don't carry their own hint. */
const HINTS: Record<string, string> = {
  prayers: 'الفروض والسنن ومواقيتها',
  dhikr: 'الصباح والمساء وما بعد الصلاة',
  fasting: 'سجّل صيامك وتابع شهرك',
  habits: 'عاداتك اليومية بتذكير',
  tasbih: 'سبحة تعدّ معك',
  qibla: 'اتجاه الكعبة من موقعك',
  mosques: 'أقرب المساجد إليك',
  calendar: 'الأشهر الهجرية ومناسباتها',
  asma: 'تعلّمها واحفظها',
  hadith: 'حديث لكل يوم',
  zakat: 'احسب زكاة مالك',
  sadaqah: 'سجّل صدقاتك وتابعها',
  badges: 'إنجازاتك في رحلة العبادة',
  settings: 'المظهر والتنبيهات والصلاة',
  backup: 'احفظ بياناتك واستعدها',
};

/** Arabic number agreement: ميزة واحدة · ميزتان · ٣ ميزات · ١١ ميزة. */
const featureCount = (n: number) =>
  n === 1 ? 'ميزة واحدة' : n === 2 ? 'ميزتان' : n <= 10 ? `${toArabicDigits(n)} ميزات` : `${toArabicDigits(n)} ميزة`;

/** Wide tiles keep the 2-col grid free of orphans: odd → first; even ≥4 → first + last. */
const isWide = (i: number, n: number) => (n % 2 === 1 ? i === 0 : n >= 4 && (i === 0 || i === n - 1));

const hintOf = (f: FeatureItem) => f.hint ?? HINTS[f.id] ?? '';

const CATEGORY_OF: Record<string, string> = Object.fromEntries(
  FEATURE_CATEGORIES.flatMap((c) => c.items.map((i) => [i.id, c.title])),
);

/** Loose Arabic matching: drop tashkeel/tatweel, unify alef/yaa/taa marbuta. */
function norm(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/**
 * «المزيد» — every feature in the app, grouped by category, filterable by
 * category chip and searchable (hints included, Arabic-normalised).
 */
export function FeaturesHubPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return null;
    return ALL_FEATURES.filter((f) => norm(f.label).includes(q) || norm(hintOf(f)).includes(q));
  }, [query]);

  const categories = cat ? FEATURE_CATEGORIES.filter((c) => c.id === cat) : FEATURE_CATEGORIES;
  const go = (to: string) => navigate(to);

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-xs text-text-muted">كل ما في رفيقي</p>
        <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark">المزيد</h1>
        <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 mt-0.5">
          الأدوات والعبادات والتعلّم في مكان واحد
        </p>
      </header>

      {/* Hero: the count seal + search */}
      <Card variant="gradient-edge" className="p-4">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="flex items-center gap-3">
          <Medallion size={54} tone="gold">
            <span className="text-base text-gold-dark dark:text-gold-light">{toArabicDigits(ALL_FEATURES.length)}</span>
          </Medallion>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-text-primary dark:text-text-on-dark">ميزة تنتظرك</p>
            <p className="text-xs text-text-muted">
              في {toArabicDigits(FEATURE_CATEGORIES.length)} أقسام، ابحث أو تصفّح
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-text-muted pointer-events-none" />
          <TextInput
            value={query}
            onValueChange={setQuery}
            placeholder="ابحث: القبلة، الزكاة، الحفظ…"
            aria-label="ابحث عن ميزة"
            type="search"
            className="w-full min-h-12 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ps-10 pe-10 text-sm text-text-primary dark:text-text-on-dark placeholder:text-text-muted ring-1 ring-black/[0.05] dark:ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-teal/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
              className="absolute top-1/2 -translate-y-1/2 end-1.5 w-9 h-9 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-teal"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </Card>

      {results ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="نتائج البحث" subtitle={`${toArabicDigits(results.length)} نتيجة`} />
          {results.length ? (
            <Card className="p-1.5">
              {results.map((f) => (
                <ResultRow key={f.id} f={f} onPick={go} />
              ))}
            </Card>
          ) : (
            <EmptyState
              title={`لا نتائج لـ «${query.trim()}»`}
              description="جرّب كلمة أقصر، أو تصفّح الأقسام."
              cta={{ label: 'عرض كل الأقسام', onClick: () => setQuery('') }}
            />
          )}
        </section>
      ) : (
        <>
          {/* Category filter chips */}
          <div className="-mx-4 px-4 overflow-x-auto no-scrollbar -my-2 py-0.5">
            <div className="flex gap-1.5 w-max" role="radiogroup" aria-label="الأقسام">
              {[{ id: null as string | null, title: 'الكل' }, ...FEATURE_CATEGORIES].map((c) => {
                const on = cat === c.id;
                return (
                  <button
                    key={c.id ?? 'all'}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      void hapticsService.selection();
                      setCat(c.id);
                    }}
                    className={[
                      'min-h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors duration-200',
                      on
                        ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                        : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/75 ring-1 ring-black/[0.05] dark:ring-white/[0.07] hover:text-teal',
                    ].join(' ')}
                  >
                    {c.title}
                  </button>
                );
              })}
            </div>
          </div>

          {categories.map((c, ci) => (
            <motion.section
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(ci, 5) * 0.04, duration: 0.24 }}
              className="flex flex-col gap-2.5"
            >
              <SectionTitle title={c.title} subtitle={featureCount(c.items.length)} />
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {c.items.map((f, i) => (
                  <FeatureTile key={f.id} f={f} featured={isWide(i, c.items.length)} onPick={go} />
                ))}
              </div>
            </motion.section>
          ))}
        </>
      )}
    </div>
  );
}

/** Grid tile; `featured` = a wide, accented tile (see isWide). */
function FeatureTile({ f, featured, onPick }: { f: FeatureItem; featured: boolean; onPick: (to: string) => void }) {
  const { Icon } = f;
  const hint = hintOf(f);
  return (
    <HapticPressable
      haptic="light"
      onClick={() => onPick(f.to)}
      className={[
        'text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] hover:ring-teal/25 transition-shadow',
        featured ? 'col-span-2 lg:col-span-1 p-4 flex items-center gap-3.5' : 'p-3.5 flex flex-col gap-2.5',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex items-center justify-center shrink-0 rounded-2xl',
          featured
            ? 'w-12 h-12 bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-sm)]'
            : 'w-10 h-10 bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
        ].join(' ')}
      >
        <Icon size={featured ? 22 : 19} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{f.label}</span>
        {hint ? <span className="block text-[11px] text-text-muted leading-snug line-clamp-2 mt-0.5">{hint}</span> : null}
      </span>
      {featured ? <ChevronLeft size={17} className="text-text-muted shrink-0" /> : null}
    </HapticPressable>
  );
}

function ResultRow({ f, onPick }: { f: FeatureItem; onPick: (to: string) => void }) {
  const { Icon } = f;
  return (
    <button
      type="button"
      onClick={() => onPick(f.to)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
        <Icon size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{f.label}</span>
        <span className="block text-[11px] text-text-muted truncate">
          {CATEGORY_OF[f.id]}
          {hintOf(f) ? `، ${hintOf(f)}` : ''}
        </span>
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" />
    </button>
  );
}
