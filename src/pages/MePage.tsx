import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Award, BarChart3, BookOpen, CalendarCheck, ChevronLeft, Cloud, CloudOff, Download, Flame, Gift, GraduationCap,
  LayoutGrid, MessageCircle, Moon, MoonStar, Phone, RefreshCw, Settings, Sparkles, Star, Target, Trophy, UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import { StandingChip } from '@/components/leaderboard/LeaderboardCards';
import { GhostBars, VERDICT_ICON } from '@/components/leaderboard/RaceViz';
import { CrownMark, useMyEmblem } from '@/components/crowns/CrownEmblem';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { BadgesShowcase } from '@/components/badges/BadgesShowcase';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, Medallion, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { PalettePicker } from '@/components/settings/PalettePicker';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { useAuthStore } from '@/store/authStore';
import { useBadgeModel } from '@/services/BadgeEngine';
import { useDayScore, useLeaderboardStore, useLocalTotals } from '@/services/leaderboard';
import { raceOf, verdictOf } from '@/services/selfRace';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { openExternal } from '@/services/silatPhone';
import { BUNDLE_VERSION, checkForUpdate, promptUpdate, updatesSupported } from '@/services/appUpdate';

const ar = toArabicDigits;

type MeTab = 'overview' | 'stats' | 'account';
const TABS: { id: MeTab; label: string }[] = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'stats', label: 'إحصاءاتي' },
  { id: 'account', label: 'الحساب والتطبيق' },
];

/** Per-section statistics — each section owns its own detailed page. */
const SECTION_STATS: { label: string; to: string; Icon: LucideIcon | typeof Mosque }[] = [
  { label: 'الصلاة', to: '/stats/prayers', Icon: Mosque },
  { label: 'الأذكار', to: '/stats/dhikr', Icon: Sparkles },
  { label: 'القرآن', to: '/stats/quran', Icon: BookOpen },
  { label: 'الأوراد', to: '/stats/awrad', Icon: Target },
  { label: 'القيام', to: '/stats/qiyam', Icon: MoonStar },
  { label: 'العادات', to: '/stats/habits', Icon: Star },
  { label: 'الصيام', to: '/stats/fasting', Icon: Moon },
  { label: 'الصدقة', to: '/stats/sadaqah', Icon: Gift },
  { label: 'التعلّم', to: '/stats/learning', Icon: GraduationCap },
];

const APP_LINKS: { label: string; hint: string; Icon: LucideIcon; to: string }[] = [
  { label: 'كل الميزات', hint: 'القبلة، الأدعية، الزكاة، التقويم…', Icon: LayoutGrid, to: '/more' },
  { label: 'الإعدادات', hint: 'الإشعارات، الصلاة، الحساب', Icon: Settings, to: '/settings' },
  { label: 'التنزيلات والعمل دون إنترنت', hint: 'الأذكار الصوتية', Icon: Download, to: '/downloads' },
  { label: 'النسخ الاحتياطي', hint: 'احفظ بياناتك واستعدها', Icon: Cloud, to: '/backup' },
];

/**
 * «أنا» (owner 2026-11-19: the old page was a pile of links — «أريد إعادة تصميم
 * كاملة»): a profile, not a menu. A full-bleed header (the name inside the badge
 * level's ring), a floating strip of the four numbers that matter, then three
 * focused tabs instead of one long scroll — نظرة عامة (this week against the
 * last, the badges within reach, the vault), إحصاءاتي, الحساب والتطبيق. ?tab=
 */
