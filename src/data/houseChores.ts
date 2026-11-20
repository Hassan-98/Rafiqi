/**
 * «مهام المنزل» — the chores and their points (owner, 2026-11-16: housework takes
 * her time and is good for her family; the men's side is the shopping, repairs,
 * errands). Points by effort. A man never sees the `for: 'female'` chores (owner,
 * same day); a woman still sees the men's, last. Pure: leaderboardScore reads
 * the same numbers, so retuning a value rescores past days too.
 *
 * Owner 2026-11-19: one thing per chore (never «X أو Y»), every chore with its
 * levels (like the dishes: خفيف · عادي · كثير · عزومة), and a fuller men's side
 * whose top points match the cooking's. Logged entries are synced and kept, so:
 * old kind ids live on as the new levels' ids; a chore that had one value keeps
 * it in `was` for entries logged without a kind; a chore split into several
 * stays here `retired` (scores and labels its history, never offered again).
 *
 * Owner 2026-11-19: only work that SERVES THE HOUSEHOLD — never something for
 * oneself alone (one's car, a garden hobby, painting, grooming…). Removed the
 * same day before release: car, paint, garden — and, by the owner, bake and prep.
 */
export type HouseMeal = 'breakfast' | 'lunch' | 'dinner';
export const MEALS: HouseMeal[] = ['breakfast', 'lunch', 'dinner'];
export const MEAL_LABEL: Record<HouseMeal, string> = { breakfast: 'الفطور', lunch: 'الغداء', dinner: 'العشاء' };

export type ChoreGroup = 'kitchen' | 'clothes' | 'cleaning' | 'kids' | 'outside' | 'fixes';
export const GROUP_LABEL: Record<ChoreGroup, string> = {
  kitchen: 'المطبخ',
  clothes: 'الملابس',
  cleaning: 'النظافة والترتيب',
  kids: 'الأولاد والأسرة',
  outside: 'المشتريات والمشاوير',
  fixes: 'الصيانة والأعمال الثقيلة',
};

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
  group: ChoreGroup;
  for?: 'female' | 'male';
  /** Cooking: pick the meal too. */
  meals?: true;
  /** One fixed value — or `kinds` to choose from. */
  points?: number;
  kinds?: ChoreKind[];
  /** The points of an entry logged without a kind, from before this chore had kinds. */
  was?: number;
  /** Split into other chores: still scores and labels old entries, never offered. */
  retired?: true;
  /** Shown to its own side only (a woman normally sees the men's chores too). */
  ownSideOnly?: true;
}

const ONE_MORE = (one: number, more: number): ChoreKind[] => [
  { id: 'one', label: 'طفل', points: one },
  { id: 'more', label: 'أكثر من طفل', points: more },
];
const ROOMS = (room: number, rooms: number, house: number): ChoreKind[] => [
  { id: 'room', label: 'غرفة', points: room },
  { id: 'rooms', label: 'عدة غرف', points: rooms },
  { id: 'house', label: 'البيت كله', points: house },
];
const LEVELS = (light: number, normal: number, full: number): ChoreKind[] => [
  { id: 'light', label: 'خفيف', points: light },
  { id: 'normal', label: 'عادي', points: normal },
  { id: 'full', label: 'شامل', points: full },
];

