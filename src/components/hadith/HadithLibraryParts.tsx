import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpenText, Copy, Heart, Search, Share2, Sparkles } from 'lucide-react';
import { openLink } from '@/components/study/studyUi';
import { dorarSearchUrl } from '@/lib/hadithMatn';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/TextInput';
import { copyItem, shareItem, useItemFavorite } from '@/components/inspiration/itemActions';
import { HADITH_BOOKS, HADITH_TOTAL } from '@/data/hadithBooks';
import { getHadith, libraryItem, onSearchProgress, searchHadith, warmSearch } from '@/services/hadithLibrary';
import { highlightRuns, type SearchHit, type SearchResult } from '@/lib/hadithSearchEngine';
import { stripTashkeel } from '@/lib/arabicSearch';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const TASHKEEL_KEY = 'myzikr:hadith-lib:tashkeel';

/** Show/hide tashkeel — a per-device reading preference (like islambook's switch). */
export function useTashkeel(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(TASHKEEL_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(TASHKEEL_KEY, v ? '0' : '1');
      } catch {
        /* preference just won't persist */
      }
      return !v;
    });
  return [on, toggle];
}

export function TashkeelButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? 'إخفاء التشكيل' : 'إظهار التشكيل'}
      className={[
        'min-h-10 px-3 rounded-xl text-[13px] font-bold transition-colors',
        on ? 'bg-teal/10 text-teal dark:text-teal-light' : 'text-text-muted hover:bg-teal/5',
      ].join(' ')}
    >
      {on ? 'مُشكَّل' : 'بلا تشكيل'}
    </button>
  );
}

export const fmtCount = (n: number) => toArabicDigits(n.toLocaleString('en-US')).replace(/,/g, '٬');

/** One hadith: number, text (search words highlighted), copy / share / save. */
export function HadithCard({
  book,
  number,
  text,
  tashkeel,
  words = [],
  showBook = false,
  focused = false,
}: {
  book: number;
  number: number;
  text: string;
  tashkeel: boolean;
  words?: readonly string[];
  showBook?: boolean;
  focused?: boolean;
}) {
  const item = useMemo(() => libraryItem(book, number, text), [book, number, text]);
  const [fav, toggleFav] = useItemFavorite(item);
  const shown = tashkeel ? text : stripTashkeel(text);
  const runs = useMemo(() => highlightRuns(shown, words), [shown, words]);
  const iconBtn = 'w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-gold hover:bg-gold/10 shrink-0';
  return (
    <div id={`h-${number}`} className="scroll-mt-28">
      <Card variant="plain" className={['p-4', focused ? 'ring-2 ring-gold/60' : ''].join(' ')}>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center rounded-lg bg-teal/10 text-teal dark:text-teal-light px-2 py-0.5 text-[11.5px] font-bold font-counter">
            {toArabicDigits(number)}
          </span>
          {showBook ? (
            <Link to={`/sunnah/${book}?n=${number}`} className="text-[11.5px] font-semibold text-gold-dark dark:text-gold-light hover:underline truncate">
              {HADITH_BOOKS[book].name}
            </Link>
          ) : null}
        </div>
        <p className="font-display text-[15px] leading-[2] text-text-primary dark:text-text-on-dark text-pretty select-text">
          {runs.map((r, i) =>
            r.hit ? (
              <mark key={i} className="bg-gold/25 text-inherit rounded px-0.5">
                {r.s}
              </mark>
            ) : (
              r.s
            ),
          )}
        </p>
        <div className="flex items-center justify-end gap-1 mt-2">
          {/* Its شرح and grading on الدرر السنية (searched by the matn, not the isnad). */}
          <button
            type="button"
            onClick={() => void openLink(dorarSearchUrl(text))}
            className="me-auto min-h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-bold text-teal dark:text-teal-light bg-teal/10 hover:bg-teal/15 transition-colors"
          >
            <BookOpenText size={15} /> شرحه في الدرر السنية
          </button>
          <button type="button" onClick={() => void copyItem(item)} aria-label="نسخ" className={iconBtn}>
            <Copy size={15} />
          </button>
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
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] px-3 min-h-12">
      <Search size={16} className="text-text-muted shrink-0" />
      <TextInput
        value={value}
        onValueChange={onChange}
        onFocus={warmSearch}
        type="search"
        placeholder={placeholder}
        aria-label="بحث في الأحاديث"
        className="flex-1 min-w-0 bg-transparent py-3 text-sm text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none"
      />
    </label>
  );
}

