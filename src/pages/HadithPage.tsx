import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from '@/lib/motion';
import { BellRing, BookOpenText, ChevronLeft, Copy, Flame, Heart, Library, Search, Share2, Shuffle } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { TextInput } from '@/components/ui/TextInput';
import { ArchMotif, OrnamentRule, SectionTitle } from '@/components/ui/Ornament';
import { StatTile } from '@/components/stats/StatTile';
import { InspirationSettings, INTERVAL_LABELS } from '@/components/inspiration/InspirationSettings';
import { GradeBadge, copyItem, shareItem, useItemFavorite } from '@/components/inspiration/itemActions';
import { openLink } from '@/components/study/studyUi';
import { dorarSearchUrl } from '@/lib/hadithMatn';
import { hadithService } from '@/services/HadithService';
import {
  dayContext,
  findItem,
  loadCorpus,
  markSeen,
  pickForDay,
  pickRandom,
  displayText,
  searchItems,
  sourceLine,
  type InspirationItem,
  type InspirationKind,
} from '@/services/inspirationService';
import { canonicalHadithId, useHadithStore } from '@/store/hadithStore';
import { useInspirationStore } from '@/store/inspirationStore';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * Lightweight reading streak persisted in localStorage (this page only).
 * Increments once per calendar day the page is opened, resets after a gap.
 */
const STREAK_KEY = 'myzikr:hadith:streak';

function bumpStreak(): number {
  const d = new Date();
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const dayMs = (k: string) => {
    const [y, m, dd] = k.split('-').map(Number);
    return new Date(y, m - 1, dd).getTime();
  };
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    let count = 1;
    if (raw) {
      const prev = JSON.parse(raw) as { last: string; count: number };
      if (prev.last === today) return prev.count;
      count = Math.round((dayMs(today) - dayMs(prev.last)) / 86_400_000) === 1 ? prev.count + 1 : 1;
    }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }));
    return count;
  } catch {
    return 1;
  }
}

type Filter = 'all' | 'ayah' | 'hadith' | 'fav';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'ayah', label: 'آيات' },
  { id: 'hadith', label: 'أحاديث' },
  { id: 'fav', label: 'المفضلة' },
];
const BOOKS = ['صحيح البخاري', 'صحيح مسلم', 'الأربعون النووية', 'الأحاديث القدسية'];
const PAGE = 20;
const TAGS_COLLAPSED = 10;

const segBtn = (active: boolean) =>
  [
    'min-h-10 rounded-xl px-2 text-xs font-bold transition-colors',
    active ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted',
  ].join(' ');

/**
 * «حديث وآية» — the library over the bundled corpus: today's (day-appropriate)
 * ayah/hadith as the hero, the notification entry, then browse by kind / book /
 * tag, Arabic-normalised search, favourites and shuffle. `?id=` (from a
 * notification tap or the Home card) opens that exact item in the hero.
 */
