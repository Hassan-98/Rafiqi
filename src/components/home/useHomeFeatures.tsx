import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { format, parseISO } from 'date-fns';
import { Sunrise, Sunset, Star, MoonStar, BookOpen, Target, BedDouble, Check, Flame, SunMedium } from 'lucide-react';
import { morningAdhkar, eveningAdhkar, postPrayerAdhkar, briefAdhkar } from '@/data/adhkar';
import { useDhikrSessionStore, freshSession } from '@/store/dhikrSessionStore';
import { SLEEP_ADHKAR } from '@/components/adhkar/adhkarSets';
import { postPrayerItems, postPrayerSetId, prayerForAdhkar } from '@/components/adhkar/postPrayer';
import { useProgressStore, frozenDays } from '@/store/progressStore';
import { useQiyamStore, qiyamNightKey, qiyamLabel } from '@/store/qiyamStore';
import { usePrayerLogStore, dayStreak, duhaRakaatOf, duhaWindow, lastDuhaRakaat } from '@/store/prayerLogStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useQuranStore } from '@/store/quranStore';
import { useSettingsStore } from '@/store/settingsStore';
import { mushafiToday, useMushafiStore } from '@/store/mushafiStore';
import { openMushafi } from '@/services/mushafi';
import { QURAN_TYPES } from '@/data/quranTypes';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { computeStreakFromActiveDates } from '@/services/statsService';
import { arCount } from '@/services/insightsService';
import { hapticsService } from '@/services/HapticsService';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { DhikrItem, PrayerName, PrayerTimesResult } from '@/types';
import type { FeatureView } from './FeatureCard';
import type { DaySlot, HomeFeature } from './dayTime';

const ar = toArabicDigits;
const time = (d: Date) => ar(formatPrayerTime(d));
const PRAYER_AR: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

// ── الأذكار ────────────────────────────────────────────────────────────────
type SetId = 'morning' | 'evening' | 'postPrayer';
const SETS: Record<SetId, { label: string; short: string; items: DhikrItem[]; Icon: typeof Sunrise }> = {
  morning: { label: 'أذكار الصباح', short: 'الصباح', items: morningAdhkar, Icon: Sunrise },
  evening: { label: 'أذكار المساء', short: 'المساء', items: eveningAdhkar, Icon: Sunset },
  postPrayer: { label: 'أذكار بعد الصلاة', short: 'بعد الصلاة', items: postPrayerAdhkar, Icon: Star },
};

/** A fard prayer whose time passed within the last 30 minutes. */
function justPrayed(times: PrayerTimesResult | null, now: Date): PrayerName | null {
  if (!times) return null;
  for (const p of ['isha', 'maghrib', 'asr', 'dhuhr', 'fajr'] as PrayerName[]) {
    const dt = now.getTime() - times[p].getTime();
    if (dt >= 0 && dt < 30 * 60_000) return p;
  }
  return null;
}

