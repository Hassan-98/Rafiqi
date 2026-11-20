import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import {
  BedDouble,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarHeart,
  Check,
  ChevronDown,
  ChevronLeft,
  HandCoins,
  House,
  Lightbulb,
  ListChecks,
  Moon,
  MoonStar,
  Sunrise,
  Sunset,
  SunMedium,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from '@/lib/motion';
import { Mosque } from '@/components/icons/Mosque';
import { prayerName, rakaat as rakaatAr } from '@/components/modules/PrayerDaySheet';
import { dayAttention, leftLabel, presentAttention, type AttentionAction, type AttentionIcon, type AttentionItem, type AttentionLevel } from '@/services/dayAttention';
import { collectSnapshot } from '@/services/insightsService';
import { prayerTimesOf } from '@/services/smartNotifications';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { toArabicDigits } from '@/services/statsService';
import { hapticsService } from '@/services/HapticsService';
import { usePrayerLogStore, lastDuhaRakaat } from '@/store/prayerLogStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useProgressStore } from '@/store/progressStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useMushafiStore, mushafiToday } from '@/store/mushafiStore';
import { useQuranStore } from '@/store/quranStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAttentionStore } from '@/store/attentionStore';
import { toast } from '@/store/toastStore';
import { useHouseStore } from '@/store/houseStore';
import { choreOf, type Chore } from '@/data/houseChores';
import { KindSheet, logChore } from '@/components/study/HouseView';
import type { PrayerTimesResult } from '@/types';
// Features register their attention sources here (side effects).
import '@/services/attention/plugins';

const ICON: Record<AttentionIcon, LucideIcon> = {
  prayer: Mosque as unknown as LucideIcon,
  mosque: Mosque as unknown as LucideIcon,
  morning: Sunrise,
  evening: Sunset,
  sleep: BedDouble,
  duha: SunMedium,
  qiyam: MoonStar,
  quran: BookOpen,
  awrad: Target,
  fasting: Moon,
  sadaqah: HandCoins,
  friday: CalendarHeart,
  house: House,
  season: CalendarClock,
  people: Users,
  task: ListChecks,
};

/** missed = it has passed, closing = it's running out, suggest = an open door, prep = tomorrow. */
const TONE: Record<AttentionLevel, { box: string; icon: string; kicker: string; chip: string }> = {
  missed: {
    box: 'ring-danger/25 bg-danger/[0.05] dark:bg-danger/[0.09]',
    icon: 'bg-danger/10 text-danger dark:bg-danger/20',
    kicker: 'text-danger',
    chip: 'bg-danger/10 text-danger ring-1 ring-danger/25 dark:bg-danger/20',
  },
  closing: {
    box: 'ring-gold/40 bg-gold/[0.07] dark:bg-gold/[0.1]',
    icon: 'bg-gold/15 text-gold-dark dark:text-gold-light',
    kicker: 'text-gold-dark dark:text-gold-light',
    chip: 'bg-gold/15 text-gold-dark dark:text-gold-light ring-1 ring-gold/35',
  },
  suggest: {
    box: 'ring-teal/20 bg-teal/[0.04] dark:bg-teal/[0.08]',
    icon: 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light',
    kicker: 'text-teal dark:text-teal-light',
    chip: 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light ring-1 ring-teal/25',
  },
  prep: {
    box: 'ring-text-muted/15 bg-cream-dark/40 dark:bg-dark-surface/70',
    icon: 'bg-teal/10 text-teal-dark dark:bg-teal/15 dark:text-teal-light',
    kicker: 'text-teal-dark dark:text-teal-light',
    chip: 'bg-teal/10 text-teal-dark dark:bg-teal/15 dark:text-teal-light ring-1 ring-teal/25',
  },
};

const success = (title: string, body?: string) => {
  void hapticsService.notify('success');
  toast.success(title, body);
};