export function HadithPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const linkedId = params.get('id');
  const [corpus, setCorpus] = useState<InspirationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<InspirationItem | null>(null);
  const [fromLink, setFromLink] = useState(false);
  const [streak] = useState(bumpStreak);
  const [filter, setFilter] = useState<Filter>('all');
  const [book, setBook] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const favorites = useHadithStore((s) => s.favorites);
  const ayahFavorites = useHadithStore((s) => s.ayahFavorites);
  const insp = useInspirationStore((s) => s.settings);
  const label = dayContext(new Date()).label;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCorpus(), hadithService.getHadithOfDay()])
      .then(([all, today]) => {
        if (cancelled) return;
        setCorpus(all);
        const linked = linkedId ? findItem(all, canonicalHadithId(linkedId)) : undefined;
        if (linked) markSeen([linked.id]);
        setFromLink(!!linked);
        setFocus(linked ?? today);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  const showToday = (kind: InspirationKind) => {
    if (!corpus) return;
    setFromLink(false);
    setFocus(pickForDay(corpus, new Date(), kind));
  };

  const shuffle = (kind?: InspirationKind) => {
    if (!corpus) return;
    void hapticsService.impact('light');
    const next = pickRandom(corpus, { kind, exclude: new Set(focus ? [focus.id] : []) });
    if (next) {
      setFromLink(false);
      setFocus(next);
    }
  };

  const openItem = (i: InspirationItem) => {
    setFromLink(false);
    setFocus(i);
    markSeen([i.id]);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Favourites: corpus items + legacy records that have no corpus twin.
  const favItems = useMemo(() => {
    if (!corpus) return [];
    const ayahKeys = new Set(ayahFavorites);
    const hadithIds = new Set(favorites.map((f) => canonicalHadithId(f.id)));
    const found = corpus.filter((i) => (i.kind === 'ayah' ? ayahKeys.has(i.key!) : hadithIds.has(i.id)));
    const foundIds = new Set(found.map((i) => i.id));
    const legacy = favorites
      .filter((f) => !foundIds.has(canonicalHadithId(f.id)))
      .map<InspirationItem>((f) => ({
        kind: 'hadith',
        id: f.id,
        text: f.arabic,
        book: f.book,
        number: f.number ?? 0,
        ...(f.grade === 'sahih' || f.grade === 'hasan' ? { grade: f.grade } : {}),
        tags: [],
      }));
    return [...found, ...legacy];
  }, [corpus, favorites, ayahFavorites]);

  const base = useMemo(() => {
    if (!corpus) return [];
    if (filter === 'fav') return favItems;
    if (filter === 'all') return corpus;
    return corpus.filter((i) => i.kind === filter && (filter !== 'hadith' || !book || i.book === book));
  }, [corpus, favItems, filter, book]);

  const tagList = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of base) for (const t of i.tags) if (t !== 'قدسي') count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [base]);

  const results = useMemo(
    () => searchItems(tag ? base.filter((i) => i.tags.includes(tag)) : base, query),
    [base, tag, query],
  );

  // Reset paging when the view changes; drop a tag that no longer exists.
  useEffect(() => setLimit(PAGE), [filter, book, tag, query]);
  useEffect(() => {
    if (tag && !tagList.includes(tag)) setTag(null);
  }, [tag, tagList]);

  const favCount = favorites.length + ayahFavorites.length;
  const shownTags = allTags ? tagList : tagList.slice(0, TAGS_COLLAPSED);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="حديث وآية"
        subtitle="آيات وأحاديث صحيحة، لكل يوم"
        showBack
        actions={
          <Button variant="icon" haptic="light" onClick={() => shuffle(focus?.kind)} aria-label="اختيار عشوائي">
            <Shuffle size={18} />
          </Button>
        }
      />
      <div ref={topRef} className="px-4 pt-4 pb-28 flex flex-col gap-6 scroll-mt-24">
        {/* Hero — today's / linked item */}
        {focus ? (
          <FocusHero
            item={focus}
            kicker={fromLink ? 'من الإشعار' : label ?? 'لِيومك'}
            onToday={showToday}
            onShuffle={() => shuffle(focus.kind)}
          />
        ) : failed ? (
          <Card variant="plain" className="p-5 text-center">
            <p className="text-sm text-text-muted">تعذّر تحميل المكتبة.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => window.location.reload()}>
              إعادة المحاولة
            </Button>
          </Card>
        ) : (
          <Card variant="elevated" className="p-5">
            <Skeleton lines={3} height={20} />
          </Card>
        )}

        {/* The full nine-book library */}
        <HapticPressable onClick={() => navigate('/sunnah')} className="block">
          <Card variant="gold-rim" className="p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
              <Library size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">الحديث النبوي الشريف</p>
              <p className="text-xs text-text-muted mt-0.5">الكتب التسعة، {toArabicDigits('62٬169')} حديثاً مع البحث</p>
            </div>
            <ChevronLeft size={18} className="text-text-muted shrink-0" />
          </Card>
        </HapticPressable>

        {/* Notification entry */}
        <HapticPressable onClick={() => setSheet(true)} className="block">
          <Card variant="plain" className="p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <BellRing size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">آية وحديث في إشعار</p>
              <p className="text-xs text-text-muted mt-0.5">
                {insp.enabled ? `مفعّل · ${INTERVAL_LABELS[insp.interval]}` : 'تصلك تلقائياً على مدار اليوم'}
              </p>
            </div>
            <ChevronLeft size={18} className="text-text-muted shrink-0" />
          </Card>
        </HapticPressable>

        <div className="grid grid-cols-2 gap-3">
          <StatTile value={toArabicDigits(streak)} label="أيام متتالية" icon={<Flame size={16} />} accent="gold" />
          <StatTile
            value={toArabicDigits(favCount)}
            label="المفضلة"
            icon={<Heart size={16} />}
            accent="teal"
            onClick={() => setFilter('fav')}
          />
        </div>

        {/* Library */}
        <section className="flex flex-col gap-3 min-w-0">
          <SectionTitle
            title="المكتبة"
            subtitle={corpus ? `${toArabicDigits(corpus.filter((i) => i.kind === 'ayah').length)} آية و${toArabicDigits(corpus.filter((i) => i.kind === 'hadith').length)} حديث` : undefined}
          />

          <label className="flex items-center gap-2 rounded-2xl bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] px-3 min-h-12">
            <Search size={16} className="text-text-muted shrink-0" />
            <TextInput
              value={query}
              onValueChange={setQuery}
              type="search"
              placeholder="ابحث بكلمة: الصبر، الرحمة، الجار…"
              aria-label="بحث في الآيات والأحاديث"
              className="flex-1 min-w-0 bg-transparent py-3 text-sm text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="radiogroup" aria-label="النوع">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                onClick={() => {
                  void hapticsService.selection();
                  setFilter(f.id);
                }}
                className={segBtn(filter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filter === 'hadith' ? (
            <div className="flex flex-wrap gap-2">
              {[null, ...BOOKS].map((b) => (
                <Chip key={b ?? 'all'} label={b ?? 'كل الكتب'} active={book === b} onClick={() => setBook(b)} />
              ))}
            </div>
          ) : null}

          {tagList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {shownTags.map((t) => (
                <Chip key={t} label={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)} />
              ))}
              {tagList.length > TAGS_COLLAPSED ? (
                <button type="button" onClick={() => setAllTags((v) => !v)} className="min-h-9 px-2 text-xs font-bold text-teal dark:text-teal-light">
                  {allTags ? 'أقل' : `المزيد (${toArabicDigits(tagList.length - TAGS_COLLAPSED)})`}
                </button>
              ) : null}
            </div>
          ) : null}

          {!corpus ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} variant="plain" className="p-4">
                  <Skeleton lines={2} height={18} />
                </Card>
              ))}
            </div>
          ) : results.length === 0 ? (
            filter === 'fav' && !query && !tag ? (
              <EmptyState
                title="لا مفضلة بعد"
                description="احفظ ما يلامس قلبك من الآيات والأحاديث لتعود إليه"
                cta={{ label: 'تصفّح الكل', onClick: () => setFilter('all') }}
              />
            ) : (
              <EmptyState
                title="لا نتائج"
                description="جرّب كلمة أخرى أو وسماً مختلفاً"
                cta={{ label: 'مسح البحث', onClick: () => { setQuery(''); setTag(null); } }}
              />
            )
          ) : (
            <>
              <p className="px-1 text-[11px] text-text-muted">{toArabicDigits(results.length)} نتيجة</p>
              <div className="flex flex-col gap-2">
                {results.slice(0, limit).map((i) => (
                  <ItemRow key={i.id} item={i} onOpen={() => openItem(i)} />
                ))}
              </div>
              {results.length > limit ? (
                <Button variant="soft" fullWidth onClick={() => setLimit((n) => n + PAGE)}>
                  عرض المزيد
                </Button>
              ) : null}
            </>
          )}
        </section>
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="آية وحديث">
        <InspirationSettings />
      </BottomSheet>
    </div>
  );
}

