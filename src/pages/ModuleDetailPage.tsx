import { useParams, Navigate } from 'react-router';
import { Flame, Sparkles, BookOpen, MoonStar, Moon, HandHeart, Star, CalendarCheck } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import type { LucideIcon } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { ArchMotif } from '@/components/ui/Ornament';
import { StatsShortcut } from '@/components/stats/StatsShortcut';
import { PrayersModule } from '@/components/modules/PrayersModule';
import { DhikrModule } from '@/components/modules/DhikrModule';
import { QuranWirdModule } from '@/components/modules/QuranWirdModule';
import { QiyamModule } from '@/components/modules/QiyamModule';
import { DuaaJournalModule } from '@/components/modules/DuaaJournalModule';
import { CustomHabitsModule } from '@/components/modules/CustomHabitsModule';
import { useProgressStore } from '@/store/progressStore';
import { useStreak } from '@/hooks/useStreak';
import { useI18n } from '@/hooks/useI18n';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { ModuleId } from '@/types';

const MODULE_LABELS: Record<ModuleId, string> = {
  prayers: 'module_prayers',
  dhikr: 'module_dhikr',
  quran: 'module_quran',
  qiyam: 'module_qiyam',
  fasting: 'module_fasting',
  duaa: 'module_duaa',
  habits: 'module_habits',
};

const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  prayers: Mosque,
  dhikr: Sparkles,
  quran: BookOpen,
  qiyam: MoonStar,
  fasting: Moon,
  duaa: HandHeart,
  habits: Star,
};

const MODULE_SUBTITLES: Partial<Record<ModuleId, string>> = {
  prayers: 'الفروض والسنن ومواقيت اليوم',
  fasting: 'سجّل صيامك وتابع شهرك',
  duaa: 'دعواتك، وما أجابه الله منها',
  habits: 'عاداتك اليومية',
  qiyam: 'ليلة بليلة',
};

/** Each module's stats page — one tap from inside the section itself. */
const MODULE_STATS_ROUTE: Record<ModuleId, string> = {
  prayers: '/stats/prayers',
  dhikr: '/stats/dhikr',
  quran: '/stats/quran',
  qiyam: '/stats/qiyam',
  fasting: '/stats/fasting',
  duaa: '/stats/history',
  habits: '/stats/habits',
};

/**
 * Modules that open with their own hero (with the module's primary action),
 * so the generic ModuleHero would be a second hero on the same screen.
 */
const HAS_OWN_HERO: ModuleId[] = ['prayers', 'dhikr', 'qiyam', 'fasting', 'duaa', 'habits'];

function ModuleContent({ id }: { id: ModuleId }) {
  switch (id) {
    case 'prayers': return <PrayersModule />;
    case 'dhikr': return <DhikrModule />;
    case 'quran': return <QuranWirdModule />;
    case 'qiyam': return <QiyamModule />;
    case 'duaa': return <DuaaJournalModule />;
    case 'habits': return <CustomHabitsModule />;
    default: return null;
  }
}

/** Progress ring drawn in currentColor so it follows the palette on accent. */
function HeroRing({ pct, size = 76 }: { pct: number; size?: number }) {
  const sw = 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-counter font-bold tabular-nums">{toArabicDigits(pct)}٪</span>
        <span className="text-[9.5px] text-on-accent/70 mt-1">اليوم</span>
      </span>
    </span>
  );
}

/**
 * The accent hero on top of a module page (for modules without their own):
 * today's progress ring, a status line, the streak and 30-day commitment.
 */
function ModuleHero({ id }: { id: ModuleId }) {
  const { t } = useI18n();
  const today = useProgressStore((s) => s.getTodayProgress());
  const { currentStreak, completionRate } = useStreak(id);
  const completion = today?.modules?.find((m) => m.moduleId === id);
  const pct = Math.round((completion?.completionRate ?? 0) * 100);
  const done = completion?.completed ?? false;
  const Icon = MODULE_ICONS[id];

  const status = done
    ? 'أتممت عبادة اليوم، تقبّل الله منك'
    : pct > 0
      ? `أنجزت ${toArabicDigits(pct)}٪ من عبادة اليوم`
      : 'لم تبدأ بعد اليوم، والوقت متّسع';

  return (
    <Card variant="hero" className="p-5 mb-6">
      <ArchMotif className="absolute -top-5 -start-4 w-36 opacity-15" />
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-on-accent/12 inline-flex items-center justify-center">
            <Icon size={20} />
          </span>
          <p className="font-display text-2xl font-bold mt-2.5 truncate">{t(MODULE_LABELS[id])}</p>
          <p className="text-[13px] text-on-accent/80 mt-0.5 text-pretty">{status}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-on-accent/12 text-[11px] font-bold">
              <Flame size={12} className="text-gold-light" />
              {currentStreak > 0 ? `${toArabicDigits(currentStreak)} يوماً متتالياً` : 'ابدأ سلسلتك اليوم'}
            </span>
            {completionRate > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-on-accent/12 text-[11px] font-bold">
                <CalendarCheck size={12} className="text-gold-light" />
                التزام {toArabicDigits(Math.round(completionRate * 100))}٪ في ٣٠ يوماً
              </span>
            ) : null}
          </div>
        </div>
        <HeroRing pct={pct} />
      </div>
    </Card>
  );
}

export function ModuleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();

  const validIds: ModuleId[] = ['prayers', 'dhikr', 'quran', 'qiyam', 'fasting', 'duaa', 'habits'];
  if (!id || !validIds.includes(id as ModuleId)) {
    return <Navigate to="/" replace />;
  }

  // The fast lives in «عباداتي» now (owner 2026-11-19); old links and armed notifications land there.
  if (id === 'fasting') return <Navigate to="/targets?tab=fasting" replace />;

  const moduleId = id as ModuleId;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <div className="lg:max-w-5xl lg:mx-auto">
        <TopAppBar
          title={t(MODULE_LABELS[moduleId])}
          subtitle={MODULE_SUBTITLES[moduleId]}
          showBack
          actions={<StatsShortcut to={MODULE_STATS_ROUTE[moduleId]} />}
        />
        <div className="px-4 pt-4 pb-28">
          {!HAS_OWN_HERO.includes(moduleId) ? <ModuleHero id={moduleId} /> : null}
          <ModuleContent id={moduleId} />
        </div>
      </div>
    </div>
  );
}
