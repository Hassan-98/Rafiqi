import { CustomHabitsModule } from '@/components/modules/CustomHabitsModule';
import { SectionInsights } from '@/components/stats/SectionInsights';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarCheck, ExternalLink, Flame, GraduationCap, Plus, Radio } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import {
  addDays, completionOn, dayKey, expectedSessions, inAr, nextStudyOverall, platformPhrase, studyStreak,
  taskCounts, WEEKDAY_AR,
} from '@/store/studyModel';
import { rescheduleAllStudy } from '@/services/studyReminders';
import { toArabicDigits } from '@/utils/arabicFormat';
import { PlatformGlyph, Segmented, openLink, useNow } from '@/components/study/studyUi';
import { CirclesView, useQuickLog, whenAr } from '@/components/study/CirclesView';
import { TasksView } from '@/components/study/TasksView';
import { HouseView } from '@/components/study/HouseView';
import type { StudyCircle } from '@/store/studyModel';

type Tab = 'tasks' | 'house' | 'habits' | 'circles';
const TABS: Tab[] = ['tasks', 'house', 'habits', 'circles'];
const SHORT_DAY = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function LiveLogButton({ c }: { c: StudyCircle }) {
  const { loggedToday, label, log } = useQuickLog(c);
  return (
    <Button variant="secondary" size="sm" onClick={log} disabled={loggedToday}>
      {loggedToday ? 'سُجّل حضورك' : label}
    </Button>
  );
}

/** Today in one card: the next lesson (with its link), today's task ring and the study streak. */
function StudyHero({ now, onAdd }: { now: number; onAdd: () => void }) {
  const circles = useStudyStore((s) => s.circles);
  const tasks = useTasksStore((s) => s.tasks);
  const next = nextStudyOverall(circles, now);
  const { done, total } = taskCounts(tasks, now);
  const streak = studyStreak(circles, now);
  const pct = total ? (done / total) * 100 : 0;

  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
      <div className="relative">
        {next ? (
          <>
            <p className="text-xs text-on-accent/75 flex items-center gap-1.5">
              {next.session.live ? (
                <>
                  <Radio size={13} className="motion-safe:animate-pulse" /> يُبث الآن
                </>
              ) : (
                'الدرس القادم'
              )}
            </p>
            <h2 className="mt-1 text-xl font-display font-bold leading-snug text-balance">{next.circle.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-on-accent/85">
              <span className="inline-flex items-center gap-1 rounded-full bg-on-accent/12 ps-1.5 pe-2 py-0.5 text-xs font-semibold">
                <PlatformGlyph platform={next.circle.platform} size={13} />
                {platformPhrase(next.circle.platform) || 'موعد'}
              </span>
              <span className="font-counter tabular-nums">{whenAr(next.session.at, now)}</span>
              {!next.session.live ? <span className="text-on-accent/70">· {inAr(next.session.at - now)}</span> : null}
            </div>
            <div className="mt-4 flex gap-2">
              {next.circle.link ? (
                <Button variant="gold" size="sm" leftIcon={<ExternalLink size={15} />} onClick={() => void openLink(next.circle.link)}>
                  افتح الرابط
                </Button>
              ) : null}
              {next.session.live ? <LiveLogButton c={next.circle} /> : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-on-accent/75">طلب العلم عبادة</p>
            <h2 className="mt-1 text-xl font-display font-bold text-balance">
              {circles.length ? 'لا مواعيد قادمة' : 'نظّم دروسك ومهامك'}
            </h2>
            <p className="mt-1 text-[13px] text-on-accent/80 text-pretty">
              {circles.length ? 'أضف موعداً لحلقاتك ليصلك التذكير قبلها.' : 'حلقات تيليجرام ويوتيوب والمسجد، ومهامك اليومية بتذكيراتها.'}
            </p>
            <Button variant="gold" size="sm" className="mt-4" leftIcon={<Plus size={15} />} onClick={onAdd}>
              أضف حلقة
            </Button>
          </>
        )}
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-on-accent/10 px-2 py-3 flex flex-col items-center">
          <div className="relative">
            <ProgressRing
              value={pct}
              size={40}
              strokeWidth={4}
              showPercent={false}
              colorFrom="var(--color-on-accent)"
              colorTo="var(--color-gold-light)"
              trackColor="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
            />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-counter font-bold tabular-nums">
              {toArabicDigits(done)}/{toArabicDigits(total)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-on-accent/75 leading-tight">مهامي</p>
        </div>
        <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
          <Flame size={15} className="mx-auto text-gold-light" />
          <p className="mt-1 text-xl font-counter font-bold tabular-nums">{toArabicDigits(streak)}</p>
          <p className="text-[10px] text-on-accent/75 leading-tight">يوماً في طلب العلم</p>
        </div>
        <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
          <GraduationCap size={15} className="mx-auto text-gold-light" />
          <p className="mt-1 text-xl font-counter font-bold tabular-nums">
            {toArabicDigits(circles.filter((c) => c.status === 'active').length)}
          </p>
          <p className="text-[10px] text-on-accent/75 leading-tight">حلقة نشطة</p>
        </div>
      </div>
    </Card>
  );
}

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
 * own reminders, and «مهام المنزل» (scored on the board). Tabs via
 * ?tab=tasks|house|habits|circles (default tasks);
 * ?task=ID opens that task (notification / widget deep link); /habits
 * redirects here with tab=habits.
 */
export function StudyHubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'tasks';
  const now = useNow();

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
  const [addReq, setAddReq] = useState(0);

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <CalendarCheck size={14} className="text-gold" />
          {WEEKDAY_AR[today.getDay()]} {toArabicDigits(today.getDate())}/{toArabicDigits(today.getMonth() + 1)}
        </p>
        <h1 className="mt-0.5 text-[26px] font-display font-bold leading-tight text-text-primary dark:text-text-on-dark">المهام والعادات</h1>
        <p className="mt-1 text-sm text-text-secondary dark:text-text-on-dark/70 text-pretty">مهام يومك وبيتك، وعاداتك، وحلقات العلم</p>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tasks', label: 'المهام' },
          { value: 'house', label: 'مهام المنزل' },
          { value: 'habits', label: 'العادات' },
          { value: 'circles', label: 'حلقات العلم' },
        ]}
      />

      {/* The circles hero lives on «حلقات العلم» only (owner request). */}
      {tab === 'circles' ? (
        <StudyHero
          now={now}
          onAdd={() => {
            setTab('circles');
            setAddReq((n) => n + 1);
          }}
        />
      ) : null}

      {tab === 'tasks' ? (
        <TasksView focusTaskId={params.get('task')} />
      ) : tab === 'house' ? (
        <HouseView />
      ) : tab === 'habits' ? (
        <>
          <CustomHabitsModule />
          <SectionInsights domain="habits" statsTo="/stats/habits" />
        </>
      ) : (
        <CirclesView addRequest={addReq} />
      )}

      {tab === 'tasks' || tab === 'circles' ? <StudyStatsPanel now={now} /> : null}
    </div>
  );
}

export default StudyHubPage;
