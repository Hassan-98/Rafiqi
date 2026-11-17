import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { format, subDays, parseISO } from 'date-fns';
import { Undo2, MoonStar, Pencil, SlidersHorizontal, Bell, ChevronLeft, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Medallion, OrnamentRule, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { SectionInsights } from '@/components/stats/SectionInsights';
import { QiyamLogSheet, type QiyamDraft } from '@/components/qiyam/QiyamLogSheet';
import { MonthPickGrid } from '@/components/ui/MonthPickGrid';
import { arCount } from '@/services/insightsService';
import {
  useNightWindow,
  useNow,
  nightPhase,
  durationAr,
  nightName,
  type NightWindow,
} from '@/components/qiyam/nightWindow';
import { useQiyamStore, qiyamNightKey, qiyamLabel } from '@/store/qiyamStore';
import { useProgressStore, frozenDays } from '@/store/progressStore';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { WEEKDAY_SHORT_AR, computeStreakFromActiveDates } from '@/services/statsService';

const time = (d: Date) => toArabicDigits(formatPrayerTime(d));

/** Gentle reminders about قيام الليل — one per day, rotating. */
const QUOTES: { text: string; source: string; quran?: boolean }[] = [
  { text: 'تَتَجَافَىٰ جُنُوبُهُمْ عَنِ الْمَضَاجِعِ يَدْعُونَ رَبَّهُمْ خَوْفًا وَطَمَعًا', source: 'السجدة: ١٦', quran: true },
  { text: 'كَانُوا قَلِيلًا مِّنَ اللَّيْلِ مَا يَهْجَعُونَ ۝ وَبِالْأَسْحَارِ هُمْ يَسْتَغْفِرُونَ', source: 'الذاريات: ١٧–١٨', quran: true },
  { text: 'وَمِنَ اللَّيْلِ فَتَهَجَّدْ بِهِ نَافِلَةً لَّكَ عَسَىٰ أَن يَبْعَثَكَ رَبُّكَ مَقَامًا مَّحْمُودًا', source: 'الإسراء: ٧٩', quran: true },
  { text: 'أفضلُ الصلاةِ بعد الفريضةِ صلاةُ الليل', source: 'رواه مسلم' },
  {
    text: 'ينزلُ ربُّنا تبارك وتعالى كلَّ ليلةٍ إلى السماءِ الدنيا حين يبقى ثلثُ الليلِ الآخر، يقول: من يدعوني فأستجيبَ له، من يسألني فأُعطيَه، من يستغفرني فأغفرَ له',
    source: 'متفق عليه',
  },
  {
    text: 'من قام بعشرِ آياتٍ لم يُكتب من الغافلين، ومن قام بمائةِ آيةٍ كُتب من القانتين، ومن قام بألفِ آيةٍ كُتب من المُقنطِرين',
    source: 'رواه أبو داود',
  },
];

const PHASE_COPY = {
  before: 'استعدّ لقيام الليلة',
  early: 'قيام هذه الليلة',
  lastThird: 'أنت في الثلث الأخير',
  after: 'هل قمتَ الليلة الماضية؟',
} as const;

export function QiyamModule() {
  const navigate = useNavigate();
  const nights = useQiyamStore((s) => s.nights);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const removeNight = useQiyamStore((s) => s.removeNight);
  const logNight = useQiyamStore((s) => s.logNight);

  const now = useNow();
  const nightKey = qiyamNightKey(new Date(now));
  const tonight = nights[nightKey];
  const win = useNightWindow(nightKey);
  const phase = nightPhase(win, now);

  // The user's last real choice — logging is ONE tap for the habit.
  const initial = useMemo<QiyamDraft>(() => {
    const last = Object.values(nights)
      .filter((n) => n.rakaat > 0)
      .sort((a, b) => b.loggedAt - a.loggedAt)[0];
    return { rakaat: last?.rakaat ?? 8, witr: last?.witr ?? true, minutes: last?.minutes };
  }, [nights]);

  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [blessing, setBlessing] = useState(false);

  const celebrate = (wasNew: boolean, key: string) => {
    void hapticsService.notify('success');
    if (wasNew && key === nightKey) setBlessing(true);
    toast.success(wasNew ? 'تقبّل الله قيامك' : 'تم تحديث القيام');
  };

  const quickLog = () => {
    logNight({ rakaat: initial.rakaat, witr: initial.witr, minutes: initial.minutes });
    celebrate(true, nightKey);
  };

  const undo = () => {
    removeNight(nightKey);
    void hapticsService.impact('medium');
    toast.info('تم إلغاء تسجيل القيام');
  };

  const strip = useMemo(() => {
    const today = parseISO(`${nightKey}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const key = format(d, 'yyyy-MM-dd');
      return { key, day: WEEKDAY_SHORT_AR[(d.getDay() + 1) % 7], night: nights[key] };
    });
  }, [nights, nightKey]);

  const summary = useMemo(() => {
    const all = Object.values(nights);
    const monthPrefix = nightKey.slice(0, 7);
    return {
      streak: computeStreakFromActiveDates(all.map((n) => n.nightKey).sort(), new Date(), frozenDays('qiyam', freezes)).current,
      monthNights: all.filter((n) => n.nightKey.startsWith(monthPrefix)).length,
      totalRakaat: all.reduce((s, n) => s + n.rakaat + (n.witr ? 1 : 0), 0),
    };
  }, [nights, nightKey, freezes]);

  const quote = QUOTES[Math.floor(parseISO(`${nightKey}T12:00:00`).getTime() / 86_400_000) % QUOTES.length];
  const quickLabel = `سجّل ${toArabicDigits(initial.rakaat)} ركعات${initial.witr ? ' + الوتر' : ''}`;

  const status = tonight
    ? [qiyamLabel(tonight, toArabicDigits), tonight.minutes ? `${toArabicDigits(tonight.minutes)} دقيقة` : null, time(new Date(tonight.loggedAt))]
        .filter(Boolean)
        .join(' · ')
    : !win
      ? '«أفضل الصلاة بعد الفريضة صلاة الليل»'
      : phase === 'before'
        ? `يدخل الليل بعد ${durationAr(win.maghrib.getTime() - now)}`
        : phase === 'early'
          ? `يبدأ الثلث الأخير بعد ${durationAr(win.lastThird.getTime() - now)}`
          : phase === 'lastThird'
            ? `وقت النزول الإلهي · يطلع الفجر بعد ${durationAr(win.fajr.getTime() - now)}`
            : 'يمكنك تسجيل قيام البارحة حتى الظهر';

  return (
    <div className="flex flex-col gap-6">
      {/* ── Night hero ─────────────────────────────────────── */}
      <Card variant="night" className="p-5">
        <NightSky />
        <div className="relative flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-on-dark/60">قيام الليل · {nightName(nightKey)}</p>
            <h2 className="mt-1 text-[22px] font-display font-bold text-balance">
              {tonight ? 'قُمتَ الليلة، تقبّل الله' : PHASE_COPY[phase]}
            </h2>
            <p className="mt-1 text-[13px] text-text-on-dark/75 inline-flex items-center gap-1.5">
              {!tonight && win ? <Clock size={13} className="text-gold-light shrink-0" /> : null}
              <span className="font-counter">{status}</span>
            </p>
          </div>
          {tonight ? (
            <Medallion size={64} tone="gold" className="text-gold-light">
              <span className="text-xl">{tonight.rakaat > 0 ? toArabicDigits(tonight.rakaat + (tonight.witr ? 1 : 0)) : '✓'}</span>
            </Medallion>
          ) : (
            <Crescent />
          )}
        </div>

        {win ? <NightTimeline win={win} now={now} /> : null}

        <div className="relative mt-5">
          {tonight ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSheetKey(nightKey)}
                className="min-h-12 rounded-[var(--radius-btn)] bg-text-on-dark/10 hover:bg-text-on-dark/15 text-text-on-dark font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Pencil size={15} /> تعديل
              </button>
              <button
                type="button"
                onClick={undo}
                className="min-h-12 rounded-[var(--radius-btn)] text-text-on-dark/75 hover:bg-text-on-dark/10 font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Undo2 size={15} /> تراجع
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="gold" size="lg" className="flex-1" onClick={quickLog} haptic="medium" leftIcon={<MoonStar size={18} />}>
                {quickLabel}
              </Button>
              <button
                type="button"
                aria-label="تخصيص الركعات والمدّة"
                onClick={() => setSheetKey(nightKey)}
                className="w-14 min-h-14 shrink-0 rounded-2xl bg-text-on-dark/10 hover:bg-text-on-dark/15 text-text-on-dark inline-flex items-center justify-center transition-colors"
              >
                <SlidersHorizontal size={19} />
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Progress (shared insights engine) ─────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="تقدّمك في القيام" subtitle="السلاسل والأرقام القياسية" />
        <SectionInsights domain="qiyam" statsTo="/stats/qiyam" />
      </section>

      {/* ── Last 7 nights ──────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="آخر ٧ ليالٍ" subtitle="اضغط على ليلة لتسجيلها أو تعديلها" />
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1.5">
            {strip.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => setSheetKey(n.key)}
                aria-label={`${nightName(n.key)}${n.night ? ` — ${qiyamLabel(n.night, toArabicDigits)}` : ''}`}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={[
                    'w-full aspect-[4/5] rounded-xl inline-flex flex-col items-center justify-center gap-0.5 font-counter font-bold transition-colors',
                    n.night
                      ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                      : n.key === nightKey
                        ? 'outline-dashed outline-1 -outline-offset-2 outline-teal/60 text-text-muted'
                        : 'bg-cream-dark/55 dark:bg-dark-surface text-text-muted',
                  ].join(' ')}
                >
                  {n.night ? (
                    <>
                      <span className="text-sm leading-none">{n.night.rakaat > 0 ? toArabicDigits(n.night.rakaat) : '✓'}</span>
                      {n.night.witr ? <Star8 size={8} className="text-gold-light" /> : null}
                    </>
                  ) : (
                    <MoonStar size={13} className="opacity-50" />
                  )}
                </span>
                <span className={['text-[10px]', n.key === nightKey ? 'font-bold text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
                  {n.day}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-3 grid grid-cols-3 gap-2 text-center border-t border-black/[0.05] dark:border-white/[0.06]">
            {[
              { v: summary.streak, l: 'ليالٍ متتالية' },
              { v: summary.monthNights, l: 'ليلة هذا الشهر' },
              { v: summary.totalRakaat, l: 'ركعة إجمالاً' },
            ].map((x) => (
              <div key={x.l}>
                <p className="text-xl font-counter font-bold tabular-nums text-teal dark:text-teal-light">{toArabicDigits(x.v)}</p>
                <p className="text-[10.5px] text-text-muted">{x.l}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Month ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="ليالي الشهر" />
        <Card className="p-4">
          <MonthPickGrid
            todayKey={nightKey}
            markOf={(k) => (nights[k] ? 'full' : null)}
            dotOf={(k) => !!nights[k]?.witr}
            countLabel={(n) => (n === 0 ? 'لا ليالٍ بعد' : arCount(n, 'ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة'))}
            onPick={setSheetKey}
          />
        </Card>
      </section>

      {/* ── A word about the night ─────────────────────────── */}
      <Card variant="gradient-edge" className="p-5 text-center">
        <OrnamentRule className="mb-3" />
        <p
          className={[
            'text-text-primary dark:text-text-on-dark text-pretty',
            quote.quran ? 'font-quran text-xl leading-[2.1]' : 'font-ornate text-lg leading-loose',
          ].join(' ')}
        >
          {quote.quran ? `﴿${quote.text}﴾` : `«${quote.text}»`}
        </p>
        <p className="mt-2 text-xs text-gold-dark dark:text-gold-light">{quote.source}</p>
      </Card>

      {/* ── Reminder ───────────────────────────────────────── */}
      <Card className="p-1.5">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
        >
          <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
            <Bell size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تذكير القيام</span>
            <span className="block text-[11px] text-text-muted truncate">
              {win ? `نبّهني قبل الثلث الأخير (${time(win.lastThird)}) من الإعدادات` : 'اضبط تنبيه قيام الليل من الإعدادات'}
            </span>
          </span>
          <ChevronLeft size={16} className="text-text-muted" />
        </button>
      </Card>

      {sheetKey ? (
        <QiyamLogSheet
          open
          onClose={() => setSheetKey(null)}
          nightKey={sheetKey}
          existing={nights[sheetKey]}
          initial={initial}
          onSaved={(_, wasNew) => {
            celebrate(wasNew, sheetKey);
            setSheetKey(null);
          }}
          onRemoved={() => {
            void hapticsService.impact('medium');
            toast.info('تم حذف تسجيل الليلة');
            setSheetKey(null);
          }}
        />
      ) : null}

      <CompletionBlessing open={blessing} message="تقبّل الله قيامك" onDone={() => setBlessing(false)} />
    </div>
  );
}

/** Soft moon glow + a few faint stars behind the hero content. */
function NightSky() {
  const stars: [string, number, string][] = [
    ['top-4 start-[46%]', 7, 'opacity-50'],
    ['top-10 start-[62%]', 5, 'opacity-30'],
    ['top-3 start-[78%]', 6, 'opacity-40 [animation-delay:1.2s]'],
    ['bottom-24 start-[88%]', 5, 'opacity-25 [animation-delay:.6s]'],
    ['top-16 start-[36%]', 4, 'opacity-25 [animation-delay:2s]'],
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -top-16 -end-14 w-52 h-52 rounded-full bg-gold/20 blur-3xl" />
      {stars.map(([pos, size, cls]) => (
        <Star8 key={pos} size={size} className={`absolute text-gold-light animate-pulse-soft motion-reduce:animate-none ${pos} ${cls}`} />
      ))}
    </div>
  );
}

function Crescent() {
  return (
    <svg viewBox="0 0 24 24" className="relative w-14 h-14 shrink-0 text-gold-light drop-shadow-[0_0_14px_currentColor]" aria-hidden>
      <path fill="currentColor" d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z" />
    </svg>
  );
}

/** Maghrib → Fajr as a bar: the last third in gold, a dot for "now". */
function NightTimeline({ win, now }: { win: NightWindow; now: number }) {
  const start = win.maghrib.getTime();
  const span = win.fajr.getTime() - start;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const lt = pct(win.lastThird.getTime());
  const cur = pct(now);
  const inNight = now >= start && now < win.fajr.getTime();
  return (
    <div className="relative mt-5">
      <div className="relative h-2 rounded-full bg-text-on-dark/10">
        <span className="absolute inset-y-0 start-0 rounded-full bg-text-on-dark/40" style={{ width: `${cur}%` }} />
        <span
          className="absolute inset-y-0 rounded-full bg-[image:var(--gradient-gold)]"
          style={{ insetInlineStart: `${lt}%`, insetInlineEnd: 0 }}
        />
        {inNight ? (
          <span
            className="absolute top-1/2 -mt-[7px] w-3.5 h-3.5 rounded-full bg-text-on-dark ring-4 ring-text-on-dark/20"
            style={{ insetInlineStart: `calc(${cur}% - 7px)` }}
          />
        ) : null}
      </div>
      <div className="mt-2.5 grid grid-cols-3 text-[11px]">
        <span className="text-start">
          <span className="block text-text-on-dark/55">المغرب</span>
          <span className="font-counter font-semibold tabular-nums">{time(win.maghrib)}</span>
        </span>
        <span className="text-center text-gold-light">
          <span className="block opacity-80">الثلث الأخير</span>
          <span className="font-counter font-bold tabular-nums">{time(win.lastThird)}</span>
        </span>
        <span className="text-end">
          <span className="block text-text-on-dark/55">الفجر</span>
          <span className="font-counter font-semibold tabular-nums">{time(win.fajr)}</span>
        </span>
      </div>
    </div>
  );
}
