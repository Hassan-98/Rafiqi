import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, addMonths, endOfMonth, format, getDaysInMonth, isValid, parseISO, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Crown, RefreshCw, Wheat } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { PERIOD_LABEL, RefreshButton, TIER_ICON, TIER_TITLE } from '@/components/leaderboard/LeaderboardCards';
import { Duel, MeBar, Podium, Rows } from '@/components/leaderboard/Contenders';
import { GaugeLegend, GhostBars, GhostLines, RaceGauge, VERDICT_ICON, WeekStrip } from '@/components/leaderboard/RaceViz';
import { PersonCrown } from '@/components/crowns/CrownEmblem';
import { CrownMoment } from '@/components/crowns/CrownMoment';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import {
  fetchRange,
  localScore,
  periodRange,
  pushScores,
  useDayScore,
  useLeaderboardStore,
  useLocalTotals,
  type LbPeriod,
  type LbRow,
} from '@/services/leaderboard';
import { useBadgeMetricsStore } from '@/services/BadgeEngine';
import { LB_RULES, type ScorePart } from '@/services/leaderboardScore';
import { harvestOf, raceOf, rangeLabel, verdictOf, type Race, type Totals } from '@/services/selfRace';
import { ARABIC_MONTHS, WEEKDAY_LABELS_AR } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const TABS: LbPeriod[] = ['today', 'yesterday', 'week', 'month'];
const TAB_LABEL: Record<LbPeriod, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر' };
const timesAr = (n: number) => (n === 1 ? 'مرة' : n === 2 ? 'مرتين' : `${ar(n)} ${n <= 10 ? 'مرات' : 'مرة'}`);
const people = (n: number) => (n === 1 ? 'مشارك واحد' : n === 2 ? 'مشاركان' : `${ar(n)} ${n <= 10 ? 'مشاركين' : 'مشاركاً'}`);
const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const ym = (d: Date) => format(d, 'yyyy-MM');
/** The app's weeks run Saturday → Friday; a week's key is its Saturday. */
const weekKey = (d: Date) => dk(startOfWeek(d, { weekStartsOn: 6 }));
type Browsable = 'week' | 'month';
const browsable = (t: LbPeriod): t is Browsable => t === 'week' || t === 'month';
/** The running week's / month's key. */
const currentKey = (t: Browsable) => (t === 'week' ? weekKey(new Date()) : ym(new Date()));

/** A finished week or month browsed in «الأسبوع» / «الشهر»: its key and «١٤ – ٢٠ نوفمبر» / «أكتوبر ٢٠٢٦». */
interface Past {
  key: string;
  label: string;
}

/** ?at= for the tab: a finished week's Saturday or a finished month ('yyyy-MM'); null = the running one. */
function pastKey(tab: LbPeriod, at: string | null): string | null {
  if (!at || !browsable(tab)) return null;
  const d = parseISO(at);
  if (!isValid(d)) return null;
  const k = tab === 'week' ? weekKey(d) : ym(d);
  return k < currentKey(tab) ? k : null;
}

/** The period's last day. */
const lastDayOf = (t: Browsable, key: string) => (t === 'week' ? addDays(parseISO(key), 6) : endOfMonth(parseISO(key)));

function labelOf(t: Browsable, key: string): string {
  const d = parseISO(key);
  if (t === 'month') return `${ARABIC_MONTHS[d.getMonth()]} ${ar(d.getFullYear())}`;
  const end = lastDayOf(t, key);
  return `${rangeLabel(d, end)}${end.getFullYear() !== new Date().getFullYear() ? ` ${ar(end.getFullYear())}` : ''}`;
}

/** «الأسبوع» / «الشهر» — for «هذا …» and «… الذي قبله». */
const unitOf = (t: LbPeriod) => (t === 'week' ? 'الأسبوع' : 'الشهر');

/**
 * «الترتيب» — two races on one page. Against yourself first (selfRace.ts:
 * yesterday, last week, last month, your record — it means something with
 * any number of people), then against the others: a duel when two compete,
 * arches and a list when more do. Today / yesterday / the week (Saturday →
 * today) / the month; no account needed (a guest identity per device, see
 * leaderboard.ts). My own points are local and work offline too.
 */
