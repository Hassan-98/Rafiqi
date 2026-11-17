import { useCallback, useMemo } from 'react';
import { useProgressStore } from '@/store/progressStore';
import { useActivityLogStore } from '@/store/activityLogStore';
import { useTargetsStore, TARGET_UNIT_LABEL } from '@/store/targetsStore';
import { useTasksStore } from '@/store/tasksStore';
import { useStudyStore } from '@/store/studyStore';
import { occursOn, isDoneOn, lessonsOnDay, clockAr, SUBJECT_LABEL } from '@/store/studyModel';
import { eventsForDate, dayKey, useCalendarPrefs, type CalendarEvent } from '@/services/calendarEvents';
import { toArabicDigits } from '@/utils/arabicFormat';

/** A user event that recurs daily — listed in the day sheet, but no grid dot. */
export type UserCalendarEvent = CalendarEvent & { minor?: boolean; done?: boolean };

/**
 * Reactive lookup of the user's own items for a day: awrad due, tasks, study
 * sessions, and (past/today) logged worship. Returns a stable function for a
 * given store snapshot, so a month grid can call it per cell cheaply.
 */
export function useUserEvents(): (key: string) => UserCalendarEvent[] {
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const activity = useActivityLogStore((s) => s.events);
  const targets = useTargetsStore((s) => s.targets);
  const tasks = useTasksStore((s) => s.tasks);
  const circles = useStudyStore((s) => s.circles);

  const activityByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of activity) m.set(e.dateKey, (m.get(e.dateKey) ?? 0) + 1);
    return m;
  }, [activity]);

  return useCallback(
    (key: string) => {
      const out: UserCalendarEvent[] = [];
      const today = dayKey(new Date());
      const wd = new Date(`${key}T12:00:00`).getDay();

      if (key >= today) {
        for (const t of targets) {
          if (t.completedAt || dayKey(new Date(t.deadline)) !== key) continue;
          out.push({
            id: `wird_${t.id}`,
            type: 'wird',
            title: t.title,
            description: `${toArabicDigits(t.current)} من ${toArabicDigits(t.total)} ${TARGET_UNIT_LABEL[t.unit]}`,
            minor: t.recurrence === 'daily',
            done: t.current >= t.total,
            actions: [{ label: 'افتح الوِرد', to: `/targets/${t.id}` }],
          });
        }
      }

      for (const t of tasks) {
        if (!occursOn(t, key)) continue;
        out.push({
          id: `task_${t.id}`,
          type: 'task',
          title: t.title,
          description: t.time ? clockAr(t.time) : undefined,
          minor: t.repeat === 'daily' || t.repeat === 'weekdays',
          done: isDoneOn(t, key),
          actions: [{ label: 'افتح المهمة', to: `/study?tab=tasks&task=${t.id}` }],
        });
      }

      for (const c of circles) {
        if (c.status !== 'active' && lessonsOnDay(c, key) === 0) continue;
        const times = [
          ...c.slots.filter((s) => s.weekday === wd && key >= dayKey(new Date(c.createdAt))).map((s) => s.time),
          ...c.sessions.filter((s) => dayKey(new Date(s.at)) === key).map((s) => s.at),
        ];
        const attended = lessonsOnDay(c, key);
        if (times.length === 0 && attended === 0) continue;
        out.push({
          id: `study_${c.id}`,
          type: 'study',
          title: c.title,
          description: [SUBJECT_LABEL[c.subject], ...times.map((t) => clockAr(t))].join(' · '),
          done: attended > 0,
          actions: [{ label: 'افتح الدرس', to: `/study/circle/${c.id}` }],
        });
      }

      if (key <= today) {
        const modules = dailyProgress[key]?.modules.filter((m) => m.completed).length ?? 0;
        const acts = activityByDay.get(key) ?? 0;
        if (modules + acts > 0) {
          out.push({
            id: 'worship',
            type: 'worship',
            title: key === today ? 'سجلّك اليوم' : 'سجلّك في هذا اليوم',
            description: [
              modules ? `${toArabicDigits(modules)} عبادة مكتملة` : '',
              acts ? `${toArabicDigits(acts)} نشاط مسجّل` : '',
            ].filter(Boolean).join(' · '),
            done: true,
            actions: [{ label: 'تفاصيل عباداتك', dayDetail: true }],
          });
        }
      }
      return out;
    },
    [targets, tasks, circles, dailyProgress, activityByDay],
  );
}

/** Religious + user events of one day (reactive). Home / inspiration can use this. */
export function useDayEvents(date: Date): UserCalendarEvent[] {
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const user = useUserEvents();
  const key = dayKey(date);
  return useMemo(() => [...eventsForDate(date, offset), ...user(key)], [key, offset, user]); // eslint-disable-line react-hooks/exhaustive-deps
}