export function MePage() {
  const [params, setParams] = useSearchParams();
  const tab: MeTab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as MeTab) : 'overview';

  return (
    <div className="flex flex-col pb-nav">
      <ProfileHeader />
      <div className="relative z-10 -mt-10 px-4">
        <NumbersStrip />
      </div>

      <div className="sticky z-20 px-4 pt-4 pb-2 bg-cream/90 dark:bg-dark-bg/90 backdrop-blur-md" style={{ top: 'var(--safe-top)' }}>
        <div role="tablist" aria-label="أقسام صفحتك" className="grid grid-cols-3 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}
              className={[
                'min-h-11 rounded-xl text-[13px] font-bold transition-colors duration-200',
                tab === t.id
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-secondary dark:text-text-on-dark/70 hover:text-text-primary dark:hover:text-text-on-dark',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="px-4 pt-4 flex flex-col gap-6">
        {tab === 'overview' ? <Overview /> : tab === 'stats' ? <Stats /> : <Account />}
      </div>

      <div className="px-4 pt-8">
        <AppCredit />
      </div>
    </div>
  );
}

// ── the header ─────────────────────────────────────────────────────────────

/** The name inside a ring that fills with the badge level — tap the level for the vault. */
function ProfileHeader() {
  const navigate = useNavigate();
  const userName = useSettingsStore((s) => s.userName);
  const myCrown = useMyEmblem();
  const { level } = useBadgeModel();
  const initial = (userName || 'ر').trim().charAt(0);
  const R = 50;
  const C = 2 * Math.PI * R;

  return (
    <header
      className="relative isolate overflow-hidden rounded-b-[32px] bg-[image:var(--gradient-teal)] text-on-accent px-4 pb-16 shadow-[var(--shadow-md)]"
      style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
    >
      <span className="lattice text-on-accent" aria-hidden />
      <ArchMotif className="absolute -top-6 -start-8 w-44 opacity-15" />
      <ArchMotif className="absolute -top-6 -end-8 w-44 opacity-15 -scale-x-100" />

      <div className="relative flex items-center justify-between">
        <p className="text-[12px] text-on-accent/75">رفيقك في العبادة</p>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label="الإعدادات"
          className="w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-on-accent/12 ring-1 ring-on-accent/15 hover:bg-on-accent/20 transition-colors"
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>

      <div className="relative mt-1 flex flex-col items-center text-center">
        <div className="relative w-[116px] h-[116px] grid place-items-center">
          <svg viewBox="0 0 116 116" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="58" cy="58" r={R} fill="none" strokeWidth="5" className="stroke-on-accent/15" />
            <circle
              cx="58"
              cy="58"
              r={R}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-gold-light transition-[stroke-dashoffset] duration-700 ease-out-soft motion-reduce:transition-none"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.min(100, Math.max(0, level.pct)) / 100)}
            />
          </svg>
          <Medallion size={84} tone="onAccent">
            <span className="text-[30px] font-display">{initial}</span>
          </Medallion>
        </div>
        <h1 className="mt-2.5 flex items-center justify-center gap-2 max-w-full text-[26px] font-display font-bold text-balance">
          <span className="truncate">{userName || 'أهلاً بك'}</span>
          {myCrown ? <CrownMark emblem={myCrown} size={24} onAccent counter={false} /> : null}
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/badges')}
            className="inline-flex items-center gap-1.5 rounded-full min-h-8 px-3 bg-on-accent/12 ring-1 ring-gold-light/45 text-[12px] font-bold hover:bg-on-accent/20 transition-colors"
          >
            <Award size={14} className="text-gold-light" aria-hidden />
            المستوى {ar(level.level.rank)}
          </button>
          <span className="empty:hidden flex">
            <StandingChip onAccent named />
          </span>
        </div>
      </div>
    </header>
  );
}

/** The four numbers that matter, floating on the header's edge — each opens its page. */
function NumbersStrip() {
  const navigate = useNavigate();
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const computeOverallStreak = useProgressStore((s) => s.computeOverallStreak);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const today = useLeaderboardStore((s) => s.mine.today);
  const model = useBadgeModel();

  const days = useMemo(() => {
    const month = format(new Date(), 'yyyy-MM');
    const active = Object.values(dailyProgress).filter((d) => d.modules.some((m) => m.completed));
    return { streak: computeOverallStreak(), month: active.filter((d) => d.dateKey.startsWith(month)).length };
    // computeOverallStreak reads the same store slice.
  }, [dailyProgress, computeOverallStreak]);

  const cells: { v: string; l: string; Icon: LucideIcon; tone: string; to: string }[] = [
    { v: ar(days.streak), l: 'أيام متتالية', Icon: Flame, tone: 'text-gold-dark dark:text-gold-light', to: '/stats' },
    { v: ar(days.month), l: 'يوماً هذا الشهر', Icon: CalendarCheck, tone: 'text-teal dark:text-teal-light', to: '/stats' },
    { v: ar(model.got), l: 'وساماً', Icon: Award, tone: 'text-gold-dark dark:text-gold-light', to: '/badges' },
    { v: join && today ? ar(today.rank) : '—', l: 'ترتيبك اليوم', Icon: Trophy, tone: 'text-teal dark:text-teal-light', to: '/leaderboard' },
  ];
  return (
    <Card variant="elevated" className="p-1.5">
      <div className="grid grid-cols-4">
        {cells.map(({ v, l, Icon, tone, to }, i) => (
          <HapticPressable
            key={l}
            onClick={() => navigate(to)}
            className={[
              'min-h-[76px] rounded-[var(--radius-inner)] px-1 py-2.5 flex flex-col items-center justify-center gap-0.5 hover:bg-teal/5',
              i > 0 ? 'border-s border-black/[0.05] dark:border-white/[0.06]' : '',
            ].join(' ')}
          >
            <Icon size={16} className={tone} aria-hidden />
            <span className="font-counter tabular-nums text-[21px] font-bold leading-tight text-text-primary dark:text-text-on-dark">{v}</span>
            <span className="text-[10.5px] leading-tight text-text-muted text-center">{l}</span>
          </HapticPressable>
        ))}
      </div>
    </Card>
  );
}

// ── نظرة عامة ──────────────────────────────────────────────────────────────

function Overview() {
  return (
    <>
      <WeekCard />
      <WithinReach />
      <section className="flex flex-col gap-3">
        <SectionTitle title="خزانة الأوسمة" subtitle="مستواك، وما ثبّتّه من أوسمتك" />
        <BadgesShowcase />
      </section>
    </>
  );
}

/** This week against last week, day by day — the self-race in one card. */
function WeekCard() {
  const navigate = useNavigate();
  const female = useSettingsStore((s) => s.gender) === 'female';
  const totals = useLocalTotals();
  const todayPoints = useDayScore(format(new Date(), 'yyyy-MM-dd')).total;
  const race = useMemo(() => raceOf('week', totals), [totals]);
  const v = verdictOf(race, female);
  const Icon = VERDICT_ICON[v.kind];
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="أسبوعك" subtitle="من السبت إلى اليوم، مقابل أسبوعك الماضي" />
      <Card className="p-4 flex flex-col gap-3.5" onClick={() => navigate('/leaderboard?tab=week')} pressable>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] text-text-muted">نقاط هذا الأسبوع</p>
            <p className="font-counter tabular-nums text-[34px] font-bold leading-none text-text-primary dark:text-text-on-dark">{ar(race.now)}</p>
          </div>
          <div className="text-end shrink-0">
            <p className="text-[11px] text-text-muted">اليوم</p>
            <p className="font-counter tabular-nums text-[17px] font-bold text-gold-dark dark:text-gold-light">+{ar(todayPoints)}</p>
          </div>
        </div>
        {race.days ? <GhostBars days={race.days} today={format(new Date(), 'yyyy-MM-dd')} /> : null}
        <p className="flex items-center gap-1.5 rounded-[var(--radius-inner)] bg-cream-dark/45 dark:bg-white/[0.04] px-3 py-2 text-[12.5px] font-semibold text-text-secondary dark:text-text-on-dark/85 text-pretty">
          <Icon size={15} className="shrink-0 text-gold-dark dark:text-gold-light" aria-hidden />
          {v.text}
        </p>
      </Card>
    </section>
  );
}