export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as LbPeriod | null;
  const tab: LbPeriod = raw && TABS.includes(raw) ? raw : 'today';
  // «الأسبوع» / «الشهر» browse back to any finished one (?at=); none = the running one.
  const at = pastKey(tab, params.get('at'));
  const past: Past | null = useMemo(() => (at && browsable(tab) ? { key: at, label: labelOf(tab, at) } : null), [tab, at]);
  /** The day the period is read up to: today, or the browsed week's / month's last day. */
  const anchor = useMemo(() => (at && browsable(tab) ? lastDayOf(tab, at) : new Date()), [tab, at]);
  const user = useAuthStore((s) => s.user);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const female = useSettingsStore((s) => s.gender) === 'female';
  const status = useLeaderboardStore((s) => s.status);
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const totals = useLocalTotals(past ? anchor : undefined);
  const race = useMemo(() => raceOf(past ? (tab === 'week' ? 'pastWeek' : 'pastMonth') : tab, totals, anchor), [tab, past, totals, anchor]);
  const [from, to] = periodRange(tab, anchor);

  useEffect(() => {
    if (!isSupabaseConfigured || !join) return;
    let live = true;
    setLoading(true);
    void (async () => {
      await pushScores(); // our own row current before reading the board
      const r = await fetchRange(from, to, 50);
      if (live) {
        setRows(r);
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [from, to, user, join, nonce]); // user: the identity changes on Google sign-in

  const me = rows?.find((r) => r.isMe) ?? null;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar
        title="الترتيب"
        subtitle="سباقٌ مع نفسك، وتنافسٌ في الخير"
        showBack
        actions={join ? <RefreshButton onDone={() => setNonce((n) => n + 1)} /> : null}
      />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        <Hero
          tab={tab}
          onTab={(t) => setParams({ tab: t }, { replace: true })}
          past={past}
          onPast={(k) => setParams(k ? { tab, at: k } : { tab }, { replace: true })}
          race={race}
          me={me}
          female={female}
        />

        {/* «المتنافسون» above «سباقك مع نفسك» (owner 2026-11-20). */}
        <Board rows={rows} loading={loading} status={status} pastIn={past ? `هذا ${unitOf(tab)}` : null} onRetry={() => setNonce((n) => n + 1)} />

        <SelfRace tab={tab} past={past} anchor={anchor} race={race} totals={totals} />

        <HarvestBanner />

        <Breakdown tab={tab} past={past} anchor={anchor} />

        <Rules />

        <Privacy />

        <CrownMoment />

        <p className="text-center text-[11.5px] leading-relaxed text-text-muted text-pretty px-2">
          «إنما الأعمال بالنيات» — الترتيب حافزٌ على المسارعة في الخير لا ميزانٌ للقبول، فأخلص نيتك لله، ومن أحبّ أن يُخفي عمله فليُخفِ اسمه.
        </p>
      </div>
    </div>
  );
}


/** The night hero: the ayah, the period, my points on the race gauge, my place, the verdict. */
function Hero({
  tab,
  onTab,
  past,
  onPast,
  race,
  me,
  female,
}: {
  tab: LbPeriod;
  onTab: (t: LbPeriod) => void;
  past: Past | null;
  onPast: (key: string | null) => void;
  race: Race;
  me: LbRow | null;
  female: boolean;
}) {
  const honors = useLeaderboardStore((s) => s.honors);
  const honorCount = useMemo(() => {
    const c = { 1: 0, 3: 0, 10: 0 };
    for (const t of Object.values(honors)) c[t]++;
    return c;
  }, [honors]);
  const v = verdictOf(race, female);
  const Icon = VERDICT_ICON[v.kind];
  return (
    <Card variant="night" className="p-4 pb-5 overflow-hidden">
      <ArchMotif className="absolute -top-4 -start-6 w-32 h-40 text-gold opacity-[0.13]" />
      <ArchMotif className="absolute -top-4 -end-6 w-32 h-40 text-gold opacity-[0.13] -scale-x-100" />
      <p className="relative font-quran text-[17px] leading-loose text-gold-light text-center">﴿وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ﴾</p>

      <div role="tablist" aria-label="فترة الترتيب" className="relative mt-3 grid grid-cols-4 rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={[
              'min-h-10 rounded-xl text-[13px] font-bold transition-colors duration-200',
              tab === t ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-glow-gold)]' : 'text-text-on-dark/70 hover:text-text-on-dark',
            ].join(' ')}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {browsable(tab) ? <PeriodNav kind={tab} pick={past?.key ?? null} onPick={onPast} /> : null}

      <div className="relative mt-3">
        <RaceGauge now={race.now} ghost={race.ghost} record={race.record?.points ?? null}>
          <span className="text-[11.5px] text-gold-light/90">
            نقاطك {past ? `في ${tab === 'week' ? 'أسبوع ' : ''}${past.label}` : PERIOD_LABEL[tab]}
          </span>
          <span className="font-counter text-[46px] font-bold leading-[1.1] text-text-on-dark tabular-nums">{ar(race.now)}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-text-on-dark/80">
            {me ? (
              <>
                المركز <b className="font-counter tabular-nums text-text-on-dark">{ar(me.rank)}</b> من {ar(me.total)}
                <PersonCrown who={me} size={16} />
              </>
            ) : past ? (
              `لا ترتيب لك في هذا ${unitOf(tab)}`
            ) : (
              'سجّل عبادتك ليُكتب لك ترتيب'
            )}
          </span>
        </RaceGauge>
      </div>
      <div className="relative -mt-3">
        <GaugeLegend ghostLabel={race.ghostLabel} ghost={race.ghost} record={race.record} />
      </div>

      <p
        className={[
          'relative mt-3.5 mx-auto w-fit max-w-full flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-pretty',
          v.kind === 'record' ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-glow-gold)]' : 'bg-white/[0.07] ring-1 ring-white/10 text-text-on-dark',
        ].join(' ')}
      >
        <Icon size={15} className={['shrink-0', v.kind === 'record' ? '' : 'text-gold-light'].join(' ')} aria-hidden />
        {v.text}
      </p>

      {honorCount[1] + honorCount[3] + honorCount[10] > 0 ? (
        <p className="relative mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-text-on-dark/70">
          {([1, 3, 10] as const)
            .filter((t) => honorCount[t] > 0)
            .map((t) => {
              const TierIcon = TIER_ICON[t];
              return (
                <span key={t} className="inline-flex items-center gap-1">
                  <TierIcon size={12} className="text-gold-light" aria-hidden />
                  {TIER_TITLE[t]} {timesAr(honorCount[t])}
                </span>
              );
            })}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * ‹ ١٤ – ٢٠ نوفمبر › / ‹ أكتوبر ٢٠٢٦ › — a week or month back or forward, or tap the
 * name for the native picker: any month of any year, or any day (→ its week).
 */
function PeriodNav({ kind, pick, onPick }: { kind: Browsable; pick: string | null; onPick: (key: string | null) => void }) {
  const current = currentKey(kind);
  const shown = pick ?? current;
  const d = parseISO(shown);
  const step = (n: number) => (kind === 'week' ? weekKey(addDays(d, 7 * n)) : ym(addMonths(d, n)));
  const go = (k: string) => onPick(k >= current ? null : k);
  const unit = unitOf(kind);
  const arrow =
    'size-10 grid place-items-center rounded-xl text-gold-light hover:bg-white/8 disabled:opacity-30 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="relative mt-2 flex items-center justify-between gap-2">
      <button type="button" className={arrow} aria-label={`${unit} السابق`} onClick={() => go(step(-1))}>
        <ChevronRight size={20} aria-hidden />
      </button>
      <label className="relative min-h-10 min-w-0 flex items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-text-on-dark hover:bg-white/8 transition-colors cursor-pointer">
        <CalendarDays size={15} className="shrink-0 text-gold-light" aria-hidden />
        <span className="truncate">{labelOf(kind, shown)}</span>
        <input
          type={kind === 'week' ? 'date' : 'month'}
          value={shown}
          max={kind === 'week' ? dk(new Date()) : current}
          onChange={(e) => e.target.value && go(kind === 'week' ? weekKey(parseISO(e.target.value)) : e.target.value)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker(); // desktop opens it only from its icon otherwise
            } catch {
              /* the tap itself opens it */
            }
          }}
          aria-label={kind === 'week' ? 'اختر يوماً من الأسبوع' : 'اختر الشهر والسنة'}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      <button type="button" className={arrow} aria-label={`${unit} التالي`} disabled={!pick} onClick={() => go(step(1))}>
        <ChevronLeft size={20} aria-hidden />
      </button>
    </div>
  );
}

