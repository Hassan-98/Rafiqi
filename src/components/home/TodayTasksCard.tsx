import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronLeft, Clock, ListChecks, Plus, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { useTasksStore } from '@/store/tasksStore';
import { compareTasks, dayKey, dueLabel, isDoneOn, isOverdue, subtaskDone } from '@/store/studyModel';
import { useNow } from '@/components/study/studyUi';
import { TaskSteps } from '@/components/study/TasksView';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const MAX_ROWS = 5;

/**
 * «مهامي» on Home: the persistent task list (tasks only — open first, then by
 * due day / time), checkable in place — an open task's steps too — and a way
 * into the full tasks tab.
 * Nothing drops off at midnight: a task stays until it's done and cleared.
 */
export function TodayTasksCard() {
  const navigate = useNavigate();
  const tasks = useTasksStore((s) => s.tasks);
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const now = useNow(60_000);
  const today = dayKey(now);

  const list = useMemo(() => {
    return [...tasks]
      .sort((a, b) => compareTasks(a, b, today))
      .map((t) => ({
        t,
        done: isDoneOn(t, today),
        late: isOverdue(t, now),
        due: dueLabel(t, now),
        stepsDone: t.subtasks.filter((s) => subtaskDone(t, s, today)).length,
      }));
  }, [tasks, now, today]);
  const done = list.filter((r) => r.done).length;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="مهامي"
        subtitle={list.length ? `${toArabicDigits(done)} من ${toArabicDigits(list.length)} أُنجزت` : 'لا مهام بعد'}
        action={
          <button
            type="button"
            onClick={() => navigate('/study?tab=tasks')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
          >
            كل المهام <ChevronLeft size={14} />
          </button>
        }
      />
      <Card className="p-1.5">
        {list.length === 0 ? (
          <button
            type="button"
            onClick={() => navigate('/study?tab=tasks&task=new')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
          >
            <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <Plus size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">أضف مهمة</span>
              <span className="block text-[11px] text-text-muted">تبقى في قائمتك حتى تنجزها</span>
            </span>
          </button>
        ) : (
          list.slice(0, MAX_ROWS).map(({ t, done: isDone, late, due, stepsDone }, i) => (
            <div key={t.id} className={i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''}>
              <div className="flex items-center gap-3 px-2 py-2 rounded-[var(--radius-inner)]">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={isDone ? `إلغاء إنجاز ${t.title}` : `أنجزت ${t.title}`}
                  onClick={() => {
                    const nowDone = toggleTask(t.id);
                    void hapticsService.impact(nowDone ? 'medium' : 'light');
                  }}
                  className={[
                    'w-11 h-11 -m-1 shrink-0 inline-flex items-center justify-center rounded-xl',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-6 h-6 rounded-lg inline-flex items-center justify-center transition-colors',
                      isDone ? 'bg-teal text-on-accent' : 'ring-2 ring-teal/35 dark:ring-teal-light/40',
                    ].join(' ')}
                  >
                    {isDone ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/study?tab=tasks&task=${t.id}`)}
                  className="flex-1 min-w-0 text-start py-1"
                >
                  <span
                    className={[
                      'block text-sm font-semibold truncate',
                      isDone ? 'line-through text-text-muted' : 'text-text-primary dark:text-text-on-dark',
                    ].join(' ')}
                  >
                    {t.title}
                  </span>
                  {due || late || t.subtasks.length ? (
                    <span className="mt-0.5 flex items-center gap-2.5 text-[11px] text-text-muted">
                      {due || late ? (
                        <span className={['inline-flex items-center gap-1', late && !isDone ? 'text-danger' : ''].join(' ')}>
                          {late && !isDone ? <AlertCircle size={11} /> : <Clock size={11} />}
                          {due ?? 'متأخرة'}
                        </span>
                      ) : null}
                      {t.subtasks.length ? (
                        <span
                          className={[
                            'inline-flex items-center gap-1',
                            stepsDone === t.subtasks.length ? 'text-teal dark:text-teal-light' : '',
                          ].join(' ')}
                        >
                          <ListChecks size={11} aria-hidden />
                          {toArabicDigits(stepsDone)}/{toArabicDigits(t.subtasks.length)} خطوات
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
                {t.priority === 'high' && !isDone ? (
                  <span className="w-2 h-2 rounded-full bg-gold shrink-0" aria-label="أولوية عالية" />
                ) : null}
              </div>
              {!isDone && t.subtasks.length ? <TaskSteps t={t} dayKey={today} max={2} className="-mt-1.5 pb-1.5" /> : null}
            </div>
          ))
        )}
        {list.length > MAX_ROWS ? (
          <button
            type="button"
            onClick={() => navigate('/study?tab=tasks')}
            className="w-full text-center text-xs font-semibold text-teal dark:text-teal-light py-2"
          >
            و{toArabicDigits(list.length - MAX_ROWS)} مهام أخرى
          </button>
        ) : null}
      </Card>
    </section>
  );
}
