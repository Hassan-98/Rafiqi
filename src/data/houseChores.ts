/**
 * «مهام المنزل» — the chores and their points (owner, 2026-11-16: housework takes
 * her time and is good for her family; the men's side is the shopping, repairs,
 * errands). Points by effort. A man never sees the `for: 'female'` chores (owner,
 * same day); a woman still sees the men's, last. Pure: leaderboardScore reads
 * the same numbers, so retuning a value rescores past days too.
 */
export type HouseMeal = 'breakfast' | 'lunch' | 'dinner';
export const MEALS: HouseMeal[] = ['breakfast', 'lunch', 'dinner'];
export const MEAL_LABEL: Record<HouseMeal, string> = { breakfast: 'الفطور', lunch: 'الغداء', dinner: 'العشاء' };

export interface ChoreKind {
  id: string;
  label: string;
  hint?: string;
  points: number;
}

export interface Chore {
  id: string;
  label: string;
  hint?: string;
  for?: 'female' | 'male';
  /** Cooking: pick the meal too. */
  meals?: true;
  /** One fixed value — or `kinds` to choose from. */
  points?: number;
  kinds?: ChoreKind[];
}

export const CHORES: Chore[] = [
  {
    id: 'cook',
    label: 'الطبخ',
    for: 'female',
    meals: true,
    kinds: [
      { id: 'light', label: 'خفيف', hint: 'تحضير سريع', points: 3 },
      { id: 'normal', label: 'عادي', hint: 'صنف أو صنفان', points: 6 },
      { id: 'full', label: 'طبخة كاملة', hint: 'عدة أصناف', points: 10 },
      { id: 'guests', label: 'لضيوف', hint: 'عزومة أو وليمة', points: 15 },
    ],
  },
  {
    id: 'dishes',
    label: 'غسيل المواعين',
    for: 'female',
    kinds: [
      { id: 'meal', label: 'بعد وجبة', points: 3 },
      { id: 'big', label: 'كمية كبيرة', points: 5 },
    ],
  },
  {
    id: 'laundry',
    label: 'غسيل الملابس',
    for: 'female',
    kinds: [
      { id: 'machine', label: 'بالغسالة', points: 3 },
      { id: 'hand', label: 'يدوياً', points: 6 },
    ],
  },
  { id: 'fold', label: 'نشر الملابس وطيّها', for: 'female', points: 3 },
  { id: 'iron', label: 'كيّ الملابس', for: 'female', points: 4 },
  {
    id: 'clean',
    label: 'تنظيف البيت',
    for: 'female',
    kinds: [
      { id: 'tidy', label: 'ترتيب', points: 3 },
      { id: 'sweep', label: 'كنس ومسح', points: 5 },
      { id: 'deep', label: 'تنظيف شامل', points: 10 },
    ],
  },
  { id: 'scrub', label: 'تنظيف المطبخ أو الحمّام', for: 'female', points: 4 },
  { id: 'kids', label: 'رعاية الأطفال', hint: 'إطعام، استحمام، تنويم', for: 'female', points: 4 },
  { id: 'homework', label: 'مذاكرة الأولاد', points: 5 },
  {
    id: 'shopping',
    label: 'شراء مستلزمات البيت',
    for: 'male',
    kinds: [
      { id: 'small', label: 'أغراض قليلة', points: 3 },
      { id: 'big', label: 'تسوّق كبير', points: 6 },
    ],
  },
  { id: 'repair', label: 'صيانة وإصلاح', for: 'male', points: 6 },
  { id: 'errands', label: 'مشاوير الأهل والأولاد', hint: 'توصيل ومواعيد', for: 'male', points: 3 },
];

const BY_ID = new Map(CHORES.map((c) => [c.id, c]));
export const choreOf = (id: string): Chore | undefined => BY_ID.get(id);

export interface HouseEntry {
  id: string;
  chore: string;
  kind?: string;
  meal?: HouseMeal;
  /** Local day it was done ('yyyy-MM-dd'). */
  day: string;
  at: number;
}

/** A logged chore's points — 0 for one the catalog no longer has. */
export function chorePoints(e: Pick<HouseEntry, 'chore' | 'kind'>): number {
  const c = choreOf(e.chore);
  if (!c) return 0;
  return c.kinds ? (c.kinds.find((k) => k.id === e.kind)?.points ?? 0) : (c.points ?? 0);
}

/** «طبخ الغداء · طبخة كاملة» / «غسيل الملابس · بالغسالة» / «كيّ الملابس». */
export function entryLabel(e: Pick<HouseEntry, 'chore' | 'kind' | 'meal'>): string {
  const c = choreOf(e.chore);
  if (!c) return 'مهمة منزلية';
  const head = c.meals && e.meal ? `طبخ ${MEAL_LABEL[e.meal]}` : c.label;
  const kind = c.kinds?.find((k) => k.id === e.kind)?.label;
  return kind ? `${head} · ${kind}` : head;
}

/** The user's side first, the shared ones, then (for a woman) the men's — a man never sees the women's. */
export function choresFor(gender: 'male' | 'female' | null | undefined): Chore[] {
  if (!gender) return CHORES;
  const rank = (c: Chore) => (c.for === gender ? 0 : c.for ? 2 : 1);
  return CHORES.filter((c) => gender === 'female' || c.for !== 'female').sort((a, b) => rank(a) - rank(b));
}

/** «٣–١٥» for a chore with kinds, «٤» for a fixed one (Latin digits — the UI converts). */
export function pointsRange(c: Chore): string {
  if (!c.kinds) return String(c.points ?? 0);
  const p = c.kinds.map((k) => k.points);
  const lo = Math.min(...p);
  const hi = Math.max(...p);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