/** The badges closest to unlocking — the next step, not the whole catalogue. */
function WithinReach() {
  const navigate = useNavigate();
  const { nearest } = useBadgeModel();
  const shown = nearest.slice(0, 3);
  if (!shown.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="في متناولك" subtitle="أقرب الأوسمة إليك" />
      <Card className="p-1.5">
        {shown.map((it, i) => (
          <button
            key={it.badge.id}
            type="button"
            onClick={() => navigate('/badges')}
            className={[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-inner)] text-start hover:bg-teal/5',
              i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
            ].join(' ')}
          >
            <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked={false} size={42} />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{it.badge.titleAr}</span>
                <span className="shrink-0 font-counter tabular-nums text-[11.5px] text-text-muted">
                  {ar(it.current)} / {ar(it.target)}
                </span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
                <span className="block h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${Math.max(4, it.pct)}%` }} />
              </span>
            </span>
          </button>
        ))}
      </Card>
    </section>
  );
}

// ── إحصاءاتي ───────────────────────────────────────────────────────────────

function Stats() {
  const navigate = useNavigate();
  return (
    <>
      <Card variant="hero" className="p-4" onClick={() => navigate('/stats')} pressable>
        <div className="relative flex items-center gap-3.5">
          <span className="w-14 h-14 rounded-2xl bg-on-accent/12 ring-1 ring-on-accent/15 inline-flex items-center justify-center shrink-0">
            <BarChart3 size={26} aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[17px] font-display font-bold">الإحصاءات العامة</span>
            <span className="block text-[12px] text-on-accent/80 text-pretty">نبض العبادة، والاتجاهات، والمقارنات بين الفترات</span>
          </span>
          <ChevronLeft size={20} className="shrink-0 text-on-accent/70" aria-hidden />
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionTitle title="حسب الباب" subtitle="تفاصيل كل عبادة على حدة" />
        <div className="grid grid-cols-3 gap-2.5">
          {SECTION_STATS.map(({ label, to, Icon }) => (
            <HapticPressable
              key={to}
              onClick={() => navigate(to)}
              className="min-h-[92px] rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] flex flex-col items-center justify-center gap-2 hover:ring-teal/25"
            >
              <span className="w-11 h-11 rounded-2xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center">
                <Icon size={20} />
              </span>
              <span className="text-[12.5px] font-semibold text-text-primary dark:text-text-on-dark/90">{label}</span>
            </HapticPressable>
          ))}
        </div>
      </section>

      <Card className="p-1.5">
        <Row Icon={Award} gold label="سجل الإنجازات" hint="الأوسمة بالأرقام، وما اقتربت منه" onClick={() => navigate('/stats/achievements')} />
        <Row first={false} Icon={Trophy} gold label="الترتيب" hint="سباقك مع نفسك، والمتنافسون في الخير" onClick={() => navigate('/leaderboard')} />
      </Card>
    </>
  );
}

