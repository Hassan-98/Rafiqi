import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from '@/lib/motion';
import { Heart, Search, Copy, Share2, ChevronLeft, ChevronRight, BookOpen, Sparkles } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Button } from '@/components/ui/Button';
import { DUAA_CATEGORIES, DUAA_LIBRARY, type DuaaLibraryEntry } from '@/data/duaaLibrary';
import { useDuaaLibraryStore } from '@/store/duaaLibraryStore';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { formatTafsirHtml } from '@/utils/formatTafsir';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Category list (entry point at `/duaa-library`). */
export function DuaaLibraryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const favorites = useDuaaLibraryStore((s) => s.favorites);

  const filteredEntries = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return DUAA_LIBRARY.filter((d) => d.arabic.includes(q) || d.reference.includes(q)).slice(0, 30);
  }, [query]);
  const favEntries = useMemo(() => DUAA_LIBRARY.filter((d) => favorites.includes(d.id)), [favorites]);
  const open = (d: DuaaLibraryEntry) => navigate(`/duaa-library/${d.categoryId}/${d.id}`);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="مكتبة الأدعية" subtitle="أدعية الكتاب والسنة وحصن المسلم" showBack />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-4 pb-28 flex flex-col gap-6"
      >
        {/* Hero: the library count + search */}
        <Card variant="gradient-edge" className="p-4">
          <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
          <div className="flex items-center gap-3">
            <Medallion size={54} tone="gold">
              <span className="text-base text-gold-dark dark:text-gold-light">{toArabicDigits(DUAA_LIBRARY.length)}</span>
            </Medallion>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-text-primary dark:text-text-on-dark">دعاءً مأثوراً</p>
              <p className="text-xs text-text-muted">في {toArabicDigits(DUAA_CATEGORIES.length)} تصنيفاً، مع فضلها ومصدرها</p>
            </div>
          </div>
          <div className="relative mt-4">
            <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <TextInput
              type="search"
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث في نصّ الدعاء أو مصدره…"
              aria-label="ابحث في الأدعية"
              className="w-full min-h-12 ps-10 pe-4 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] text-sm text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
        </Card>

        {query.trim() ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="نتائج البحث" subtitle={`${toArabicDigits(filteredEntries.length)} نتيجة`} />
            {filteredEntries.length === 0 ? (
              <EmptyState title="لا نتائج" description="جرّب كلمة أخرى من نصّ الدعاء." />
            ) : (
              <DuaaList entries={filteredEntries} onPick={open} />
            )}
          </section>
        ) : (
          <>
            {favEntries.length > 0 ? (
              <section className="flex flex-col gap-2.5">
                <SectionTitle title="المفضلة" subtitle={`${toArabicDigits(favEntries.length)} دعاء`} />
                <DuaaList entries={favEntries.slice(0, 5)} onPick={open} />
              </section>
            ) : null}

            <section className="flex flex-col gap-2.5">
              <SectionTitle title="التصنيفات" />
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {DUAA_CATEGORIES.map((cat) => {
                  const count = DUAA_LIBRARY.filter((d) => d.categoryId === cat.id).length;
                  return (
                    <HapticPressable
                      key={cat.id}
                      haptic="light"
                      onClick={() => navigate(`/duaa-library/${cat.id}`)}
                      className="text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] hover:ring-teal/25 p-3 flex items-center gap-3"
                    >
                      <span className="w-10 h-10 rounded-xl bg-gold/12 inline-flex items-center justify-center text-xl shrink-0" aria-hidden>
                        {cat.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{cat.nameAr}</span>
                        <span className="block text-[11px] text-text-muted font-counter">{toArabicDigits(count)} دعاء</span>
                      </span>
                    </HapticPressable>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </motion.div>
    </div>
  );
}

/** Duaa rows inside one card, hairline-separated. */
function DuaaList({ entries, onPick }: { entries: DuaaLibraryEntry[]; onPick: (d: DuaaLibraryEntry) => void }) {
  return (
    <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
      {entries.map((d, i) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onPick(d)}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
        >
          <span className="w-7 h-7 rounded-lg bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light text-[11px] font-counter font-bold inline-flex items-center justify-center shrink-0">
            {toArabicDigits(i + 1)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-arabic text-sm leading-relaxed text-text-primary dark:text-text-on-dark line-clamp-2">{d.arabic}</span>
            <span className="block text-[10.5px] text-text-muted truncate mt-0.5">{d.reference}</span>
          </span>
          <ChevronLeft size={16} className="text-text-muted shrink-0" />
        </button>
      ))}
    </Card>
  );
}

export function DuaaCategoryPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const cat = DUAA_CATEGORIES.find((c) => c.id === categoryId);
  const entries = useMemo(() => DUAA_LIBRARY.filter((d) => d.categoryId === categoryId), [categoryId]);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title={cat?.nameAr ?? 'الأدعية'}
        subtitle={entries.length ? `${toArabicDigits(entries.length)} دعاء` : undefined}
        showBack
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-2">
        {entries.length === 0 ? (
          <EmptyState
            title="لا توجد أدعية في هذا التصنيف"
            cta={{ label: 'كل التصنيفات', onClick: () => navigate('/duaa-library') }}
          />
        ) : (
          <DuaaList entries={entries} onPick={(d) => navigate(`/duaa-library/${categoryId}/${d.id}`)} />
        )}
      </div>
    </div>
  );
}

export function DuaaDetailPage() {
  const { categoryId, id } = useParams();
  const navigate = useNavigate();
  const entry = DUAA_LIBRARY.find((d) => d.id === id);
  const isFavorite = useDuaaLibraryStore((s) => s.isFavorite);
  const toggleFavorite = useDuaaLibraryStore((s) => s.toggleFavorite);
  const markViewed = useDuaaLibraryStore((s) => s.markViewed);
  const fav = entry ? isFavorite(entry.id) : false;

  useEffect(() => {
    if (entry) markViewed(entry.id);
  }, [entry, markViewed]);

  if (!entry) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="الدعاء" showBack />
        <p className="p-6 text-text-muted text-center">دعاء غير موجود</p>
      </div>
    );
  }

  const idx = DUAA_LIBRARY.filter((d) => d.categoryId === categoryId).findIndex((d) => d.id === entry.id);
  const siblings = DUAA_LIBRARY.filter((d) => d.categoryId === categoryId);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(`${entry.arabic}\n— ${entry.reference}`);
      toast.success('تم النسخ');
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  const shareDuaa = async () => {
    const text = `${entry.arabic}\n— ${entry.reference}`;
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({ title: 'دعاء', text });
      } catch {
        /* user cancelled */
      }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: 'دعاء', text });
      } catch {
        /* user cancelled */
      }
    } else {
      void copyText();
    }
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title={DUAA_CATEGORIES.find((c) => c.id === categoryId)?.nameAr ?? 'الدعاء'}
        subtitle={idx >= 0 ? `دعاء ${toArabicDigits(idx + 1)} من ${toArabicDigits(siblings.length)}` : undefined}
        showBack
        actions={
          <Button
            variant="icon"
            haptic="light"
            onClick={() => {
              void hapticsService.impact('light');
              toggleFavorite(entry.id);
            }}
            aria-label={fav ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
          >
            <Heart size={18} className={fav ? 'fill-gold text-gold' : ''} />
          </Button>
        }
      />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-6 pb-28 flex flex-col gap-5"
      >
        <DuaaBodyCard entry={entry} />

        {entry.benefit ? (
          <div className="rounded-[var(--radius-card)] bg-gold/10 ring-1 ring-gold/30 p-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-dark dark:text-gold-light">
              <Sparkles size={13} /> فضل هذا الدعاء
            </p>
            <p className="mt-1.5 text-sm text-text-primary dark:text-text-on-dark leading-relaxed text-pretty">{entry.benefit}</p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth leftIcon={<Copy size={14} />} onClick={copyText}>
            نسخ
          </Button>
          <Button variant="secondary" fullWidth leftIcon={<Share2 size={14} />} onClick={shareDuaa}>
            مشاركة
          </Button>
        </div>

        {/* Prev / Next within category */}
        <div className="flex gap-2 justify-between mt-2">
          {idx > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronRight size={14} />}
              onClick={() => navigate(`/duaa-library/${categoryId}/${siblings[idx - 1].id}`)}
            >
              السابق
            </Button>
          ) : (
            <span />
          )}
          {idx < siblings.length - 1 ? (
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronLeft size={14} />}
              onClick={() => navigate(`/duaa-library/${categoryId}/${siblings[idx + 1].id}`)}
            >
              التالي
            </Button>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * The duaa body card. Renders the Arabic text through `formatTafsirHtml`
 * so prophetic blessings (ﷺ / صلى الله عليه وسلم), Quran citations and
 * inline quoted phrases pick up the gold + teal highlights instead of all
 * blending into one wall of text. The reference is given its own little
 * pill at the bottom of the card so it doesn't fight the duaa for
 * attention.
 */
function DuaaBodyCard({ entry }: { entry: DuaaLibraryEntry }) {
  const formatted = useMemo(() => formatTafsirHtml(entry.arabic), [entry.arabic]);
  return (
    <Card variant="gradient-edge" className="p-0 overflow-hidden">
      {/* Ornament strip at the top — a subtle gold band that mirrors the
          ornamental rule found in classical printed du'aa collections. */}
      <div className="h-1 bg-[image:var(--gradient-gold)]" />

      <div className="p-6 text-center">
        <div
          className="font-quran t-rich text-[24px] leading-[2.2] text-text-primary dark:text-text-on-dark"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: formatted }}
        />

        <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal/10 text-[11px] text-teal dark:text-teal-light">
          <BookOpen size={11} />
          <span>{entry.reference}</span>
        </div>
      </div>

      <div className="h-1 bg-[image:var(--gradient-gold)] opacity-70" />
    </Card>
  );
}