const PAGE = 20;

/**
 * Results for a query (debounced): builds the index on first use with a
 * progress bar, then exact matches first and «نتائج قريبة» (close spellings)
 * after them, paged.
 */
export function HadithSearchResults({ query, books, tashkeel }: { query: string; books?: number[]; tashkeel: boolean }) {
  const [q, setQ] = useState(query);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const booksKey = books?.join(',') ?? '';

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => onSearchProgress((d, t) => setProgress(d < t ? [d, t] : null)), []);

  useEffect(() => setLimit(PAGE), [q, booksKey]);

  useEffect(() => {
    if (!q) {
      setRes(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    searchHadith(q, { books, offset: 0, limit })
      .then(async (r) => {
        const missing = r.hits.filter((h) => texts[`${h.book}:${h.number}`] === undefined);
        const loaded = await Promise.all(missing.map((h) => getHadith(h.book, h.number)));
        if (cancelled) return;
        setTexts((prev) => {
          const next = { ...prev };
          missing.forEach((h, i) => (next[`${h.book}:${h.number}`] = loaded[i] ?? ''));
          return next;
        });
        setRes(r);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // `texts` is a cache, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, booksKey, limit]);

  if (!query.trim()) return null;

  if (progress) {
    const pct = Math.round((progress[0] / progress[1]) * 100);
    return (
      <Card variant="plain" className="p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">
          تجهيز البحث في {fmtCount(HADITH_TOTAL)} حديثاً… {toArabicDigits(pct)}٪
        </p>
        <div className="h-2 rounded-full bg-track overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-[image:var(--gradient-teal)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-text-muted">مرة واحدة في كل جلسة، ثم يصبح البحث فورياً.</p>
      </Card>
    );
  }

  if (failed) {
    return <EmptyState title="تعذّر البحث" description="أعد المحاولة بعد قليل" />;
  }

  if (!res || (busy && res.hits.length === 0)) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <Card key={i} variant="plain" className="p-4">
            <Skeleton lines={3} height={16} />
          </Card>
        ))}
      </div>
    );
  }

  if (res.total === 0) {
    return <EmptyState title="لا نتائج" description="جرّب كلمة أقصر أو جزءاً من الكلمة، فالبحث يتجاهل التشكيل والهمزات" />;
  }

  const firstNear = res.hits.findIndex((h) => h.near);
  const row = (h: SearchHit) => (
    <HadithCard
      key={`${h.book}:${h.number}`}
      book={h.book}
      number={h.number}
      text={texts[`${h.book}:${h.number}`] ?? ''}
      tashkeel={tashkeel}
      words={res.words}
      showBook
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[12px] text-text-muted">
        {res.exact > 0 ? `${fmtCount(res.exact)} نتيجة مطابقة` : 'لا تطابق تاماً'}
        {res.total > res.exact ? ` · ${fmtCount(res.total - res.exact)} نتيجة قريبة` : ''}
      </p>
      {res.hits.map((h, i) => (
        <div key={`${h.book}:${h.number}`} className="flex flex-col gap-2">
          {i === firstNear ? (
            <p className="mt-2 px-1 inline-flex items-center gap-1.5 text-[12px] font-bold text-gold-dark dark:text-gold-light">
              <Sparkles size={13} /> نتائج قريبة من كلماتك
            </p>
          ) : null}
          {row(h)}
        </div>
      ))}
      {res.total > res.hits.length ? (
        <Button variant="soft" fullWidth loading={busy} onClick={() => setLimit((n) => n + PAGE)}>
          عرض المزيد ({fmtCount(res.total - res.hits.length)})
        </Button>
      ) : null}
    </div>
  );
}
