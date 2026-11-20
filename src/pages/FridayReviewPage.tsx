import { useEffect, useMemo, type ReactNode } from 'react';
import { CalendarCheck2, Flame, Target, Trophy } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { useNow } from '@/components/study/studyUi';
import { BestWeak, DomainList, FridaySunan, PrivacyNote, ReminderCard, ReviewHistory, type CompareItem } from '@/components/friday/ReviewParts';
import { FocusPicker, KeptPrompt, Prompts, Questions } from '@/components/friday/MuhasabaForm';
import { useBadgeMetricsStore } from '@/services/BadgeEngine';
import {
  compareWeek,
  dk,
  inReviewWindow,
  pickBestWeak,
  pickableOf,
  reviewSections,
  reviewStreak,
  reviewWeek,
  shiftWeek,
  trendOf,
  weekLabel,
  weeklyTrend,
  type DomainId,
  type Pickable,
} from '@/services/fridayReview';
import { MUHASABA_VERSE } from '@/services/fridayReviewContent';
import { collectReviewInput, pointsOver, rescheduleFridayReview } from '@/services/fridayReviewLive';
import { useFridayReviewStore } from '@/store/fridayReviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

const ROUTE: Record<DomainId, string> = {
  fard: '/stats/prayers',
  jamaah: '/stats/prayers',
  rawatib: '/stats/prayers',
  duha: '/stats/nawafil',
  adhkar: '/stats/dhikr',
  quran: '/stats/quran',
  qiyam: '/stats/qiyam',
  fasting: '/stats/fasting',
  awrad: '/stats/awrad',
  tasks: '/study',
  sadaqah: '/stats/sadaqah',
};

const pct = (v: number | null) => (v == null ? '—' : `${toArabicDigits(v)}٪`);

/**
 * «محاسبة الجمعة» — /friday-review. The week (Saturday → Friday) against the
 * last, the best and weakest door, honest questions, private notes and one
 * focus for next week; the journal and its streak. Open for completion
 * Thursday evening → Saturday; any other day it shows the week so far.
 * `embedded`: the body alone, inside «عباداتي» (/targets?tab=friday).
 */