export const CHORES: Chore[] = [
  // ── Hers: the kitchen ──
  {
    id: 'cook',
    label: 'الطبخ',
    group: 'kitchen',
    for: 'female',
    meals: true,
    kinds: [
      { id: 'light', label: 'خفيف', hint: 'تحضير سريع', points: 2 }, // owner 2026-11-19: 3 → 2
      { id: 'normal', label: 'عادي', hint: 'صنف أو صنفان', points: 6 },
      { id: 'full', label: 'طبخة كاملة', hint: 'عدة أصناف', points: 10 },
      { id: 'guests', label: 'لضيوف', hint: 'عزومة أو وليمة', points: 15 },
    ],
  },
  {
    id: 'sweets',
    label: 'الحلويات',
    group: 'kitchen',
    for: 'female',
    kinds: [
      { id: 'light', label: 'خفيفة', hint: 'صنف سريع', points: 3 },
      { id: 'normal', label: 'عادية', points: 5 },
      { id: 'occasion', label: 'لمناسبة', hint: 'عيد أو عزومة', points: 10 },
    ],
  },
  {
    id: 'dishes',
    label: 'غسيل المواعين',
    group: 'kitchen',
    for: 'female',
    kinds: [
      { id: 'light', label: 'خفيف', hint: 'أكواب وأطباق قليلة', points: 2 },
      { id: 'meal', label: 'عادي', hint: 'بعد وجبة', points: 3 },
      { id: 'big', label: 'كثير', hint: 'مواعين اليوم أو طبخة كبيرة', points: 5 },
      { id: 'guests', label: 'عزومة', hint: 'بعد الضيوف', points: 8 },
    ],
  },
  {
    id: 'kitchen',
    label: 'تنظيف المطبخ',
    group: 'kitchen',
    for: 'female',
    kinds: [
      { id: 'light', label: 'سريع', hint: 'مسح الأسطح', points: 2 },
      { id: 'normal', label: 'عادي', hint: 'الأسطح والموقد والأرض', points: 4 },
      { id: 'full', label: 'شامل', hint: 'الثلاجة والفرن والخزائن', points: 8 },
    ],
  },
  // ── Hers: the clothes ──
  {
    id: 'laundry',
    label: 'غسيل الملابس',
    group: 'clothes',
    for: 'female',
    kinds: [
      { id: 'machine', label: 'غسلة واحدة', hint: 'بالغسالة', points: 3 },
      { id: 'many', label: 'عدة غسلات', hint: 'بالغسالة', points: 5 },
      { id: 'hand', label: 'يدوياً', points: 6 },
      { id: 'heavy', label: 'ثقيل', hint: 'بطاطين ومفارش وسجاد', points: 8 },
    ],
  },
  {
    id: 'hang',
    label: 'نشر الغسيل',
    group: 'clothes',
    for: 'female',
    kinds: [
      { id: 'light', label: 'قليل', points: 1 },
      { id: 'normal', label: 'عادي', points: 2 },
      { id: 'full', label: 'كثير', points: 3 },
    ],
  },
  {
    id: 'fold',
    label: 'طيّ الملابس',
    hint: 'مع ترتيبها في الخزانة',
    group: 'clothes',
    for: 'female',
    was: 3,
    kinds: [
      { id: 'light', label: 'قليل', points: 1 },
      { id: 'normal', label: 'عادي', points: 2 },
      { id: 'full', label: 'كثير', points: 4 },
    ],
  },
  {
    id: 'iron',
    label: 'كيّ الملابس',
    group: 'clothes',
    for: 'female',
    was: 4,
    kinds: [
      { id: 'light', label: 'قطع قليلة', points: 2 },
      { id: 'normal', label: 'عادي', points: 4 },
      { id: 'full', label: 'كثير', points: 6 },
    ],
  },
  {
    id: 'sew',
    label: 'تصليح الملابس',
    hint: 'خياطة، رتق، أزرار',
    group: 'clothes',
    for: 'female',
    kinds: [
      { id: 'light', label: 'بسيط', hint: 'زر أو رتق', points: 2 },
      { id: 'normal', label: 'عادي', hint: 'تقصير أو تضييق', points: 4 },
      { id: 'full', label: 'تفصيل قطعة', hint: 'خياطة قطعة كاملة', points: 8 },
    ],
  },
  // ── Hers: cleaning and tidying ──
  { id: 'tidy', label: 'ترتيب البيت', group: 'cleaning', for: 'female', kinds: ROOMS(1, 3, 5) },
  { id: 'sweep', label: 'كنس الأرضيات', group: 'cleaning', for: 'female', kinds: ROOMS(1, 3, 5) },
  { id: 'mop', label: 'مسح الأرضيات', group: 'cleaning', for: 'female', kinds: ROOMS(2, 4, 6) },
  {
    id: 'bathroom',
    label: 'تنظيف الحمّام',
    group: 'cleaning',
    for: 'female',
    kinds: [
      { id: 'light', label: 'سريع', points: 2 },
      { id: 'normal', label: 'عادي', points: 4 },
      { id: 'full', label: 'شامل', hint: 'البلاط والأدوات الصحية', points: 6 },
    ],
  },
  {
    id: 'deep',
    label: 'تنظيف موسمي',
    hint: 'تنظيف شامل قبل رمضان أو العيد',
    group: 'cleaning',
    for: 'female',
    kinds: [
      { id: 'room', label: 'غرفة كاملة', points: 6 },
      { id: 'rooms', label: 'عدة غرف', points: 9 },
      { id: 'house', label: 'البيت كله', points: 12 },
    ],
  },
  // ── Hers: the children ──
  {
    id: 'baby',
    label: 'رعاية الرضيع',
    hint: 'رضاعة، تغيير، تنويم',
    group: 'kids',
    for: 'female',
    kinds: [
      { id: 'part', label: 'بعض اليوم', points: 4 },
      { id: 'night', label: 'سهر الليل', points: 5 },
      { id: 'day', label: 'اليوم كله', points: 8 },
    ],
  },
  {
    id: 'feed',
    label: 'إطعام الأطفال',
    group: 'kids',
    for: 'female',
    kinds: [
      { id: 'one', label: 'وجبة', points: 2 },
      { id: 'more', label: 'عدة وجبات', points: 4 },
    ],
  },
  { id: 'kidsBath', label: 'استحمام الأطفال', group: 'kids', for: 'female', kinds: ONE_MORE(2, 4) },
  { id: 'kidsSleep', label: 'تنويم الأطفال', group: 'kids', for: 'female', kinds: ONE_MORE(1, 3) },
  {
    id: 'schoolPrep',
    label: 'تجهيز الأولاد للمدرسة',
    hint: 'الملابس والحقيبة والفطور',
    group: 'kids',
    for: 'female',
    kinds: ONE_MORE(2, 4),
  },
  // ── Both ──
  {
    id: 'homework',
    label: 'مذاكرة الأولاد',
    group: 'kids',
    was: 5,
    kinds: [
      { id: 'half', label: 'نصف ساعة', points: 3 },
      { id: 'hour', label: 'ساعة', points: 5 },
      { id: 'more', label: 'أكثر من ساعة', points: 8 },
    ],
  },
  {
    id: 'kidsTime',
    label: 'وقت مع الأولاد',
    hint: 'لعب، قصة، تعليم',
    group: 'kids',
    kinds: [
      { id: 'half', label: 'نصف ساعة', points: 2 },
      { id: 'hour', label: 'ساعة', points: 4 },
      { id: 'more', label: 'أكثر من ساعة', points: 6 },
    ],
  },
  {
    id: 'nursing',
    label: 'تمريض مريض',
    hint: 'القيام على مريض في البيت',
    group: 'kids',
    kinds: [
      { id: 'part', label: 'بعض اليوم', points: 4 },
      { id: 'day', label: 'اليوم كله', points: 8 },
    ],
  },
  // ── His: shopping and errands ──
  {
    id: 'shopping',
    label: 'مشتريات البيت',
    group: 'outside',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'small', label: 'أغراض قليلة', points: 3 },
      { id: 'normal', label: 'عادية', points: 5 },
      { id: 'big', label: 'تموين كبير', hint: 'مشتريات الشهر', points: 8 },
      { id: 'occasion', label: 'لمناسبة', hint: 'عزومة أو عيد', points: 12 },
    ],
  },
  {
    id: 'schoolRun',
    label: 'توصيل الأولاد',
    hint: 'المدرسة والدروس',
    group: 'outside',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'one', label: 'مشوار', points: 2 },
      { id: 'both', label: 'ذهاب وعودة', points: 4 },
    ],
  },
  {
    id: 'errands',
    label: 'مشاوير الأهل',
    hint: 'طبيب، زيارات',
    group: 'outside',
    for: 'male',
    ownSideOnly: true,
    was: 3,
    kinds: [
      { id: 'short', label: 'قصير', points: 3 },
      { id: 'long', label: 'طويل', points: 6 },
    ],
  },
  {
    id: 'papers',
    label: 'قضاء المصالح',
    hint: 'فواتير، أوراق، معاملات',
    group: 'outside',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'light', label: 'بسيطة', points: 3 },
      { id: 'long', label: 'تأخذ ساعات', points: 7 },
    ],
  },
  // ── His: repairs and heavy work ──
  {
    id: 'repair',
    label: 'إصلاحات البيت',
    hint: 'كهرباء، سباكة، نجارة',
    group: 'fixes',
    for: 'male',
    ownSideOnly: true,
    was: 6,
    kinds: [
      { id: 'light', label: 'بسيطة', hint: 'تغيير لمبة أو صنبور', points: 4 },
      { id: 'normal', label: 'متوسطة', points: 7 },
      // 15 like cooking for guests: the men's side keeps its top level with hers (paint, 15, was removed).
      { id: 'full', label: 'كبيرة', hint: 'تأخذ ساعات', points: 15 },
    ],
  },
  {
    id: 'install',
    label: 'تركيب الأثاث',
    hint: 'رفوف، دواليب، أجهزة',
    group: 'fixes',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'light', label: 'قطعة صغيرة', points: 3 },
      { id: 'normal', label: 'عادي', points: 6 },
      { id: 'full', label: 'كبير', hint: 'دولاب أو مكيّف', points: 10 },
    ],
  },
  {
    id: 'heavy',
    label: 'حمل الأغراض الثقيلة',
    hint: 'الغاز، المياه، الأثاث',
    group: 'fixes',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'light', label: 'أنبوبة أو جركن', points: 2 },
      { id: 'normal', label: 'عادي', points: 4 },
      { id: 'full', label: 'نقل أثاث', points: 8 },
    ],
  },
  {
    id: 'outdoor',
    label: 'تنظيف خارج البيت',
    hint: 'الفناء، السطح، المدخل، السلّم',
    group: 'fixes',
    for: 'male',
    ownSideOnly: true,
    kinds: LEVELS(3, 5, 8),
  },
  // ── His: in the house ──
  {
    id: 'helpHome',
    label: 'مساعدة أهلك في البيت',
    hint: 'اقتداءً بالنبي ﷺ — غسيل، ترتيب، طبخ',
    group: 'cleaning',
    for: 'male',
    // Her own chores already are this, one by one.
    ownSideOnly: true,
    kinds: [
      { id: 'light', label: 'خفيفة', points: 3 },
      { id: 'normal', label: 'عادية', points: 5 },
      { id: 'full', label: 'كبيرة', points: 8 },
    ],
  },
  {
    id: 'trash',
    label: 'إخراج القمامة',
    group: 'cleaning',
    for: 'male',
    ownSideOnly: true,
    kinds: [
      { id: 'one', label: 'كيس', points: 1 },
      { id: 'more', label: 'كثير', points: 2 },
    ],
  },
  {
    id: 'guests',
    label: 'خدمة الضيوف',
    hint: 'استقبال وضيافة',
    group: 'kids',
    for: 'male',
    kinds: [
      { id: 'light', label: 'ضيف أو اثنان', points: 3 },
      { id: 'full', label: 'عزومة', points: 8 },
    ],
  },
  // ── Retired (split 2026-11-19) — their logged entries still count ──
  {
    id: 'clean',
    label: 'تنظيف البيت',
    group: 'cleaning',
    for: 'female',
    retired: true,
    kinds: [
      { id: 'tidy', label: 'ترتيب', points: 3 },
      { id: 'sweep', label: 'كنس ومسح', points: 5 },
      { id: 'deep', label: 'تنظيف شامل', points: 10 },
    ],
  },
  { id: 'scrub', label: 'تنظيف المطبخ أو الحمّام', group: 'cleaning', for: 'female', retired: true, points: 4 },
  { id: 'kids', label: 'رعاية الأطفال', group: 'kids', for: 'female', retired: true, points: 4 },
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

