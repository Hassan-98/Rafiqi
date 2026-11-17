import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart3, Flame, CalendarCheck, Award, ChevronLeft, Settings, Cloud, Star, LayoutGrid,
  Sparkles, BookOpen, MoonStar, Target, Moon, Gift, GraduationCap, Download, Trophy,
} from 'lucide-react';
import { StandingChip } from '@/components/leaderboard/LeaderboardCards';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { useSettingsStore } from '@/store/settingsStore';
import { PalettePicker } from '@/components/settings/PalettePicker';
import { useProgressStore } from '@/store/progressStore';
import { useBadgeStore } from '@/store/badgeStore';
import { badgesFor, unlockedCount } from '@/data/badges';
import { BadgesShowcase } from '@/components/badges/BadgesShowcase';
import { toArabicDigits } from '@/utils/arabicFormat';
import { format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

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


/**
 * «أنا» — the personal tab: who you are in numbers, the general + per-section
 * statistics, habits and badges, and every setting / secondary feature.
 */
export function MePage() {
  const navigate = useNavigate();
  const userName = useSettingsStore((s) => s.userName);
  const gender = useSettingsStore((s) => s.gender);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const computeOverallStreak = useProgressStore((s) => s.computeOverallStreak);
  const unlocked = useBadgeStore((s) => s.unlocked);

  const numbers = useMemo(() => {
    const monthPrefix = format(new Date(), 'yyyy-MM');
    const active = Object.values(dailyProgress).filter((d) => d.modules.some((m) => m.completed));
    return {
      streak: computeOverallStreak(),
      monthDays: active.filter((d) => d.dateKey.startsWith(monthPrefix)).length,
      totalDays: active.length,
    };
    // computeOverallStreak reads the same store slice.
  }, [dailyProgress, computeOverallStreak]);

  const initial = (userName || 'ر').trim().charAt(0);

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      {/* ── Identity hero ─────────────────────────────────── */}
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-4 -start-6 w-40 opacity-15" />
        <div className="flex items-center gap-4">
          <Medallion size={68} tone="onAccent">
            <span className="text-2xl font-display">{initial}</span>
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-on-accent/70">رفيقك في العبادة</p>
            <h1 className="text-2xl font-display font-bold truncate">{userName || 'أهلاً بك'}</h1>
            <p className="text-xs text-on-accent/80 mt-0.5">
              {toArabicDigits(numbers.totalDays)} يوم عبادة منذ البداية
            </p>
            <div className="mt-2 empty:hidden flex">
              <StandingChip onAccent rank />
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { v: numbers.streak, l: 'يوماً متتالياً', Icon: Flame },
            { v: numbers.monthDays, l: 'يوماً هذا الشهر', Icon: CalendarCheck },
            { v: unlockedCount(unlocked, gender), l: `وساماً من ${toArabicDigits(badgesFor(gender).length)}`, Icon: Award },
          ].map(({ v, l, Icon }) => (
            <div key={l} className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
              <Icon size={15} className="mx-auto text-gold-light" />
              <p className="mt-1 text-xl font-counter font-bold tabular-nums">{toArabicDigits(v)}</p>
              <p className="text-[10px] text-on-accent/75 leading-tight">{l}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Badges: level + pinned badges, up front ──────── */}
      <BadgesShowcase />

      {/* ── Statistics: general + per section ─────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle title="إحصاءاتي" subtitle="الصورة الكاملة، ثم تفاصيل كل قسم" />
        <HapticPressable
          onClick={() => navigate('/stats')}
          className="w-full text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4 flex items-center gap-3"
        >
          <span className="w-12 h-12 rounded-2xl bg-[image:var(--gradient-teal)] text-on-accent inline-flex items-center justify-center shrink-0">
            <BarChart3 size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-text-primary dark:text-text-on-dark">الإحصاءات العامة</span>
            <span className="block text-xs text-text-muted">نبض العبادة، الاتجاهات، المقارنات والإنجازات</span>
          </span>
          <ChevronLeft size={18} className="text-text-muted" />
        </HapticPressable>
        <div className="grid grid-cols-3 gap-2">
          {SECTION_STATS.map(({ label, to, Icon }) => (
            <HapticPressable
              key={to}
              onClick={() => navigate(to)}
              className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] py-3 flex flex-col items-center gap-1.5 hover:ring-teal/25"
            >
              <span className="text-teal dark:text-teal-light">
                <Icon size={19} />
              </span>
              <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/85">{label}</span>
            </HapticPressable>
          ))}
        </div>
      </section>

      {/* ── Growth ────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        {[
          { label: 'العادات', hint: 'عاداتك اليومية', Icon: Star, to: '/study?tab=habits' },
          { label: 'سجل الإنجازات', hint: 'الأوسمة بالأرقام', Icon: Award, to: '/stats/achievements' },
        ].map(({ label, hint, Icon, to }) => (
          <HapticPressable
            key={to}
            onClick={() => navigate(to)}
            className="text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4"
          >
            <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center">
              <Icon size={19} />
            </span>
            <p className="mt-3 font-bold text-text-primary dark:text-text-on-dark">{label}</p>
            <p className="text-xs text-text-muted">{hint}</p>
          </HapticPressable>
        ))}
      </section>

      {/* ── Appearance: palette picker ────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle title="المظهر" subtitle="اختر لوحة ألوان التطبيق" />
        <PalettePicker compact />
      </section>

      {/* ── Everything else ───────────────────────────────── */}
      <Card className="p-1.5">
        {[
          { label: 'الترتيب', hint: 'نافِس في الخير يومياً وأسبوعياً', Icon: Trophy, to: '/leaderboard' },
          { label: 'كل الميزات', hint: 'القبلة، الأدعية، الزكاة، التقويم…', Icon: LayoutGrid, to: '/more' },
          { label: 'الإعدادات', hint: 'الإشعارات، الصلاة، الحساب', Icon: Settings, to: '/settings' },
          { label: 'التنزيلات والعمل دون إنترنت', hint: 'الأذكار الصوتية', Icon: Download, to: '/downloads' },
          { label: 'النسخ الاحتياطي', hint: 'احفظ بياناتك واستعدها', Icon: Cloud, to: '/backup' },
        ].map(({ label, hint, Icon, to }, i) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className={[
              'w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5',
              i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
            ].join(' ')}
          >
            <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <Icon size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{label}</span>
              <span className="block text-[11px] text-text-muted truncate">{hint}</span>
            </span>
            <ChevronLeft size={16} className="text-text-muted" />
          </button>
        ))}
      </Card>
    </div>
  );
}