function FocusHero({
  item,
  kicker,
  onToday,
  onShuffle,
}: {
  item: InspirationItem;
  kicker: string;
  onToday: (k: InspirationKind) => void;
  onShuffle: () => void;
}) {
  const [fav, toggleFav] = useItemFavorite(item);
  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="relative flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-gold-dark dark:text-gold-light min-w-0 truncate">{kicker}</p>
          <div className="inline-flex rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 shrink-0" role="tablist" aria-label="اليوم">
            {(
              [
                ['ayah', 'آية اليوم'],
                ['hadith', 'حديث اليوم'],
              ] as const
            ).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={item.kind === k} onClick={() => onToday(k)} className={segBtn(item.kind === k).replace('min-h-10', 'min-h-8 px-3')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {item.kind === 'ayah' ? (
          <p className="relative font-quran text-[1.5rem] leading-[2.1] mt-4 text-center text-text-primary dark:text-text-on-dark text-balance">
            {item.text}
          </p>
        ) : (
          <p className="relative font-display text-lg leading-loose mt-4 text-text-primary dark:text-text-on-dark text-pretty whitespace-pre-line">
            «{item.text}»
          </p>
        )}
        <OrnamentRule className="my-3" />
        <div className="relative flex flex-wrap items-center justify-center gap-2 text-xs text-text-muted">
          <span>{sourceLine(item)}</span>
          <GradeBadge grade={item.grade} />
        </div>

        <div className="relative flex flex-wrap items-center justify-center gap-2 mt-4">
          <Button
            variant={fav ? 'gold' : 'soft'}
            size="sm"
            haptic="light"
            leftIcon={<Heart size={15} className={fav ? 'fill-current' : ''} />}
            onClick={toggleFav}
            aria-pressed={fav}
          >
            {fav ? 'محفوظ' : 'حفظ'}
          </Button>
          <Button variant="secondary" size="sm" haptic="light" leftIcon={<Share2 size={15} />} onClick={() => void shareItem(item)}>
            مشاركة
          </Button>
          <Button variant="icon" size="sm" haptic="light" onClick={() => void copyItem(item)} aria-label="نسخ">
            <Copy size={16} />
          </Button>
          <Button variant="icon" size="sm" haptic="light" onClick={onShuffle} aria-label={item.kind === 'ayah' ? 'آية أخرى' : 'حديث آخر'}>
            <Shuffle size={16} />
          </Button>
          {item.kind === 'hadith' ? (
            <Button
              variant="soft"
              size="sm"
              haptic="light"
              leftIcon={<BookOpenText size={15} />}
              onClick={() => void openLink(dorarSearchUrl(item.text))}
            >
              شرحه في الدرر السنية
            </Button>
          ) : null}
        </div>
      </Card>
    </motion.div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        void hapticsService.selection();
        onClick();
      }}
      aria-pressed={active}
      className={[
        'min-h-9 px-3 rounded-xl text-xs font-bold transition-colors',
        active
          ? 'bg-[image:var(--gradient-teal)] text-on-accent'
          : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/75 ring-1 ring-black/[0.05] dark:ring-white/[0.07]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function ItemRow({ item, onOpen }: { item: InspirationItem; onOpen: () => void }) {
  const [fav, toggleFav] = useItemFavorite(item);
  const iconBtn = 'w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-gold hover:bg-gold/10 shrink-0';
  return (
    <Card variant="plain" className="p-4">
      <button type="button" onClick={onOpen} className="block w-full text-start min-w-0">
        <p
          className={[
            'text-text-primary dark:text-text-on-dark line-clamp-5 text-pretty whitespace-pre-line',
            item.kind === 'ayah' ? 'font-quran text-lg leading-[2]' : 'font-display text-sm leading-relaxed',
          ].join(' ')}
        >
          {displayText(item)}
        </p>
      </button>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-muted">{sourceLine(item)}</span>
          <GradeBadge grade={item.grade} />
        </div>
        <button type="button" onClick={() => void shareItem(item)} aria-label="مشاركة" className={iconBtn}>
          <Share2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            void hapticsService.impact('light');
            toggleFav();
          }}
          aria-pressed={fav}
          aria-label={fav ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
          className={iconBtn}
        >
          <Heart size={16} className={fav ? 'fill-gold text-gold' : ''} />
        </button>
      </div>
    </Card>
  );
}