const RACE_SUB: Record<LbPeriod, string> = {
  today: 'خصمك الأول: أنت بالأمس',
  yesterday: 'أمسك مقابل اليوم الذي قبله',
  week: 'هذا الأسبوع مقابل الماضي يوماً بيوم',
  month: 'هذا الشهر مقابل الماضي حتى اليوم نفسه',
};

function Tile({ label, value, sub, gold = false }: { label: string; value: number | null; sub?: string; gold?: boolean }) {
  return (
    <div
      className={[
        'min-w-0 rounded-[var(--radius-inner)] px-2.5 py-2.5 flex flex-col gap-0.5',
        gold ? 'bg-gold/10 ring-1 ring-gold/30' : 'bg-cream-dark/45 dark:bg-white/[0.04]',
      ].join(' ')}
    >
      <span className="text-[10.5px] text-text-muted truncate">{label}</span>
      <span className={['font-counter tabular-nums text-[19px] font-bold leading-tight', gold ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
        {value == null ? '—' : ar(value)}
      </span>
      {sub ? <span className="text-[10px] text-text-muted truncate">{sub}</span> : null}
    </div>
  );
}

/** «سباقك مع نفسك»: the numbers to beat and the race drawn for the period. */
function SelfRace({ tab, past, anchor, race, totals }: { tab: LbPeriod; past: Past | null; anchor: Date; race: Race; totals: Totals }) {
  const now = anchor;
  const todayKey = dk(now);
  const many = tab === 'week' || tab === 'month';
  const unit = tab === 'week' ? 'أسبوع' : tab === 'month' ? 'شهر' : 'يوم';
  const avgLabel = tab === 'week' ? 'معدّل أسابيعك' : tab === 'month' ? 'معدّل أشهرك' : 'معدّل أيامك';
  const before = `${unitOf(tab)} الذي قبله`;
  const prevLabel = past ? before : tab === 'week' ? 'الأسبوع الماضي' : tab === 'month' ? 'الشهر الماضي' : tab === 'today' ? 'أمس' : 'الذي قبله';
  // A finished one is compared whole — no «up to the same day».
  const sameUntil = past
    ? undefined
    : tab === 'week'
      ? `حتى ${WEEKDAY_LABELS_AR[now.getDay()]}: ${ar(race.ghost)}`
      : tab === 'month'
        ? `حتى يوم ${ar(now.getDate())}: ${ar(race.ghost)}`
        : undefined;

  const strip = useMemo(() => {
    if (many) return [];
    const end = tab === 'today' ? parseISO(todayKey) : subDays(parseISO(todayKey), 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(end, 6 - i);
      return { key: dk(d), label: WEEKDAY_LABELS_AR[d.getDay()], points: totals[dk(d)] ?? 0 };
    });
  }, [tab, many, totals, todayKey]);

  const lines = useMemo(() => {
    if (tab !== 'month') return null;
    const today = parseISO(todayKey);
    const s = startOfMonth(today);
    const p = subMonths(s, 1);
    const days = getDaysInMonth(s);
    return {
      days,
      now: Array.from({ length: today.getDate() }, (_, i) => totals[dk(addDays(s, i))] ?? 0),
      ghost: Array.from({ length: Math.min(days, getDaysInMonth(p)) }, (_, i) => totals[dk(addDays(p, i))] ?? 0),
    };
  }, [tab, totals, todayKey]);

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="سباقك مع نفسك" subtitle={past ? `${past.label} مقابل ${before}` : RACE_SUB[tab]} />
      <Card className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Tile label={prevLabel} value={many ? race.prevTotal : race.ghost} sub={sameUntil} />
          <Tile label={avgLabel} value={race.avg} />
          <Tile label={`أفضل ${unit}`} value={race.record?.points ?? null} sub={race.record?.label} gold />
        </div>
        {tab === 'week' && race.days ? (
          <>
            <GhostBars days={race.days} today={past ? '' : todayKey} />
            <Legend a={past ? past.label : 'هذا الأسبوع'} b={past ? before : 'الأسبوع الماضي'} />
          </>
        ) : lines ? (
          <>
            <GhostLines now={lines.now} ghost={lines.ghost} days={lines.days} />
            <Legend a={`${past ? past.label : 'هذا الشهر'} (تراكمياً)`} b={past ? before : 'الشهر الماضي'} />
          </>
        ) : (
          <WeekStrip days={strip} avg={race.avg} chosen={strip[strip.length - 1]?.key ?? ''} />
        )}
      </Card>
    </section>
  );
}

