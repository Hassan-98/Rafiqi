import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { format, subDays } from 'date-fns';
import { surahs } from '@/data/surahs';
import { BookOpen, Check, Flame, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { TextInput } from '@/components/ui/TextInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StatTile } from '@/components/stats/StatTile';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { leftFor } from '@/components/badges/badgeUi';
import { TodayChallenges } from '@/components/badges/TodayChallenges';
import { useBadgeModel } from '@/services/BadgeEngine';
import { computeStreakFromActiveDates } from '@/services/statsService';
import { QURAN_TYPE_IDS, QURAN_TYPES, type QuranType } from '@/data/quranTypes';
import type { BadgeMetric } from '@/data/badges';
import { StatsShortcut } from '@/components/stats/StatsShortcut';
import {
  khatmaState,
  mushafiToday,
  normalizeMushafiCode,
  prettyMushafiCode,
  quranTypeStats,
  useMushafiStore,
  type KhatmaState,
  type MushafiToday,
  type TypeStats,
} from '@/store/mushafiStore';
import { useQuranStore } from '@/store/quranStore';
import { useSettingsStore } from '@/store/settingsStore';
import { openMushafi, pullMushafi } from '@/services/mushafi';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const pagesTxt = (n: number) => (n === 1 ? 'صفحة واحدة' : n === 2 ? 'صفحتان' : n <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`);

function agoTxt(t: number | null): string {
  if (!t) return 'لم تتم بعد';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${ar(min)} د`;
  const h = Math.round(min / 60);
  return h < 24 ? `قبل ${ar(h)} س` : `قبل ${ar(Math.round(h / 24))} يوم`;
}

/**
 * «القرآن» — the Quran is read in «مصحفي» (a separate app); this tab links to
 * it, opens it, and shows what its sync brought back: today's wird and the
 * khatmas. Stats, badges and reminders read the same record.
 */
export function QuranPage() {
  const code = useMushafiStore((s) => s.code);
  return (
    <div className="flex flex-col gap-6 px-4 pb-nav max-w-2xl mx-auto w-full" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">كتاب الله</p>
          <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">القرآن الكريم</h1>
          <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
            تقرأ في مصحفي، ويصل تقدّمك إلى هنا
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <StatsShortcut to="/stats/quran" label="إحصاءات القرآن" />
        </div>
      </header>
      {code ? <Linked code={code} /> : <LinkCard />}
    </div>
  );
}

/**
 * Old reader links (`/quran/read/18`, `?page=`) from targets, the calendar's
 * الكهف, notifications: open مصحفي at that page and land on «القرآن».
 */
export function QuranOpenRedirect() {
  const { surahId } = useParams();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || surahs.find((s) => s.number === Number(surahId))?.pages[0];
  useEffect(() => {
    void openMushafi(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Navigate to="/quran" replace />;
}

function LinkCard() {
  const setCode = useMushafiStore((s) => s.setCode);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const link = () => {
    const c = normalizeMushafiCode(value);
    if (!c) {
      setError('الرمز ١٦ حرفاً ورقماً، مثل ABCD-EFGH-JKLM-NPQR');
      return;
    }
    setCode(c);
    void pullMushafi().then((ok) =>
      ok ? toast.success('رُبط مصحفي', 'صفحاتك وختماتك تصل هنا الآن') : toast.info('حُفظ الرمز', 'تعذّرت المزامنة الآن، وستُعاد تلقائياً'),
    );
  };
  return (
    <>
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-6 w-36 text-gold opacity-20" />
        <div className="relative flex items-center gap-4">
          <Medallion size={64} tone="teal" className="text-teal dark:text-teal-light">
            <BookOpen size={24} />
          </Medallion>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark text-balance">اربط مصحفي</h2>
            <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
              القراءة والختمات والورد في تطبيق مصحفي. اربطه برمز المزامنة فتصل صفحاتك وختماتك إلى الإحصاءات والأوسمة والتذكيرات.
            </p>
          </div>
        </div>
        <ol className="relative mt-4 flex flex-col gap-1.5 text-[12.5px] text-text-secondary dark:text-text-on-dark/80">
          {[
            'افتح مصحفي، ثم «الإعدادات»',
            'في «المزامنة بين أجهزتك» اضغط «إنشاء رمز جديد»، أو «نسخ» إن كان لك رمز',
            'ألصق الرمز هنا',
          ].map((t, i) => (
            <li key={t} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-teal/12 text-teal dark:text-teal-light text-[11px] font-counter inline-flex items-center justify-center shrink-0 mt-px">
                {ar(i + 1)}
              </span>
              <span className="text-pretty">{t}</span>
            </li>
          ))}
        </ol>
        <form
          className="relative mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            link();
          }}
        >
          <TextInput
            value={value}
            onValueChange={(v) => {
              setValue(v);
              setError(null);
            }}
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-EFGH-JKLM-NPQR"
            aria-label="رمز المزامنة من مصحفي"
            aria-invalid={!!error}
            className="w-full rounded-[var(--radius-inner)] bg-white dark:bg-dark-surface ring-1 ring-black/[0.08] dark:ring-white/[0.1] focus:ring-2 focus:ring-teal/50 px-3.5 py-3 text-center font-counter tracking-[0.12em] text-[15px] text-text-primary dark:text-text-on-dark outline-none"
          />
          {error ? <p className="text-[12px] text-danger text-center">{error}</p> : null}
          <Button type="submit" fullWidth leftIcon={<Link2 size={17} />}>
            ربط
          </Button>
        </form>
      </Card>
      <Button variant="secondary" fullWidth leftIcon={<BookOpen size={17} />} onClick={() => void openMushafi()}>
        افتح مصحفي
      </Button>
    </>
  );
}

function Linked({ code }: { code: string }) {
  const days = useMushafiStore((s) => s.days);
  const khatmas = useMushafiStore((s) => s.khatmas);
  const marks = useMushafiStore((s) => s.marks);
  const tops = useMushafiStore((s) => s.tops);
  const setCode = useMushafiStore((s) => s.setCode);
  const fallback = useSettingsStore((s) => s.quranDailyTarget);
  const legacyWird = useQuranStore((s) => s.wird);
  const [unlink, setUnlink] = useState(false);
  const [typeOpen, setTypeOpen] = useState<QuranType | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const t = useMemo(
    () => mushafiToday(days, khatmas, marks, today, legacyWird?.unit === 'page' ? legacyWird.amount : fallback),
    [days, khatmas, marks, today, fallback, legacyWird],
  );
  const types = useMemo(() => quranTypeStats(days, khatmas, marks, today, tops), [days, khatmas, marks, today, tops]);
  const all = useMemo(
    () =>
      khatmas
        .map((k) => khatmaState(k, marks, today))
        .sort((a, b) => Number(b.live) - Number(a.live) || b.owe - a.owe),
    [khatmas, marks, today],
  );
  const week = useMemo(() => {
    const keys = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    const byType = Object.fromEntries(
      QURAN_TYPE_IDS.map((ty) => [ty, keys.reduce((n, k) => n + (types[ty].days[k] ?? 0), 0)]),
    ) as Record<QuranType, number>;
    return { pages: keys.reduce((n, k) => n + (days[k]?.length ?? 0), 0), byType };
  }, [days, types]);
  const streaks = useMemo(() => {
    const of = (keys: string[]) => computeStreakFromActiveDates(keys).current;
    return {
      any: of(Object.keys(days).filter((k) => days[k].length > 0)),
      byType: Object.fromEntries(QURAN_TYPE_IDS.map((ty) => [ty, of(Object.keys(types[ty].days))])) as Record<QuranType, number>,
    };
  }, [days, types]);

  return (
    <>
      <TodayWird t={t} weekPages={week.pages} />
      <StreakStrip any={streaks.any} byType={streaks.byType} types={types} />
      <TodayChallenges only={['quran_wird_days', 'day_quran_share']} />

      <section className="flex flex-col gap-3">
        <SectionTitle title="نصيبك من القرآن" subtitle="لكل نوع من الختمات فضله وسرعته، فاجعل لك من كلٍّ نصيباً" />
        <div className="grid grid-cols-2 gap-3">
          {QURAN_TYPE_IDS.map((ty) => (
            <TypeCard key={ty} stats={types[ty]} week={week.byType[ty]} onOpen={() => setTypeOpen(ty)} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="ختماتك" subtitle="من مصحفي: الورد يتوزّع على أيام الختمة، وما فاتك يُضاف إلى يومك" />
        {all.length === 0 ? (
          <Card className="p-4">
            <p className="text-[13px] text-text-secondary dark:text-text-on-dark/75 text-pretty">
              لا ختمات بعد. أنشئ ختمة في مصحفي واختر نوعها وأيامها، فيظهر وردها اليومي هنا.
            </p>
          </Card>
        ) : (
          all.map((s) => <KhatmaRow key={s.id} s={s} />)
        )}
      </section>

      <BadgeCategoryStrip categories={['quran']} />

      <div className="flex items-center justify-between gap-2 text-[11.5px] text-text-muted">
        <span dir="ltr" className="font-counter tracking-wider">
          {prettyMushafiCode(code).slice(0, 4)}-••••-••••-••••
        </span>
        <button
          type="button"
          onClick={() => setUnlink(true)}
          className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg hover:text-danger hover:bg-danger/10"
        >
          <Unlink size={13} aria-hidden /> فكّ الربط
        </button>
      </div>

      <TypeSheet
        type={typeOpen}
        stats={typeOpen ? types[typeOpen] : null}
        week={typeOpen ? week.byType[typeOpen] : 0}
        streak={typeOpen ? streaks.byType[typeOpen] : 0}
        onClose={() => setTypeOpen(null)}
      />
      <ConfirmDialog
        open={unlink}
        title="فكّ ربط مصحفي؟"
        message="يتوقّف وصول قراءتك الجديدة إلى هنا. يبقى ما وصل من إحصاءاتك، وتبقى قراءتك كلها في مصحفي."
        confirmLabel="فكّ الربط"
        confirmVariant="danger"
        onConfirm={() => {
          setCode(null);
          setUnlink(false);
        }}
        onCancel={() => setUnlink(false)}
      />
    </>
  );
}

const khatmasTxt = (n: number) => (n === 1 ? 'ختمة واحدة' : n === 2 ? 'ختمتين' : n <= 10 ? `${ar(n)} ختمات` : `${ar(n)} ختمة`);
const daysTxt = (n: number) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${ar(n)} أيام` : `${ar(n)} يوماً`);

function TypeIcon({ type, size = 32 }: { type: QuranType; size?: number }) {
  const { Icon } = QURAN_TYPES[type];
  return (
    <span
      className="rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Today's wird: the total, and what each running khatma still owes — never one khatma's name over the sum. */
function TodayWird({ t, weekPages }: { t: MushafiToday; weekPages: number }) {
  const syncedAt = useMushafiStore((s) => s.syncedAt);
  const status = useMushafiStore((s) => s.status);
  const done = t.owe === 0;
  const pct = Math.round((t.achieved / t.goal) * 100);
  const lead = t.live.find((s) => s.owe > 0) ?? t.live[0];
  return (
    <Card variant="gradient-edge" className="p-5">
      <ArchMotif className="absolute -top-6 -end-6 w-36 text-gold opacity-20" />
      <div className="relative flex items-center gap-4">
        <Medallion
          size={68}
          tone={done ? 'gold' : 'teal'}
          className={done ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'}
        >
          {done ? (
            <Check size={26} strokeWidth={2.5} />
          ) : (
            <span className="text-[15px] font-counter tabular-nums">
              {ar(t.achieved)}
              <span className="text-[11px] opacity-70">/{ar(t.goal)}</span>
            </span>
          )}
        </Medallion>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-text-muted">
            {t.live.length > 1 ? `وِرد اليوم من ${khatmasTxt(t.live.length)}` : t.live.length === 1 ? 'وِرد اليوم' : 'صفحات يومك'}
          </p>
          <h2 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark text-balance">
            {done ? 'أتممت وِرد اليوم' : `بقي ${pagesTxt(t.owe)}`}
          </h2>
          <p className="text-[12px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
            {t.late > 0 && !done
              ? `منها ${pagesTxt(t.late)} فاتتك`
              : `قرأت اليوم ${pagesTxt(t.pages)}، وفي سبعة أيام ${pagesTxt(weekPages)}`}
          </p>
        </div>
      </div>

      {t.live.length > 0 ? (
        <ul className="relative mt-4 flex flex-col gap-1.5">
          {t.live.map((s) => {
            const part = Math.max(0, Math.min(1, (s.share - Math.min(s.owe, s.share)) / s.share));
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void openMushafi(s.next)}
                  className="w-full flex items-center gap-3 rounded-[var(--radius-inner)] bg-white/75 dark:bg-dark-bg/45 px-3 py-2.5 text-start"
                >
                  <TypeIcon type={s.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{s.name}</span>
                    <span className="block text-[11px] text-text-muted">
                      {QURAN_TYPES[s.type].label}
                      {s.owe > 0 ? `، من ص ${ar(s.next)} إلى ${ar(s.end)}` : ''}
                    </span>
                    <span className="mt-1 block h-1 rounded-full bg-teal/10 overflow-hidden" aria-hidden>
                      <span
                        className={`block h-full rounded-full ${s.owe === 0 ? 'bg-[image:var(--gradient-gold)]' : 'bg-[image:var(--gradient-teal)]'}`}
                        style={{ width: `${Math.round(part * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span
                    className={[
                      'shrink-0 text-[12px] font-bold font-counter tabular-nums',
                      s.owe === 0 ? 'text-gold-dark dark:text-gold-light inline-flex items-center gap-1' : 'text-teal dark:text-teal-light',
                    ].join(' ')}
                  >
                    {s.owe === 0 ? (
                      <>
                        <Check size={13} strokeWidth={3} aria-hidden /> تمّ
                      </>
                    ) : (
                      `بقي ${ar(s.owe)} ص`
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div
        className="relative mt-4 h-2 rounded-full bg-teal/10 overflow-hidden"
        role="progressbar"
        aria-label="وِرد اليوم"
        aria-valuemin={0}
        aria-valuemax={t.goal}
        aria-valuenow={t.achieved}
      >
        <span
          className={`absolute inset-y-0 start-0 rounded-full ${done ? 'bg-[image:var(--gradient-gold)]' : 'bg-[image:var(--gradient-teal)]'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <Button className="relative mt-4" fullWidth leftIcon={<BookOpen size={18} />} onClick={() => void openMushafi(done ? undefined : lead?.next)}>
        {lead && !done ? `اقرأ وردك من ص ${ar(lead.next)}` : 'افتح مصحفي'}
      </Button>
      <div className="relative mt-3 flex items-center justify-between gap-2 text-[11.5px] text-text-muted">
        <span>{status === 'fail' ? 'تعذّرت المزامنة، تحقّق من الاتصال' : `آخر مزامنة ${agoTxt(syncedAt)}`}</span>
        <button
          type="button"
          onClick={() => void pullMushafi()}
          disabled={status === 'syncing'}
          className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-teal dark:text-teal-light hover:bg-teal/10 disabled:opacity-60"
        >
          <RefreshCw size={13} className={status === 'syncing' ? 'animate-spin' : ''} aria-hidden /> حدّث الآن
        </button>
      </div>
    </Card>
  );
}

/** «سلسلتك»: any reading, then each type you keep (or have open). */
function StreakStrip({ any, byType, types }: { any: number; byType: Record<QuranType, number>; types: Record<QuranType, TypeStats> }) {
  const shown = QURAN_TYPE_IDS.filter((ty) => byType[ty] > 0 || types[ty].running.length > 0);
  if (!any && !shown.length) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="سلاسلك مع القرآن">
      <span className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full bg-gold/15 text-gold-dark dark:text-gold-light text-[12.5px] font-bold">
        <Flame size={14} aria-hidden /> مع القرآن {any ? daysTxt(any) : 'ابدأ اليوم'}
      </span>
      {shown.map((ty) => (
        <span
          key={ty}
          className={[
            'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-[12px] font-semibold ring-1',
            byType[ty] > 0
              ? 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light ring-teal/20'
              : 'text-text-muted ring-black/[0.08] dark:ring-white/[0.1]',
          ].join(' ')}
        >
          {(() => {
            const { Icon } = QURAN_TYPES[ty];
            return <Icon size={13} aria-hidden />;
          })()}
          {QURAN_TYPES[ty].label}{byType[ty] > 0 ? ` ${daysTxt(byType[ty])}` : '، عُد إليه اليوم'}
        </span>
      ))}
    </div>
  );
}

/** One kind of khatma: where you stand in it — or an invitation to have a share. */
function TypeCard({ stats, week, onOpen }: { stats: TypeStats; week: number; onOpen: () => void }) {
  const meta = QURAN_TYPES[stats.type];
  const run = stats.running[0];
  const none = !run && stats.finished === 0;
  const pct = run ? Math.floor((run.done / run.total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        'text-start rounded-[var(--radius-card)] p-3.5 flex flex-col gap-2 min-h-[148px]',
        none
          ? 'border border-dashed border-teal/30 bg-transparent'
          : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)]',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <TypeIcon type={stats.type} size={34} />
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold text-text-primary dark:text-text-on-dark">{meta.label}</span>
          <span className="block text-[11px] text-text-muted truncate">{meta.sub}</span>
        </span>
      </span>
      {run ? (
        <>
          <span className="text-[12px] text-text-secondary dark:text-text-on-dark/80 truncate">
            {stats.running.length > 1 ? `${khatmasTxt(stats.running.length)} جارية` : `«${run.name}»`}
          </span>
          <span className="h-1.5 rounded-full bg-teal/10 overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${pct}%` }} />
          </span>
          <span className="flex items-baseline justify-between gap-1 text-[11px] text-text-muted">
            <span className="font-counter tabular-nums">{ar(pct)}٪</span>
            <span>{week > 0 ? `هذا الأسبوع ${ar(week)} ص` : 'لم تتقدّم هذا الأسبوع'}</span>
          </span>
        </>
      ) : stats.finished > 0 ? (
        <>
          <span className="text-[12px] font-semibold text-gold-dark dark:text-gold-light">
            ختمت {khatmasTxt(stats.finished)}
          </span>
          <span className="text-[11px] text-text-muted text-pretty">ابدأ ختمة جديدة ليبقى لك منها نصيب</span>
        </>
      ) : (
        <>
          <span className="text-[11.5px] text-text-secondary dark:text-text-on-dark/80 text-pretty">{meta.benefit}</span>
          <span className="mt-auto text-[11.5px] font-bold text-teal dark:text-teal-light">اجعل لك منه نصيباً ›</span>
        </>
      )}
    </button>
  );
}

const TYPE_METRICS: Record<QuranType, BadgeMetric[]> = {
  tilawa: ['quran_pages', 'quran_khatmat', 'quran_streak'],
  listen: ['listen_pages', 'listen_streak', 'listen_khatmat'],
  tafsir: ['tafsir_pages', 'tafsir_streak', 'tafsir_khatmat'],
  hifz: ['review_pages', 'review_streak', 'review_khatmat'],
};

/** A type up close: its virtue, its pace, your numbers in it, its khatmas and the badge nearest to you. */
function TypeSheet({
  type,
  stats,
  week,
  streak,
  onClose,
}: {
  type: QuranType | null;
  stats: TypeStats | null;
  week: number;
  streak: number;
  onClose: () => void;
}) {
  const model = useBadgeModel();
  const meta = type ? QURAN_TYPES[type] : null;
  const next =
    type && model
      ? model.tracks
          .filter((tr) => TYPE_METRICS[type].includes(tr.metric) && tr.next)
          .map((tr) => tr.next!)
          .sort((a, b) => b.pct - a.pct)[0]
      : undefined;
  return (
    <BottomSheet open={!!type} onClose={onClose} title={meta ? `${meta.label} ${meta.sub}` : ''}>
      {meta && stats ? (
        <div className="flex flex-col gap-4 pb-2">
          <figure className="rounded-[var(--radius-inner)] bg-cream-dark/45 dark:bg-dark-surface px-4 py-3">
            <blockquote className="text-[15px] leading-loose text-text-primary dark:text-text-on-dark text-pretty">{meta.quote}</blockquote>
            <figcaption className="text-[11px] text-text-muted mt-1">{meta.source}</figcaption>
          </figure>
          <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            {meta.benefit}. {meta.pace}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatTile value={ar(stats.pages)} label="صفحة في ختماته" />
            <StatTile value={ar(week)} label="صفحة هذا الأسبوع" />
            <StatTile value={ar(stats.finished)} label="ختمات أتممتها" accent="gold" />
            <StatTile value={streak ? daysTxt(streak) : '—'} label="سلسلته الآن" accent="gold" />
          </div>
          {stats.running.length ? (
            <div className="flex flex-col gap-2">
              {stats.running.map((s) => (
                <KhatmaRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
              ابدأ ختمة {meta.label} في مصحفي: «الختمات» ثم «ختمة جديدة»، واختر النوع «{meta.label}» والمدة التي تناسبك.
            </p>
          )}
          {next ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-inner)] ring-1 ring-black/[0.05] dark:ring-white/[0.08] px-3 py-2.5">
              <BadgeEmblem icon={next.badge.icon} rarity={next.badge.rarity} unlocked={false} pct={next.pct} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">«{next.badge.titleAr}»</span>
                <span className="block text-[11px] text-text-muted">{leftFor(next)}</span>
              </span>
            </div>
          ) : null}
          <Button fullWidth leftIcon={<BookOpen size={17} />} onClick={() => void openMushafi(stats.running[0]?.next)}>
            {stats.running[0] ? `تابع «${stats.running[0].name}»` : 'افتح مصحفي'}
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function KhatmaRow({ s }: { s: KhatmaState }) {
  const pct = Math.floor((s.done / s.total) * 100);
  const over = s.live && s.day >= s.days;
  const line = !s.live
    ? 'ختمتها، تقبّل الله منك'
    : over
      ? `انتهت المدة، وبقي ${pagesTxt(s.total - s.done)}`
      : s.owe > 0
        ? `ورد اليوم: بقي ${pagesTxt(s.owe)}${s.late ? `، منها ${ar(s.late)} فاتتك` : ''}`
        : 'أتممت ورد اليوم';
  return (
    <button
      type="button"
      onClick={() => void openMushafi(s.live ? s.next : undefined)}
      className="text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] p-3.5 flex flex-col gap-2"
    >
      <span className="flex items-center gap-2.5">
        <TypeIcon type={s.type} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{s.name}</span>
          <span className="block text-[11px] text-text-muted">{QURAN_TYPES[s.type].label}</span>
        </span>
        <span className="shrink-0 text-[12px] font-counter tabular-nums text-teal dark:text-teal-light">{ar(pct)}٪</span>
      </span>
      <span className="h-1.5 rounded-full bg-teal/10 overflow-hidden" aria-hidden>
        <span className="block h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${pct}%` }} />
      </span>
      <span className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className={s.live && s.owe > 0 && !over ? 'text-text-secondary dark:text-text-on-dark/80' : 'text-text-muted'}>{line}</span>
        <span className="shrink-0 font-counter tabular-nums text-text-muted">
          {ar(s.done)} من {ar(s.total)} ص
        </span>
      </span>
    </button>
  );
}