// ── الحساب والتطبيق ────────────────────────────────────────────────────────

function Account() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const who = meta.full_name || meta.name || user?.email || '';
  return (
    <>
      <section className="flex flex-col gap-3">
        <SectionTitle title="حسابك" subtitle={user ? 'بياناتك محفوظة وتتزامن بين أجهزتك' : 'بياناتك على هذا الجهاز وحده'} />
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span
              className={[
                'w-12 h-12 rounded-2xl inline-flex items-center justify-center shrink-0',
                user ? 'bg-teal/10 text-teal dark:text-teal-light' : 'bg-warning/12 text-warning',
              ].join(' ')}
            >
              {user ? <UserRound size={22} aria-hidden /> : <CloudOff size={22} aria-hidden />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{user ? who : 'غير مسجّل الدخول'}</span>
              <span className="block text-[11.5px] text-text-muted text-pretty">
                {user ? 'المزامنة السحابية تعمل' : 'سجّل الدخول لتُحفظ عبادتك وتنتقل معك إلى أي جهاز'}
              </span>
            </span>
          </div>
          <Button variant={user ? 'soft' : 'primary'} size="sm" fullWidth className="mt-3.5" onClick={() => navigate('/settings?tab=account')}>
            {user ? 'إدارة الحساب' : 'تسجيل الدخول'}
          </Button>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="المظهر" subtitle="لوحة ألوان التطبيق" />
        <PalettePicker compact />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="التطبيق" subtitle="الميزات، والإعدادات، وبياناتك" />
        <Card className="p-1.5">
          {APP_LINKS.map(({ label, hint, Icon, to }, i) => (
            <Row key={to} first={i === 0} Icon={Icon} label={label} hint={hint} onClick={() => navigate(to)} />
          ))}
        </Card>
      </section>
    </>
  );
}

