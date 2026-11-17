import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from '@/lib/motion';
import {
  Heart,
  ChevronRight,
  ChevronLeft,
  Volume2,
  Play,
  Pause,
  Shuffle,
  Star,
  Sparkles,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { SectionTitle, ArchMotif, OrnamentRule } from '@/components/ui/Ornament';
import { ProgressGauge } from '@/components/stats/ProgressGauge';
import { StatTile } from '@/components/stats/StatTile';
import { ASMA_UL_HUSNA } from '@/data/asmaUlHusna';
import { useAsmaProgressStore } from '@/store/asmaProgressStore';
import { audioPlayerService } from '@/services/AudioPlayerService';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const ASMA_TOTAL = 99;

const FILTERS = [
  { id: 'all' as const, label: 'الكل' },
  { id: 'todo' as const, label: 'لم أدرسها' },
  { id: 'fav' as const, label: 'المفضّلة' },
];

const ASMA_THRESHOLDS = [
  { at: 0, color: 'var(--color-text-muted)' },
  { at: 40, color: 'var(--color-gold-dark)' },
  { at: 60, color: 'var(--color-gold)' },
  { at: 80, color: 'var(--color-teal)' },
];

/**
 * Grid view of 99 names. Replaces the Coming Soon stub at `/asma`.
 */
export function AsmaUlHusnaPage() {
  const navigate = useNavigate();
  const studied = useAsmaProgressStore((s) => s.studied);
  const favorites = useAsmaProgressStore((s) => s.favorites);

  // ── Coverage aggregation (read raw slices, derive here) ───────────────
  const { studiedSet, favSet, favRate, nextUnstudied } = useMemo(() => {
    const sSet = new Set(studied);
    const fSet = new Set(favorites);
    // Favourite rate is relative to what's been studied (engagement depth).
    const rate = sSet.size > 0 ? Math.round((fSet.size / sSet.size) * 100) : 0;
    // First name (lowest index) the user has not yet opened.
    const next = ASMA_UL_HUSNA.find((x) => !sSet.has(x.index)) ?? null;
    return { studiedSet: sSet, favSet: fSet, favRate: rate, nextUnstudied: next };
  }, [studied, favorites]);

  const [filter, setFilter] = useState<'all' | 'todo' | 'fav'>('all');
  const shown = useMemo(
    () =>
      filter === 'all'
        ? ASMA_UL_HUSNA
        : ASMA_UL_HUSNA.filter((x) => (filter === 'fav' ? favSet.has(x.index) : !studiedSet.has(x.index))),
    [filter, favSet, studiedSet],
  );

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="الأسماء الحسنى"
        subtitle="تعلّمها واحفظها وتدبّر معانيها"
        showBack
        actions={
          <Button variant="icon" haptic="light" onClick={() => navigate('/asma/flashcards')} aria-label="بطاقات المراجعة">
            <Shuffle size={18} />
          </Button>
        }
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6">
        {/* ── Ornamented hero ──────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card variant="gradient-edge" className="p-5 flex flex-col gap-5">
            <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
            <div className="text-center">
              <Sparkles size={20} className="mx-auto text-gold" />
              <p className="font-ornate text-xl leading-loose text-teal dark:text-teal-light mt-1 text-balance">
                «إنّ لله تسعةً وتسعين اسماً، مَن أحصاها دخل الجنة»
              </p>
              <p className="text-[11px] text-text-muted">متفق عليه</p>
            </div>

            <div className="flex justify-center">
              <ProgressGauge
                value={studiedSet.size}
                max={ASMA_TOTAL}
                variant="ring"
                size={168}
                label="نسبة الإحصاء"
                thresholds={ASMA_THRESHOLDS}
                formatValue={(pct) => (
                  <span className="flex flex-col items-center leading-none">
                    <span>{toArabicDigits(studiedSet.size)}</span>
                    <span className="text-[11px] text-text-muted font-normal mt-0.5">
                      من {toArabicDigits(ASMA_TOTAL)}، {toArabicDigits(pct)}٪
                    </span>
                  </span>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="مدروسة"
                value={toArabicDigits(studiedSet.size)}
                accent="teal"
                icon={<BookOpen size={14} />}
              />
              <StatTile
                label="المفضّلة"
                value={toArabicDigits(favSet.size)}
                accent="gold"
                icon={<Star size={14} />}
              />
              <StatTile
                label="نسبة التفضيل"
                value={`${toArabicDigits(favRate)}٪`}
                accent="gold"
                icon={<Heart size={14} />}
              />
            </div>

            {/* "التالي" CTA → first unstudied name (hidden once all 99 studied). */}
            {nextUnstudied ? (
              <Button
                variant="primary"
                fullWidth
                haptic="light"
                rightIcon={<ArrowLeft size={16} />}
                onClick={() => navigate(`/asma/${nextUnstudied.index}`)}
              >
                ادرس التالي: {nextUnstudied.arabic}
              </Button>
            ) : (
              <p className="text-center text-xs text-success font-semibold">
                أحصيتَ الأسماء التسعة والتسعين كاملةً
              </p>
            )}
          </Card>
        </motion.div>

        {/* ── Names grid ───────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2.5">
        <SectionTitle title="الأسماء التسعة والتسعون" subtitle="المدروسة بلون مميّز، والمفضّلة بنجمة" />
        <div role="radiogroup" aria-label="تصفية الأسماء" className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.id)}
                className={[
                  'flex-1 min-h-10 rounded-xl text-[13px] font-semibold transition-colors',
                  on ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-secondary dark:text-text-on-dark/70',
                ].join(' ')}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {shown.map((n) => {
            const isFav = favSet.has(n.index);
            const isStudied = studiedSet.has(n.index);
            return (
              <HapticPressable
                key={n.index}
                haptic="light"
                onClick={() => navigate(`/asma/${n.index}`)}
                className="w-full text-start"
              >
                <Card
                  variant={isFav ? 'gold-rim' : 'plain'}
                  className={[
                    'p-3 h-full flex flex-col gap-1 transition-colors',
                    !isFav && isStudied ? 'ring-teal/30 dark:ring-teal/30' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-counter text-text-muted">{toArabicDigits(n.index)}</span>
                    {isFav ? (
                      <Star size={12} className="fill-gold text-gold" />
                    ) : isStudied ? (
                      <Badge size="dot" status="done" />
                    ) : null}
                  </div>
                  <p
                    className={[
                      'font-display text-xl text-center leading-snug py-1',
                      isStudied || isFav
                        ? 'text-teal dark:text-teal-light'
                        : 'text-text-secondary dark:text-text-on-dark/80',
                    ].join(' ')}
                  >
                    {n.arabic}
                  </p>
                  <p className="text-[10px] text-text-muted italic text-center">{n.transliteration}</p>
                </Card>
              </HapticPressable>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-6">
            {filter === 'fav' ? 'لم تضف أسماء إلى المفضّلة بعد' : 'أحصيت الأسماء كلها، بارك الله فيك'}
          </p>
        ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * Detail page for a single name.
 */
export function AsmaUlHusnaDetailPage() {
  const { index } = useParams();
  const navigate = useNavigate();
  const n = ASMA_UL_HUSNA.find((x) => x.index === Number(index));
  const markStudied = useAsmaProgressStore((s) => s.markStudied);
  const toggleFavorite = useAsmaProgressStore((s) => s.toggleFavorite);
  const isFavorite = useAsmaProgressStore((s) => s.isFavorite);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (n) markStudied(n.index);
  }, [n, markStudied]);

  useEffect(() => {
    return audioPlayerService.subscribe((p, u) => {
      setPlaying(p && u === n?.audioUrl);
    });
  }, [n?.audioUrl]);

  if (!n) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="الأسماء الحسنى" showBack />
        <p className="p-6 text-center text-text-muted">اسم غير موجود</p>
      </div>
    );
  }

  const fav = isFavorite(n.index);
  const prev = n.index > 1 ? n.index - 1 : null;
  const next = n.index < 99 ? n.index + 1 : null;

  const playPause = () => {
    if (!n.audioUrl) return;
    if (playing) audioPlayerService.stop();
    else void audioPlayerService.play(n.audioUrl);
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="الأسماء الحسنى"
        subtitle={`الاسم ${toArabicDigits(n.index)} من ${toArabicDigits(ASMA_TOTAL)}`}
        showBack
        actions={
          <Button
            variant="icon"
            haptic="light"
            onClick={() => {
              void hapticsService.impact('light');
              toggleFavorite(n.index);
            }}
            aria-label={fav ? 'إزالة من المفضلة' : 'أضف إلى المفضلة'}
          >
            <Heart size={18} className={fav ? 'fill-gold text-gold' : ''} />
          </Button>
        }
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-4 pt-6 pb-28 flex flex-col items-center gap-6"
      >
        <Card variant="gradient-edge" className="w-full px-5 py-8 flex flex-col items-center">
          <ArchMotif className="absolute inset-x-0 mx-auto -top-2 w-44 text-gold opacity-20" />
          <p className="relative font-display text-6xl text-teal dark:text-teal-light leading-loose text-center">
            {n.arabic}
          </p>
          <p className="relative text-sm text-text-muted italic">{n.transliteration}</p>
          <OrnamentRule className="w-32 mt-4" />
        </Card>

        <Card variant="gold-rim" className="p-5 w-full text-center">
          <p className="text-[11px] text-text-muted mb-2">المعنى</p>
          <p className="font-arabic text-lg leading-relaxed text-text-primary dark:text-text-on-dark">
            {n.meaningAr}
          </p>
          {n.explanationAr ? (
            <>
              <p className="text-[11px] text-text-muted mt-4 mb-2">شرح</p>
              <p className="font-arabic text-sm leading-relaxed text-text-secondary">{n.explanationAr}</p>
            </>
          ) : null}
        </Card>

        {n.audioUrl ? (
          <Button variant="primary" leftIcon={playing ? <Pause size={16} /> : <Play size={16} />} onClick={playPause}>
            {playing ? 'إيقاف' : 'استماع'}
          </Button>
        ) : null}

        <div className="flex items-center gap-2 mt-2">
          {prev ? (
            <Button variant="secondary" size="sm" leftIcon={<ChevronRight size={14} />} onClick={() => navigate(`/asma/${prev}`)}>
              السابق
            </Button>
          ) : null}
          {next ? (
            <Button
              variant="secondary"
              size="sm"
              rightIcon={<ChevronLeft size={14} />}
              onClick={() => navigate(`/asma/${next}`)}
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
 * Flashcards mode: random name, swipe to next.
 */
export function AsmaUlHusnaFlashcardsPage() {
  const [currentIndex, setCurrentIndex] = useState(() => Math.floor(Math.random() * 99) + 1);
  const [revealed, setRevealed] = useState(false);
  const n = ASMA_UL_HUSNA.find((x) => x.index === currentIndex)!;

  const nextCard = () => {
    let r;
    do {
      r = Math.floor(Math.random() * 99) + 1;
    } while (r === currentIndex);
    setCurrentIndex(r);
    setRevealed(false);
    void hapticsService.selection();
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg flex flex-col">
      <TopAppBar title="بطاقات الأسماء" subtitle="اختبر معرفتك بالمعاني" showBack />
      <div className="flex-1 flex items-center justify-center px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full max-w-sm"
          >
            <Card variant="gradient-edge" className="p-8 flex flex-col items-center gap-4 min-h-[400px] justify-center">
              <span className="text-xs font-counter text-text-muted">
                {toArabicDigits(n.index)} / {toArabicDigits(ASMA_TOTAL)}
              </span>
              <p className="font-display text-5xl text-teal dark:text-teal-light text-center leading-loose">
                {n.arabic}
              </p>
              {revealed ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center mt-4"
                >
                  <p className="text-sm text-text-muted italic">{n.transliteration}</p>
                  <p className="font-arabic text-base leading-relaxed text-text-primary dark:text-text-on-dark mt-3">
                    {n.meaningAr}
                  </p>
                </motion.div>
              ) : (
                <Button variant="ghost" leftIcon={<Star size={14} />} onClick={() => setRevealed(true)}>
                  كشف المعنى
                </Button>
              )}
            </Card>
            <div className="flex gap-2 mt-4">
              {n.audioUrl ? (
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon={<Volume2 size={14} />}
                  onClick={() => void audioPlayerService.play(n.audioUrl!)}
                >
                  استماع
                </Button>
              ) : null}
              <Button variant="primary" fullWidth onClick={nextCard}>
                التالي
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