function act(a: AttentionAction, male: boolean, only?: number) {
  const log = usePrayerLogStore.getState();
  if (a.kind === 'prayers') {
    const list = only == null ? a.prayers : [a.prayers[only]];
    for (const p of list) log.setPrayer(a.dateKey, p, 'fard', true);
    success(list.length === 1 ? `سُجّلت صلاة ${prayerName(list[0], a.dateKey, male)}، تقبّل الله` : 'سُجّلت صلواتك، تقبّل الله');
  } else if (a.kind === 'duha') {
    log.setDuha(a.dateKey, true, lastDuhaRakaat(log.duha));
    success('تقبّل الله ضحاك');
  } else if (a.kind === 'sunnah') {
    log.setPrayer(a.dateKey, a.prayer, a.type, true);
    success('تقبّل الله');
  } else if (a.kind === 'qiyam') {
    const q = useQiyamStore.getState();
    const last = Object.values(q.nights).sort((x, y) => y.loggedAt - x.loggedAt)[0];
    const rakaat = last?.rakaat || 2;
    const witr = last?.witr ?? true;
    q.logNight({ rakaat, witr });
    success('سُجّل قيام الليلة، تقبّل الله', `${rakaatAr(rakaat)}${witr ? ' + الوتر' : ''} — عدّلها من صفحة القيام`);
  } else if (a.kind === 'intent') {
    useAttentionStore.getState().setFastIntent(a.dateKey);
    success('نويتَ صيام الغد، تقبّل الله', 'نذكّرك بالسحور قبل الفجر بإذن الله');
  } else if (a.kind === 'run') {
    a.run();
  }
}

const chipBase = 'min-h-9 px-3 rounded-full inline-flex items-center gap-1 text-[12px] font-bold transition-transform active:scale-[0.97]';
const textBtn = 'min-h-9 px-2 text-[11.5px] font-semibold text-text-muted hover:text-text-secondary dark:hover:text-text-on-dark/80';

function Chips({ item, male, tone, onActed }: { item: AttentionItem; male: boolean; tone: (typeof TONE)[AttentionLevel]; onActed: () => void }) {
  const a = item.action;
  const [pick, setPick] = useState<Chore | null>(null);
  const done = (f: () => void) => () => {
    f();
    onActed();
  };
  if (!a) return null;
  const chip = [chipBase, tone.chip].join(' ');
  return (
    <>
      {a.kind === 'prayers'
        ? a.prayers.map((p, i) => {
            const name = prayerName(p, a.dateKey, male);
            return (
              <button key={p} type="button" onClick={done(() => act(a, male, i))} aria-label={`سجّل صلاة ${name}`} className={chip}>
                <Check size={13} strokeWidth={2.8} aria-hidden /> {name}
              </button>
            );
          })
        : null}
      {a.kind === 'prayers' && a.prayers.length >= 3 ? (
        <button type="button" onClick={done(() => act(a, male))} className={chip}>
          صلّيتها كلها
        </button>
      ) : null}
      {a.kind === 'chores'
        ? a.chores.map((id) => {
            const c = choreOf(id);
            return c ? (
              <button key={id} type="button" onClick={c.kinds ? () => setPick(c) : done(() => logChore(id))} className={chip}>
                <Check size={13} strokeWidth={2.8} aria-hidden /> {c.label}
              </button>
            ) : null;
          })
        : null}
      {a.kind !== 'prayers' && a.kind !== 'chores' ? (
        <button type="button" onClick={done(() => act(a, male))} className={chip}>
          <Check size={13} strokeWidth={2.8} aria-hidden />{' '}
          {a.kind === 'qiyam' ? 'قمتُ الليلة' : a.kind === 'intent' ? 'سأصومه بإذن الله' : a.kind === 'run' ? a.label : 'صلّيتُها'}
        </button>
      ) : null}
      {a.kind === 'chores' ? (
        <KindSheet
          chore={pick}
          onClose={() => setPick(null)}
          onPick={(kind, meal) => {
            if (pick) logChore(pick.id, kind, meal);
            setPick(null);
            onActed();
          }}
        />
      ) : null}
    </>
  );
}

