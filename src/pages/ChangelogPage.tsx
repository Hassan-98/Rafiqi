import { Sparkles } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { BUNDLE_VERSION } from '@/services/appUpdate';
import { toArabicDigits } from '@/utils/arabicFormat';
import changelog from '@/data/changelog.json';

const dateAr = (k: string) =>
  toArabicDigits(new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${k}T12:00:00`)));

/**
 * «سجل التحديثات» — every release's notes, newest first. scripts/pack-update.mjs
 * prepends the entry (from --notes, one line per «؛») before it builds, so each
 * bundle carries its own; src/data/changelog.json is the source.
 */
export function ChangelogPage() {
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar title="سجل التحديثات" subtitle={`نسختك ${toArabicDigits(BUNDLE_VERSION)}`} showBack />
      <ol className="flex flex-col gap-3 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        {changelog.map((e) => {
          const current = e.version === BUNDLE_VERSION;
          return (
            <li key={e.version}>
              <Card variant={current ? 'gold-rim' : 'plain'} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-counter text-[15px] font-bold text-text-primary dark:text-text-on-dark" dir="ltr">
                    {toArabicDigits(e.version)}
                  </span>
                  {current ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 ring-1 ring-gold/35 px-2 min-h-6 text-[11px] font-bold text-gold-dark dark:text-gold-light">
                      <Sparkles size={11} aria-hidden /> نسختك الحالية
                    </span>
                  ) : null}
                  <span className="ms-auto text-[11.5px] text-text-muted">{dateAr(e.date)}</span>
                </div>
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {e.notes.map((n) => (
                    <li key={n} className="flex gap-2 text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/85 text-pretty">
                      <span className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-teal/60 dark:bg-teal-light/60 shrink-0" aria-hidden />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
