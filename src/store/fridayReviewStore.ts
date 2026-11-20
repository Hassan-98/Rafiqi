import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { REMINDER_DEFAULT, focusOfWeek, type Focus, type ReminderPrefs } from '@/services/fridayReview';

export type Kept = 'yes' | 'partly' | 'no';

/** One week's review, keyed by the week's Friday. Private: never leaves the user's own (synced) storage. */
export interface ReviewEntry {
  week: string;
  /** Question id → 1–5 (scale) or 1 / 0 (yes / no). */
  answers: Record<string, number>;
  thanks?: string;
  istighfar?: string;
  resolve?: string;
  /** Next week's one goal. */
  focus?: Focus;
  /** «هل وفّيت بعزمك؟» about the previous week's focus. */
  kept?: Kept;
  /** Completed («أتممت محاسبتي») — the first completion is kept. */
  doneAt?: number;
  /** Snapshot at completion, for the journal. */
  score?: number | null;
  points?: number;
  best?: string;
  weak?: string;
}

interface FridayReviewState {
  reviews: Record<string, ReviewEntry>;
  /** Friday key → the sunan ticked that day. */
  sunan: Record<string, string[]>;
  /** The user's own question set (bank ids); null = the weekly rotation. */
  questionIds: string[] | null;
  custom: { id: string; text: string }[];
  reminder: ReminderPrefs;
  patch: (week: string, p: Partial<Omit<ReviewEntry, 'week' | 'answers'>>) => void;
  answer: (week: string, questionId: string, value: number | null) => void;
  complete: (week: string, snap: Pick<ReviewEntry, 'score' | 'points' | 'best' | 'weak'>) => void;
  toggleSunnah: (friday: string, id: string) => void;
  setQuestionIds: (ids: string[] | null) => void;
  addCustom: (text: string) => void;
  removeCustom: (id: string) => void;
  setReminder: (p: Partial<ReminderPrefs>) => void;
}

const blank = (week: string): ReviewEntry => ({ week, answers: {} });
const makeId = () => `q${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** «محاسبة الجمعة» (myzikr:friday-review — synced with the user's own data; maps union by week). */
export const useFridayReviewStore = create<FridayReviewState>()(
  persist(
    (set) => {
      const edit = (week: string, fn: (e: ReviewEntry) => ReviewEntry) =>
        set((s) => ({ reviews: { ...s.reviews, [week]: fn(s.reviews[week] ?? blank(week)) } }));
      return {
        reviews: {},
        sunan: {},
        questionIds: null,
        custom: [],
        reminder: REMINDER_DEFAULT,
        patch: (week, p) => edit(week, (e) => ({ ...e, ...p })),
        answer: (week, q, v) =>
          edit(week, (e) => {
            const answers = { ...e.answers };
            if (v == null) delete answers[q];
            else answers[q] = v;
            return { ...e, answers };
          }),
        complete: (week, snap) => edit(week, (e) => ({ ...e, ...snap, doneAt: e.doneAt ?? Date.now() })),
        toggleSunnah: (friday, id) =>
          set((s) => {
            const cur = s.sunan[friday] ?? [];
            return { sunan: { ...s.sunan, [friday]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
          }),
        setQuestionIds: (ids) => set({ questionIds: ids }),
        addCustom: (text) => set((s) => ({ custom: [...s.custom, { id: makeId(), text: text.trim() }] })),
        removeCustom: (id) => set((s) => ({ custom: s.custom.filter((c) => c.id !== id) })),
        setReminder: (p) => set((s) => ({ reminder: { ...s.reminder, ...p } })),
      };
    },
    { name: 'myzikr:friday-review', storage: safeStorage },
  ),
);

/** This week's focus (chosen in last week's review) — for Home. */
export const selectCurrentFocus = (s: Pick<FridayReviewState, 'reviews'>, now = new Date()): Focus | null => focusOfWeek(s.reviews, now);

export const useCurrentFocus = (): Focus | null => useFridayReviewStore((s) => selectCurrentFocus(s));
