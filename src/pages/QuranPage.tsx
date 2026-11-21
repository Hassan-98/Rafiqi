import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { format, startOfWeek, subDays } from 'date-fns';
import { surahs } from '@/data/surahs';
import { BookOpen, CalendarDays, Check, ChevronLeft, Flame, Headphones, Link2, RefreshCw, Repeat, Sprout, Unlink, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { TextInput } from '@/components/ui/TextInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StatTile } from '@/components/stats/StatTile';
import { BarChart } from '@/components/stats/BarChart';
import { BadgeCategoryStrip } from '@/components/badges/BadgeCategoryStrip';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { leftFor } from '@/components/badges/badgeUi';
import { TodayChallenges } from '@/components/badges/TodayChallenges';
import { useBadgeModel } from '@/services/BadgeEngine';
import { computeStreakFromActiveDates, WEEKDAY_SHORT_AR } from '@/services/statsService';
import { QURAN_TYPE_IDS, QURAN_TYPES, type QuranType } from '@/data/quranTypes';
import type { BadgeMetric } from '@/data/badges';
import { StatsShortcut } from '@/components/stats/StatsShortcut';
import { GroupsHomeCard } from '@/components/groups/GroupsHomeCard';
import {
  khatmaState,
  mushafiToday,
  normalizeMushafiCode,
  prettyMushafiCode,
  quranTypeStats,
  sessionCredit,
  sessionStats,
  useMushafiStore,
  type KhatmaState,
  type MushafiToday,
  type SessionItem,
  type SessionType,
  type TypeStats,
} from '@/store/mushafiStore';
import { useQuranStore } from '@/store/quranStore';
import { useSettingsStore } from '@/store/settingsStore';
import { openMushafi, pullMushafi } from '@/services/mushafi';
import { hifzModel, rangeTxt, type HifzModel } from '@/services/hifzModel';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const pagesTxt = (n: number) => (n === 1 ? 'صفحة واحدة' : n === 2 ? 'صفحتان' : n <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`);
const khatmasTxt = (n: number) => (n === 1 ? 'ختمة واحدة' : n === 2 ? 'ختمتين' : n <= 10 ? `${ar(n)} ختمات` : `${ar(n)} ختمة`);
const runningTxt = (n: number) => (n === 1 ? 'ختمة جارية' : n === 2 ? 'ختمتان جاريتان' : n <= 10 ? `${ar(n)} ختمات جارية` : `${ar(n)} ختمة جارية`);
// Never «·» beside a digit: it reads as the Arabic zero «٠» (owner) — «،» there.
const daysTxt = (n: number) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${ar(n)} أيام` : `${ar(n)} يوماً`);
/** Pages by ayat can be a fraction: one decimal under ten. */
const num = (n: number) => (n >= 10 || Number.isInteger(n) ? ar(Math.round(n)) : ar(Math.round(n * 10) / 10).replace('.', '٫'));
const minutesTxt = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${ar(h)} س${r ? ` ${ar(r)} د` : ''}` : `${ar(r)} د`;
};
const dk = (d: Date | number) => format(d, 'yyyy-MM-dd');

function agoTxt(t: number | null): string {
  if (!t) return 'لم تتم بعد';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${ar(min)} د`;
  const h = Math.round(min / 60);
  return h < 24 ? `قبل ${ar(h)} س` : `قبل ${ar(Math.round(h / 24))} يوم`;
}

/**
 * «القرآن» — the Quran is read in «مصحفي» (a separate app); this tab links to it,
 * opens it, and shows what its sync brought back. Redesigned 2026-11-20 (owner: «عشوائية»,
 * the hifz and sessions boxes stranded at the bottom): one night hero for today's wird,
 * then the khatmas (each one's portion), the hifz map, the week by type and the latest
 * sessions. «خطة اليوم» was dropped the next day (owner: the log is enough). Stats, badges and reminders read the same record.
 */