function Legend({ a, b }: { a: string; b: string }) {
  return (
    <p className="flex items-center justify-center gap-4 text-[11px] text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-3 h-2.5 rounded-sm bg-[image:var(--gradient-gold)]" />
        {a}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-3 h-2.5 rounded-sm border-[1.5px] border-dashed border-teal/60 dark:border-teal-light/55" />
        {b}
      </span>
    </p>
  );
}

/** «حصاد الأسبوع» — the door to /harvest; louder from Friday to Sunday. */
function HarvestBanner() {
  const navigate = useNavigate();
  const totals = useLocalTotals(); // up to today, whichever month the page shows
  const h = useMemo(() => harvestOf(totals), [totals]);
  const day = new Date().getDay();
  const fresh = day === 5 || day === 6 || day === 0;
  return (
    <Card variant={fresh ? 'gradient-edge' : 'plain'} className="p-1.5">
      <button
        type="button"
        onClick={() => navigate('/harvest')}
        className="relative w-full flex items-center gap-3 rounded-[var(--radius-inner)] p-2.5 text-start hover:bg-teal/5 transition-colors"
      >
        <Medallion size={46} tone="gold">
          <Wheat size={19} className="text-gold-dark dark:text-gold-light" aria-hidden />
        </Medallion>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[14px] font-bold text-text-primary dark:text-text-on-dark">{h.live ? 'حصاد أسبوعك جاهز' : 'حصاد الأسبوع الماضي'}</span>
          <span className="text-[11.5px] text-text-muted truncate">
            {h.range} · {ar(h.total)} نقطة
            {h.delta != null ? ` · ${h.delta >= 0 ? '▲' : '▼'} ${ar(Math.abs(h.delta))}٪` : ''}
          </span>
        </span>
        <ChevronLeft size={18} className="text-text-muted shrink-0" aria-hidden />
      </button>
    </Card>
  );
}