export function FridayReviewPage({ embedded = false }: { embedded?: boolean }) {
  const now = useNow(60_000);
  const date = new Date(now);
  const today = dk(date);
  const week = reviewWeek(date);
  const open = inReviewWindow(date);
  const male = useSettingsStore((s) => s.gender) === 'male';
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const reviews = useFridayReviewStore((s) => s.reviews);
  const complete = useFridayReviewStore((s) => s.complete);
  const entry = reviews[week.id];
  const lastFocus = reviews[shiftWeek(week, -1).id]?.focus;

  // Idempotent: arms the weekly reminder even if the boot wiring is missing.
  useEffect(() => {
    void rescheduleFridayReview();
  }, []);

  const data = useMemo(() => {
    const at = new Date();
    const input = collectReviewInput();
    const cmp = compareWeek(input, week, at);
    const win = { from: cmp.days[0], to: cmp.days[cmp.days.length - 1], prevFrom: cmp.prevDays[0], prevTo: cmp.prevDays[cmp.prevDays.length - 1] };
    const sections = reviewSections().flatMap((sec) => {
      try {
        const r = sec.compute(win);
        return r ? [{ sec, r }] : [];
      } catch (e) {
        console.warn('[fridayReview] section failed', sec.id, e);
        return [];
      }
    });
    const picks = [
      ...cmp.rows.map(pickableOf),
      ...sections.map(({ sec, r }): Pickable | null =>
        r.score != null ? { id: sec.id, label: sec.title, score: r.score, prevScore: r.prevScore ?? 0 } : null,
      ),
    ].filter((p): p is Pickable => !!p);
    return {
      cmp,
      sections,
      ...pickBestWeak(picks),
      points: { now: pointsOver(cmp.days), prev: pointsOver(cmp.prevDays) },
      trend: weeklyTrend(input, at),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics republish on every logged deed; the day moves the window
  }, [metrics, week.id, today]);

  const { cmp, sections, best, weak, points } = data;
  const streak = reviewStreak(reviews, date);
  const final = !cmp.partial;

  const tracked = cmp.rows.filter((r) => r.tracked);
  const idle = cmp.rows.filter((r) => !r.tracked);
  const items: CompareItem[] = [
    ...tracked.map((r) => ({
      id: r.id,
      label: r.label,
      value: r.now.text,
      prev: r.prev.text,
      trend: r.trend,
      diff: r.diff,
      phrase: r.phrase,
      to: ROUTE[r.id],
    })),
    ...sections.map(({ sec, r }) => ({
      id: sec.id,
      label: sec.title,
      value: r.summary,
      prev: r.prev,
      trend: r.trend ?? ('same' as const),
      diff: r.diff,
      phrase: r.phrase ?? '',
      to: r.to,
    })),
    {
      id: 'points',
      label: 'نقاط الترتيب',
      value: toArabicDigits(points.now),
      prev: toArabicDigits(points.prev),
      trend: trendOf(points.now, points.prev),
      diff: points.now - points.prev,
      phrase: points.now >= points.prev ? 'مجموع نقاط أيامك' : 'أقل من الأسبوع الماضي',
      to: '/leaderboard',
    },
  ];
  const weakSection = sections.find(({ sec }) => sec.id === weak?.id);

  const finish = () => {
    complete(week.id, { score: cmp.score, points: points.now, best: best?.id, weak: weak?.id });
    toast.success('تقبّل الله منك', 'بارك الله لك في أسبوعك القادم');
  };

  return (
    <div className={embedded ? undefined : 'min-h-dvh bg-cream dark:bg-dark-bg pb-16'} dir="rtl">
      {embedded ? (
        <p className="-mt-2 mb-3 text-xs text-text-muted">الأسبوع {weekLabel(week)}</p>
      ) : (
        <TopAppBar title="محاسبة الجمعة" subtitle={`الأسبوع ${weekLabel(week)}`} showBack />
      )}

      <div
        className={[
          embedded ? '' : 'px-4 pt-4 lg:max-w-5xl lg:mx-auto',
          'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6 lg:items-start',
        ].join(' ')}
      >
        <div className="flex flex-col gap-6">
          {/* Hero: the week's score against the last, the points and the streak. */}
          <Card variant="hero" className="p-5">
            <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
            <div className="relative flex items-center gap-4">
              <Medallion size={88} tone="onAccent" className="text-[19px]">
                {cmp.score == null ? '—' : toArabicDigits(cmp.score)}
                {cmp.score == null ? null : <span className="text-[11px]">٪</span>}
              </Medallion>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-on-accent/75">{final ? 'أسبوعك الذي مضى' : open ? 'أسبوعك حتى اليوم' : 'أسبوعك حتى الآن'}</p>
                <h2 className="mt-0.5 text-xl font-display font-bold leading-snug text-balance">
                  {cmp.score == null ? 'سجّل أعمالك لتراها هنا' : cmp.prevScore == null ? 'بداية محاسبتك' : trendLine(cmp.score, cmp.prevScore)}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-on-accent/80">
                  الأسبوع الماضي {pct(cmp.prevScore)}
                  {cmp.elapsed < 7 ? ` · أول ${toArabicDigits(cmp.elapsed)} أيام منه` : ''}
                </p>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-3 gap-2">
              <HeroStat Icon={Trophy} value={toArabicDigits(points.now)} label={`نقطة · الماضي ${toArabicDigits(points.prev)}`} />
              <HeroStat Icon={Flame} value={toArabicDigits(streak.current)} label="أسابيع محاسبة" />
              <HeroStat Icon={CalendarCheck2} value={entry?.doneAt ? 'تمّت' : open ? 'مفتوحة' : 'الخميس'} label={entry?.doneAt ? 'المحاسبة' : open ? 'حتى آخر السبت' : 'تُفتح مساءً'} />
            </div>
            <p className="relative mt-4 font-quran text-[16px] leading-loose text-on-accent/90 text-balance">
              ﴿{MUHASABA_VERSE.text}﴾ <span className="font-sans text-[11px] text-on-accent/70">[{MUHASABA_VERSE.source}]</span>
            </p>
          </Card>

          {date.getDay() === 5 ? <FridaySunan friday={today} male={male} /> : null}

          {open && lastFocus ? <KeptPrompt week={week.id} focus={lastFocus} /> : null}
          {!open && lastFocus ? (
            <Card variant="gradient-edge" className="p-4 flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center">
                <Target size={20} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted">عزمك لهذا الأسبوع</p>
                <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark text-balance">{lastFocus.text}</p>
              </div>
            </Card>
          ) : null}

          <section className="flex flex-col gap-2.5">
            <SectionTitle title="بين أسبوعين" subtitle={cmp.partial ? 'هذا الأسبوع حتى اليوم، مقابل نفس الأيام من الأسبوع الماضي' : 'هذا الأسبوع مقابل الأسبوع الماضي'} />
            <BestWeak best={best} weak={weak} />
            <DomainList items={items} />
            {idle.length ? (
              <p className="px-1 text-[12px] text-text-muted text-pretty">
                لا تسجيل في آخر أربعة أسابيع: {idle.map((r) => r.label).join('، ')}
              </p>
            ) : null}
          </section>

          {open ? (
            <>
              <Questions week={week.id} />
              <Prompts week={week.id} />
              <FocusPicker
                week={week.id}
                weak={weakSection ? null : ((weak?.id as DomainId | undefined) ?? null)}
                weakLabel={weak?.label}
                extra={weakSection?.r.focus}
                male={male}
              />
              <Card variant={entry?.doneAt ? 'inset' : 'plain'} className="p-4 flex flex-col gap-3">
                {entry?.doneAt ? (
                  <p className="text-[14px] font-semibold text-teal dark:text-teal-light text-pretty">
                    أتممت محاسبة هذا الأسبوع، تقبّل الله منك. ما تعدّله الآن يُحفظ تلقائياً.
                  </p>
                ) : (
                  <>
                    <p className="text-[13px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
                      يُحفظ ما كتبته تلقائياً. حين تفرغ، أتمّ المحاسبة لتدخل سجلّك وسلسلتك.
                    </p>
                    <Button variant="gold" fullWidth onClick={finish}>
                      أتممت محاسبتي
                    </Button>
                  </>
                )}
              </Card>
            </>
          ) : (
            <Card variant="inset" className="p-4">
              <p className="text-[13px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
                تُفتح المحاسبة مساء الخميس وتبقى حتى آخر يوم السبت: أسئلة صادقة، وخواطر لا يراها غيرك، وعزم واحد للأسبوع القادم.
              </p>
            </Card>
          )}
        </div>

        <div className="mt-6 lg:mt-0 flex flex-col gap-6">
          <ReviewHistory trend={data.trend} streak={streak} currentWeek={week.id} />
          <ReminderCard />
          <PrivacyNote />
        </div>
      </div>
    </div>
  );
}

function trendLine(now: number, prev: number): string {
  const t = trendOf(now, prev, 2);
  return t === 'up' ? 'أحسن من الأسبوع الماضي، الحمد لله' : t === 'down' ? 'أقل من الأسبوع الماضي، فاستدرك' : 'على حالك من الأسبوع الماضي';
}

function HeroStat({ Icon, value, label }: { Icon: typeof Trophy; value: string; label: ReactNode }) {
  return (
    <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
      <Icon size={15} className="mx-auto text-gold-light" aria-hidden />
      <p className="mt-1 text-lg font-counter font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-on-accent/75 leading-tight">{label}</p>
    </div>
  );
}

export default FridayReviewPage;
