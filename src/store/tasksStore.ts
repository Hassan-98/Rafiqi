import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { dayKey, isDoneOn, occurrenceKey, subtaskDone, withSubtaskDone, type Subtask, type Task } from '@/store/studyModel';

export type NewTaskInput = Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt' | 'history' | 'subtasks'> &
  Partial<Pick<Task, 'subtasks'>>;

const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
/** ≈ a year of daily ticks per recurring task. */
const MAX_HISTORY = 400;

function trimHistory(h: Record<string, number>): Record<string, number> {
  const keys = Object.keys(h);
  if (keys.length <= MAX_HISTORY) return h;
  const keep = keys.sort().slice(-MAX_HISTORY);
  return Object.fromEntries(keep.map((k) => [k, h[k]]));
}

/** Set one occurrence done/undone. One-off → `done`; recurring → the day's history entry. */
function setDone(t: Task, done: boolean, key: string): Task {
  if (t.repeat === 'none') {
    return { ...t, done, doneAt: done ? Date.now() : undefined, snoozedUntil: done ? undefined : t.snoozedUntil };
  }
  const history = { ...(t.history ?? {}) };
  const occ = occurrenceKey(t, key);
  if (done) history[occ] = Date.now();
  else delete history[occ];
  return { ...t, history: trimHistory(history), snoozedUntil: done ? undefined : t.snoozedUntil };
}

interface TasksState {
  tasks: Task[];
  addTask: (input: NewTaskInput) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  /** Flip today's (or `key`'s) occurrence. Returns the new done state. */
  toggleTask: (id: string, key?: string) => boolean;
  /** Idempotent set — what widget actions and notification «تم» use. */
  setTaskDone: (id: string, done: boolean, key?: string) => void;
  addSubtask: (id: string, title: string) => void;
  /** Flip a step for today's (or `key`'s) occurrence. Returns the new done state. */
  toggleSubtask: (id: string, subId: string, key?: string) => boolean;
  /** Idempotent set — what widget `task.step.toggle` actions use. */
  setSubtaskDone: (id: string, subId: string, done: boolean, key?: string) => void;
  removeSubtask: (id: string, subId: string) => void;
  /** Remind again in `minutes`. */
  snooze: (id: string, minutes: number) => void;
  reorderTasks: (ids: string[]) => void;
  /** Delete finished one-off tasks (recurring tasks keep their history). */
  clearCompleted: () => void;
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => {
      const mutate = (id: string, fn: (t: Task) => Task) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));

      return {
        tasks: [],

        addTask: (input) => {
          const id = makeId();
          set((s) => ({
            tasks: [{ subtasks: [], ...input, id, createdAt: Date.now(), done: false }, ...s.tasks],
          }));
          return id;
        },

        updateTask: (id, patch) => mutate(id, (t) => ({ ...t, ...patch, id: t.id })),

        removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

        toggleTask: (id, key = dayKey(Date.now())) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return false;
          const next = !isDoneOn(t, key);
          mutate(id, (x) => setDone(x, next, key));
          return next;
        },

        setTaskDone: (id, done, key = dayKey(Date.now())) => mutate(id, (t) => setDone(t, done, key)),

        addSubtask: (id, title) => {
          const clean = title.trim();
          if (!clean) return;
          const sub: Subtask = { id: makeId(), title: clean, done: false };
          mutate(id, (t) => ({ ...t, subtasks: [...t.subtasks, sub] }));
        },

        toggleSubtask: (id, subId, key = dayKey(Date.now())) => {
          const t = get().tasks.find((x) => x.id === id);
          const s = t?.subtasks.find((x) => x.id === subId);
          if (!t || !s) return false;
          const next = !subtaskDone(t, s, key);
          mutate(id, (x) => ({ ...x, subtasks: withSubtaskDone(x, subId, key, next) }));
          return next;
        },

        setSubtaskDone: (id, subId, done, key = dayKey(Date.now())) =>
          mutate(id, (t) => ({ ...t, subtasks: withSubtaskDone(t, subId, key, done) })),

        removeSubtask: (id, subId) => mutate(id, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) })),

        snooze: (id, minutes) => mutate(id, (t) => ({ ...t, snoozedUntil: Date.now() + minutes * 60000 })),

        reorderTasks: (ids) =>
          set((s) => {
            const rank = new Map(ids.map((id, i) => [id, i]));
            const big = ids.length;
            return { tasks: [...s.tasks].sort((a, b) => (rank.get(a.id) ?? big) - (rank.get(b.id) ?? big)) };
          }),

        clearCompleted: () => set((s) => ({ tasks: s.tasks.filter((t) => t.repeat !== 'none' || !t.done) })),
      };
    },
    { name: 'myzikr:tasks', storage: safeStorage },
  ),
);