/** `pastIn`: «هذا الأسبوع» / «هذا الشهر» when a finished one is browsed. */
function Board({ rows, loading, status, pastIn, onRetry }: { rows: LbRow[] | null; loading: boolean; status: string; pastIn: string | null; onRetry: () => void }) {
  const navigate = useNavigate();
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);

  if (!isSupabaseConfigured) return null;
  if (!join) {
    return (
      <Card className="p-4 flex flex-col gap-3">
        <p className="text-sm text-text-primary dark:text-text-on-dark leading-relaxed text-pretty">
          أنت خارج الترتيب الآن، فلا تُرفع نقاطك ولا يظهر اسمك — وسباقك مع نفسك باقٍ لك هنا.
        </p>
        <Button variant="soft" fullWidth onClick={() => setJoin(true)}>
          انضم إلى الترتيب
        </Button>
      </Card>
    );
  }
  if (status === 'missing') {
    return (
      <Card className="p-4">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">الترتيب قيد التجهيز، ونقاطك محفوظة هنا حتى يُفتح.</p>
      </Card>
    );
  }
  if (status === 'signin') {
    return (
      <Card className="p-4 flex flex-col gap-3">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">
          شاركتَ في الترتيب بحسابك في جوجل من هذا الجهاز، فسجّل الدخول به ليظهر ترتيبك — حتى لا تظهر نقاطك مرتين باسمين.
        </p>
        <Button variant="soft" fullWidth onClick={() => navigate('/settings?tab=account')}>
          تسجيل الدخول
        </Button>
      </Card>
    );
  }
  if (!rows && loading) {
    return (
      <Card className="p-3 flex flex-col gap-3" aria-busy>
        <Skeleton height={140} rounded="lg" />
        <Skeleton lines={3} />
      </Card>
    );
  }
  if (!rows) {
    return (
      <Card className="p-4 flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80">تعذّر تحميل الترتيب، تحقق من اتصالك بالإنترنت.</p>
        <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>
          إعادة المحاولة
        </Button>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          illustration={
            <Medallion size={72} tone="gold">
              <Crown size={24} className="text-gold" />
            </Medallion>
          }
          title={pastIn ? `لا ترتيب في ${pastIn}` : 'لم يُسجَّل أحدٌ بعد'}
          description={
            pastIn ? 'لم تُرفع فيه نقاط أحد، وسباقك مع نفسك أدناه محسوبٌ من سجلّك.' : 'ابدأ بصلاتك أو أذكارك، وكن أول المتنافسين في هذه الفترة.'
          }
        />
      </Card>
    );
  }

  const total = rows[0].total;
  const me = rows.find((r) => r.isMe);
  const duel = rows.length === 2 && total === 2;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={duel ? 'المواجهة' : 'المتنافسون'} subtitle={duel ? 'اثنان في الميدان، والسبق لمن يبادر' : `${people(total)} في هذه الفترة`} />
      {duel ? (
        <Duel rows={rows} />
      ) : (
        <>
          <Podium rows={rows} />
          <Rows rows={rows.filter((r) => r.rank > 3)} first={rows[0].points} />
        </>
      )}
      {me && me.rank > 3 ? <MeBar me={me} above={rows.find((r) => r.rank === me.rank - 1)} /> : null}
    </section>
  );
}

