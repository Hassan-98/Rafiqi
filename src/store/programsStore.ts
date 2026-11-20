import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { shiftKey } from '@/store/studyModel';
import type { Grace, ReminderSpec } from '@/data/programsCatalog';
import type { CustomSpec, DayCheck, ProgramRun } from '@/store/programsModel';

const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export interface StartInput {
  templateId?: string;
  custom?: CustomSpec;
  name?: string;
  days?: number;
  startDay: string;
  grace: Grace;
  remindersOn: boolean;
  reminders?: ReminderSpec[];
  linkRef?: string;
}

interface ProgramsState {
  /** Newest first. */
  runs: ProgramRun[];
  start: (input: StartInput) => string;
  /** Merge a day's hand entries (null clears the day's hand entries, keeps the stamp). */
  setCheck: (id: string, key: string, patch: Partial<DayCheck> | null) => void;
  /** Tick / untick an item (a prayer's takbeer, an adhkar set read from a book). */
  toggleItem: (id: string, key: string, item: string) => void;
  /** Add to a day's hand count (never below 0). */
  addAmount: (id: string, key: string, by: number) => void;
  /** Pause from `from` (inclusive) until resumed. */
  pause: (id: string, from: string) => void;
  /** End the open pause the day before `today` (a same-day pause is dropped). */
  resume: (id: string, today: string) => void;
  /** Mark one past day excused (travel, illness): it neither counts nor breaks. */
  excuseDay: (id: string, key: string, on: boolean) => void;
  update: (id: string, patch: Partial<Pick<ProgramRun, 'grace' | 'remindersOn' | 'reminders' | 'name' | 'linkRef'>>) => void;
  stop: (id: string, endedOn: string) => void;
  remove: (id: string) => void;
  /** Reconcile: closed days' store-verified amounts. */
  stamp: (id: string, seen: Record<string, number>) => void;
  finish: (id: string, finishedOn: string) => void;
  markCelebrated: (id: string) => void;
}

/** «برامج التدرّج» (synced: runs union by id, day maps by key). */
export const useProgramsStore = create<ProgramsState>()(
  persist(
    (set) => {
      const mutate = (id: string, fn: (r: ProgramRun) => ProgramRun) =>
        set((s) => ({ runs: s.runs.map((r) => (r.id === id ? fn(r) : r)) }));
      const day = (r: ProgramRun, key: string, fn: (c: DayCheck) => DayCheck): ProgramRun => {
        const c = fn({ ...(r.checks[key] ?? {}) });
        const checks = { ...r.checks };
        if (Object.values(c).some((v) => v !== undefined && !(Array.isArray(v) && v.length === 0))) checks[key] = c;
        else delete checks[key];
        return { ...r, checks };
      };

      return {
        runs: [],

        start: (input) => {
          const id = makeId();
          const run: ProgramRun = {
            id,
            templateId: input.templateId,
            custom: input.custom,
            name: input.name?.trim() || undefined,
            days: input.days,
            startDay: input.startDay,
            grace: input.grace,
            status: 'active',
            pauses: {},
            checks: {},
            remindersOn: input.remindersOn,
            reminders: input.reminders,
            linkRef: input.linkRef,
            createdAt: Date.now(),
          };
          set((s) => ({ runs: [run, ...s.runs] }));
          return id;
        },

        setCheck: (id, key, patch) =>
          mutate(id, (r) =>
            day(r, key, (c) => (patch === null ? { seen: c.seen } : { ...c, ...patch })),
          ),

        toggleItem: (id, key, item) =>
          mutate(id, (r) =>
            day(r, key, (c) => {
              const items = c.items ?? [];
              return { ...c, items: items.includes(item) ? items.filter((x) => x !== item) : [...items, item] };
            }),
          ),

        addAmount: (id, key, by) => mutate(id, (r) => day(r, key, (c) => ({ ...c, amount: Math.max(0, (c.amount ?? 0) + by) || undefined }))),

        pause: (id, from) =>
          mutate(id, (r) => (Object.values(r.pauses).includes(null) ? r : { ...r, pauses: { ...r.pauses, [from]: null } })),

        resume: (id, today) =>
          mutate(id, (r) => {
            const pauses = { ...r.pauses };
            const yesterday = shiftKey(today, -1);
            for (const [from, to] of Object.entries(pauses)) {
              if (to !== null) continue;
              if (yesterday < from) delete pauses[from];
              else pauses[from] = yesterday;
            }
            return { ...r, pauses };
          }),

        excuseDay: (id, key, on) =>
          mutate(id, (r) => {
            const pauses = { ...r.pauses };
            if (on) pauses[key] = key;
            else if (pauses[key] === key) delete pauses[key];
            return { ...r, pauses };
          }),

        update: (id, patch) => mutate(id, (r) => ({ ...r, ...patch })),

        stop: (id, endedOn) => mutate(id, (r) => ({ ...r, status: 'stopped', endedOn })),

        remove: (id) => set((s) => ({ runs: s.runs.filter((r) => r.id !== id) })),

        stamp: (id, seen) =>
          mutate(id, (r) => {
            const checks = { ...r.checks };
            for (const [k, v] of Object.entries(seen)) checks[k] = { ...checks[k], seen: Math.max(v, checks[k]?.seen ?? 0) };
            return { ...r, checks };
          }),

        finish: (id, finishedOn) => mutate(id, (r) => (r.status === 'active' ? { ...r, status: 'done', finishedOn } : r)),

        markCelebrated: (id) => mutate(id, (r) => ({ ...r, celebrated: true })),
      };
    },
    { name: 'myzikr:programs', storage: safeStorage },
  ),
);
