import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Heart, Share2, Shuffle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { OrnamentRule } from '@/components/ui/Ornament';
import { Skeleton } from '@/components/ui/Skeleton';
import { GradeBadge, shareItem, useItemFavorite } from '@/components/inspiration/itemActions';
import { hadithService } from '@/services/HadithService';
import {
  dayContext,
  loadCorpus,
  pickForDay,
  pickRandom,
  sourceLine,
  type InspirationItem,
  type InspirationKind,
} from '@/services/inspirationService';
import { hapticsService } from '@/services/HapticsService';

/**
 * تدبّر — the ayah and the hadith of the day from the bundled corpus
 * (day-appropriate on Fridays, Ramadan, the ten of Dhul-Hijjah…). The hadith
 * leads (owner: the Sunnah gets the prominent spot); the chips switch, shuffle draws a fresh one, and
 * tapping the text opens it in the «حديث وآية» library.
 */
export function ReflectionCard() {
  const navigate = useNavigate();
  const today = new Date();
  const [tab, setTab] = useState<InspirationKind>('hadith');
  const [items, setItems] = useState<Record<InspirationKind, InspirationItem | null>>({ ayah: null, hadith: null });
  const [corpus, setCorpus] = useState<InspirationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const label = dayContext(today).label;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCorpus(), hadithService.getHadithOfDay()])
      .then(([all, hadith]) => {
        if (cancelled) return;
        setCorpus(all);
        setItems({ ayah: pickForDay(all, new Date(), 'ayah'), hadith });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const item = items[tab];
  const [fav, toggleFav] = useItemFavorite(item);

  const shuffle = () => {
    if (!corpus) return;
    void hapticsService.impact('light');
    const next = pickRandom(corpus, { kind: tab, maxLen: 450, exclude: new Set(item ? [item.id] : []) });
    if (next) setItems((s) => ({ ...s, [tab]: next }));
  };

  const iconBtn =
    'w-10 h-10 -m-1 inline-flex items-center justify-center rounded-xl text-text-muted hover:text-gold hover:bg-gold/10 transition-colors';

  return (
    <Card variant="gradient-edge" className="p-5">
      <div className="relative flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="tablist" aria-label="تدبّر">
          {(
            [
              ['ayah', 'آية اليوم'],
              ['hadith', 'حديث اليوم'],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={[
                'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors min-h-8',
                tab === id
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-muted',
              ].join(' ')}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={tab === 'ayah' ? 'آية أخرى' : 'حديث آخر'} onClick={shuffle} className={iconBtn}>
            <Shuffle size={16} />
          </button>
          {item ? (
            <>
              <button type="button" aria-label="مشاركة" onClick={() => void shareItem(item)} className={iconBtn}>
                <Share2 size={16} />
              </button>
              <button
                type="button"
                aria-label={fav ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
                aria-pressed={fav}
                onClick={() => {
                  void hapticsService.impact('light');
                  toggleFav();
                }}
                className={iconBtn}
              >
                <Heart size={17} className={fav ? 'fill-gold text-gold' : ''} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {label ? (
        <p className="relative mt-3 text-center text-[11px] font-bold text-gold-dark dark:text-gold-light">{label}</p>
      ) : null}

      <div className="relative mt-3 min-h-[7.5rem] flex flex-col justify-center">
        {item ? (
          <button
            type="button"
            onClick={() => navigate(`/hadith?id=${encodeURIComponent(item.id)}`)}
            className="block w-full rounded-[var(--radius-inner)] text-center"
            aria-label="فتح في مكتبة الآيات والأحاديث"
          >
            {item.kind === 'ayah' ? (
              <p className="font-quran text-[1.45rem] leading-[2.1] text-text-primary dark:text-text-on-dark text-balance">
                {item.text}
              </p>
            ) : (
              <p className="font-ornate text-lg leading-[1.9] text-text-primary dark:text-text-on-dark text-pretty whitespace-pre-line">
                «{item.text}»
              </p>
            )}
            <OrnamentRule className="mt-3 mx-auto w-40" />
            <span className="mt-2 flex items-center justify-center gap-2 text-xs text-text-muted">
              {sourceLine(item)}
              {item.kind === 'hadith' ? <GradeBadge grade={item.grade} /> : null}
            </span>
          </button>
        ) : failed ? (
          <p className="text-sm text-text-muted text-center">تعذّر التحميل الآن.</p>
        ) : (
          <Skeleton lines={3} height={18} />
        )}
      </div>
    </Card>
  );
}