export function QuranPage() {
  const code = useMushafiStore((s) => s.code);
  return (
    <div className="flex flex-col gap-6 px-4 pb-nav max-w-2xl mx-auto w-full" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">كتاب الله</p>
          <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">القرآن الكريم</h1>
          <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">تقرأ في مصحفي، ويصل تقدّمك إلى هنا</p>
        </div>
        <div className="shrink-0 pt-1">
          <StatsShortcut to="/stats/quran" label="إحصاءات القرآن" />
        </div>
      </header>
      {code ? (
        <Linked code={code} />
      ) : (
        <>
          <LinkCard />
          <GroupsHomeCard khatma />
        </>
      )}
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
          {['افتح مصحفي، ثم «الإعدادات»', 'في «المزامنة بين أجهزتك» اضغط «إنشاء رمز جديد»، أو «نسخ» إن كان لك رمز', 'ألصق الرمز هنا'].map((t, i) => (
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
  const sessions = useMushafiStore((s) => s.sessions);
  const setCode = useMushafiStore((s) => s.setCode);
  const fallback = useSettingsStore((s) => s.quranDailyTarget);
  const cycle = useSettingsStore((s) => s.hifzCycle);
  const legacyWird = useQuranStore((s) => s.wird);
  const [unlink, setUnlink] = useState(false);
  const [typeOpen, setTypeOpen] = useState<QuranType | null>(null);

  const now = Date.now();
  const today = dk(now);
  const t = useMemo(
    () => mushafiToday(days, khatmas, marks, today, legacyWird?.unit === 'page' ? legacyWird.amount : fallback),
    [days, khatmas, marks, today, fallback, legacyWird],
  );
  const types = useMemo(() => quranTypeStats(days, khatmas, marks, today, tops), [days, khatmas, marks, today, tops]);
  const ses = useMemo(() => sessionStats(sessions), [sessions]);
  const m = hifzModel(sessions, now, cycle); // cached per minute inside
  // Sessions' pages per day in the type they belong to (reading → تلاوة, hifz/review → مراجعة) — beyond the khatmas'.
  const sesDays = useMemo(() => {
    const out = Object.fromEntries(QURAN_TYPE_IDS.map((ty) => [ty, {}])) as Record<QuranType, Record<string, number>>;
    for (const x of ses.items) {
      const c = sessionCredit(x, types);
      for (const [ty, n] of [['tilawa', c.tilawa], ['listen', c.listen], ['hifz', c.review + c.hifz]] as const)
        if (n > 0) out[ty][x.day] = (out[ty][x.day] ?? 0) + n;
    }
    return out;
  }, [ses, types]);
  /** The last seven days, oldest first: pages counted per type — the same pages the points count. */
  const week = useMemo(() => {
    const keys = Array.from({ length: 7 }, (_, i) => dk(subDays(new Date(), 6 - i)));
    const of = (ty: QuranType, k: string) => (types[ty].days[k] ?? 0) + (sesDays[ty][k] ?? 0);
    return {
      keys,
      perDay: keys.map((k) => QURAN_TYPE_IDS.reduce((n, ty) => n + of(ty, k), 0)),
      byType: Object.fromEntries(QURAN_TYPE_IDS.map((ty) => [ty, keys.reduce((n, k) => n + of(ty, k), 0)])) as Record<QuranType, number>,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today re-keys the week at midnight
  }, [types, sesDays, today]);
  const streaks = useMemo(() => {
    const of = (keys: string[]) => computeStreakFromActiveDates(keys).current;
    return {
      any: of([...Object.keys(days).filter((k) => days[k].length > 0), ...ses.byDay.keys()]),
      byType: Object.fromEntries(
        QURAN_TYPE_IDS.map((ty) => [ty, of([...Object.keys(types[ty].days), ...Object.keys(sesDays[ty])])]),
      ) as Record<QuranType, number>,
    };
  }, [days, types, ses, sesDays]);
  const all = useMemo(() => khatmas.filter((k) => !k.del).map((k) => khatmaState(k, marks, today)), [khatmas, marks, today]);
  const running = all.filter((s) => s.live).sort((a, b) => b.owe - a.owe);
  const finished = all.filter((s) => !s.live).sort((a, b) => (b.finished ?? '').localeCompare(a.finished ?? ''));

  return (
    <>
      <Hero t={t} today={week.perDay[6]} weekPages={week.perDay.reduce((a, b) => a + b, 0)} streak={streaks.any} />
      <Khatmas running={running} finished={finished} />
      <HifzPanel m={m} now={now} />
      <WeekSection keys={week.keys} perDay={week.perDay} byType={week.byType} streaks={streaks.byType} types={types} onType={setTypeOpen} />
      <RecentSessions items={ses.items} now={now} />
      <GroupsHomeCard khatma />
      <TodayChallenges only={['quran_wird_days', 'day_quran_share']} />
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

// ── shared bits ──────────────────────────────────────────────────────────────

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

/** A section title's «more» link. */
function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 min-h-9 px-1 text-xs font-semibold text-teal dark:text-teal-light">
      {children} <ChevronLeft size={14} aria-hidden />
    </Link>
  );
}

// ── the hero ─────────────────────────────────────────────────────────────────

/** Today's wird on a ring: what all the running khatmas owe today, together — each one's share is in «ختماتك». */
function Hero({ t, today, weekPages, streak }: { t: MushafiToday; today: number; weekPages: number; streak: number }) {
  const syncedAt = useMushafiStore((s) => s.syncedAt);
  const status = useMushafiStore((s) => s.status);
  const done = t.owe === 0;
  const lead = t.live.find((s) => s.owe > 0) ?? t.live[0];
  const frac = t.goal > 0 ? Math.min(1, t.achieved / t.goal) : 0;
  return (
    <Card variant="night" className="p-4 pb-5 overflow-hidden">
      <ArchMotif className="absolute -top-4 -start-6 w-32 h-40 text-gold opacity-[0.13]" />
      <ArchMotif className="absolute -top-4 -end-6 w-32 h-40 text-gold opacity-[0.13] -scale-x-100" />
      <p className="relative font-quran text-[17px] leading-loose text-gold-light text-center">﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾</p>

      <div className="relative mt-2" role="progressbar" aria-label="وِرد اليوم" aria-valuemin={0} aria-valuemax={t.goal} aria-valuenow={t.achieved}>
        <Ring frac={frac}>
          {done ? (
            <>
              <Check size={34} strokeWidth={2.5} className="text-gold-light" aria-hidden />
              <span className="mt-1 text-[13px] font-bold text-text-on-dark">أتممت وردك</span>
            </>
          ) : (
            <>
              <span className="text-[11.5px] text-gold-light/90">{t.live.length > 1 ? `وِرد ${khatmasTxt(t.live.length)}` : t.live.length ? 'وِرد اليوم' : 'صفحات يومك'}</span>
              <span className="font-counter text-[40px] font-bold leading-[1.1] text-text-on-dark tabular-nums">
                {ar(t.achieved)}
                <span className="text-[18px] text-text-on-dark/55">/{ar(t.goal)}</span>
              </span>
              <span className="text-[11.5px] text-text-on-dark/70">صفحة</span>
            </>
          )}
        </Ring>
      </div>

      <p
        className={[
          'relative mt-3 mx-auto w-fit max-w-full flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-pretty',
          // text-text-primary = the light ink in every mode: dark on the gold fill
          done ? 'bg-[image:var(--gradient-gold)] text-text-primary shadow-[var(--shadow-glow-gold)]' : 'bg-white/[0.07] ring-1 ring-white/10 text-text-on-dark',
        ].join(' ')}
      >
        {done ? (
          <>
            <Check size={15} className="shrink-0" aria-hidden /> أتممت وِرد اليوم، تقبّل الله منك
          </>
        ) : (
          <>
            <BookOpen size={15} className="shrink-0 text-gold-light" aria-hidden />
            بقي {pagesTxt(t.owe)}
            {t.late > 0 ? <span className="text-gold-light">، منها {ar(t.late)} فاتتك</span> : null}
          </>
        )}
      </p>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <HeroStat Icon={Flame} value={ar(streak)} label={streak === 1 ? 'يوم مع القرآن' : 'أيام متتالية'} />
        <HeroStat Icon={BookOpen} value={num(today)} label="صفحة اليوم" />
        <HeroStat Icon={CalendarDays} value={num(weekPages)} label="في سبعة أيام" />
      </div>

      <Button variant="gold" className="relative mt-4" fullWidth leftIcon={<BookOpen size={18} />} onClick={() => void openMushafi(done ? undefined : lead?.next)}>
        {lead && !done ? `تابع وردك من ص ${ar(lead.next)}` : 'افتح مصحفي'}
      </Button>
      <div className="relative mt-2.5 flex items-center justify-between gap-2 text-[11.5px] text-text-on-dark/60">
        <span>{status === 'fail' ? 'تعذّرت المزامنة، تحقّق من الاتصال' : `آخر مزامنة ${agoTxt(syncedAt)}`}</span>
        <button
          type="button"
          onClick={() => void pullMushafi()}
          disabled={status === 'syncing'}
          className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-gold-light hover:bg-white/[0.08] disabled:opacity-60"
        >
          <RefreshCw size={13} className={status === 'syncing' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden /> حدّث الآن
        </button>
      </div>
    </Card>
  );
}

function Ring({ frac, children }: { frac: number; children: ReactNode }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-[156px]">
      <svg viewBox="0 0 156 156" className="size-full -rotate-90" aria-hidden>
        <circle cx="78" cy="78" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-white/[0.09]" />
        <circle
          cx="78"
          cy="78"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="text-gold-light transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function HeroStat({ Icon, value, label }: { Icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08] px-2 py-2.5 text-center">
      <Icon size={14} className="mx-auto text-gold-light" aria-hidden />
      <p className="mt-1 text-[17px] font-counter font-bold tabular-nums leading-tight text-text-on-dark">{value}</p>
      <p className="text-[10.5px] text-text-on-dark/70 leading-tight truncate">{label}</p>
    </div>
  );
}

// ── «ختماتك» ─────────────────────────────────────────────────────────────────

function Khatmas({ running, finished }: { running: KhatmaState[]; finished: KhatmaState[] }) {
  const [showDone, setShowDone] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="ختماتك"
        subtitle={running.length ? 'العلامة الذهبية حيث يبلغ وِرد اليوم' : 'من مصحفي: كل ختمة يتوزّع وردها على أيامها'}
        action={
          running.length ? <span className="text-[12px] font-bold text-text-muted">{runningTxt(running.length)}</span> : undefined
        }
      />
      {running.length ? (
        running.map((s) => <KhatmaCard key={s.id} s={s} />)
      ) : (
        <Card className="p-4">
          <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
            لا ختمة جارية. أنشئ ختمة في مصحفي واختر نوعها وأيامها، فيظهر وردها اليومي هنا.
          </p>
        </Card>
      )}
      {finished.length ? (
        <Card className="p-1.5">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="w-full min-h-11 flex items-center justify-between gap-2 rounded-[var(--radius-inner)] px-2.5 text-[13px] font-bold text-text-primary dark:text-text-on-dark hover:bg-teal/5"
          >
            <span className="inline-flex items-center gap-2">
              <Check size={15} className="text-gold-dark dark:text-gold-light" aria-hidden />
              ختمات أتممتها
              <span className="font-counter tabular-nums text-text-muted">({ar(finished.length)})</span>
            </span>
            <ChevronLeft size={16} className={['text-text-muted transition-transform duration-200', showDone ? '-rotate-90' : ''].join(' ')} aria-hidden />
          </button>
          {showDone ? (
            <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {finished.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-2.5 py-2.5">
                  <TypeIcon type={s.type} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{s.name}</span>
                    <span className="block text-[11.5px] text-text-muted">
                      {QURAN_TYPES[s.type].label}
                      {s.finished
                        ? ` · ختمتها ${new Date(`${s.finished}T12:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

/** A running khatma: its share of the Mushaf, where today's wird reaches (the gold mark), and what today still owes. */
function KhatmaCard({ s }: { s: KhatmaState }) {
  const pct = Math.floor((s.done / s.total) * 100);
  const over = s.day >= s.days;
  // done counts from the khatma's own start page (top − done = the pages before it).
  const target = Math.max(0, Math.min(1, (s.end - (s.top - s.done)) / s.total));
  const left = s.days - s.day - 1;
  const status = over
    ? `انتهت مدتها، وبقي ${pagesTxt(s.total - s.done)}`
    : s.owe > 0
      ? `وِرد اليوم: بقي ${pagesTxt(s.owe)}${s.late ? `، منها ${ar(s.late)} فاتتك` : ''}`
      : 'أتممت وِرد اليوم';
  return (
    <button
      type="button"
      onClick={() => void openMushafi(s.next)}
      className="text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] p-4 flex flex-col gap-3 hover:ring-teal/25 transition-shadow"
    >
      <span className="flex items-center gap-3">
        <TypeIcon type={s.type} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">{s.name}</span>
          <span className="block text-[11.5px] text-text-muted">
            {QURAN_TYPES[s.type].label} · {over ? `مدتها ${daysTxt(s.days)}` : `اليوم ${ar(s.day + 1)} من ${ar(s.days)}${left > 0 ? `، بقي ${daysTxt(left)}` : '، آخر أيامها'}`}
          </span>
        </span>
        <span className="shrink-0 font-counter tabular-nums text-[20px] font-bold text-teal dark:text-teal-light">
          {ar(pct)}
          <span className="text-[12px]">٪</span>
        </span>
      </span>
      <span className="relative block h-2 rounded-full bg-teal/10" aria-hidden>
        <span className="absolute inset-y-0 start-0 rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${pct}%` }} />
        {!over && s.owe > 0 ? (
          <span className="absolute -top-1 -bottom-1 w-[3px] rounded-full bg-gold" style={{ insetInlineStart: `calc(${target * 100}% - 1.5px)` }} />
        ) : null}
      </span>
      <span className="flex items-baseline justify-between gap-2 text-[12px]">
        <span
          className={
            over
              ? 'text-danger'
              : s.owe > 0
                ? 'font-semibold text-text-secondary dark:text-text-on-dark/85'
                : 'font-semibold text-gold-dark dark:text-gold-light'
          }
        >
          {status}
        </span>
        <span className="shrink-0 font-counter tabular-nums text-text-muted">
          {ar(s.done)} / {ar(s.total)} ص
        </span>
      </span>
    </button>
  );
}

// ── «الحفظ والمراجعة» ────────────────────────────────────────────────────────

const JUZ_TICKS = [1, 10, 20, 30];

/** What you hold by heart, juz by juz, and this week's new and review — opening «الحفظ والمراجعة». */
function HifzPanel({ m, now }: { m: HifzModel; now: number }) {
  if (!m.held && !m.log.length) {
    return (
      <section className="flex flex-col gap-3">
        <SectionTitle title="الحفظ والمراجعة" subtitle="محفوظك، ومراجعته يوماً بيوم" />
        <Link to="/hifz" className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          <Card variant="gradient-edge" pressable className="p-4 flex items-center gap-3.5">
            <Medallion size={56} tone="gold">
              <Sprout size={22} aria-hidden />
            </Medallion>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-text-primary dark:text-text-on-dark">ابدأ متابعة حفظك</span>
              <span className="block text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
                سجّل ما تحفظه وما تراجعه، فترى خريطة محفوظك ومراجعة كل يوم بالقريب والبعيد.
              </span>
            </span>
            <ChevronLeft size={18} className="shrink-0 text-text-muted" aria-hidden />
          </Card>
        </Link>
      </section>
    );
  }
  const pct = (m.held / 604) * 100;
  const juzFull = m.juz.filter((j) => j.held === j.total).length;
  const weekFrom = dk(startOfWeek(now, { weekStartsOn: 6 }));
  let fresh = 0;
  let review = 0;
  for (const [d, v] of m.days)
    if (d >= weekFrom) {
      fresh += v.fresh;
      review += v.review;
    }
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="الحفظ والمراجعة" subtitle="محفوظك في المصحف جزءاً جزءاً" action={<MoreLink to="/hifz">التفاصيل والسجلّ</MoreLink>} />
      <Link
        to="/hifz"
        className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        aria-label={`الحفظ والمراجعة: محفوظك ${pagesTxt(m.held)}، ${ar(juzFull)} جزء كامل`}
      >
        <Card pressable className="p-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-text-muted">محفوظك</p>
              <p className="text-[22px] font-display font-bold leading-tight text-text-primary dark:text-text-on-dark">{pagesTxt(m.held)}</p>
              <p className="mt-0.5 text-[12px] text-text-secondary dark:text-text-on-dark/75">
                {m.held && pct < 10 ? num(pct) : ar(Math.floor(pct))}٪ من المصحف، {ar(juzFull)} {juzFull >= 3 && juzFull <= 10 ? 'أجزاء كاملة' : 'جزء كامل'}
              </p>
            </div>
            <div className="shrink-0 grid grid-cols-2 gap-1.5 text-center">
              <MiniStat Icon={Sprout} value={num(fresh)} label="حفظ" gold />
              <MiniStat Icon={Repeat} value={num(review)} label="مراجعة" />
              <p className="col-span-2 text-[10.5px] text-text-muted">صفحات هذا الأسبوع</p>
            </div>
          </div>
          <div>
            <div className="grid gap-[3px] h-12" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }} aria-hidden>
              {m.juz.map((j, i) => (
                <span key={i} className="relative rounded-[3px] bg-track overflow-hidden">
                  <span
                    className={`absolute inset-x-0 bottom-0 ${j.held === j.total ? 'bg-gold' : 'bg-teal dark:bg-teal-light'}`}
                    style={{ height: `${(j.held / j.total) * 100}%` }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-1 grid gap-[3px] text-[10px] font-counter tabular-nums text-text-muted" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }} aria-hidden>
              {JUZ_TICKS.map((j) => (
                <span key={j} className="text-center" style={{ gridColumn: j }}>
                  {ar(j)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-3 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-teal dark:bg-teal-light" aria-hidden /> بعضه محفوظ
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-gold" aria-hidden /> جزء كامل
              </span>
            </p>
          </div>
        </Card>
      </Link>
    </section>
  );
}

function MiniStat({ Icon, value, label, gold = false }: { Icon: LucideIcon; value: string; label: string; gold?: boolean }) {
  return (
    <span
      className={[
        'min-w-[3.75rem] rounded-xl px-2 py-1.5 flex flex-col items-center',
        gold ? 'bg-gold/10 text-gold-dark dark:text-gold-light' : 'bg-teal/[0.07] dark:bg-teal/15 text-teal dark:text-teal-light',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1 text-[15px] font-counter font-bold tabular-nums leading-tight">
        <Icon size={12} aria-hidden />
        {value}
      </span>
      <span className="text-[10.5px] text-text-muted">{label}</span>
    </span>
  );
}

// ── «أسبوعك مع القرآن» ───────────────────────────────────────────────────────

function WeekSection({
  keys,
  perDay,
  byType,
  streaks,
  types,
  onType,
}: {
  keys: string[];
  perDay: number[];
  byType: Record<QuranType, number>;
  streaks: Record<QuranType, number>;
  types: Record<QuranType, TypeStats>;
  onType: (t: QuranType) => void;
}) {
  const data = keys.map((k, i) => ({
    label: WEEKDAY_SHORT_AR[new Date(`${k}T12:00`).getDay()],
    value: Math.round(perDay[i] * 10) / 10,
    highlight: i === keys.length - 1,
  }));
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="أسبوعك مع القرآن" subtitle="الصفحات المحتسبة من ختماتك وجلساتك، ونصيبك من كل نوع" />
      <Card className="p-4 flex flex-col gap-3">
        {perDay.some((n) => n > 0) ? (
          <BarChart data={data} height={112} showValues formatValue={(v) => (v ? num(v) : '')} />
        ) : (
          <p className="py-2 text-[12.5px] text-text-muted text-center text-pretty">لم تُحتسب صفحات في الأيام السبعة الماضية بعد.</p>
        )}
        <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.06] border-t border-black/[0.04] dark:border-white/[0.06]">
          {QURAN_TYPE_IDS.map((ty) => {
            const st = types[ty];
            const run = st.running[0];
            const sub = run
              ? st.running.length > 1
                ? runningTxt(st.running.length)
                : `«${run.name}»، ${ar(Math.floor((run.done / run.total) * 100))}٪`
              : st.finished
                ? `أتممت ${khatmasTxt(st.finished)}`
                : byType[ty] > 0
                  ? 'من جلساتك'
                  : QURAN_TYPES[ty].benefit;
            return (
              <li key={ty}>
                <button type="button" onClick={() => onType(ty)} className="w-full min-h-12 flex items-center gap-3 py-2.5 text-start">
                  <TypeIcon type={ty} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-text-primary dark:text-text-on-dark">
                      {ty === 'hifz' ? 'الحفظ والمراجعة' : QURAN_TYPES[ty].label}
                    </span>
                    <span className="block text-[11px] text-text-muted truncate">{sub}</span>
                  </span>
                  {streaks[ty] > 0 ? (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[11.5px] font-bold font-counter text-gold-dark dark:text-gold-light" aria-label={`سلسلته ${daysTxt(streaks[ty])}`}>
                      <Flame size={12} aria-hidden />
                      {ar(streaks[ty])}
                    </span>
                  ) : null}
                  <span className="shrink-0 w-14 text-end text-[13px] font-bold font-counter tabular-nums text-text-primary dark:text-text-on-dark">
                    {byType[ty] > 0 ? `${num(byType[ty])} ص` : <span className="text-text-muted font-normal">—</span>}
                  </span>
                  <ChevronLeft size={16} className="shrink-0 text-text-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

// ── «آخر جلساتك» ─────────────────────────────────────────────────────────────

const SESSION_META: Record<SessionType, { label: string; Icon: LucideIcon }> = {
  tilawa: { label: 'تلاوة', Icon: BookOpen },
  listen: { label: 'استماع', Icon: Headphones },
  hifz: { label: 'حفظ', Icon: Sprout },
  review: { label: 'مراجعة', Icon: Repeat },
};

/** The latest sessions of every kind, by day. */
function RecentSessions({ items, now }: { items: SessionItem[]; now: number }) {
  const list = items.slice(-6).reverse();
  const today = dk(now);
  const yesterday = dk(subDays(now, 1));
  const groups: [string, SessionItem[]][] = [];
  for (const x of list) {
    const g = groups[groups.length - 1];
    if (g && g[0] === x.day) g[1].push(x);
    else groups.push([x.day, [x]]);
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="آخر جلساتك"
        subtitle="من «جلسة» في مصحفي: تلاوة واستماع وحفظ ومراجعة"
        action={list.length ? <MoreLink to="/hifz">سجلّ الحفظ</MoreLink> : undefined}
      />
      {list.length ? (
        <Card className="p-1.5">
          {groups.map(([day, xs]) => (
            <div key={day}>
              <p className="px-2.5 pt-2.5 pb-1 text-[11.5px] font-bold text-text-muted">
                {day === today
                  ? 'اليوم'
                  : day === yesterday
                    ? 'أمس'
                    : new Date(xs[0].s).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {xs.map((x) => {
                  const { label, Icon } = SESSION_META[x.ty];
                  let pages = 0;
                  for (const f of x.pages.values()) pages += f;
                  const held = x.ty === 'hifz' || x.ty === 'review';
                  return (
                    <li key={x.id} className="flex items-center gap-3 px-2.5 py-2.5">
                      <span
                        className={[
                          'size-9 rounded-xl inline-flex items-center justify-center shrink-0',
                          held ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
                        ].join(' ')}
                        aria-hidden
                      >
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">
                          {label} · {rangeTxt(x.a, x.z)}
                        </span>
                        <span className="block text-[11.5px] text-text-muted">
                          {new Date(x.s).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                          {x.minutes >= 1 ? `، ${minutesTxt(x.minutes)}` : ''}
                          {x.m ? '، يدوياً' : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12.5px] font-bold font-counter tabular-nums text-text-secondary dark:text-text-on-dark/80">{num(pages)} ص</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
            في مصحفي اضغط «جلسة» (⏱)، واختر تلاوة أو استماعاً أو حفظاً أو مراجعة، وابدأ من أي آية. ما تقرؤه يصل هنا ويُحتسب في نقاطك وأوسمتك بعدد صفحاته،
            والكهف يوم الجمعة يُعلَّم وحده.
          </p>
        </Card>
      )}
    </section>
  );
}

// ── a type up close ──────────────────────────────────────────────────────────

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
            <StatTile value={num(week)} label="صفحة في سبعة أيام" />
            <StatTile value={ar(stats.finished)} label="ختمات أتممتها" accent="gold" />
            <StatTile value={streak ? daysTxt(streak) : '—'} label="سلسلته الآن" accent="gold" />
          </div>
          {stats.running.length ? (
            <div className="flex flex-col gap-2">
              {stats.running.map((s) => (
                <KhatmaCard key={s.id} s={s} />
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