/** The author's contact, shown on the credit card (owner 2026-11-19, his own choice to publish them). */
const AUTHOR_PHONE = '01146321817';
const AUTHOR_FACEBOOK = 'https://www.facebook.com/hassan2231998';

/** lucide dropped brand marks: Facebook's «f», in the current colour. */
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M13.5 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V3.9a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.3h2.8V22h3.4Z" />
    </svg>
  );
}

/** The app's name, its author and version (owner 2026-11-19: on «أنا», not in Settings) — under every tab. */
function AppCredit() {
  return (
    <Card variant="gradient-edge" className="p-5 text-center flex flex-col items-center gap-1.5">
      <Star8 size={22} className="text-gold" />
      <p className="font-ornate text-2xl text-teal dark:text-teal-light mt-1">رَفِيقِي</p>
      <p className="text-[11px] text-text-muted">رفيقك في العبادة</p>
      <div className="w-16 h-px bg-gold/40 my-2" aria-hidden />
      <p className="text-[11px] text-text-muted">تطوير وتصميم</p>
      <p className="font-display text-base font-bold text-text-primary dark:text-text-on-dark">م / حسن علي</p>
      <p className="font-counter tabular-nums text-[13px] text-text-secondary dark:text-text-on-dark/80" dir="ltr">
        {ar(AUTHOR_PHONE)}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {[
          { label: 'اتصال', href: `tel:${AUTHOR_PHONE}`, icon: <Phone size={15} aria-hidden /> },
          { label: 'واتساب', href: `https://wa.me/2${AUTHOR_PHONE}`, icon: <MessageCircle size={15} aria-hidden /> },
          { label: 'فيسبوك', href: AUTHOR_FACEBOOK, icon: <FacebookMark /> },
        ].map(({ label, href, icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => void openExternal(href)}
            className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl bg-white/70 dark:bg-white/[0.06] ring-1 ring-gold/25 text-[12.5px] font-semibold text-teal dark:text-teal-light hover:bg-teal/10 transition-colors"
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-muted mt-2" dir="ltr">v{BUNDLE_VERSION}</p>
      {updatesSupported ? <CheckUpdateButton /> : null}
    </Card>
  );
}

/** Manual update check; a found update shows the same prompt as the start-up check. */
function CheckUpdateButton() {
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const m = await checkForUpdate();
      if (m) promptUpdate(m);
      else toast.success('أنت على أحدث إصدار');
    } catch {
      toast.error('تعذّر التحقق من التحديثات', 'تأكد من اتصالك بالإنترنت');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={check} loading={busy}>
      التحقق من التحديثات
    </Button>
  );
}

/** One row of a list card (DESIGN-SYSTEM §4 «Lists»). */
function Row({
  Icon,
  label,
  hint,
  onClick,
  first = true,
  gold = false,
}: {
  Icon: LucideIcon;
  label: string;
  hint: ReactNode;
  onClick: () => void;
  first?: boolean;
  gold?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5',
        first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]',
      ].join(' ')}
    >
      <span
        className={[
          'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
          gold ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
        ].join(' ')}
      >
        <Icon size={17} aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{label}</span>
        <span className="block text-[11px] text-text-muted truncate">{hint}</span>
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" aria-hidden />
    </button>
  );
}
