import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { addDays, format, startOfMonth, startOfWeek, subDays, subWeeks } from 'date-fns';
import { BookOpen, Check, CloudOff, Flame, Link2, Plus, Repeat, Sprout, Target, Trash2, type LucideIcon } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NumberInput } from '@/components/ui/NumberInput';
import { Toggle } from '@/components/ui/Toggle';
import { notificationService } from '@/services/NotificationService';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { StatTile } from '@/components/stats/StatTile';
import { BarChart } from '@/components/stats/BarChart';
import { CalendarHeatmap } from '@/components/stats/CalendarHeatmap';
import { surahs } from '@/data/surahs';
import { ayahKey, pageOfAyah, useMushafiStore, type MushafiSession, type SessionItem } from '@/store/mushafiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { openMushafi, saveMushafiSessions } from '@/services/mushafi';
import { computeStreakFromActiveDates } from '@/services/statsService';
import {
  CYCLES,
  RECENT_DAYS,
  ayahIndex,
  dayNo,
  hifzModel,
  juzPages,
  pageAyat,
  pagesAyat,
  pagesTxt,
  rangeTxt,
  surahAyat,
  type HifzModel,
  type PageState,
  type Range,
} from '@/services/hifzModel';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
/** Pages by ayat can be a fraction: one decimal under ten. */
const num = (n: number) => (n >= 10 || Number.isInteger(n) ? ar(Math.round(n)) : ar(Math.round(n * 10) / 10).replace('.', '٫'));
const dk = (d: Date | number) => format(d, 'yyyy-MM-dd');
function ago(t: number, now: number): string {
  const d = dayNo(now) - dayNo(t);
  return d <= 0 ? 'اليوم' : d === 1 ? 'أمس' : d === 2 ? 'قبل يومين' : d <= 10 ? `قبل ${ar(d)} أيام` : `قبل ${ar(d)} يوماً`;
}
const dateAr = (t: number, o: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(t).toLocaleDateString('ar-EG', o);
const timesTxt = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرّتين' : n <= 10 ? `${ar(n)} مرات` : `${ar(n)} مرة`);
const minutesTxt = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${ar(h)} س${r ? ` ${ar(r)} د` : ''}` : `${ar(r)} د`;
};

const CELL: Record<PageState, string> = {
  none: 'bg-track',
  ok: 'bg-teal',
  today: 'bg-gold',
  late: 'bg-danger/75',
};
const LEGEND: [PageState, string][] = [
  ['ok', 'محفوظة'],
  ['today', 'مراجعة اليوم'],
  ['late', 'متأخرة'],
  ['none', 'لم تُحفظ'],
];

const chip = (active: boolean) =>
  [
    'min-h-10 rounded-xl px-3 text-xs font-bold transition-colors',
    active ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted',
  ].join(' ');
const chipRow = 'flex flex-wrap gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1';
const field =
  'w-full min-h-11 bg-cream-dark/60 dark:bg-white/[0.06] text-text-primary dark:text-text-on-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-text-muted';

type HifzType = 'hifz' | 'review';
/** What the record sheet opens with: a type, and a span when known. */
interface Preset {
  ty: HifzType;
  a?: number;
  z?: number;
}

/**
 * «الحفظ والمراجعة»: what you hold by heart and how to keep it — today's review
 * (القريب والبعيد), what to memorize next and the week's goal, the map of the Mushaf,
 * the surahs, your activity and log, recording from here, and the plan.
 * The data are مصحفي's hifz/review sessions (services/hifzModel.ts).
 */
export function HifzPage() {
  const code = useMushafiStore((s) => s.code);
  const sessions = useMushafiStore((s) => s.sessions);
  const pending = useMushafiStore((s) => s.pending.length);
  const cycle = useSettingsStore((s) => s.hifzCycle);
  const now = Date.now();
  const m = hifzModel(sessions, now, cycle);
  const [rec, setRec] = useState<{ p: Preset; n: number } | null>(null);
  const [recOpen, setRecOpen] = useState(false);
  const [juz, setJuz] = useState<number | null>(null);
  const record = (p: Preset) => {
    setRec({ p, n: Date.now() });
    setRecOpen(true);
  };
  const empty = !m.log.length;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg pb-16" dir="rtl">
      <TopAppBar title="الحفظ والمراجعة" subtitle="محفوظك، ومراجعته يوماً بيوم" showBack />
      <div className="px-4 pt-4 max-w-2xl mx-auto w-full flex flex-col gap-6">
        {!code ? (
          <Unlinked />
        ) : (
          <>
            {empty ? <Welcome onRecord={record} /> : <Hero m={m} now={now} onRecord={record} />}
            {pending ? (
              <p className="-mt-3 flex items-center gap-1.5 px-1 text-[12px] text-text-muted">
                <CloudOff size={14} aria-hidden /> {pending === 1 ? 'تسجيل واحد' : `${ar(pending)} تسجيلات`} لم يصل الخادم بعد، ويُرسل حين يعود الاتصال
              </p>
            ) : null}
            {empty ? null : (
              <>
                <TodayReview m={m} now={now} cycle={cycle} onRecord={record} />
                <NewHifz m={m} now={now} onRecord={record} />
                <MushafMap m={m} onJuz={setJuz} />
                <Surahs m={m} now={now} onRecord={record} />
                <Activity m={m} now={now} />
                <Log m={m} />
              </>
            )}
            <Plan m={m} />
          </>
        )}
      </div>
      <BottomSheet open={recOpen} onClose={() => setRecOpen(false)} title="سجّل حفظاً أو مراجعة">
        {rec ? <RecordForm key={rec.n} preset={rec.p} fallback={m.log[0]} onDone={() => setRecOpen(false)} /> : null}
      </BottomSheet>
      <BottomSheet open={juz != null} onClose={() => setJuz(null)} title={juz ? `الجزء ${ar(juz)}` : undefined}>
        {juz ? (
          <JuzDetail
            key={juz}
            m={m}
            juz={juz}
            now={now}
            onRecord={(p) => {
              setJuz(null);
              record(p);
            }}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}

function Unlinked() {
  const navigate = useNavigate();
  return (
    <Card className="p-5 flex flex-col items-start gap-3">
      <Medallion size={64} tone="teal">
        <Link2 size={22} aria-hidden />
      </Medallion>
      <h2 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark">اربط مصحفي أولاً</h2>
      <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
        حفظك ومراجعتك تُسجَّل في مصحفي («جلسة») أو من هنا، وتُحفظ برمز المزامنة نفسه. اربطه من صفحة القرآن، ثم عُد إلى هنا.
      </p>
      <Button onClick={() => navigate('/quran')} leftIcon={<Link2 size={17} />}>
        اربط مصحفي
      </Button>
    </Card>
  );
}

function Welcome({ onRecord }: { onRecord: (p: Preset) => void }) {
  return (
    <Card variant="gradient-edge" className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Medallion size={64} tone="gold">
          <Sprout size={24} aria-hidden />
        </Medallion>
        <div className="min-w-0">
          <h2 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark">ابدأ متابعة حفظك</h2>
          <p className="text-[12.5px] text-text-muted">«خيركم من تعلّم القرآن وعلّمه»</p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
        <li>• سجّل ما تحفظه أو تراجعه: في مصحفي من «جلسة» وأنت تقرأ، أو من هنا متى شئت.</li>
        <li>• ما حفظته من قبل سجّله «مراجعة»، فيدخل محفوظك دون أن يُعدّ حفظاً جديداً.</li>
        <li>• بعدها ترى هنا مراجعة كل يوم، وما تحفظه بعد، وخريطة محفوظك ومتى راجعته.</li>
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="gold" onClick={() => onRecord({ ty: 'hifz' })} leftIcon={<Sprout size={17} />}>
          حفظ جديد
        </Button>
        <Button variant="soft" onClick={() => onRecord({ ty: 'review' })} leftIcon={<Repeat size={17} />}>
          محفوظ قديم
        </Button>
      </div>
    </Card>
  );
}

function Hero({ m, now, onRecord }: { m: HifzModel; now: number; onRecord: (p: Preset) => void }) {
  const pct = (m.held / 604) * 100;
  const juzFull = m.juz.filter((j) => j.held === j.total).length;
  const surahFull = m.surahs.filter((s) => s.held === s.total).length;
  const week = dk(startOfWeek(now, { weekStartsOn: 6 }));
  let fresh = 0;
  let review = 0;
  for (const [d, v] of m.days)
    if (d >= week) {
      fresh += v.fresh;
      review += v.review;
    }
  const streak = computeStreakFromActiveDates([...m.days.keys()], new Date(now));
  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
      <div className="relative flex items-center gap-4">
        <Medallion size={88} tone="onAccent" className="text-[19px]">
          {m.held && pct < 10 ? num(pct) : ar(Math.floor(pct))}
          <span className="text-[11px]">٪</span>
        </Medallion>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-on-accent/75">محفوظك من كتاب الله</p>
          <h2 className="mt-0.5 text-xl font-display font-bold leading-snug">{pagesTxt(m.held)}</h2>
          <p className="mt-1 text-[12px] text-on-accent/80">
            {ar(juzFull)} {juzFull >= 3 && juzFull <= 10 ? 'أجزاء' : 'جزء'} كامل · {ar(surahFull)} {surahFull >= 3 && surahFull <= 10 ? 'سور' : 'سورة'} كاملة
          </p>
        </div>
      </div>
      <span
        className="relative mt-4 block h-1.5 rounded-full bg-on-accent/15 overflow-hidden"
        role="progressbar"
        aria-label="محفوظك من المصحف"
        aria-valuemin={0}
        aria-valuemax={604}
        aria-valuenow={m.held}
      >
        <span className="block h-full rounded-full bg-gold-light" style={{ width: `${pct}%` }} />
      </span>
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <HeroStat Icon={Flame} value={ar(streak.current)} label="أيام متتالية" />
        <HeroStat Icon={Sprout} value={num(fresh)} label="ص حفظ هذا الأسبوع" />
        <HeroStat Icon={Repeat} value={num(review)} label="ص مراجعة هذا الأسبوع" />
      </div>
      <div className="relative mt-4 flex gap-2">
        <Button variant="gold" fullWidth onClick={() => onRecord({ ty: 'review' })} leftIcon={<Plus size={17} />}>
          سجّل حفظاً أو مراجعة
        </Button>
        <button
          type="button"
          onClick={() => void openMushafi()}
          className="shrink-0 min-h-12 rounded-[var(--radius-btn)] px-4 bg-on-accent/12 text-on-accent text-sm font-bold inline-flex items-center gap-2"
        >
          <BookOpen size={17} aria-hidden /> مصحفي
        </button>
      </div>
    </Card>
  );
}

function HeroStat({ Icon, value, label }: { Icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
      <Icon size={15} className="mx-auto text-gold-light" aria-hidden />
      <p className="mt-1 text-lg font-counter font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-on-accent/75 leading-tight">{label}</p>
    </div>
  );
}

/** Today's review: القريب, then the day's share of البعيد — each run of pages with open / done. */
function TodayReview({ m, now, cycle, onRecord }: { m: HifzModel; now: number; cycle: number; onRecord: (p: Preset) => void }) {
  const t = m.today;
  const total = t.done + t.left;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="مراجعة اليوم" subtitle={`القريب كل يوم، والبعيد كله كل ${ar(cycle)} يوماً`} />
      <Card className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            className={[
              'size-11 shrink-0 rounded-2xl inline-flex items-center justify-center',
              t.left ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
            ].join(' ')}
            aria-hidden
          >
            {t.left ? <Repeat size={20} /> : <Check size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark">
              {t.left ? `بقي لك اليوم ${pagesTxt(t.left)}` : t.done ? 'أتممت مراجعة اليوم، بارك الله فيك' : 'لا مراجعة عليك اليوم'}
            </p>
            <p className="text-[12px] text-text-muted">
              {t.done ? `رُوجعت اليوم ${pagesTxt(t.done)}` : 'لم تراجع اليوم بعد'}
              {t.farCount ? ` · حصّة البعيد ${pagesTxt(t.share)} من ${pagesTxt(t.farCount)}` : ''}
            </p>
          </div>
        </div>
        {total ? (
          <span
            className="h-1.5 rounded-full bg-teal/10 overflow-hidden"
            role="progressbar"
            aria-label="مراجعة اليوم"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={t.done}
          >
            <span className="block h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${(t.done / total) * 100}%` }} />
          </span>
        ) : null}
        {t.recent.length ? (
          <RangeGroup
            title="القريب"
            hint={`ما حفظته في آخر ${ar(RECENT_DAYS)} أيام، يُراجَع كل يوم حتى يثبت`}
            ranges={t.recent}
            m={m}
            now={now}
            onRecord={onRecord}
          />
        ) : null}
        {t.far.length ? (
          <RangeGroup title="البعيد" hint="الأقدم عهداً بالمراجعة أولاً" ranges={t.far} m={m} now={now} onRecord={onRecord} />
        ) : null}
        {t.late ? (
          <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger text-pretty">
            {pagesTxt(t.late)} من البعيد لم تُراجَع منذ أكثر من {ar(cycle)} يوماً. زِد مراجعتك أياماً حتى تلحق، أو
            اختر دورة أطول في «خطتك».
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function RangeGroup({
  title,
  hint,
  ranges,
  m,
  now,
  onRecord,
}: {
  title: string;
  hint: string;
  ranges: Range[];
  m: HifzModel;
  now: number;
  onRecord: (p: Preset) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12.5px] font-bold text-text-secondary dark:text-text-on-dark/85">
        {title} <span className="font-normal text-text-muted">· {hint}</span>
      </p>
      <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
        {ranges.map((r) => {
          const [a, z] = pagesAyat(r.from, r.to);
          const n = r.to - r.from + 1;
          const oldest = Math.min(...m.pages.slice(r.from - 1, r.to).map((p) => p.last));
          const label = rangeTxt(a, z);
          return (
            <li key={r.from} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{label}</p>
                <p className="text-[11.5px] text-text-muted">
                  {n === 1 ? `ص ${ar(r.from)}` : `ص ${ar(r.from)}–${ar(r.to)}`} · {pagesTxt(n)} · آخر مراجعة {ago(oldest, now)}
                </p>
              </div>
              <Button variant="icon" aria-label={`افتح ${label} في مصحفي`} onClick={() => void openMushafi(r.from)}>
                <BookOpen size={18} />
              </Button>
              <Button variant="soft" size="sm" onClick={() => onRecord({ ty: 'review', a, z })} leftIcon={<Check size={15} />}>
                راجعتها
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What to memorize next, the week's goal, and the pace. */
function NewHifz({ m, now, onRecord }: { m: HifzModel; now: number; onRecord: (p: Preset) => void }) {
  const weekly = useSettingsStore((s) => s.hifzWeekly);
  const weekStart = startOfWeek(now, { weekStartsOn: 6 });
  const week = dk(weekStart);
  const month = dk(subDays(now, 27));
  let thisWeek = 0;
  let last4 = 0;
  for (const [d, v] of m.days) {
    if (d >= week) thisWeek += v.fresh;
    if (d >= month) last4 += v.fresh;
  }
  const pace = last4 / 4;
  const left = 604 - m.held;
  const daysLeft = 7 - Math.round((now - weekStart.getTime()) / 86_400_000);
  const next = m.next;
  const nextPage = next == null ? 0 : pageOfAyah(next);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="الحفظ الجديد" subtitle="تابع من حيث وقفت" />
      <Card className="p-4 flex flex-col gap-4">
        {left === 0 ? (
          <p className="text-[14px] font-bold text-teal dark:text-teal-light text-pretty">
            أتممت حفظ كتاب الله. «يُقال لصاحب القرآن: اقرأ وارتقِ ورتّل كما كنت ترتّل في الدنيا»
          </p>
        ) : next != null ? (
          <div className="flex items-center gap-3">
            <span className="size-11 shrink-0 rounded-2xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center" aria-hidden>
              <Sprout size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-text-muted">حفظك التالي</p>
              <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">
                {surahs[ayahKey(next)[0] - 1].nameArabic} من الآية {ar(ayahKey(next)[1])}
              </p>
              <p className="text-[11.5px] text-text-muted">ص {ar(nextPage)}</p>
            </div>
            <Button variant="icon" aria-label="افتحها في مصحفي" onClick={() => void openMushafi(nextPage)}>
              <BookOpen size={18} />
            </Button>
            <Button variant="soft" size="sm" onClick={() => onRecord({ ty: 'hifz', a: next, z: pageAyat(nextPage)[1] })} leftIcon={<Check size={15} />}>
              حفظتها
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
              لم تسجّل حفظاً جديداً بعد. ابدأ من حيث شئت، ونقترح عليك ما بعده.
            </p>
            <Button variant="soft" size="sm" onClick={() => onRecord({ ty: 'hifz' })} leftIcon={<Plus size={15} />}>
              سجّل
            </Button>
          </div>
        )}

        {weekly > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="font-bold text-text-secondary dark:text-text-on-dark/85 inline-flex items-center gap-1.5">
                <Target size={14} aria-hidden /> هدف الأسبوع
              </span>
              <span className="text-text-muted tabular-nums">
                {num(thisWeek)} من {ar(weekly)} ص · {thisWeek >= weekly ? 'تمّ' : `بقي ${daysLeft === 1 ? 'يوم' : `${ar(daysLeft)} أيام`}`}
              </span>
            </p>
            <span
              className="h-1.5 rounded-full bg-gold/15 overflow-hidden"
              role="progressbar"
              aria-label="هدف الحفظ هذا الأسبوع"
              aria-valuemin={0}
              aria-valuemax={weekly}
              aria-valuenow={Math.min(weekly, Math.round(thisWeek))}
            >
              <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (thisWeek / weekly) * 100)}%` }} />
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">لا هدف أسبوعي بعد، حدّده في «خطتك» أسفل الصفحة.</p>
        )}

        {left > 0 ? (
          <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            {pace > 0
              ? `وتيرتك في آخر أربعة أسابيع ${num(pace)} ص أسبوعياً؛ بها تتمّ حفظ القرآن في نحو ${eta(left / pace)}، بإذن الله.`
              : 'لم تحفظ جديداً في آخر أربعة أسابيع.'}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function eta(weeks: number): string {
  if (weeks < 9) return `${ar(Math.ceil(weeks))} ${Math.ceil(weeks) <= 10 && Math.ceil(weeks) >= 3 ? 'أسابيع' : 'أسبوع'}`;
  const months = Math.round(weeks / 4.345);
  if (months < 24) return `${ar(months)} ${months >= 3 && months <= 10 ? 'أشهر' : 'شهراً'}`;
  const years = Math.round(months / 12);
  return `${ar(years)} ${years >= 3 && years <= 10 ? 'سنوات' : 'سنة'}`;
}

/** The Mushaf as 30 rows (ajzaa) of page cells; a row opens its juz. */
function MushafMap({ m, onJuz }: { m: HifzModel; onJuz: (j: number) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="خريطة المحفوظ" subtitle="كل صف جزء وكل خانة صفحة، اضغط جزءاً لتفاصيل صفحاته" />
      <Card className="p-3 flex flex-col gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-text-muted" aria-label="دليل الألوان">
          {LEGEND.map(([s, l]) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={`size-3 rounded-[3px] ${CELL[s]}`} aria-hidden />
              {l}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col">
          {m.juz.map((j, k) => {
            const [p0, p1] = juzPages(k + 1);
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onJuz(k + 1)}
                  aria-label={`الجزء ${ar(k + 1)}: ${j.held ? `${ar(j.held)} من ${ar(j.total)} صفحة محفوظة` : 'لم يُحفظ منه شيء'}`}
                  className="w-full min-h-8 flex items-center gap-2 rounded-lg px-1 hover:bg-teal/5 active:bg-teal/10 transition-colors"
                >
                  <span className="w-5 shrink-0 text-[10.5px] font-counter tabular-nums text-text-muted text-center">{ar(k + 1)}</span>
                  <span className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(23, minmax(0, 1fr))' }} aria-hidden>
                    {m.pages.slice(p0 - 1, p1).map((p) => (
                      <span key={p.page} className={`h-4 rounded-[3px] ${CELL[p.state]}`} />
                    ))}
                  </span>
                  <span className="w-6 shrink-0 text-[10.5px] font-counter tabular-nums text-text-muted text-end">{j.held ? ar(j.held) : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** A juz: its pages as tappable cells, and the chosen page's record. */
function JuzDetail({ m, juz, now, onRecord }: { m: HifzModel; juz: number; now: number; onRecord: (p: Preset) => void }) {
  const [p0, p1] = juzPages(juz);
  const pages = m.pages.slice(p0 - 1, p1);
  const [sel, setSel] = useState(() => (pages.find((p) => p.state === 'late' || p.state === 'today') ?? pages[0]).page);
  const p = m.pages[sel - 1];
  const [a, z] = pageAyat(sel);
  const [ja, jz] = pagesAyat(p0, p1);
  const held = pages.filter((x) => x.held).length;
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-text-secondary dark:text-text-on-dark/80">
          محفوظ {ar(held)} من {ar(pages.length)} صفحة · {rangeTxt(ja, jz)}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="صفحات الجزء">
        {pages.map((x) => (
          <button
            key={x.page}
            type="button"
            onClick={() => setSel(x.page)}
            aria-pressed={x.page === sel}
            aria-label={`صفحة ${ar(x.page)}: ${LEGEND.find(([s]) => s === x.state)![1]}`}
            className={[
              'min-h-11 rounded-xl text-[13px] font-counter tabular-nums transition-transform active:scale-95',
              CELL[x.state],
              x.state === 'none' ? 'text-text-muted' : 'text-on-accent font-bold',
              x.page === sel ? 'ring-2 ring-offset-2 ring-teal dark:ring-teal-light ring-offset-white dark:ring-offset-dark-card' : '',
            ].join(' ')}
          >
            {ar(x.page)}
          </button>
        ))}
      </div>
      <Card variant="inset" className="p-3.5 flex flex-col gap-2">
        <p className="text-[14px] font-bold text-text-primary dark:text-text-on-dark">
          ص {ar(sel)} · {rangeTxt(a, z)}
        </p>
        <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80">
          {p.held
            ? `محفوظة منذ ${dateAr(p.since, { day: 'numeric', month: 'long', year: 'numeric' })} · مرّت عليها جلساتك ${timesTxt(p.times)} · آخر مراجعة ${ago(p.last, now)}${p.recent ? ' · من القريب' : ''}`
            : 'لم تُحفظ بعد، أو لم تشمل جلساتك كل آياتها.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" onClick={() => onRecord({ ty: p.held ? 'review' : 'hifz', a, z })} leftIcon={<Check size={15} />}>
            {p.held ? 'راجعتها' : 'حفظتها'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void openMushafi(sel)} leftIcon={<BookOpen size={15} />}>
            افتحها في مصحفي
          </Button>
        </div>
      </Card>
      {held ? (
        <Button variant="secondary" fullWidth onClick={() => onRecord({ ty: 'review', a: ja, z: jz })} leftIcon={<Repeat size={16} />}>
          راجعت الجزء كله
        </Button>
      ) : null}
    </div>
  );
}

/** Surahs you hold (or all): how much of each, and when last reviewed. */
function Surahs({ m, now, onRecord }: { m: HifzModel; now: number; onRecord: (p: Preset) => void }) {
  const [all, setAll] = useState(false);
  const rows = m.surahs.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => all || s.held > 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="السور"
        subtitle="ما تحفظه من كل سورة، ومتى راجعته"
        action={
          <div className={chipRow} role="radiogroup" aria-label="أيّ السور">
            <button type="button" role="radio" aria-checked={!all} onClick={() => setAll(false)} className={chip(!all)}>
              محفوظك
            </button>
            <button type="button" role="radio" aria-checked={all} onClick={() => setAll(true)} className={chip(all)}>
              الكل
            </button>
          </div>
        }
      />
      <Card className="p-1.5">
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {rows.map((s) => {
            const meta = surahs[s.n - 1];
            const full = s.held === s.total;
            const [a, z] = surahAyat(s.n);
            const late = s.last && dayNo(now) - dayNo(s.last) > 30;
            return (
              <li key={s.n} className="flex items-center gap-2.5 px-2 py-2.5">
                <span className="size-8 shrink-0 rounded-lg bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center text-[11px] font-counter tabular-nums">
                  {ar(s.n)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{meta.nameArabic}</span>
                    <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
                      {full ? 'كاملة' : `${ar(s.held)} / ${ar(s.total)} آية`}
                    </span>
                  </p>
                  <span className="mt-1 block h-1 rounded-full bg-teal/10 overflow-hidden" aria-hidden>
                    <span className={`block h-full rounded-full ${full ? 'bg-teal' : 'bg-gold'}`} style={{ width: `${(s.held / s.total) * 100}%` }} />
                  </span>
                  {s.held ? (
                    <p className={`mt-0.5 text-[11px] ${late ? 'text-danger' : 'text-text-muted'}`}>آخر مراجعة {ago(s.last, now)}</p>
                  ) : null}
                </div>
                <Button variant="icon" aria-label={`افتح ${meta.nameArabic} في مصحفي`} onClick={() => void openMushafi(meta.pages[0])}>
                  <BookOpen size={17} />
                </Button>
                <Button
                  variant="icon"
                  aria-label={s.held ? `سجّل مراجعة ${meta.nameArabic}` : `سجّل حفظ ${meta.nameArabic}`}
                  onClick={() => onRecord({ ty: s.held ? 'review' : 'hifz', a, z })}
                >
                  {s.held ? <Repeat size={17} /> : <Plus size={17} />}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** The month in numbers, eight weeks of new vs review, and the last four months day by day. */
function Activity({ m, now }: { m: HifzModel; now: number }) {
  const month = dk(startOfMonth(now));
  const sum = { fresh: 0, review: 0, minutes: 0, days: 0 };
  for (const [d, v] of m.days)
    if (d >= month) {
      sum.fresh += v.fresh;
      sum.review += v.review;
      sum.minutes += v.minutes;
      sum.days++;
    }
  const streak = computeStreakFromActiveDates([...m.days.keys()], new Date(now));
  const week0 = startOfWeek(now, { weekStartsOn: 6 });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = subWeeks(week0, 7 - i);
    const from = dk(start);
    const to = dk(addDays(start, 7));
    let fresh = 0;
    let review = 0;
    for (const [d, v] of m.days)
      if (d >= from && d < to) {
        fresh += v.fresh;
        review += v.review;
      }
    return {
      label: `${ar(start.getDate())}/${ar(start.getMonth() + 1)}`,
      value: Math.round((fresh + review) * 10) / 10,
      highlight: i === 7,
      segments: [
        { value: fresh, color: 'var(--color-gold)', label: 'حفظ' },
        { value: review, color: 'var(--color-teal)', label: 'مراجعة' },
      ],
    };
  });
  // The last 16 weeks, each day against the busiest one.
  let max = 0;
  for (const v of m.days.values()) max = Math.max(max, v.fresh + v.review);
  const cells = Array.from({ length: 112 }, (_, i) => {
    const d = dk(subDays(now, 111 - i));
    const v = m.days.get(d);
    const pages = v ? v.fresh + v.review : 0;
    return { date: d, value: max ? pages / max : 0, label: pages ? `${num(pages)} ص` : undefined };
  });
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="نشاطك" subtitle="حفظك ومراجعتك بالصفحات" />
      <div className="grid grid-cols-2 gap-2">
        <StatTile value={num(sum.fresh)} label="ص حفظ جديد هذا الشهر" accent="gold" icon={<Sprout size={16} />} />
        <StatTile value={num(sum.review)} label="ص مراجعة هذا الشهر" icon={<Repeat size={16} />} />
        <StatTile value={sum.minutes ? minutesTxt(sum.minutes) : '—'} label={`وقتك هذا الشهر · ${ar(sum.days)} ${sum.days >= 3 && sum.days <= 10 ? 'أيام' : 'يوم'}`} />
        <StatTile value={ar(streak.longest)} label="أطول أيام متتالية" icon={<Flame size={16} />} />
      </div>
      <Card className="p-4 flex flex-col gap-3">
        <p className="flex items-center justify-between gap-2 text-[12.5px] font-bold text-text-secondary dark:text-text-on-dark/85">
          آخر ثمانية أسابيع
          <span className="inline-flex items-center gap-3 font-normal text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-gold" aria-hidden /> حفظ
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-teal" aria-hidden /> مراجعة
            </span>
          </span>
        </p>
        <BarChart data={weeks} height={130} showValues formatValue={(v) => (v ? num(v) : '')} />
      </Card>
      <Card className="p-4">
        <CalendarHeatmap cells={cells} legendLabels={['أقل', 'أكثر']} />
      </Card>
    </section>
  );
}

/** Every hifz/review session, by day; filter, delete. */
function Log({ m }: { m: HifzModel }) {
  const [only, setOnly] = useState<HifzType | null>(null);
  const [shown, setShown] = useState(30);
  const [del, setDel] = useState<SessionItem | null>(null);
  const items = m.log.filter((x) => !only || x.ty === only);
  const groups: [string, SessionItem[]][] = [];
  for (const x of items.slice(0, shown)) {
    const g = groups[groups.length - 1];
    if (g && g[0] === x.day) g[1].push(x);
    else groups.push([x.day, [x]]);
  }
  const remove = async (x: SessionItem) => {
    setDel(null);
    await saveMushafiSessions([{ id: x.id, t: Date.now(), del: 1 } as MushafiSession]);
    toast.success('حُذفت', 'وتُحذف من مصحفي في مزامنته التالية');
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="السجلّ"
        subtitle="من مصحفي ومن هنا"
        action={
          <div className={chipRow} role="radiogroup" aria-label="النوع">
            {([null, 'hifz', 'review'] as const).map((t) => (
              <button key={t ?? 'all'} type="button" role="radio" aria-checked={only === t} onClick={() => setOnly(t)} className={chip(only === t)}>
                {t === 'hifz' ? 'حفظ' : t === 'review' ? 'مراجعة' : 'الكل'}
              </button>
            ))}
          </div>
        }
      />
      <Card className="p-1.5">
        {groups.length ? (
          groups.map(([day, xs]) => (
            <div key={day}>
              <p className="px-2.5 pt-2.5 pb-1 text-[11.5px] font-bold text-text-muted">{dateAr(xs[0].s)}</p>
              <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {xs.map((x) => {
                  let pages = 0;
                  for (const f of x.pages.values()) pages += f;
                  return (
                    <li key={x.id} className="flex items-center gap-3 px-2.5 py-2">
                      <span
                        className={[
                          'size-8 rounded-lg inline-flex items-center justify-center shrink-0',
                          x.ty === 'hifz' ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
                        ].join(' ')}
                        aria-hidden
                      >
                        {x.ty === 'hifz' ? <Sprout size={16} /> : <Repeat size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">
                          {x.ty === 'hifz' ? 'حفظ' : 'مراجعة'} · {rangeTxt(x.a, x.z)}
                        </span>
                        <span className="block text-[11.5px] text-text-muted">
                          {new Date(x.s).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                          {x.minutes >= 1 ? ` · ${minutesTxt(x.minutes)}` : ''} · {num(pages)} ص{x.m ? ' · يدوياً' : ''}
                        </span>
                      </span>
                      <Button variant="icon" aria-label="احذف هذا التسجيل" onClick={() => setDel(x)} className="!text-text-muted hover:!text-danger">
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="p-4 text-[13px] text-text-muted">لا تسجيل من هذا النوع بعد.</p>
        )}
      </Card>
      {items.length > shown ? (
        <Button variant="ghost" onClick={() => setShown((n) => n + 30)}>
          عرض المزيد ({ar(items.length - shown)})
        </Button>
      ) : null}
      <ConfirmDialog
        open={!!del}
        title="حذف هذا التسجيل؟"
        message={del ? `${del.ty === 'hifz' ? 'حفظ' : 'مراجعة'} · ${rangeTxt(del.a, del.z)} — يُحذف هنا ومن مصحفي.` : undefined}
        confirmLabel="احذف"
        confirmVariant="danger"
        onConfirm={() => del && void remove(del)}
        onCancel={() => setDel(null)}
      />
    </section>
  );
}

/** The review cycle and the weekly goal, and how the review is planned. */
function Plan({ m }: { m: HifzModel }) {
  const cycle = useSettingsStore((s) => s.hifzCycle);
  const weekly = useSettingsStore((s) => s.hifzWeekly);
  const remind = useSettingsStore((s) => s.hifzRemind);
  const remindAt = useSettingsStore((s) => s.hifzRemindAt);
  const located = useSettingsStore((s) => !!s.coords);
  const setPlan = useSettingsStore((s) => s.setHifzPlan);
  const far = m.today.farCount;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="خطتك" subtitle="دورة المراجعة وهدف الحفظ" />
      <Card className="p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">تراجع محفوظك كله كل</p>
          <div className={chipRow} role="radiogroup" aria-label="دورة المراجعة">
            {CYCLES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setPlan({ hifzCycle: c })} className={`${chip(cycle === c)} flex-1`}>
                {ar(c)} {c <= 10 ? 'أيام' : 'يوماً'}
              </button>
            ))}
          </div>
          {far ? (
            <p className="text-[12px] text-text-muted">حصّة البعيد بها كل يوم: {pagesTxt(Math.ceil(far / cycle))}.</p>
          ) : null}
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark">هدف الحفظ الأسبوعي</span>
            <span className="block text-[12px] text-text-muted">صفحات جديدة كل أسبوع، ٠ بلا هدف</span>
          </span>
          <NumberInput
            value={weekly}
            min={0}
            max={100}
            onValueChange={(v) => setPlan({ hifzWeekly: v })}
            inputMode="numeric"
            aria-label="صفحات الحفظ أسبوعياً"
            className={`${field} !w-20 text-center font-counter tabular-nums`}
          />
        </label>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark">تذكير المراجعة</span>
              <span className="block text-[12px] text-text-muted text-pretty">كل يوم بقي فيه ما تراجعه، ومعه ما بقي</span>
            </span>
            <Toggle
              checked={remind}
              onChange={(v) => {
                setPlan({ hifzRemind: v });
                if (v) void notificationService.requestPermission();
              }}
              label="تذكير المراجعة"
              hideLabel
            />
          </div>
          {remind ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-text-secondary dark:text-text-on-dark/80">
                {remindAt ? 'في الساعة' : located ? 'بعد الفجر بنصف ساعة، أو اختر وقتاً' : 'الساعة ٧ صباحاً، أو اختر وقتاً'}
              </span>
              <span className="flex items-center gap-1.5">
                {remindAt ? (
                  <Button variant="ghost" size="sm" onClick={() => setPlan({ hifzRemindAt: '' })}>
                    {located ? 'بعد الفجر' : 'تلقائي'}
                  </Button>
                ) : null}
                <input
                  type="time"
                  dir="ltr"
                  value={remindAt}
                  onChange={(e) => setPlan({ hifzRemindAt: e.target.value })}
                  aria-label="وقت تذكير المراجعة"
                  className={`${field} !w-auto font-counter tabular-nums`}
                />
              </span>
            </div>
          ) : null}
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[12.5px] font-bold text-teal dark:text-teal-light min-h-9 inline-flex items-center">
            كيف تُرتَّب مراجعتك؟
          </summary>
          <ul className="mt-1 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            <li>• القريب: ما حفظته في آخر {ar(RECENT_DAYS)} أيام تراجعه كل يوم حتى يثبت.</li>
            <li>• البعيد: بقية محفوظك تمرّ عليه كله في كل دورة؛ لكل يوم حصّته، والأقدم عهداً بالمراجعة أولاً.</li>
            <li>• الصفحة محفوظة حين تشمل جلسات الحفظ والمراجعة كل آياتها، وتُعدّ مراجَعة حين تُراجَع آياتها كلها.</li>
            <li>• ما حفظته قديماً سجّله «مراجعة»: يدخل محفوظك ولا يُعدّ حفظاً جديداً.</li>
            <li>• في «الترتيب»: الصفحة تحفظها أول مرة ١٥ نقطة، وصفحة المراجعة ٣، بعدد الصفحات لا بمدة الجلسة.</li>
          </ul>
        </details>
      </Card>
    </section>
  );
}

type Scope = 'surah' | 'juz' | 'pages' | 'ayat';
const SCOPES: [Scope, string][] = [
  ['surah', 'سورة'],
  ['juz', 'جزء'],
  ['pages', 'صفحات'],
  ['ayat', 'آيات'],
];

/** The sheet's first scope for a span: the surah or juz it is, its pages, or its ayat. */
function scopeOf(a: number, z: number) {
  const [s1, x1] = ayahKey(a);
  const [s2, x2] = ayahKey(z);
  const p1 = pageOfAyah(a);
  const p2 = pageOfAyah(z);
  const base = { s1, x1, s2, x2, p1, p2, juz: 1 };
  const [sa, sz] = surahAyat(s1);
  if (a === sa && z === sz) return { ...base, scope: 'surah' as Scope };
  for (let j = 1; j <= 30; j++) {
    const [ja, jz] = pagesAyat(...juzPages(j));
    if (a === ja && z === jz) return { ...base, juz: j, scope: 'juz' as Scope };
  }
  if (a === pageAyat(p1)[0] && z === pageAyat(p2)[1]) return { ...base, scope: 'pages' as Scope };
  return { ...base, scope: 'ayat' as Scope };
}

const rid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Record a hifz or review done (in مصحفي's format, m: 1): by surah, juz, pages or ayat, when, how long. */
function RecordForm({ preset, fallback, onDone }: { preset: Preset; fallback?: SessionItem; onDone: () => void }) {
  const [init] = useState(() => {
    if (preset.a != null && preset.z != null) return scopeOf(preset.a, preset.z);
    // No span: the surah of the latest session (or الفاتحة), whole.
    const s = fallback ? ayahKey(fallback.a)[0] : 1;
    return { ...scopeOf(...surahAyat(s)), juz: fallback ? Math.max(1, juzOfPage(pageOfAyah(fallback.a))) : 30 };
  });
  const [ty, setTy] = useState<HifzType>(preset.ty);
  const [scope, setScope] = useState<Scope>(init.scope);
  const [surah, setSurah] = useState(init.s1);
  const [juz, setJuz] = useState(init.juz);
  const [p1, setP1] = useState(init.p1);
  const [p2, setP2] = useState(init.p2);
  const [s1, setS1] = useState(init.s1);
  const [x1, setX1] = useState(init.x1);
  const [s2, setS2] = useState(init.s2);
  const [x2, setX2] = useState(init.x2);
  const nowKey = format(Date.now(), "yyyy-MM-dd'T'HH:mm");
  const [when, setWhen] = useState(nowKey);
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);

  const [a, z]: [number, number] =
    scope === 'surah'
      ? surahAyat(surah)
      : scope === 'juz'
        ? pagesAyat(...juzPages(juz))
        : scope === 'pages'
          ? p2 >= p1
            ? pagesAyat(p1, p2)
            : [1, 0]
          : [ayahIndex(s1, x1), ayahIndex(s2, x2)];
  const ok = z >= a;
  const pages = ok ? pageOfAyah(z) - pageOfAyah(a) + 1 : 0;

  const save = async () => {
    if (!ok || busy) return;
    const now = Date.now();
    // Recorded now with a length = it ended now: the start goes back by it (never a length cut to nothing).
    const d = Math.max(0, minutes) * 60_000;
    const s = Math.min(Date.parse(when) || now, now - d);
    const x: MushafiSession = { id: rid(), ty, a, z, s, e: s + d, t: now, m: 1 };
    setBusy(true);
    const sent = await saveMushafiSessions([x]);
    setBusy(false);
    toast.success(ty === 'hifz' ? 'سُجّل حفظك' : 'سُجّلت مراجعتك', sent ? `${rangeTxt(a, z)} · ويصل مصحفي في مزامنته` : 'حُفظ هنا، ويُرسل حين يعود الاتصال');
    onDone();
  };

  const surahSelect = (v: number, set: (n: number) => void, label: string) => (
    <select aria-label={label} className={field} value={v} onChange={(e) => set(Number(e.target.value))}>
      {surahs.map((s) => (
        <option key={s.number} value={s.number}>
          {ar(s.number)} · {s.nameArabic}
        </option>
      ))}
    </select>
  );

  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Group label="النوع" hint={ty === 'hifz' ? 'ما تحفظه لأول مرة' : 'ما تراجعه، أو ما حفظته من قبل'}>
        <div className={chipRow} role="radiogroup" aria-label="النوع">
          {(['hifz', 'review'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={ty === t} onClick={() => setTy(t)} className={`${chip(ty === t)} flex-1`}>
              {t === 'hifz' ? 'حفظ جديد' : 'مراجعة'}
            </button>
          ))}
        </div>
      </Group>

      <Group label="المقدار">
        <div className={chipRow} role="radiogroup" aria-label="المقدار بـ">
          {SCOPES.map(([s, l]) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className={`${chip(scope === s)} flex-1`}>
              {l}
            </button>
          ))}
        </div>
        {scope === 'surah' ? (
          surahSelect(surah, setSurah, 'السورة')
        ) : scope === 'juz' ? (
          <select aria-label="الجزء" className={field} value={juz} onChange={(e) => setJuz(Number(e.target.value))}>
            {Array.from({ length: 30 }, (_, j) => (
              <option key={j} value={j + 1}>
                الجزء {ar(j + 1)}
              </option>
            ))}
          </select>
        ) : scope === 'pages' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-text-muted">
              من صفحة
              <NumberInput value={p1} min={1} max={604} onValueChange={setP1} inputMode="numeric" className={`${field} font-counter tabular-nums`} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-muted">
              إلى صفحة
              <NumberInput value={p2} min={1} max={604} onValueChange={setP2} inputMode="numeric" className={`${field} font-counter tabular-nums`} />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(
              [
                ['من', s1, x1, (s: number) => (setS1(s), setX1(1)), setX1],
                ['إلى', s2, x2, (s: number) => (setS2(s), setX2(surahs[s - 1].versesCount)), setX2],
              ] as const
            ).map(([l, s, x, setS, setX]) => (
              <div key={l} className="grid grid-cols-[2.25rem_1fr_5rem] items-center gap-2">
                <span className="text-[12px] text-text-muted">{l}</span>
                {surahSelect(s, setS, `${l} سورة`)}
                <NumberInput
                  value={x}
                  min={1}
                  max={surahs[s - 1].versesCount}
                  onValueChange={setX}
                  inputMode="numeric"
                  aria-label={`${l} آية`}
                  className={`${field} text-center font-counter tabular-nums`}
                />
              </div>
            ))}
          </div>
        )}
        <p className={`rounded-xl px-3 py-2.5 text-[12.5px] ${ok ? 'bg-teal/[0.07] text-text-secondary dark:text-text-on-dark/85' : 'bg-danger/10 text-danger'}`} role="status">
          {ok ? `${rangeTxt(a, z)} · ${pagesTxt(pages)} · ${ar(z - a + 1)} آية` : 'النهاية قبل البداية'}
        </p>
      </Group>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-text-secondary dark:text-text-on-dark/85">
          متى
          <input type="datetime-local" value={when} max={nowKey} onChange={(e) => setWhen(e.target.value)} className={`${field} font-counter`} dir="ltr" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-text-secondary dark:text-text-on-dark/85">
          المدة (دقيقة)
          <NumberInput
            value={minutes}
            min={0}
            max={600}
            onValueChange={setMinutes}
            inputMode="numeric"
            placeholder="اختيارية"
            className={`${field} text-center font-counter tabular-nums`}
          />
        </label>
      </div>
      <p className="-mt-2 text-[11.5px] text-text-muted text-pretty">المدة للسجلّ فقط؛ نقاطك في «الترتيب» بعدد الصفحات.</p>

      <Button type="submit" fullWidth loading={busy} disabled={!ok} leftIcon={<Check size={17} />}>
        سجّل
      </Button>
    </form>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] font-bold text-text-secondary dark:text-text-on-dark/85">
        {label}
        {hint ? <span className="font-normal text-text-muted"> · {hint}</span> : null}
      </p>
      {children}
    </div>
  );
}

function juzOfPage(p: number) {
  for (let j = 30; j >= 1; j--) if (juzPages(j)[0] <= p) return j;
  return 1;
}

export default HifzPage;