/** A logged chore's points — 0 for one the catalog no longer has, or a kind it doesn't. */
export function chorePoints(e: Pick<HouseEntry, 'chore' | 'kind'>): number {
  const c = choreOf(e.chore);
  if (!c) return 0;
  if (e.kind == null) return c.was ?? c.points ?? 0;
  return c.kinds?.find((k) => k.id === e.kind)?.points ?? 0;
}

/** «طبخ الغداء · طبخة كاملة» / «غسيل الملابس · غسلة واحدة» / «كيّ الملابس». */
export function entryLabel(e: Pick<HouseEntry, 'chore' | 'kind' | 'meal'>): string {
  const c = choreOf(e.chore);
  if (!c) return 'مهمة منزلية';
  const head = c.meals && e.meal ? `طبخ ${MEAL_LABEL[e.meal]}` : c.label;
  const kind = c.kinds?.find((k) => k.id === e.kind)?.label;
  return kind ? `${head} · ${kind}` : head;
}

/** The user's side first, the shared ones, then (for a woman) the men's — a man never sees the women's. */
export function choresFor(gender: 'male' | 'female' | null | undefined): Chore[] {
  const live = CHORES.filter((c) => !c.retired);
  if (!gender) return live;
  const rank = (c: Chore) => (c.for === gender ? 0 : c.for ? 2 : 1);
  return live
    .filter((c) => (gender === 'female' || c.for !== 'female') && !(c.ownSideOnly && c.for && c.for !== gender))
    .sort((a, b) => rank(a) - rank(b));
}

/** «٣–١٥» for a chore with kinds, «٤» for a fixed one (Latin digits — the UI converts). */
export function pointsRange(c: Chore): string {
  if (!c.kinds) return String(c.points ?? 0);
  const p = c.kinds.map((k) => k.points);
  const lo = Math.min(...p);
  const hi = Math.max(...p);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