function useAdhkarView(slot: DaySlot, times: PrayerTimesResult | null): FeatureView {
  const navigate = useNavigate();
  const sessions = useDhikrSessionStore((s) => s.sessions);
  const brief = useSettingsStore((s) => s.adhkarBrief);
  const now = new Date();
  const recent = justPrayed(times, now);
  // أذكار ما بعد الصلاة are per prayer: the one that just passed, done once
  // its reading is finished or it is ticked on the prayer log.
  const after = times ? prayerForAdhkar(now, times) : null;
  const afterSaid = usePrayerLogStore((s) => (after ? !!s.log[after.dateKey]?.[after.prayer]?.adhkar : false));
  const sessionId = (id: SetId) => (id === 'postPrayer' && after ? postPrayerSetId(after.prayer) : id);

  const progress = useMemo(() => {
    const out = {} as Record<SetId, { done: number; total: number }>;
    for (const id of Object.keys(SETS) as SetId[]) {
      const items =
        id === 'postPrayer' && after ? postPrayerItems(after.prayer, SETS[id].items) : briefAdhkar(SETS[id].items, brief && id !== 'postPrayer');
      const session = freshSession(sessions[sessionId(id)]);
      const total = items.length;
      const done = items.filter((it) => (session.counts[it.id] ?? 0) >= it.count || session.skipped[it.id]).length;
      out[id] = { total, done: id === 'postPrayer' && afterSaid ? total : done };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, brief, after?.prayer, afterSaid]);
  const isDone = (id: SetId) => progress[id].total > 0 && progress[id].done >= progress[id].total;

  // Which set belongs to "now": right after a prayer → its adhkar; otherwise
  // morning after Fajr, evening after Asr (and until midnight if unfinished),
  // and the sleep adhkar late at night.
  let set: SetId | 'sleep';
  if (recent && !isDone('postPrayer') && slot !== 'morning' && slot !== 'evening') set = 'postPrayer';
  else if (slot === 'morning') set = 'morning';
  else if (slot === 'evening') set = 'evening';
  else if (slot === 'midday') set = isDone('morning') ? 'postPrayer' : 'morning';
  else set = now.getHours() >= 12 && !isDone('evening') ? 'evening' : 'sleep';

  const open = (id: SetId) => navigate(`/adhkar?set=${sessionId(id)}`);

  const chips = (
    <div className="flex gap-1.5">
      {(Object.keys(SETS) as SetId[]).map((id) => {
        const p = progress[id];
        const done = isDone(id);
        const { Icon } = SETS[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => open(id)}
            aria-label={`${SETS[id].label}: ${ar(p.done)} من ${ar(p.total)}`}
            className={[
              'flex-1 min-w-0 inline-flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors',
              done
                ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                : id === set
                  ? 'bg-teal/12 text-teal dark:text-teal-light ring-1 ring-teal/25'
                  : 'bg-white/70 dark:bg-dark-bg/50 text-text-secondary dark:text-text-on-dark/75',
            ].join(' ')}
          >
            {done ? <Check size={12} strokeWidth={2.6} /> : <Icon size={12} />}
            <span className="truncate">{id === 'postPrayer' && after ? `بعد ${PRAYER_AR[after.prayer].replace('ال', '')}` : SETS[id].short}</span>
            {!done && p.done > 0 ? (
              <span className="font-counter opacity-75">{ar(Math.round((p.done / p.total) * 100))}٪</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  if (set === 'sleep') {
    const sleepSession = freshSession(sessions.sleep);
    const sleepDone = SLEEP_ADHKAR.filter(
      (it) => (sleepSession.counts[it.id] ?? 0) >= it.count || sleepSession.skipped[it.id],
    ).length;
    const sleepPct = (sleepDone / SLEEP_ADHKAR.length) * 100;
    return {
      key: 'adhkar',
      Icon: BedDouble,
      title: 'أذكار النوم',
      kicker: 'قبل أن تنام',
      status: 'اختم يومك بذكر الله، ونَم على طهارة',
      pct: sleepPct,
      done: sleepDone >= SLEEP_ADHKAR.length,
      cta: sleepDone > 0 ? 'تابع أذكار النوم' : 'ابدأ أذكار النوم',
      onOpen: () => navigate('/adhkar?set=sleep'),
      extra: chips,
    };
  }

  const p = progress[set];
  const done = isDone(set);
  const pct = p.total ? (p.done / p.total) * 100 : 0;
  const kicker =
    set === 'postPrayer'
      ? after
        ? `بعد صلاة ${PRAYER_AR[after.prayer]}`
        : 'بعد الصلاة'
      : set === 'morning'
        ? 'وقتها الآن · بعد الفجر'
        : 'وقتها الآن · بعد العصر';
  return {
    key: 'adhkar',
    Icon: SETS[set].Icon,
    title: set === 'postPrayer' && after ? `أذكار بعد ${PRAYER_AR[after.prayer]}` : SETS[set].label,
    kicker,
    status: done
      ? 'أتممتها اليوم، تقبّل الله منك'
      : p.done > 0
        ? `أتممت ${ar(p.done)} من ${ar(p.total)} ذكراً`
        : `${ar(p.total)} ذكراً · لم تبدأ بعد`,
    pct,
    done,
    cta: done ? 'اقرأها مرة أخرى' : p.done > 0 ? 'تابع من حيث توقفت' : 'ابدأ الأذكار',
    onOpen: () => open(set),
    extra: chips,
  };
}

// ── قيام الليل ─────────────────────────────────────────────────────────────
/** Maghrib of the night's evening → next Fajr, and the start of the last third
 *  (same computation as QiyamModule). */
function useNightWindow(nightKey: string) {
  const coords = useSettingsStore((s) => s.coords);
  const method = useSettingsStore((s) => s.prayerMethod);
  const school = useSettingsStore((s) => s.madhabSchool);
  return useMemo(() => {
    if (!coords) return null;
    try {
      const evening = parseISO(`${nightKey}T12:00:00`);
      const morning = new Date(evening.getTime() + 24 * 3600 * 1000);
      const maghrib = prayerTimeService.getTimes(coords, evening, method, school).maghrib;
      const fajr = prayerTimeService.getTimes(coords, morning, method, school).fajr;
      const lastThird = new Date(fajr.getTime() - (fajr.getTime() - maghrib.getTime()) / 3);
      return { maghrib, fajr, lastThird };
    } catch {
      return null;
    }
  }, [coords, method, school, nightKey]);
}

const nightsAr = (n: number) => arCount(n, 'ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة');

function useQiyamView(): FeatureView {
  const navigate = useNavigate();
  const nights = useQiyamStore((s) => s.nights);
  const freezes = useProgressStore((s) => s.freezesUsed);
  const logNight = useQiyamStore((s) => s.logNight);
  const nightKey = qiyamNightKey();
  const tonight = nights[nightKey];
  const win = useNightWindow(nightKey);
  const now = Date.now();

  const { streak, last } = useMemo(() => {
    const all = Object.values(nights);
    return {
      // Night keys are evening dates, so "today" for the streak is tonight's key.
      streak: computeStreakFromActiveDates(all.map((n) => n.nightKey).sort(), parseISO(`${nightKey}T12:00:00`), frozenDays('qiyam', freezes)).current,
      last: all.sort((a, b) => b.loggedAt - a.loggedAt)[0],
    };
  }, [nights, nightKey, freezes]);

  const inNight = win ? now >= win.maghrib.getTime() && now < win.fajr.getTime() : false;
  const inLastThird = win ? now >= win.lastThird.getTime() && now < win.fajr.getTime() : false;
  const nightOver = win ? now >= win.fajr.getTime() : false;

  let status: string;
  if (tonight) status = `${qiyamLabel(tonight, ar)} · تقبّل الله قيامك`;
  else if (inLastThird) status = 'أنت الآن في الثلث الأخير — وقت النزول الإلهي';
  else if (nightOver) status = 'الليلة القادمة فرصة جديدة للوقوف بين يدي الله';
  else if (win) status = `يبدأ الثلث الأخير ${time(win.lastThird)}`;
  else status = '«أفضل الصلاة بعد الفريضة صلاة الليل»';

  const quickLog = () => {
    const rakaat = last?.rakaat || 8;
    const witr = last?.witr ?? true;
    logNight({ rakaat, witr });
    void hapticsService.notify('success');
    toast.success('سُجّل قيام الليلة، تقبّل الله', `${ar(rakaat)} ركعات${witr ? ' + الوتر' : ''} — عدّلها من صفحة القيام`);
  };

  const extra = win ? (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'المغرب', t: win.maghrib, hi: false },
          { label: 'الثلث الأخير', t: win.lastThird, hi: true },
          { label: 'الفجر', t: win.fajr, hi: false },
        ].map((w) => (
          <div
            key={w.label}
            className={[
              'rounded-[var(--radius-inner)] py-2',
              w.hi
                ? inLastThird
                  ? 'bg-gold/25 ring-1 ring-gold/50 text-gold-light'
                  : 'bg-gold/12 text-gold-light'
                : 'bg-white/[0.06] text-text-on-dark/80',
            ].join(' ')}
          >
            <p className="text-[10.5px] font-semibold">{w.label}</p>
            <p className="mt-0.5 text-sm font-counter font-bold tabular-nums">{time(w.t)}</p>
          </div>
        ))}
      </div>
      {streak > 0 ? (
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-text-on-dark/70">
          <Flame size={12} className="text-gold-light" />
          سلسلتك {nightsAr(streak)} متتالية — لا تقطعها
        </p>
      ) : null}
    </div>
  ) : undefined;

  return {
    key: 'qiyam',
    Icon: MoonStar,
    title: tonight ? 'قُمت الليلة' : 'قيام الليل',
    kicker: inLastThird ? 'الثلث الأخير الآن' : 'الليلة',
    status,
    pct: tonight ? 100 : 0,
    done: !!tonight,
    // Before noon the "night" is last night; once Fajr is in there's nothing
    // left to do on it, so it must not hold the spotlight.
    idle: !tonight && nightOver,
    cta: tonight ? 'عرض قيام الليلة' : 'افتح صفحة القيام',
    onOpen: () => navigate('/targets?tab=qiyam'),
    secondary: !tonight && inNight ? { label: 'سجّل قيامي', onClick: quickLog, Icon: Check } : undefined,
    extra,
    night: true,
  };
}

// ── صلاة الضحى ─────────────────────────────────────────────────────────────
function useDuhaView(times: PrayerTimesResult | null): FeatureView {
  const navigate = useNavigate();
  const duha = usePrayerLogStore((s) => s.duha);
  const excused = usePrayerLogStore((s) => s.excused);
  const today = format(new Date(), 'yyyy-MM-dd');
  const rakaat = duhaRakaatOf(duha[today]);
  const done = rakaat > 0;
  const win = times ? duhaWindow(times) : null;
  const now = Date.now();
  const inTime = !!win && now >= win.start.getTime() && now < win.end.getTime();
  const over = !!win && now >= win.end.getTime();
  const streak = useMemo(() => dayStreak(Object.keys(duha), excused).current, [duha, excused]);

  const quickLog = () => {
    const n = lastDuhaRakaat(duha);
    usePrayerLogStore.getState().setDuha(today, true, n);
    void hapticsService.notify('success');
    toast.success('تقبّل الله ضحاك', `${ar(n)} ركعات — غيّرها من صفحة الصلاة`);
  };

  let status: string;
  if (done) status = `${ar(rakaat)} ركعات · صدقةٌ عن كل مَفصِل فيك`;
  else if (inTime && win) status = `وقتها الآن حتى ${time(win.end)} · أفضله نحو ${time(win.best)}`;
  else if (win && !over) status = `تبدأ ${time(win.start)} · أفضل وقتها نحو ${time(win.best)}`;
  else status = '«ويُجزئ من ذلك ركعتان يركعهما من الضحى»';

  const extra =
    win || streak > 0 ? (
      <div className="flex flex-col gap-2.5">
        {win ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'تبدأ', t: win.start, hi: false },
              { label: 'أفضل وقتها', t: win.best, hi: true },
              { label: 'تنتهي', t: win.end, hi: false },
            ].map((w) => (
              <div
                key={w.label}
                className={[
                  'rounded-[var(--radius-inner)] py-2',
                  w.hi ? 'bg-gold/15 text-gold-dark dark:text-gold-light ring-1 ring-gold/30' : 'bg-white/70 dark:bg-dark-bg/50 text-text-secondary dark:text-text-on-dark/80',
                ].join(' ')}
              >
                <p className="text-[10.5px] font-semibold">{w.label}</p>
                <p className="mt-0.5 text-sm font-counter font-bold tabular-nums">{time(w.t)}</p>
              </div>
            ))}
          </div>
        ) : null}
        {streak > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-[11.5px] text-text-secondary dark:text-text-on-dark/70">
            <Flame size={12} className="text-gold-dark dark:text-gold-light" />
            سلسلة الضحى {arCount(streak, 'يوم واحد', 'يومان', 'أيام', 'يوماً')} — «لا يحافظ عليها إلا أوّاب»
          </p>
        ) : null}
      </div>
    ) : undefined;

  return {
    key: 'duha',
    Icon: SunMedium,
    title: done ? 'صلّيت الضحى' : 'صلاة الضحى',
    kicker: inTime ? 'وقتها الآن' : 'نافلة النهار',
    status,
    pct: done ? 100 : 0,
    done,
    // Only worth the spotlight inside its window.
    idle: !done && !inTime,
    cta: done ? 'عرض صلوات اليوم' : 'افتح صفحة الصلاة',
    onOpen: () => navigate('/module/prayers'),
    secondary: !done && inTime ? { label: 'صلّيتها', onClick: quickLog, Icon: Check } : undefined,
    extra,
  };
}

