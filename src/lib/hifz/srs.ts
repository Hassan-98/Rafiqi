/**
 * Spaced-repetition scheduling for hifz review (SM-2-lite).
 *
 * Each memorized unit (a surah, today) carries an interval that grows with
 * good recitations and shrinks with poor ones; `dueAt` drives the
 * "مراجعة اليوم" queue on the Hifz home.
 */

export interface SrsFields {
  intervalDays: number;
  dueAt: number; // epoch ms
  reps: number;
  lastReviewedAt: number;
  lastAccuracy: number; // 0..1
}

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 60;

export function gradeFromAccuracy(accuracy: number): SrsGrade {
  if (accuracy >= 0.95) return 'easy';
  if (accuracy >= 0.85) return 'good';
  if (accuracy >= 0.6) return 'hard';
  return 'again';
}

/** Compute the next review schedule after a session with the given accuracy. */
export function nextReview(prev: SrsFields | undefined, accuracy: number, now = Date.now()): SrsFields {
  const grade = gradeFromAccuracy(accuracy);
  const interval = prev?.intervalDays ?? 0;
  let nextInterval: number;
  switch (grade) {
    case 'again':
      // Struggled — bring it back the same day (a few hours later).
      nextInterval = 0;
      break;
    case 'hard':
      nextInterval = Math.max(1, Math.round(interval * 1.25));
      break;
    case 'good':
      nextInterval = interval <= 0 ? 1 : Math.round(interval * 2);
      break;
    case 'easy':
    default:
      nextInterval = interval <= 0 ? 2 : Math.round(interval * 2.5) + 1;
      break;
  }
  nextInterval = Math.min(MAX_INTERVAL_DAYS, nextInterval);
  const dueAt = grade === 'again' ? now + 4 * 60 * 60 * 1000 : now + nextInterval * DAY_MS;
  return {
    intervalDays: nextInterval,
    dueAt,
    reps: (prev?.reps ?? 0) + 1,
    lastReviewedAt: now,
    lastAccuracy: accuracy,
  };
}

/** Human label for the next review distance ("اليوم", "غداً", "بعد ٥ أيام"). */
export function dueLabel(dueAt: number, now = Date.now()): string {
  const days = Math.ceil((dueAt - now) / DAY_MS);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'غداً';
  return `بعد ${days} أيام`;
}