/** One item: `focus` is the «الآن» one (larger, its «لماذا؟» open); the rest are compact. */
function Row({ item, male, focus = false, onActed }: { item: AttentionItem; male: boolean; focus?: boolean; onActed: () => void }) {
  const navigate = useNavigate();
  const dismiss = useAttentionStore((s) => s.dismiss);
  const mute = useAttentionStore((s) => s.mute);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const tone = TONE[item.level];
  const Icon = ICON[item.icon] ?? CalendarHeart;
  const left = item.deadline ? item.deadline.getTime() - Date.now() : null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const showWhy = !!item.why && (focus || whyOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={['rounded-[var(--radius-card)] ring-1 flex', focus ? 'p-3.5 gap-3 shadow-sm' : 'p-2.5 gap-2.5', tone.box].join(' ')}
    >
      <span className={['rounded-xl inline-flex items-center justify-center shrink-0', focus ? 'w-11 h-11' : 'w-9 h-9', tone.icon].join(' ')}>
        <Icon size={focus ? 20 : 16} strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 min-w-0">
          {focus ? <span className={['shrink-0 rounded-full px-2 py-px text-[10.5px] font-bold', tone.chip].join(' ')}>الآن</span> : null}
          <span className={['min-w-0 truncate text-[11px] font-bold', tone.kicker].join(' ')}>{item.kicker}</span>
          {!focus && left != null && left > 0 ? (
            <span className="ms-auto shrink-0 text-[10.5px] font-counter font-semibold tabular-nums text-text-muted">بقي {leftLabel(left)}</span>
          ) : null}
        </p>
        <button type="button" onClick={() => navigate(item.to)} className="mt-0.5 w-full text-start flex items-start gap-1">
          <span className="min-w-0 flex-1">
            <span className={['block font-bold leading-snug text-text-primary dark:text-text-on-dark [overflow-wrap:anywhere]', focus ? 'text-[15.5px]' : 'text-[13.5px]'].join(' ')}>
              {item.title}
            </span>
            <span
              className={[
                // line-clamp sets its own display: no `block` here, or the clamp is lost.
                'mt-0.5 leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty',
                focus ? 'text-[12.5px] line-clamp-2' : 'text-[11.5px] line-clamp-1',
              ].join(' ')}
            >
              {item.body}
            </span>
          </span>
          <ChevronLeft size={15} className="mt-1 shrink-0 text-text-muted" aria-hidden />
        </button>

        {showWhy ? (
          <p id={whyId} className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-text-muted text-pretty">
            <Lightbulb size={12} className="mt-0.5 shrink-0 text-gold-dark dark:text-gold-light" aria-hidden />
            <span>
              <span className="sr-only">لماذا؟ </span>
              {item.why}
            </span>
          </p>
        ) : null}

        <div className={['flex flex-wrap items-center gap-1.5', focus ? 'mt-2.5' : 'mt-1.5'].join(' ')}>
          <Chips item={item} male={male} tone={tone} onActed={onActed} />
          <span className="ms-auto inline-flex items-center">
            {!focus && item.why ? (
              <button type="button" onClick={() => setWhyOpen((v) => !v)} aria-expanded={whyOpen} aria-controls={whyId} className={textBtn}>
                لماذا؟
              </button>
            ) : null}
            <button type="button" onClick={() => dismiss(item.id, today)} className={textBtn}>
              {item.habit === 'kahf' ? 'قرأتُها' : 'ليس الآن'}
            </button>
            {item.habit ? (
              <button
                type="button"
                onClick={() => {
                  mute(item.habit!);
                  toast.info(item.habit === 'house' ? 'لن نذكّرك بمهام المنزل' : 'لن نقترحها عليك', 'تعيدها من الإعدادات ← التنبيهات ← رفيقك اليومي');
                }}
                className={textBtn}
              >
                {item.habit === 'house' ? 'لا تذكّرني' : 'لا تقترحها'}
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <p className="px-1 pt-1 text-[11px] font-bold text-text-muted">{children}</p>;
}

/** Beyond the focus, this many rows show before «و٣ أخرى». */
const VISIBLE = 3;
const moreLabel = (n: number) => (n === 1 ? 'وواحدة أخرى' : n === 2 ? 'واثنتان أخريان' : `و${toArabicDigits(n)} أخرى`);

/**
 * «يحتاج انتباهك» — ONE «الآن» focus, then «قبل أن يفوت» (today) and
 * «استعدّ للغد», each with its «لماذا؟» (services/dayAttention.ts). Renders
 * nothing when all is well.
 */
export function AttentionCard({ times }: { times: PrayerTimesResult | null }) {
  const log = usePrayerLogStore((s) => s.log);
  const excused = usePrayerLogStore((s) => s.excused);
  const duha = usePrayerLogStore((s) => s.duha);
  const nights = useQiyamStore((s) => s.nights);
  const events = useActivityLogStore((s) => s.events);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const targets = useTargetsStore((s) => s.targets);
  const sadaqah = useSadaqahStore((s) => s.entries);
  const linked = useMushafiStore((s) => !!s.code);
  const days = useMushafiStore((s) => s.days);
  const khatmas = useMushafiStore((s) => s.khatmas);
  const marks = useMushafiStore((s) => s.marks);
  const wird = useQuranStore((s) => s.wird);
  const fallback = useSettingsStore((s) => s.quranDailyTarget);
  const gender = useSettingsStore((s) => s.gender);
  const male = gender === 'male';
  const house = useHouseStore((s) => s.entries);
  const dismissed = useAttentionStore((s) => s.dismissed);
  const muted = useAttentionStore((s) => s.muted);
  const fastIntent = useAttentionStore((s) => s.fastIntent);
  const hijriOffset = useCalendarPrefs((s) => s.hijriOffset);
  // A source's chip changes a store the card doesn't watch: refresh after any tap.
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Home re-renders every second (the prayer countdown); the list follows the minute.
  const minute = Math.floor(Date.now() / 60_000);

  const items = useMemo(() => {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const q = linked ? mushafiToday(days, khatmas, marks, today, wird?.unit === 'page' ? wird.amount : fallback) : null;
    return dayAttention({
      snap: collectSnapshot(),
      now,
      times,
      timesOf: prayerTimesOf,
      gender,
      quranOwe: q && (q.live.length || wird) ? q.owe : null,
      pagesToday: days[today] ?? [],
      muted,
      hidden: Object.keys(dismissed).filter((k) => dismissed[k] === today),
      hijriOffset,
      fastIntent,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store slices are the change triggers; the engine reads a fresh snapshot
  }, [minute, tick, times, log, excused, duha, nights, events, dailyProgress, targets, sadaqah, linked, days, khatmas, marks, wird, fallback, gender, house, dismissed, muted, fastIntent, hijriOffset]);

  if (items.length === 0) return null;
  const { focus, today, tomorrow } = presentAttention(items);
  const rest = [...today, ...tomorrow];
  const shown = expanded ? rest : rest.slice(0, VISIBLE);
  const hiddenCount = rest.length - shown.length;
  const shownToday = shown.filter((i) => i.level !== 'prep');
  const shownTomorrow = shown.filter((i) => i.level === 'prep');
  const refresh = () => setTick((n) => n + 1);
  const urgent = focus && (focus.level === 'missed' || focus.level === 'closing');

  return (
    <section aria-label="يحتاج انتباهك" className="flex flex-col gap-2">
      {urgent ? (
        <p className="inline-flex items-center gap-1.5 px-1 text-[12px] font-bold text-text-secondary dark:text-text-on-dark/80">
          <BellRing size={14} className="text-gold-dark dark:text-gold-light" aria-hidden />
          يحتاج انتباهك
        </p>
      ) : null}
      {focus ? <Row item={focus} male={male} focus onActed={refresh} /> : null}
      {shownToday.length ? (
        <>
          <GroupLabel>قبل أن يفوت</GroupLabel>
          {shownToday.map((it) => (
            <Row key={it.id} item={it} male={male} onActed={refresh} />
          ))}
        </>
      ) : null}
      {shownTomorrow.length ? (
        <>
          <GroupLabel>استعدّ للغد</GroupLabel>
          {shownTomorrow.map((it) => (
            <Row key={it.id} item={it} male={male} onActed={refresh} />
          ))}
        </>
      ) : null}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="self-start min-h-9 px-2 inline-flex items-center gap-1 text-[12px] font-bold text-teal dark:text-teal-light"
        >
          {moreLabel(hiddenCount)}
          <ChevronDown size={14} aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