// ── الأوراد ────────────────────────────────────────────────────────────────
function useAwradView(): FeatureView {
  const navigate = useNavigate();
  const targets = useTargetsStore((s) => s.targets);
  const active = useMemo(() => targets.filter((t) => !t.completedAt), [targets]);

  if (active.length === 0) {
    return {
      key: 'awrad',
      Icon: Target,
      title: 'الأوراد',
      kicker: 'وِردك',
      status: 'أنشئ وِردك الأول من الذكر أو القرآن وتابع تقدّمك',
      pct: 0,
      done: false,
      idle: true,
      cta: 'أنشئ وِرداً',
      onOpen: () => navigate('/targets'),
    };
  }

  const doneCount = active.filter((t) => t.current >= t.total).length;
  const pct = (active.reduce((s, t) => s + Math.min(1, t.total ? t.current / t.total : 0), 0) / active.length) * 100;
  const done = doneCount >= active.length;
  const remaining = active.filter((t) => t.current < t.total);
  const top = [...remaining, ...active.filter((t) => t.current >= t.total)].slice(0, 3);

  const extra = (
    <div className="flex flex-col gap-1.5">
      {top.map((t) => {
        const r = t.total ? Math.min(1, t.current / t.total) : 0;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`/targets/${t.id}`)}
            className="flex items-center gap-3 rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-bg/50 px-3 py-2 text-start"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark truncate">{t.title}</span>
              <span className="mt-1 block h-1.5 rounded-full bg-cream-dark dark:bg-dark-surface overflow-hidden">
                <span
                  className={['block h-full rounded-full', r >= 1 ? 'bg-gold' : 'bg-teal'].join(' ')}
                  style={{ width: `${Math.round(r * 100)}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-counter tabular-nums text-text-muted">
              {ar(Math.min(t.current, t.total))}/{ar(t.total)}
            </span>
          </button>
        );
      })}
    </div>
  );

  return {
    key: 'awrad',
    Icon: Target,
    title: 'أورادك اليوم',
    kicker: 'وِردك',
    status: done
      ? `أتممت أورادك كلها (${ar(active.length)})، بارك الله فيك`
      : `${ar(doneCount)} من ${ar(active.length)} مكتملة · التالي: ${remaining[0].title}`,
    pct,
    done,
    cta: done ? 'عرض الأوراد' : 'تابع وِردك',
    onOpen: () => (remaining.length === 1 ? navigate(`/targets/${remaining[0].id}`) : navigate('/targets')),
    extra,
  };
}

// ── القرآن ─────────────────────────────────────────────────────────────────
function useQuranView(): FeatureView {
  const linked = useMushafiStore((s) => !!s.code);
  const days = useMushafiStore((s) => s.days);
  const khatmas = useMushafiStore((s) => s.khatmas);
  const marks = useMushafiStore((s) => s.marks);
  const fallback = useSettingsStore((s) => s.quranDailyTarget);
  const wird = useQuranStore((s) => s.wird);
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const t = useMemo(
    () => mushafiToday(days, khatmas, marks, today, wird?.unit === 'page' ? wird.amount : fallback),
    [days, khatmas, marks, today, wird, fallback],
  );

  // The Quran is read in «مصحفي»; its sync brings the wird back here.
  if (!linked) {
    return {
      key: 'quran',
      Icon: BookOpen,
      title: 'القرآن الكريم',
      kicker: 'وقت التلاوة',
      status: 'اربط مصحفي ليصل وردك وختماتك هنا',
      pct: 0,
      done: false,
      idle: true,
      cta: 'اربط مصحفي',
      onOpen: () => navigate('/quran'),
    };
  }

  const done = t.owe === 0;
  const owing = t.live.filter((x) => x.owe > 0);
  const lead = owing[0] ?? t.live[0];
  const pages = (n: number) => (n === 1 ? 'صفحة' : n === 2 ? 'صفحتان' : n <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`);
  // Several khatmas: what EACH still owes — the sum belongs to none of them.
  const typeCount = (ty: string) => t.live.filter((x) => x.type === ty).length;
  const each = owing.map((x) => `${typeCount(x.type) > 1 ? x.name : QURAN_TYPES[x.type].label} ${ar(x.owe)}`).join('، ');
  return {
    key: 'quran',
    Icon: BookOpen,
    title: 'وِرد القرآن',
    kicker:
      t.live.length === 1
        ? `«${t.live[0].name}»، ${QURAN_TYPES[t.live[0].type].label}`
        : t.live.length === 2
          ? 'ختمتان جاريتان'
          : t.live.length > 2
            ? `${ar(t.live.length)} ختمات جارية`
            : 'وقت التلاوة',
    status: done
      ? 'أتممت وردك اليوم، بارك الله فيك'
      : t.live.length > 1
        ? `بقي ${each} ص`
        : t.late
          ? `بقي ${pages(t.owe)}، منها ${ar(t.late)} فاتتك`
          : `بقي ${pages(t.owe)} من ${ar(t.goal)}`,
    pct: Math.round((t.achieved / t.goal) * 100),
    done,
    cta: done ? 'افتح مصحفي' : t.achieved > 0 ? 'أكمل وردك' : 'اقرأ وردك',
    onOpen: () => void openMushafi(done ? undefined : lead?.next),
  };
}

/** Live views for the four star features (prayers have their own hero). */
export function useHomeFeatures(slot: DaySlot, times: PrayerTimesResult | null): Record<HomeFeature, FeatureView> {
  return {
    adhkar: useAdhkarView(slot, times),
    duha: useDuhaView(times),
    qiyam: useQiyamView(),
    awrad: useAwradView(),
    quran: useQuranView(),
  };
}
