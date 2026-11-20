import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from '@/lib/motion';
import { format, subDays } from 'date-fns';
import { Check, Sunrise, Sun, SunDim, SunMedium, Sunset, MoonStar, MapPin, UserRound, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { SectionTitle } from '@/components/ui/Ornament';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { MonthPickGrid } from '@/components/ui/MonthPickGrid';
import { GenderPicker } from '@/components/settings/GenderPicker';
import { PrayerDaySheet, PrayerExtras, DuhaRakaatPicker, prayerName } from '@/components/modules/PrayerDaySheet';
import { PrayerHero } from '@/components/home/PrayerHero';
import { postPrayerSetId } from '@/components/adhkar/postPrayer';
import { usePrayerTimes, formatPrayerTime } from '@/hooks/usePrayerTimes';
import { usePrayerLogStore, fardCountOf, adhkarCountOf, eachPrayerStreak, duhaRakaatOf, duhaWindow, sunnahRakaatOn } from '@/store/prayerLogStore';
import { useNotificationStore, iqamaMinutes } from '@/store/notificationStore';
import { useSettingsStore, type Gender } from '@/store/settingsStore';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { WEEKDAY_SHORT_AR } from '@/services/statsService';
import type { PrayerName } from '@/types';
import { PrayerStreaksStrip } from '@/components/home/PrayerStreaksStrip';
import type { PrayerCheckType } from '@/store/prayerLogStore';

const PRAYER_KEYS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_ICON: Record<PrayerName, LucideIcon> = {
  fajr: Sunrise,
  dhuhr: Sun,
  asr: SunDim,
  maghrib: Sunset,
  isha: MoonStar,
};

type RowState = 'complete' | 'done' | 'now' | 'missed' | 'next' | 'later';

const RAIL = 'bg-black/[0.08] dark:bg-white/[0.09]';

/**
 * The prayers module: the next prayer with a live countdown, then the day as
 * a timeline — each fard is a node on the rail (tap to log, tap again to
 * undo), with its sunnah chips beneath, the sunrise marked and الضحى after it.
 */
export function PrayersModule() {
  const navigate = useNavigate();
  const iqama = useNotificationStore((s) => s.prayerExtras.iqama);
  const { times, nextPrayer, loading } = usePrayerTimes();
  const gender = useSettingsStore((s) => s.gender);
  const male = gender === 'male';
  const togglePrayer = usePrayerLogStore((s) => s.togglePrayer);
  const isPrayerDone = usePrayerLogStore((s) => s.isPrayerDone);
  const getFardCount = usePrayerLogStore((s) => s.getFardCount);
  const getSunnahCount = usePrayerLogStore((s) => s.getSunnahCount);

  const dateKey = format(new Date(), 'yyyy-MM-dd');
  // Subscribe to the log so the UI re-renders on every toggle.
  const dayLog = usePrayerLogStore((s) => s.log[dateKey]);
  const [blessing, setBlessing] = useState(false);
  const [pastDay, setPastDay] = useState<string | null>(null);
  const excusedToday = usePrayerLogStore((s) => !!s.excused[dateKey]);
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const duhaRakaat = duhaRakaatOf(duha[dateKey]);
  const duhaToday = duhaRakaat > 0;
  const streaks = useMemo(() => eachPrayerStreak(log, excused, duha), [log, excused, duha]);

  const fardCount = useMemo(() => getFardCount(dateKey), [getFardCount, dateKey, dayLog]);
  const sunnahCount = useMemo(() => getSunnahCount(dateKey) + (duhaToday ? 1 : 0), [getSunnahCount, dateKey, dayLog, duhaToday]);

  const toggleDuha = (rakaat?: number) => {
    if (rakaat && duhaToday) {
      // Re-counting an already logged الضحى.
      usePrayerLogStore.getState().setDuha(dateKey, true, rakaat);
      void hapticsService.selection();
      return;
    }
    usePrayerLogStore.getState().setDuha(dateKey, !duhaToday, rakaat);
    if (!duhaToday) {
      void hapticsService.notify('success');
      toast.success('تقبّل الله ضحاك', `${toArabicDigits(duhaRakaatOf(usePrayerLogStore.getState().duha[dateKey]))} ركعات — «ويُجزئ من ذلك ركعتان يركعهما من الضحى»`);
    } else {
      void hapticsService.impact('light');
      toast.info('تم إلغاء التسجيل');
    }
  };

  const handleToggle = (prayer: PrayerName, type: PrayerCheckType) => {
    const wasDone = isPrayerDone(dateKey, prayer, type);
    const fardBefore = getFardCount(dateKey);
    togglePrayer(dateKey, prayer, type);
    if (!wasDone) {
      void hapticsService.notify('success');
      if (fardBefore < 5 && getFardCount(dateKey) === 5) {
        setBlessing(true);
        toast.success('ما شاء الله، أكملت فروض اليوم');
      }
    } else {
      void hapticsService.impact('light');
      toast.info('تم إلغاء التسجيل');
    }
  };

  // The prayer whose time is running now = the last one whose adhan passed.
  // (Re-evaluated every second through nextPrayer's countdown re-render.)
  const now = Date.now();
  const current = times
    ? [...PRAYER_KEYS].reverse().find((p) => times[p].getTime() <= now) ?? null
    : null;

  /** Fard + its أذكار + every sunnah it has (no qabliyyah for الجمعة). */
  const completeOf = (p: PrayerName) => {
    const e = dayLog?.[p];
    if (!e?.fard || !e.adhkar) return false;
    const m = sunnahRakaatOn(p, dateKey, male);
    return (!m.before || !!e.sunnahBefore) && (!m.after || !!e.sunnahAfter);
  };
  const adhkarCount = adhkarCountOf(dayLog);

  const stateOf = (p: PrayerName): RowState => {
    if (completeOf(p)) return 'complete';
    if (isPrayerDone(dateKey, p, 'fard')) return 'done';
    if (p === current) return 'now';
    if (times && times[p].getTime() <= now) return 'missed';
    if (nextPrayer?.name === p) return 'next';
    return 'later';
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Card className="p-4 flex items-center gap-3">
          <Skeleton width={48} height={48} rounded="lg" />
          <div className="flex-1">
            <Skeleton width="40%" height={12} />
            <Skeleton width="60%" height={18} className="mt-2" />
          </div>
        </Card>
        <Card className="p-3 flex flex-col gap-4">
          {PRAYER_KEYS.map((p) => (
            <div key={p} className="flex items-center gap-3">
              <Skeleton width={44} height={44} rounded="full" />
              <Skeleton width="45%" height={16} />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── The hero: next prayer, the step for the prayer running now, the day's path ── */}
      {times ? (
        <PrayerHero times={times} nextPrayer={nextPrayer} page />
      ) : (
        <Card className="p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
            <MapPin size={18} />
          </span>
          <p className="flex-1 text-sm text-text-secondary dark:text-text-on-dark/80 leading-relaxed text-pretty">
            حدّد موقعك لتظهر مواقيت الصلاة، ويمكنك التسجيل الآن.
          </p>
          <Button variant="soft" size="sm" onClick={() => navigate('/settings?tab=prayer')}>
            تحديد
          </Button>
        </Card>
      )}

      {/* ── Today's timeline ────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="صلوات اليوم"
          subtitle={`${toArabicDigits(fardCount)} من ٥ فروض، وأذكار الصلاة ${toArabicDigits(adhkarCount)} من ٥${sunnahCount > 0 ? `، و${toArabicDigits(sunnahCount)} من السنن` : ''}`}
          action={
            <span className="flex gap-1" aria-hidden>
              {PRAYER_KEYS.map((p) => (
                <span
                  key={p}
                  className={[
                    'w-2 h-2 rounded-full',
                    isPrayerDone(dateKey, p, 'fard') ? 'bg-teal dark:bg-teal-light' : 'bg-text-muted/25',
                  ].join(' ')}
                />
              ))}
            </span>
          }
        />
        <Card className="p-1.5">
          <ol>
            {PRAYER_KEYS.map((prayer, i) => {
              const state = stateOf(prayer);
              const first = i === 0;
              const last = i === PRAYER_KEYS.length - 1;
              return (
                <li key={prayer}>
                  <PrayerRow
                    name={prayerName(prayer, dateKey, male)}
                    time={times ? toArabicDigits(formatPrayerTime(times[prayer])) : null}
                    iqama={
                      times && iqama.enabled
                        ? toArabicDigits(formatPrayerTime(new Date(times[prayer].getTime() + iqamaMinutes(iqama, prayer) * 60_000)))
                        : null
                    }
                    Icon={PRAYER_ICON[prayer]}
                    state={state}
                    streak={streaks[prayer].current}
                    first={first}
                    last={last}
                    onToggle={() => handleToggle(prayer, 'fard')}
                  >
                    <PrayerExtras
                      dateKey={dateKey}
                      prayer={prayer}
                      male={male}
                      onToggle={(type) => handleToggle(prayer, type)}
                      showAdhkar={!excusedToday}
                      onRead={() => navigate(`/adhkar?set=${postPrayerSetId(prayer)}`)}
                    />
                  </PrayerRow>
                  {/* Sunrise sits between Fajr and Dhuhr on the rail. */}
                  {prayer === 'fajr' && times ? (
                    <div className="relative flex items-center gap-3 px-3 py-1.5">
                      <span aria-hidden className={`absolute start-[2.125rem] top-0 bottom-0 w-px ${RAIL}`} />
                      <span className="relative w-11 flex justify-center shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-gold/60 ring-4 ring-white dark:ring-dark-card" />
                      </span>
                      <span className="text-[11.5px] text-text-muted inline-flex items-center gap-1.5">
                        <Sunrise size={13} className="text-gold-dark dark:text-gold-light" />
                        الشروق
                        <span className="font-counter tabular-nums">{toArabicDigits(formatPrayerTime(times.sunrise))}</span>
                      </span>
                    </div>
                  ) : null}
                  {prayer === 'fajr' ? (
                    <DuhaRow times={times} rakaat={duhaRakaat} streak={streaks.duha.current} onToggle={toggleDuha} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>
        <p className="text-[11px] text-text-muted text-center px-2">
          اضغط أي علامة مرة أخرى لإلغاء تسجيلها إن سجّلتها خطأً
        </p>
      </section>

      <PrayerStreaksStrip />

      {gender === null ? <GenderPrompt /> : null}

      {gender === 'female' ? (
        <Card className="p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">اليوم يوم عذر شرعي</p>
            <p className="text-[11px] text-text-muted">لا يُحتسب في الإحصاءات ولا يقطع سلسلتك</p>
          </div>
          <Toggle
            checked={excusedToday}
            onChange={(on) => usePrayerLogStore.getState().setExcused(dateKey, on)}
            size="sm"
            label="اليوم يوم عذر شرعي"
            hideLabel
          />
        </Card>
      ) : null}

      <PastDays todayKey={dateKey} onPick={setPastDay} />

      <PrayerDaySheet dateKey={pastDay} onClose={() => setPastDay(null)} />
      <CompletionBlessing open={blessing} message="تقبّل الله صلاتك" onDone={() => setBlessing(false)} />
    </div>
  );
}

const STATE_CHIP: Record<RowState, { label: string; cls: string } | null> = {
  complete: { label: 'أتممتها', cls: 'bg-gold/15 text-gold-dark dark:text-gold-light' },
  done: { label: 'أدّيتها', cls: 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light' },
  now: { label: 'وقتها الآن', cls: 'bg-gold/15 text-gold-dark dark:text-gold-light' },
  missed: { label: 'لم تُسجَّل', cls: 'bg-cream-dark/70 dark:bg-dark-surface text-text-muted' },
  next: { label: 'القادمة', cls: 'bg-cream-dark/70 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/70' },
  later: null,
};

/** «🔥 ١٢» — this prayer's own run of consecutive days (from two). */
function StreakChip({ n }: { n: number }) {
  if (n < 2) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10.5px] font-counter font-bold text-gold-dark dark:text-gold-light"
      aria-label={`${toArabicDigits(n)} أيام متتالية`}
    >
      <Flame size={11} aria-hidden />
      {toArabicDigits(n)}
    </span>
  );
}

/**
 * صلاة الضحى — a nafl, so a smaller dashed node on the rail between sunrise
 * and Dhuhr, gold (not teal) once prayed. Its time: from when the sun has
 * risen a spear's length (~15 min after sunrise) until shortly before Dhuhr.
 */
function DuhaRow({
  times,
  rakaat,
  streak,
  onToggle,
}: {
  times: { sunrise: Date; dhuhr: Date; maghrib: Date } | null;
  /** Today's rakaat (0 = not prayed). */
  rakaat: number;
  streak: number;
  /** No arg: toggle (with the last count). With a count: log/re-count with it. */
  onToggle: (rakaat?: number) => void;
}) {
  const done = rakaat > 0;
  const win = times ? duhaWindow(times) : null;
  const start = win?.start ?? null;
  const end = win?.end ?? null;
  const now = Date.now();
  const inTime = !!start && !!end && now >= start.getTime() && now < end.getTime();
  return (
    <div className={['relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-[var(--radius-inner)]', inTime && !done ? 'bg-gold/[0.05]' : ''].join(' ')}>
      <span aria-hidden className={`absolute start-[2.125rem] top-0 bottom-0 w-px ${RAIL}`} />
      <span className="relative z-10 w-11 flex justify-center shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => onToggle()}
          aria-pressed={done}
          aria-label={`صلاة الضحى: ${done ? 'صلّيتها، اضغط للإلغاء' : 'اضغط لتسجيلها'}`}
          className={[
            'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors duration-200',
            done
              ? 'bg-[image:var(--gradient-gold)] text-on-accent shadow-[var(--shadow-xs)]'
              : inTime
                ? 'bg-white dark:bg-dark-card ring-2 ring-gold text-gold-dark dark:text-gold-light'
                : 'bg-white dark:bg-dark-card border-[1.5px] border-dashed border-gold/50 text-gold-dark/80 dark:text-gold-light/80 hover:border-gold',
          ].join(' ')}
        >
          {done ? <Check size={15} strokeWidth={3} /> : <SunMedium size={15} />}
        </motion.button>
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <p className={['font-display font-bold text-[14.5px] leading-tight', done ? 'text-gold-dark dark:text-gold-light' : 'text-text-secondary dark:text-text-on-dark/85'].join(' ')}>
          الضحى
        </p>
        <span className="px-1.5 py-px rounded-md text-[9.5px] font-bold bg-gold/15 text-gold-dark dark:text-gold-light">نافلة</span>
        {start && end ? (
          <span className="text-[11px] text-text-muted font-counter tabular-nums">
            من {toArabicDigits(formatPrayerTime(start))} إلى {toArabicDigits(formatPrayerTime(end))}
          </span>
        ) : null}
        <StreakChip n={streak} />
        <span className="flex-1" />
        {done || inTime ? (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-gold/15 text-gold-dark dark:text-gold-light">
            {done ? `صلّيتها · ${toArabicDigits(rakaat)} ركعات` : 'وقتها الآن'}
          </span>
        ) : null}
      </div>
      {/* Rakaat: one tap logs الضحى with that count, or re-counts it. */}
      <div className="w-full ps-14 flex flex-col gap-1">
        {done || inTime ? <DuhaRakaatPicker value={rakaat} onPick={(n) => onToggle(n)} /> : null}
        {win && !done ? (
          <p className="text-[10.5px] text-text-muted">
            أفضل وقتها نحو <span className="font-counter tabular-nums">{toArabicDigits(formatPrayerTime(win.best))}</span> — «صلاة الأوّابين حين ترمض الفِصال»
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PrayerRow({
  name,
  time,
  iqama,
  Icon,
  state,
  streak,
  first,
  last,
  onToggle,
  children,
}: {
  name: string;
  time: string | null;
  /** Iqama clock time, when the iqama reminder is set. */
  iqama?: string | null;
  Icon: LucideIcon;
  state: RowState;
  streak: number;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const done = state === 'done' || state === 'complete';
  const chip = STATE_CHIP[state];
  return (
    <div
      className={[
        'relative flex items-start gap-3 px-3 py-3 rounded-[var(--radius-inner)] transition-colors',
        state === 'now' ? 'bg-gold/[0.07]' : '',
      ].join(' ')}
    >
      {/* Rail through the node centre (px-3 + half of the 44px node). */}
      <span
        aria-hidden
        className={[
          'absolute start-[2.125rem] w-px',
          RAIL,
          first ? 'top-[2.125rem]' : 'top-0',
          last ? 'h-[2.125rem]' : 'bottom-0',
        ].join(' ')}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={onToggle}
        aria-pressed={done}
        aria-label={`${name}: ${done ? 'مؤدّاة، اضغط للإلغاء' : 'اضغط لتسجيلها'}`}
        className={[
          'relative z-10 w-11 h-11 rounded-full inline-flex items-center justify-center shrink-0 transition-colors duration-200',
          done
            ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-sm)]'
            : state === 'now'
              ? 'bg-white dark:bg-dark-card ring-2 ring-gold text-gold-dark dark:text-gold-light'
              : 'bg-white dark:bg-dark-card ring-2 ring-black/[0.08] dark:ring-white/[0.1] text-text-muted hover:ring-teal/50 hover:text-teal',
        ].join(' ')}
      >
        {done ? <Check size={20} strokeWidth={3} /> : <Icon size={19} />}
      </motion.button>

      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2">
          <p
            className={[
              'font-display font-bold text-[17px] leading-tight',
              done ? 'text-teal dark:text-teal-light' : 'text-text-primary dark:text-text-on-dark',
            ].join(' ')}
          >
            {name}
          </p>
          {time ? (
            <span className="text-xs text-text-muted font-counter tabular-nums">
              {time}
              {iqama ? <span className="ms-1.5 text-[10.5px]">الإقامة {iqama}</span> : null}
            </span>
          ) : null}
          <StreakChip n={streak} />
          <span className="flex-1" />
          {chip ? (
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${chip.cls}`}>{chip.label}</span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** «الأيام الماضية»: the last 7 days + a month calendar; any day opens its sheet to fill in a forgotten prayer. */
function PastDays({ todayKey, onPick }: { todayKey: string; onPick: (dateKey: string) => void }) {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const week = useMemo(() => {
    const today = new Date(`${todayKey}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const key = format(d, 'yyyy-MM-dd');
      return { key, day: WEEKDAY_SHORT_AR[d.getDay()], n: fardCountOf(log[key]), excused: !!excused[key] };
    });
  }, [log, excused, todayKey]);

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="الأيام الماضية" subtitle="نسيت تسجيل صلاة؟ اضغط على اليوم وسجّلها" />
      <Card className="p-4 flex flex-col gap-5">
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onPick(d.key)}
              aria-label={`${d.day}: ${d.excused ? 'يوم عذر' : `${toArabicDigits(d.n)} من ٥`}`}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={[
                  'w-full aspect-[4/5] rounded-xl inline-flex flex-col items-center justify-center gap-1 font-counter font-bold transition-colors',
                  d.excused
                    ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                    : d.n === 5
                      ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                      : d.n > 0
                        ? 'bg-teal/15 text-teal dark:text-teal-light'
                        : 'bg-cream-dark/55 dark:bg-dark-surface text-text-muted',
                  d.key === todayKey ? 'ring-2 ring-gold/50' : '',
                ].join(' ')}
              >
                <span className="text-[13px] leading-none">{d.excused ? 'عذر' : `${toArabicDigits(d.n)}/٥`}</span>
                {!d.excused ? (
                  <span className="flex gap-[2px]" aria-hidden>
                    {[0, 1, 2, 3, 4].map((j) => (
                      <span key={j} className={['w-1 h-1 rounded-full', j < d.n ? 'bg-current' : 'bg-current opacity-25'].join(' ')} />
                    ))}
                  </span>
                ) : null}
              </span>
              <span className={['text-[10px]', d.key === todayKey ? 'font-bold text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>{d.day}</span>
            </button>
          ))}
        </div>
        <MonthPickGrid
          todayKey={todayKey}
          markOf={(k) => (excused[k] ? 'excused' : fardCountOf(log[k]) === 5 ? 'full' : fardCountOf(log[k]) > 0 ? 'partial' : null)}
          countLabel={(n) => (n === 0 ? 'لا أيام كاملة بعد' : `${toArabicDigits(n)} ${n === 1 ? 'يوم كامل' : 'أيام كاملة'}`)}
          onPick={onPick}
        />
      </Card>
    </section>
  );
}

/** Asked once, here where it first matters (mosque for men, excused days for women). */
function GenderPrompt() {
  const setGender = useSettingsStore((s) => s.setGender);
  const pick = (g: Gender) => {
    setGender(g);
    toast.success(g === 'male' ? 'ستظهر لك صلاة المسجد والجمعة' : 'ستظهر لكِ أيام العذر وصيغ الأذكار للمؤنث');
  };
  return (
    <Card variant="gradient-edge" className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <UserRound size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">خصّص التطبيق لك</p>
          <p className="text-[11px] text-text-muted text-pretty">صلاة المسجد والجمعة للرجال، وأيام العذر وصيغ الأذكار للنساء</p>
        </div>
      </div>
      <GenderPicker value={null} onChange={pick} />
    </Card>
  );
}
