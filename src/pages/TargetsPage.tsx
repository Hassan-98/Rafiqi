import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from '@/lib/motion';
import { GraduationCap, History, Moon, MoonStar, NotebookPen, Target as TargetIcon, TrendingUp } from 'lucide-react';
import { ProgramsPage } from '@/pages/ProgramsPage';
import { AwradPanel } from '@/components/targets/AwradPanel';
import { QiyamModule } from '@/components/modules/QiyamModule';
import { isQiyamTime } from '@/components/qiyam/nightWindow';
import { Segmented } from '@/components/study/studyUi';
import { CirclesTab } from '@/pages/study/StudyHubPage';
import { QadaPage } from '@/pages/QadaPage';
import { FridayReviewPage } from '@/pages/FridayReviewPage';
import { FastingView } from '@/components/fasting/FastingView';
import { useProgressStore } from '@/store/progressStore';
import { dayInfo } from '@/services/fastingPlan';
import { useQadaStore } from '@/store/qadaStore';
import { useFridayReviewStore } from '@/store/fridayReviewStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { qadaAttention } from '@/services/qadaPlan';
import { fridayReviewAttention } from '@/services/fridayReview';

type Tab = 'awrad' | 'qiyam' | 'fasting' | 'programs' | 'circles' | 'qada' | 'friday';

/** «بانتظارك»: something in that tab wants today's attention (same rules as Home's «يحتاج انتباهك»). */
function Dot() {
  return (
    <span className="w-2 h-2 rounded-full bg-gold shrink-0">
      <span className="sr-only">، بانتظارك</span>
    </span>
  );
}
function QadaDot() {
  const qada = useQadaStore();
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  return qadaAttention(qada, new Date(), offset).length ? <Dot /> : null;
}
/** A day worth fasting above the ordinary (عرفة، عاشوراء…) or a Ramadan day, not logged yet. */
function FastingDot() {
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const d = dayInfo(new Date(), offset);
  const fasted = useProgressStore((s) => !!s.dailyProgress[d.key]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed));
  return !fasted && (d.ramadan || d.reason?.major) ? <Dot /> : null;
}
function FridayDot() {
  const reviews = useFridayReviewStore((s) => s.reviews);
  return fridayReviewAttention({ reviews }, new Date()) ? <Dot /> : null;
}

const TABS: { id: Tab; label: string; Icon: typeof MoonStar; Badge?: () => ReactNode }[] = [
  { id: 'awrad', label: 'الأوراد', Icon: TargetIcon },
  { id: 'qiyam', label: 'القيام', Icon: MoonStar },
  { id: 'fasting', label: 'الصيام', Icon: Moon, Badge: FastingDot },
  { id: 'programs', label: 'البرامج', Icon: TrendingUp },
  { id: 'circles', label: 'حلقات العلم', Icon: GraduationCap },
  { id: 'qada', label: 'القضاء', Icon: History, Badge: QadaDot },
  { id: 'friday', label: 'المحاسبة', Icon: NotebookPen, Badge: FridayDot },
];
const IDS = TABS.map((t) => t.id);
const dateFmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * «عباداتي» tab: الأوراد, قيام الليل, الصيام (owner 2026-11-19), برامج التدرّج (back, owner 2026-11-20),
 * حلقات العلم, قضاء ما فات and محاسبة الجمعة. The segment lives in the URL (?tab=qiyam|programs|qada|friday);
 * without it the tab opens on قيام between Isha and Fajr, on الأوراد otherwise.
 * The chapters keep their own params inside (?tab=programs&run=ID,
 * ?tab=qada&view=fasts) and their standalone routes (/programs, /qada,
 * /friday-review) for notifications and deep links.
 */
export function TargetsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && IDS.includes(raw) ? raw : isQiyamTime() ? 'qiyam' : 'awrad';

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-xs text-text-muted">{dateFmt.format(new Date())}</p>
        <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark">عباداتي</h1>
        <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
          أورادك وقيام ليلك وصيامك، وبرامج التدرّج، وحلقات العلم، وقضاء ما فات، ومحاسبة الجمعة
        </p>
      </header>

      <Segmented
        scroll
        className="-mt-2"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        options={TABS.map(({ id, label, Icon, Badge }) => ({
          value: id,
          label: (
            <>
              {/* Icons from sm up: on a 360px phone the five labels alone fit without scrolling. */}
              <Icon size={16} aria-hidden className="hidden sm:block" /> {label}
              {Badge ? <Badge /> : null}
            </>
          ),
        }))}
      />

      <motion.div
        key={tab}
        role="tabpanel"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        {tab === 'qiyam' ? (
          <QiyamModule />
        ) : tab === 'fasting' ? (
          <FastingView />
        ) : tab === 'programs' ? (
          <ProgramsPage embedded />
        ) : tab === 'circles' ? (
          <CirclesTab />
        ) : tab === 'qada' ? (
          <QadaPage embedded />
        ) : tab === 'friday' ? (
          <FridayReviewPage embedded />
        ) : (
          <AwradPanel />
        )}
      </motion.div>
    </div>
  );
}
