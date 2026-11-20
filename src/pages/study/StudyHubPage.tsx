import { CustomHabitsModule } from '@/components/modules/CustomHabitsModule';
import { SectionInsights } from '@/components/stats/SectionInsights';
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import { addDays, completionOn, dayKey, expectedSessions, WEEKDAY_AR } from '@/store/studyModel';
import { rescheduleAllStudy } from '@/services/studyReminders';
import { toArabicDigits } from '@/utils/arabicFormat';
import { Segmented, useNow } from '@/components/study/studyUi';
import { CirclesHome } from '@/components/study/CirclesView';
import { TasksView } from '@/components/study/TasksView';
import { HouseView } from '@/components/study/HouseView';
import { SilatPage } from '@/pages/SilatPage';

type Tab = 'tasks' | 'silat' | 'house' | 'habits';
const TABS: Tab[] = ['tasks', 'silat', 'house', 'habits'];
const SHORT_DAY = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** Self-contained progress panel: this week's task completion, attendance, lessons this month. */
function StudyStatsPanel({ now }: { now: number }) {
  const circles = useStudyStore((s) => s.circles);
  const tasks = useTasksStore((s) => s.tasks);

  const data = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(now), i - 6));
    const week = days.map((d) => ({ d, ...completionOn(tasks, dayKey(d)) }));
    const wDone = week.reduce((s, x) => s + x.done, 0);
    const wTotal = week.reduce((s, x) => s + x.total, 0);

    const live = circles.filter((c) => c.format === 'live');
    const attended = live.reduce((s, c) => s + c.log.filter((l) => l.status === 'attended').length, 0);
    const held = live.reduce(
      (s, c) => s + Math.max(expectedSessions(c, now), c.log.filter((l) => l.status !== 'watched').length),
      0,
    );
    const monthPrefix = dayKey(now).slice(0, 7);
    const month = circles.reduce(
      (s, c) => s + c.log.filter((l) => l.status !== 'missed' && dayKey(l.date).startsWith(monthPrefix)).length,
      0,
    );
    const max = Math.max(1, ...week.map((x) => x.total));
    return { week, wDone, wTotal, attendance: held ? Math.min(1, attended / held) : null, month, max, anyLive: live.length > 0 };
  }, [circles, tasks, now]);

  if (!tasks.length && !circles.length) return null;
  const todayK = dayKey(now);

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="تقدّمك" subtitle="آخر سبعة أيام" />
      <Card className="p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-counter font-bold tabular-nums text-teal dark:text-teal-light">
              {data.wTotal ? `${toArabicDigits(Math.round((data.wDone / data.wTotal) * 100))}٪` : '—'}
            </p>
            <p className="text-[11px] text-text-muted">إنجاز المهام</p>
          </div>
          <div>
            <p className="text-2xl font-counter font-bold tabular-nums text-teal dark:text-teal-light">
              {data.attendance !== null ? `${toArabicDigits(Math.round(data.attendance * 100))}٪` : '—'}
            </p>
            <p className="text-[11px] text-text-muted">{data.anyLive ? 'نسبة الحضور' : 'الحضور (لا دروس مباشرة)'}</p>
          </div>
          <div>
            <p className="text-2xl font-counter font-bold tabular-nums text-gold-dark dark:text-gold-light">{toArabicDigits(data.month)}</p>
            <p className="text-[11px] text-text-muted">درساً هذا الشهر</p>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-2 h-24" role="img" aria-label="إنجاز المهام في آخر سبعة أيام">
          {data.week.map(({ d, done, total }) => {
            const k = dayKey(d);
            const h = total ? Math.max(6, (total / data.max) * 100) : 6;
            const fill = total ? (done / total) * 100 : 0;
            return (
              <div key={k} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="w-full max-w-7 rounded-lg bg-cream-dark/70 dark:bg-white/[0.06] relative overflow-hidden" style={{ height: `${h}%` }}>
                  <div
                    className="absolute bottom-0 inset-x-0 bg-[image:var(--gradient-teal)] rounded-lg transition-[height] duration-500 ease-out-soft"
                    style={{ height: `${fill}%` }}
                  />
                </div>
                <span className={['text-[10px]', k === todayK ? 'font-bold text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
                  {SHORT_DAY[d.getDay()]}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

/**
 * «المهام والعادات» (bottom tab) — the daily to-do, the habits tracker and the
 * knowledge circles (live lessons, recorded series, channels), each with its
 * own reminders, «صلة الرحم» (the /silat page body; its own segment on
 * ?view=) and «مهام المنزل» (scored on the board). Tabs via
 * ?tab=tasks|silat|house|habits|circles (default tasks);
 * ?task=ID opens that task (notification / widget deep link); /habits
 * redirects here with tab=habits.
 */
export function StudyHubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'tasks';
  const now = useNow();

  // حلقات العلم moved to «عباداتي» (owner 2026-11-18).
  useEffect(() => {
    if (rawTab === 'circles') navigate('/targets?tab=circles', { replace: true });
  }, [rawTab, navigate]);

  // Legacy/alt deep link: /study?circle=ID → the circle page.
  const circleParam = params.get('circle');
  useEffect(() => {
    if (circleParam) navigate(`/study/circle/${circleParam}`, { replace: true });
  }, [circleParam, navigate]);

  // Idempotent: arms reminders + starts following store changes, even if boot wiring is missing.
  useEffect(() => {
    void rescheduleAllStudy();
  }, []);

  const setTab = (t: Tab) => setParams(t === 'tasks' ? {} : { tab: t }, { replace: true });
  const today = new Date(now);

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <CalendarCheck size={14} className="text-gold" />
          {WEEKDAY_AR[today.getDay()]} {toArabicDigits(today.getDate())}/{toArabicDigits(today.getMonth() + 1)}
        </p>
        <h1 className="mt-0.5 text-[26px] font-display font-bold leading-tight text-text-primary dark:text-text-on-dark">حياتي</h1>
        <p className="mt-1 text-sm text-text-secondary dark:text-text-on-dark/70 text-pretty">مهام يومك وبيتك، وصلة رحمك، وعاداتك</p>
      </header>

      <Segmented
        scroll
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tasks', label: 'المهام' },
          { value: 'silat', label: 'صلة الرحم' },
          { value: 'house', label: 'المنزل' },
          { value: 'habits', label: 'العادات' },
        ]}
      />

      {tab === 'tasks' ? (
        <TasksView focusTaskId={params.get('task')} />
      ) : tab === 'silat' ? (
        <SilatPage embedded />
      ) : tab === 'house' ? (
        <HouseView />
      ) : (
        <>
          <CustomHabitsModule />
          <SectionInsights domain="habits" statsTo="/stats/habits" />
        </>
      )}

      {tab === 'tasks' ? <StudyStatsPanel now={now} /> : null}
    </div>
  );
}

export default StudyHubPage;

/** «حلقات العلم» — its own tab in «عباداتي» (/targets?tab=circles) since 2026-11-18 (owner); the screen is CirclesHome. */
export function CirclesTab() {
  return <CirclesHome />;
}
