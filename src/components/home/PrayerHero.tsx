import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { AlarmClock, BookOpenText, Check, ChevronLeft, Sparkles, Star, Timer } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ArchMotif } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { Mosque } from '@/components/icons/Mosque';
import { prayerName, rakaat } from '@/components/modules/PrayerDaySheet';
import { remainingMinutes } from '@/components/adhkar/adhkarSets';
import { postPrayerItems, postPrayerSetId } from '@/components/adhkar/postPrayer';
import { postPrayerAdhkar } from '@/data/adhkar';
import {
  usePrayerLogStore,
  adhkarCountOf,
  fardCountOf,
  rawatibRakaatOf,
  PRAYERS_ORDER,
  rawatibFullOn,
  prayerStreak,
  sunnahRakaatOn,
  type PrayerCheckType,
} from '@/store/prayerLogStore';
import { useNotificationStore, iqamaMinutes } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatPrayerTime, type NextPrayer } from '@/hooks/usePrayerTimes';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { PrayerName, PrayerTimesResult } from '@/types';

const ar = toArabicDigits;
const clock = (d: Date) => ar(formatPrayerTime(d));
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

/** m:ss under an hour, h:mm:ss after. */
const elapsedLabel = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return ar(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`);
};

const minutesAr = (m: number) => (m <= 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : m <= 10 ? `${ar(m)} دقائق` : `${ar(m)} دقيقة`);

/** Log a prayer detail from Home; the store keeps progress + streaks in step. */
function logIt(dateKey: string, p: PrayerName, type: PrayerCheckType, done: boolean, name: string) {
  const st = usePrayerLogStore.getState();
  const before = st.getFardCount(dateKey);
  st.setPrayer(dateKey, p, type, done);
  if (!done) {
    void hapticsService.impact('light');
    toast.info('تم إلغاء التسجيل');
    return;
  }
  void hapticsService.notify('success');
  const after = st.getFardCount(dateKey);
  if (before < 5 && after === 5) toast.success('ما شاء الله، أتممت الفروض الخمسة اليوم');
  else if (type === 'onTime') toast.success(`سُجّلت صلاة ${name} على وقتها، تقبّل الله`);
  else if (type === 'fard' || type === 'mosque') toast.success(`سُجّلت صلاة ${name}، تقبّل الله`);
  else if (type === 'adhkar') toast.success(`تقبّل الله، قلتَ أذكار ${name}`);
  else toast.success('تقبّل الله');
}

/** The last prayer whose adhan has passed today (null before Fajr). */
function currentPrayer(times: PrayerTimesResult, now: number): PrayerName | null {
  return [...PRAYERS_ORDER].reverse().find((p) => times[p].getTime() <= now) ?? null;
}

/**
 * The day as a path: five nodes joined by segments that fill in gold as the
 * day passes, a bead at "now". A node is one tap to log (once its time has
 * come); the small star under it lights once its أذكار were said.
 */
function PrayerPath({ times, next, onAccent }: { times: PrayerTimesResult; next: PrayerName | null; onAccent: boolean }) {
  const dateKey = todayKey();
  const day = usePrayerLogStore((s) => s.log[dateKey]);
  const male = useSettingsStore((s) => s.gender) === 'male';
  const now = Date.now();
  const cur = currentPrayer(times, now);

  // How far along segment i (prayer i → i+1) the day is, 0..1.
  const segFill = (i: number) => {
    const a = times[PRAYERS_ORDER[i]].getTime();
    const b = times[PRAYERS_ORDER[i + 1]].getTime();
    return Math.min(1, Math.max(0, (now - a) / (b - a)));
  };
  const track = onAccent
    ? 'color-mix(in srgb, var(--color-on-accent) 22%, transparent)'
    : 'color-mix(in srgb, var(--color-teal) 18%, transparent)';
  const fill = onAccent ? 'var(--color-gold-light)' : 'var(--color-gold)';

  return (
    <ol className="grid grid-cols-5" aria-label="صلوات اليوم">
      {PRAYERS_ORDER.map((id, i) => {
        const name = prayerName(id, dateKey, male);
        const t = times[id];
        const due = t.getTime() <= now;
        const logged = !!day?.[id]?.fard;
        const said = !!day?.[id]?.adhkar;
        const isCur = id === cur && !logged;
        const isNext = next === id && !due;
        const f = i < 4 ? segFill(i) : 0;
        const node = (
          <span
            className={[
              'relative z-10 w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors duration-200',
              logged
                ? onAccent
                  ? 'bg-on-accent text-teal-dark shadow-[var(--shadow-xs)]'
                  : 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                : isCur
                  ? onAccent
                    ? 'ring-2 ring-gold-light text-gold-light'
                    : 'ring-2 ring-gold text-gold-dark dark:text-gold-light bg-white dark:bg-dark-card'
                  : due
                    ? onAccent
                      ? 'border-[1.5px] border-dashed border-on-accent/80'
                      : 'border-[1.5px] border-dashed border-teal/60 bg-white dark:bg-dark-card'
                    : onAccent
                      ? 'border-[1.5px] border-on-accent/25'
                      : 'border-[1.5px] border-black/10 dark:border-white/15 bg-white dark:bg-dark-card',
            ].join(' ')}
          >
            {logged ? <Check size={17} strokeWidth={3} /> : isNext ? <Star size={12} className={onAccent ? 'text-gold-light' : 'text-gold'} /> : null}
          </span>
        );
        const label = (
          <>
            {node}
            <span
              className={[
                'mt-1.5 text-[12px] font-bold leading-none',
                isCur || isNext ? (onAccent ? 'text-gold-light' : 'text-gold-dark dark:text-gold-light') : '',
              ].join(' ')}
            >
              {name}
            </span>
            <span className={['mt-1 text-[10.5px] font-counter tabular-nums leading-none', onAccent ? 'text-on-accent/75' : 'text-text-muted'].join(' ')}>
              {clock(t)}
            </span>
            <span
              aria-hidden
              className={[
                'mt-1.5 h-3.5 inline-flex items-center gap-0.5 text-[9.5px] font-bold',
                said ? (onAccent ? 'text-gold-light' : 'text-gold-dark dark:text-gold-light') : onAccent ? 'text-on-accent/40' : 'text-text-muted/60',
                logged ? '' : 'invisible',
              ].join(' ')}
            >
              {said ? <Check size={10} strokeWidth={3.2} /> : <Sparkles size={10} />}
              أذكار
            </span>
          </>
        );
        return (
          <li key={id} className="relative flex justify-center">
            {/* Segment to the next prayer: from this node's edge to the next one's. */}
            {i < 4 ? (
              <span
                aria-hidden
                className="absolute top-[17px] h-[2px] rounded-full"
                style={{
                  insetInlineStart: 'calc(50% + 22px)',
                  insetInlineEnd: 'calc(-50% + 22px)',
                  background: `linear-gradient(to left, ${fill} ${f * 100}%, ${track} ${f * 100}%)`,
                }}
              >
                {f > 0 && f < 1 ? (
                  <span
                    className={['absolute top-1/2 w-2.5 h-2.5 rounded-full', onAccent ? 'bg-gold-light' : 'bg-gold'].join(' ')}
                    style={{ insetInlineStart: `${f * 100}%`, transform: 'translate(50%, -50%)', boxShadow: `0 0 0 4px ${track}` }}
                  />
                ) : null}
              </span>
            ) : null}
            {due ? (
              <button
                type="button"
                onClick={() => logIt(dateKey, id, 'fard', !logged, name)}
                aria-pressed={logged}
                aria-label={`${logged ? 'إلغاء تسجيل' : 'سجّل'} صلاة ${name}${logged ? (said ? '، قلتَ أذكارها' : '، لم تُسجَّل أذكارها') : ''}`}
                className={[
                  'w-full flex flex-col items-center rounded-[var(--radius-inner)] py-1.5 transition-colors',
                  onAccent ? 'hover:bg-on-accent/10' : 'hover:bg-teal/5',
                ].join(' ')}
              >
                {label}
              </button>
            ) : (
              <div className="w-full flex flex-col items-center py-1.5 opacity-85" aria-label={`${name} ${clock(t)}`}>
                {label}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * «الآن» — the one next step for the prayer whose time is running: log it
 * (in the mosque, for men), then its أذكار, then its sunnah after; done once
 * all are in. Hidden before Fajr and on an excused day.
 */
function NowStep({ times }: { times: PrayerTimesResult }) {
  const navigate = useNavigate();
  const dateKey = todayKey();
  const entry = usePrayerLogStore((s) => s.log[dateKey]);
  const excused = usePrayerLogStore((s) => !!s.excused[dateKey]);
  const male = useSettingsStore((s) => s.gender) === 'male';
  const iqama = useNotificationStore((s) => s.prayerExtras.iqama);
  const now = Date.now();
  const cur = currentPrayer(times, now);
  if (!cur || excused) return null;

  const name = prayerName(cur, dateKey, male);
  const e = entry?.[cur];
  const elapsed = Math.floor((now - times[cur].getTime()) / 1000);
  const toIqama = iqama.enabled ? iqamaMinutes(iqama, cur) * 60 - elapsed : null;
  const after = sunnahRakaatOn(cur, dateKey, male).after;
  const readMin = remainingMinutes(postPrayerItems(cur, postPrayerAdhkar), {}, {});

  const primary =
    'min-h-11 px-4 rounded-2xl bg-on-accent text-teal-dark font-bold text-[14px] inline-flex items-center justify-center gap-1.5 shadow-[var(--shadow-sm)]';
  const soft =
    'min-h-11 px-3.5 rounded-2xl bg-on-accent/12 ring-1 ring-on-accent/25 text-on-accent font-semibold text-[13px] inline-flex items-center justify-center gap-1.5';

  let kicker: string;
  let title: string;
  let line: ReactNode = null;
  let actions: ReactNode;
  if (!e?.fard) {
    kicker = 'وقتها الآن';
    title = `صلاة ${name}`;
    line = (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 font-counter">
        <Timer size={12} aria-hidden className="text-gold-light" />
        مضى على الأذان <b className="tabular-nums" dir="ltr">{elapsedLabel(elapsed)}</b>
        {toIqama != null && toIqama > 0 ? (
          <>
            <span aria-hidden>—</span> الإقامة بعد <b className="tabular-nums text-gold-light" dir="ltr">{elapsedLabel(toIqama)}</b>
          </>
        ) : toIqama != null && toIqama > -10 * 60 ? (
          <>
            <span aria-hidden>—</span> <b className="text-gold-light">حان وقت الإقامة</b>
          </>
        ) : null}
      </span>
    );
    actions = (
      <>
        <HapticPressable haptic="medium" onClick={() => logIt(dateKey, cur, 'fard', true, name)} className={primary}>
          <Check size={16} strokeWidth={2.8} /> صلّيتُها
        </HapticPressable>
        {male ? (
          <HapticPressable onClick={() => logIt(dateKey, cur, 'mosque', true, name)} className={soft}>
            <Mosque size={15} /> في المسجد
          </HapticPressable>
        ) : (
          <HapticPressable onClick={() => logIt(dateKey, cur, 'onTime', true, name)} className={soft}>
            <AlarmClock size={15} /> على وقتها
          </HapticPressable>
        )}
      </>
    );
  } else if (!e.adhkar) {
    kicker = `تقبّل الله ${name}`;
    title = `أذكار بعد ${name}`;
    line = <span>نحو {minutesAr(readMin)}، «معقّبات لا يخيب قائلهن»</span>;
    actions = (
      <>
        <HapticPressable haptic="medium" onClick={() => navigate(`/adhkar?set=${postPrayerSetId(cur)}`)} className={primary}>
          <BookOpenText size={16} /> اقرأ الأذكار
        </HapticPressable>
        <HapticPressable onClick={() => logIt(dateKey, cur, 'adhkar', true, name)} className={soft}>
          <Check size={15} /> قلتُها
        </HapticPressable>
      </>
    );
  } else if (after > 0 && !e.sunnahAfter) {
    kicker = 'بقيت السنّة';
    title = `البعدية ${rakaat(after)}`;
    line = <span>«من صلّى اثنتي عشرة ركعة في يوم وليلة بُني له بهنّ بيت في الجنة»</span>;
    actions = (
      <HapticPressable haptic="medium" onClick={() => logIt(dateKey, cur, 'sunnahAfter', true, name)} className={primary}>
        <Check size={16} strokeWidth={2.8} /> صلّيتُها
      </HapticPressable>
    );
  } else {
    return (
      <p className="relative flex items-center gap-2 rounded-[var(--radius-inner)] bg-on-accent/10 px-3 py-2.5 text-[12.5px]">
        <span className="w-6 h-6 rounded-full bg-gold-light text-teal-dark inline-flex items-center justify-center shrink-0">
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="text-pretty">
          أتممتَ {name} بأذكارها{after > 0 ? ' وسنّتها' : ''}، تقبّل الله منك
        </span>
      </p>
    );
  }

  return (
    <div className="relative rounded-[var(--radius-inner)] bg-on-accent/10 ring-1 ring-on-accent/15 p-3 flex flex-col gap-2.5">
      <div className="min-w-0">
        <p className="text-[11px] text-gold-light font-bold">{kicker}</p>
        <p className="font-display text-[19px] font-bold leading-tight">{title}</p>
        {line ? <p className="mt-1 text-[11.5px] text-on-accent/80 leading-relaxed">{line}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/**
 * The day's numbers: fard, their adhkar, the rawatib — and on Home the way to
 * the full page; on the prayers page (no link) the five-prayer chain instead.
 */
function DaySums({ onOpen }: { onOpen?: () => void }) {
  const dateKey = todayKey();
  const day = usePrayerLogStore((s) => s.log[dateKey]);
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const male = useSettingsStore((s) => s.gender) === 'male';
  const streak = useMemo(() => (onOpen ? 0 : prayerStreak(log, excused).current), [onOpen, log, excused]);
  const stats = [
    { v: `${ar(fardCountOf(day))}/٥`, l: 'الفروض' },
    { v: `${ar(adhkarCountOf(day))}/٥`, l: 'أذكار الصلاة' },
    { v: `${ar(rawatibRakaatOf(day, dateKey, male))}/${ar(rawatibFullOn(dateKey, male))}`, l: 'ركعات الرواتب' },
    ...(onOpen
      ? []
      : [{ v: ar(streak), l: streak === 1 ? 'يوم متتالٍ' : streak === 2 ? 'يومان متتاليان' : streak % 100 >= 3 && streak % 100 <= 10 ? 'أيام متتالية' : 'يوماً متتالياً' }]),
  ];
  const body = (
    <>
      {stats.map((x) => (
        <span key={x.l} className="flex flex-col items-start min-w-0">
          <span className="font-counter text-[15px] font-bold tabular-nums leading-tight">{x.v}</span>
          <span className="text-[10.5px] text-on-accent/70 truncate">{x.l}</span>
        </span>
      ))}
    </>
  );
  if (!onOpen) return <div className="relative grid grid-cols-4 gap-2 px-1">{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 rounded-[var(--radius-inner)] bg-on-accent/10 px-3 py-2.5 text-start hover:bg-on-accent/15 transition-colors"
    >
      {body}
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
        الصلوات <ChevronLeft size={14} />
      </span>
    </button>
  );
}

/**
 * «الصلاة القادمة» hero (Home and the prayers page): the next prayer and its
 * countdown, the one next step for the prayer whose time is running, the day
 * as a path of five, and the day's sums. `page` drops the link to itself.
 */
export function PrayerHero({
  times,
  nextPrayer,
  page = false,
}: {
  times: PrayerTimesResult | null;
  nextPrayer: NextPrayer | null;
  page?: boolean;
}) {
  const navigate = useNavigate();
  const male = useSettingsStore((s) => s.gender) === 'male';
  const iqama = useNotificationStore((s) => s.prayerExtras.iqama);
  const nextName = nextPrayer ? prayerName(nextPrayer.name, format(nextPrayer.time, 'yyyy-MM-dd'), male) : null;
  const iqamaAt =
    nextPrayer && iqama.enabled ? new Date(nextPrayer.time.getTime() + iqamaMinutes(iqama, nextPrayer.name) * 60_000) : null;

  return (
    <Card variant="hero" className="p-4 sm:p-5 flex flex-col gap-4">
      <ArchMotif className="absolute -top-6 -start-8 w-44 opacity-[0.14]" />
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-on-accent/75">الصلاة القادمة</p>
          <p className="mt-0.5 text-[34px] font-display font-bold leading-tight">{nextName ?? 'صلوات اليوم'}</p>
          {nextPrayer ? (
            <p className="text-xs text-on-accent/75 mt-0.5 font-counter">
              الأذان {clock(nextPrayer.time)}
              {iqamaAt ? `، الإقامة ${clock(iqamaAt)}` : ''}
            </p>
          ) : null}
        </div>
        {nextPrayer ? (
          <div className="text-end shrink-0">
            <p className="text-[11px] text-on-accent/70">بعد</p>
            <p className="text-[32px] font-counter font-bold text-gold-light tabular-nums leading-none" dir="ltr">
              {ar(nextPrayer.countdown)}
            </p>
          </div>
        ) : null}
      </div>

      {times ? (
        <>
          <NowStep times={times} />
          <div className="relative pt-1 border-t border-on-accent/15">
            <PrayerPath times={times} next={nextPrayer?.name ?? null} onAccent />
          </div>
        </>
      ) : (
        <p className="relative text-xs text-on-accent/80">حدّد موقعك من الإعدادات لتظهر مواقيت الصلاة.</p>
      )}

      <DaySums onOpen={page ? undefined : () => navigate('/module/prayers')} />
    </Card>
  );
}

/** The path alone, for when the Ramadan widget takes the hero spot. */
export function PrayerStrip({ times, nextPrayer }: { times: PrayerTimesResult | null; nextPrayer: NextPrayer | null }) {
  if (!times) return null;
  return (
    <Card className="px-2 py-2.5">
      <PrayerPath times={times} next={nextPrayer?.name ?? null} onAccent={false} />
    </Card>
  );
}