/** Where my points came from — the day's parts, or the week's / the month's summed. */
function Breakdown({ tab, past, anchor }: { tab: LbPeriod; past: Past | null; anchor: Date }) {
  const [from, to] = periodRange(tab, anchor);
  const many = tab === 'week' || tab === 'month';
  const day = useDayScore(many ? to : from);
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const parts = useMemo(() => {
    if (!many) return [...day.parts].sort((a, b) => b.points - a.points);
    const sum = new Map<string, ScorePart>();
    for (let d = parseISO(from); dk(d) <= to; d = addDays(d, 1)) {
      for (const x of localScore(dk(d)).parts) {
        const had = sum.get(x.id);
        sum.set(x.id, { ...x, points: (had?.points ?? 0) + x.points });
      }
    }
    return [...sum.values()].sort((a, b) => b.points - a.points);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  }, [many, day, from, to, metrics]);
  const subtitle = past
    ? `مجموع ${tab === 'week' ? 'أسبوع ' : ''}${past.label}`
    : tab === 'today'
      ? 'تتحدّث مع كل عمل تسجّله'
      : tab === 'yesterday'
        ? 'نقاط الأمس'
        : tab === 'week'
          ? 'مجموع الأسبوع من السبت إلى اليوم'
          : 'مجموع الشهر من أوله إلى اليوم';
  const max = parts[0]?.points ?? 1;
  const all = parts.reduce((n, x) => n + x.points, 0);

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="من أين جاءت نقاطك" subtitle={subtitle} />
      {parts.length ? (
        <Card className="p-1.5">
          <ul className="flex flex-col">
            {parts.map((x) => (
              <li key={x.id} className="px-3 py-2.5 flex flex-col gap-1.5">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-text-secondary dark:text-text-on-dark/85 min-w-0 truncate">{x.label}</span>
                  <span className="shrink-0 flex items-baseline gap-1.5">
                    <span className="text-[10.5px] text-text-muted font-counter tabular-nums">{ar(Math.round((x.points / Math.max(1, all)) * 100))}٪</span>
                    <span className="font-counter tabular-nums text-[13.5px] font-bold text-gold-dark dark:text-gold-light">+{ar(x.points)}</span>
                  </span>
                </span>
                <span className="h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-teal/45 dark:bg-teal-light/45" style={{ width: `${Math.max(2, (x.points / max) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-text-muted text-pretty">لا نقاط بعد — صلاتك وأذكارك ووِردك تُكتب هنا حين تسجّلها.</p>
        </Card>
      )}
    </section>
  );
}

/** «كيف تُحتسب النقاط؟» — by section, one number a row, caps and extras under the label. */
function Rules() {
  const gender = useSettingsStore((s) => s.gender);
  return (
    <details className="group rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4">
      <summary className="cursor-pointer list-none flex items-center justify-between text-[14px] font-bold text-text-primary dark:text-text-on-dark min-h-8">
        كيف تُحتسب النقاط؟
        <span className="text-xs font-semibold text-teal dark:text-teal-light group-open:hidden">عرض</span>
      </summary>
      <p className="mt-2 text-[11.5px] text-text-muted leading-relaxed text-pretty">
        بحسب جهد العمل ومشقّته، مما تسجّله في التطبيق. ما له حدٌّ ذُكر تحته، وقيام الليل يُحسب لليلته (لمساء يومه).
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {LB_RULES.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-1 flex items-center gap-2 text-[12px] font-bold text-teal dark:text-teal-light">
              {g.title}
              <span aria-hidden className="h-px flex-1 bg-teal/15 dark:bg-teal-light/15" />
            </h3>
            <dl className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {g.rules
                .filter((r) => !r.for || !gender || r.for === gender)
                .map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="min-w-0">
                      <span className="block text-[13px] text-text-primary dark:text-text-on-dark/90">{r.label}</span>
                      {r.note ? <span className="block mt-0.5 text-[11px] leading-snug text-text-muted text-pretty">{ar(r.note)}</span> : null}
                    </dt>
                    <dd
                      dir={r.points.startsWith('+') ? 'ltr' : undefined} // «+٣», not «٣+»
                      className="shrink-0 min-w-12 rounded-full bg-gold/10 px-2.5 py-1 text-center font-counter tabular-nums text-[13px] font-bold text-gold-dark dark:text-gold-light">
                      {ar(r.points)}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}

/** «المشاركة في الترتيب» and «إخفاء اسمي» — mirrored in Settings › الحساب. */
function Privacy() {
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);
  const hide = useSettingsStore((s) => s.leaderboardHideName);
  const setHide = useSettingsStore((s) => s.setLeaderboardHideName);
  const userName = useSettingsStore((s) => s.userName);
  if (!isSupabaseConfigured) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="الخصوصية" subtitle="يُرفع مجموع نقاطك فقط، لا تفاصيل عبادتك" />
      <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">المشاركة في الترتيب</span>
            <span className="block text-[11px] text-text-muted text-pretty">إيقافها يحذف نقاطك من الترتيب</span>
          </span>
          <Toggle checked={join} onChange={setJoin} size="sm" label="المشاركة في الترتيب" hideLabel />
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">إخفاء اسمي</span>
            <span className="block text-[11px] text-text-muted text-pretty">
              {hide ? 'يراك الآخرون باسم «مجهول»' : `يظهر باسم «${userName.trim() || 'مجهول'}» — غيّره من الإعدادات`}
            </span>
          </span>
          <Toggle checked={hide} onChange={setHide} size="sm" label="إخفاء اسمي في الترتيب" hideLabel disabled={!join} />
        </div>
      </Card>
    </section>
  );
}
