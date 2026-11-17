import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { NumberInput } from '@/components/ui/NumberInput';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { SectionTitle } from '@/components/ui/Ornament';
import {
  HadithCard,
  HadithSearchResults,
  SearchBox,
  TashkeelButton,
  fmtCount,
  useTashkeel,
} from '@/components/hadith/HadithLibraryParts';
import { HADITH_BOOKS, HADITH_TOTAL } from '@/data/hadithBooks';
import { getHadiths } from '@/services/hadithLibrary';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * «الحديث النبوي الشريف» — the nine books (islambook's numbering), offline.
 * Search ignores tashkeel/hamza forms, matches parts of words, and falls back
 * to close spellings for mistyped words.
 */
export function HadithLibraryPage() {
  const navigate = useNavigate();
  const [tashkeel, toggleTashkeel] = useTashkeel();
  const [query, setQuery] = useState('');
  const [book, setBook] = useState<number | null>(null);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="الحديث النبوي الشريف"
        subtitle={`الكتب التسعة · ${fmtCount(HADITH_TOTAL)} حديثاً`}
        showBack
        actions={<TashkeelButton on={tashkeel} onToggle={toggleTashkeel} />}
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-4">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث بكلمة أو جزء منها أو رقم الحديث…" />
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
          {[null, ...HADITH_BOOKS.map((b) => b.id)].map((id) => (
            <button
              key={id ?? 'all'}
              type="button"
              onClick={() => {
                void hapticsService.selection();
                setBook(id);
              }}
              aria-pressed={book === id}
              className={[
                'shrink-0 min-h-9 px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap',
                book === id
                  ? 'bg-[image:var(--gradient-teal)] text-on-accent'
                  : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/75 ring-1 ring-black/[0.05] dark:ring-white/[0.07]',
              ].join(' ')}
            >
              {id === null ? 'كل الكتب' : HADITH_BOOKS[id].name}
            </button>
          ))}
        </div>

        {query.trim() ? (
          <HadithSearchResults query={query} books={book === null ? undefined : [book]} tashkeel={tashkeel} />
        ) : (
          <>
            <p className="px-1 text-[11.5px] text-text-muted leading-relaxed text-pretty">
              يتجاهل البحث التشكيل والهمزات، ويقبل جزءاً من الكلمة، ويقترح الكلمات القريبة إن أخطأت في كتابتها. اكتب رقماً لتصل إلى الحديث بالرقم.
            </p>
            <section className="flex flex-col gap-3">
              <SectionTitle title="الكتب" subtitle="اختر كتاباً لتتصفّحه بالترقيم" />
              <div className="grid grid-cols-2 gap-3">
                {HADITH_BOOKS.map((b) => (
                  <HapticPressable
                    key={b.id}
                    onClick={() => navigate(`/sunnah/${b.id}`)}
                    className={[
                      'text-start rounded-[var(--radius-card)] p-4 flex flex-col gap-2 min-h-32 ring-1 shadow-[var(--shadow-sm)]',
                      b.sahih
                        ? 'bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-gold/30 dark:ring-gold/20'
                        : 'bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06]',
                    ].join(' ')}
                  >
                    <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center">
                      <BookOpen size={17} />
                    </span>
                    <span className="mt-auto block text-[15px] font-bold text-text-primary dark:text-text-on-dark">{b.name}</span>
                    <span className="block text-[11px] text-text-muted line-clamp-1">{b.author}</span>
                    <span className="block text-[11px] font-semibold text-teal dark:text-teal-light">{fmtCount(b.count)} حديثاً</span>
                  </HapticPressable>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const PAGE = 20;

/** One book, in pages of 20 by number; `?n=` opens (and rings) that hadith. */
export function HadithBookPage() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const book = HADITH_BOOKS[Number(params.book)] ?? HADITH_BOOKS[0];
  const target = Math.min(book.count, Math.max(1, Number(search.get('n')) || 1));
  const start = Math.floor((target - 1) / PAGE) * PAGE + 1;
  const end = Math.min(book.count, start + PAGE - 1);
  const [tashkeel, toggleTashkeel] = useTashkeel();
  const [query, setQuery] = useState('');
  const [jump, setJump] = useState(target);
  const [texts, setTexts] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTexts(null);
    void getHadiths(book.id, start, end).then((t) => !cancelled && setTexts(t));
    return () => {
      cancelled = true;
    };
  }, [book.id, start, end]);

  // Bring a linked hadith into view once its page is on screen.
  useEffect(() => {
    if (texts && search.get('n')) document.getElementById(`h-${target}`)?.scrollIntoView({ block: 'start' });
  }, [texts, target, search]);

  const go = (n: number) => {
    setSearch({ n: String(Math.min(book.count, Math.max(1, n))) }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title={book.name}
        subtitle={`${fmtCount(book.count)} حديثاً`}
        showBack
        actions={<TashkeelButton on={tashkeel} onToggle={toggleTashkeel} />}
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-4">
        <SearchBox value={query} onChange={setQuery} placeholder={`ابحث في ${book.name}…`} />

        {query.trim() ? (
          <HadithSearchResults query={query} books={[book.id]} tashkeel={tashkeel} />
        ) : (
          <>
            <Card variant="plain" className="p-3 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text-secondary dark:text-text-on-dark/80 shrink-0">الحديث رقم</span>
              <NumberInput
                value={jump}
                onValueChange={setJump}
                min={1}
                max={book.count}
                aria-label="رقم الحديث"
                className="flex-1 min-w-0 min-h-10 rounded-xl bg-cream-dark/50 dark:bg-dark-surface px-3 text-center font-counter text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40"
                onKeyDown={(e) => e.key === 'Enter' && go(jump)}
              />
              <Button variant="primary" size="sm" onClick={() => go(jump)}>
                اذهب
              </Button>
            </Card>

            <Pager start={start} end={end} count={book.count} onGo={go} />

            {texts ? (
              <div className="flex flex-col gap-2">
                {texts.map((t, i) => (
                  <HadithCard
                    key={start + i}
                    book={book.id}
                    number={start + i}
                    text={t}
                    tashkeel={tashkeel}
                    focused={!!search.get('n') && start + i === target}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i} variant="plain" className="p-4">
                    <Skeleton lines={4} height={16} />
                  </Card>
                ))}
              </div>
            )}

            {texts ? <Pager start={start} end={end} count={book.count} onGo={go} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Pager({ start, end, count, onGo }: { start: number; end: number; count: number; onGo: (n: number) => void }) {
  const btn = 'w-11 h-11 rounded-xl inline-flex items-center justify-center bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary disabled:opacity-30';
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={btn} disabled={start <= 1} onClick={() => onGo(start - PAGE)} aria-label="الصفحة السابقة">
        <ChevronRight size={18} />
      </button>
      <span className="text-[12px] text-text-muted font-counter">
        {toArabicDigits(start)}–{toArabicDigits(end)} من {fmtCount(count)}
      </span>
      <button type="button" className={btn} disabled={end >= count} onClick={() => onGo(end + 1)} aria-label="الصفحة التالية">
        <ChevronLeft size={18} />
      </button>
    </div>
  );
}
