import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { lessonsDone, type CircleStatus, type LessonLog, type StudyCircle } from '@/store/studyModel';

export type NewCircleInput = Omit<StudyCircle, 'id' | 'createdAt' | 'log' | 'status'> & Partial<Pick<StudyCircle, 'status'>>;

const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const MAX_LOG = 1000;

interface StudyState {
  circles: StudyCircle[];
  addCircle: (input: NewCircleInput) => string;
  updateCircle: (id: string, patch: Partial<StudyCircle>) => void;
  removeCircle: (id: string) => void;
  /** Append a lesson/session entry (defaults: now, attended for live, watched otherwise). */
  logSession: (id: string, entry?: Partial<Omit<LessonLog, 'id'>>) => string | undefined;
  updateLog: (id: string, logId: string, patch: Partial<LessonLog>) => void;
  removeLog: (id: string, logId: string) => void;
  /** Mark the next lesson done (series numbering) — same as logSession with n. */
  markLessonDone: (id: string, extra?: Partial<Omit<LessonLog, 'id'>>) => string | undefined;
  /** Undo the most recent log entry. */
  undoLastLesson: (id: string) => void;
  setStatus: (id: string, status: CircleStatus) => void;
  /** Persist a new order (ids not listed keep their relative order at the end). */
  reorderCircles: (ids: string[]) => void;
}

/** A finished series closes itself; undoing below the total reopens it. */
function withAutoStatus(c: StudyCircle): StudyCircle {
  if (c.format !== 'series' || !c.totalLessons) return c;
  const full = lessonsDone(c) >= c.totalLessons;
  if (full && c.status === 'active') return { ...c, status: 'done' };
  if (!full && c.status === 'done') return { ...c, status: 'active' };
  return c;
}

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => {
      const mutate = (id: string, fn: (c: StudyCircle) => StudyCircle) =>
        set((s) => ({ circles: s.circles.map((c) => (c.id === id ? withAutoStatus(fn(c)) : c)) }));

      return {
        circles: [],

        addCircle: (input) => {
          const id = makeId();
          const circle: StudyCircle = { ...input, id, createdAt: Date.now(), log: [], status: input.status ?? 'active' };
          set((s) => ({ circles: [circle, ...s.circles] }));
          return id;
        },

        updateCircle: (id, patch) => mutate(id, (c) => ({ ...c, ...patch, id: c.id })),

        removeCircle: (id) => set((s) => ({ circles: s.circles.filter((c) => c.id !== id) })),

        logSession: (id, entry = {}) => {
          const c = get().circles.find((x) => x.id === id);
          if (!c) return undefined;
          const logId = makeId();
          const log: LessonLog = {
            date: Date.now(),
            status: c.format === 'live' ? 'attended' : 'watched',
            ...entry,
            id: logId,
          };
          mutate(id, (x) => ({ ...x, log: [log, ...x.log].sort((a, b) => b.date - a.date).slice(0, MAX_LOG) }));
          return logId;
        },

        updateLog: (id, logId, patch) =>
          mutate(id, (c) => ({ ...c, log: c.log.map((l) => (l.id === logId ? { ...l, ...patch, id: l.id } : l)) })),

        removeLog: (id, logId) => mutate(id, (c) => ({ ...c, log: c.log.filter((l) => l.id !== logId) })),

        markLessonDone: (id, extra) => {
          const c = get().circles.find((x) => x.id === id);
          if (!c) return undefined;
          return get().logSession(id, { n: lessonsDone(c) + 1, ...extra });
        },

        undoLastLesson: (id) => mutate(id, (c) => ({ ...c, log: c.log.slice(1) })),

        setStatus: (id, status) => set((s) => ({ circles: s.circles.map((c) => (c.id === id ? { ...c, status } : c)) })),

        reorderCircles: (ids) =>
          set((s) => {
            const rank = new Map(ids.map((id, i) => [id, i]));
            const big = ids.length;
            return {
              circles: [...s.circles].sort((a, b) => (rank.get(a.id) ?? big) - (rank.get(b.id) ?? big)),
            };
          }),
      };
    },
    { name: 'myzikr:study', storage: safeStorage },
  ),
);
