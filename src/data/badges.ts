/**
 * «خزانة الأوسمة» — the badge catalog (rebuilt 2026-11).
 *
 * Every badge measures ONE metric (computed in services/badgeMetrics.ts) and
 * unlocks at `target`. Badges sharing a metric form a TRACK — a ladder of
 * tiers from easy to very hard (e.g. سلسلة الفجر ٣ → ٧ → ٤٠ → ١٠٠ → ٣٦٥).
 * Metrics, not badges, own the category, unit and audience.
 *
 * Ids are permanent: unlocked ids live in the user's store, so never rename
 * or reuse one (the pre-2026-11 ids are all kept).
 */

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const RARITY_RANK: Record<BadgeRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
export const RARITY_LABEL_AR: Record<BadgeRarity, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  mythic: 'فريد',
};
export const RARITY_POINTS: Record<BadgeRarity, number> = { common: 10, rare: 25, epic: 60, legendary: 150, mythic: 400 };

// ── Categories («أبواب الأوسمة») ───────────────────────────────────────────
export type BadgeCategory =
  | 'days'
  | 'prayer'
  | 'sunnah'
  | 'mosque'
  | 'qiyam'
  | 'dhikr'
  | 'quran'
  | 'awrad'
  | 'fasting'
  | 'seasons'
  | 'sadaqah'
  | 'knowledge'
  | 'habits'
  | 'steadfast';

export interface CategoryMeta {
  id: BadgeCategory;
  label: string;
  hint: string;
  /** Where the worship behind it is done (the «ابدأ الآن» action). */
  to: string;
}

export const BADGE_CATEGORIES: CategoryMeta[] = [
  { id: 'days', label: 'الأيام الجامعة', hint: 'أيام تجمع فيها أبواب الخير', to: '/module/prayers' },
  { id: 'prayer', label: 'الفرائض', hint: 'الصلوات الخمس وسلاسلها', to: '/module/prayers' },
  { id: 'sunnah', label: 'السنن والنوافل', hint: 'الرواتب والضحى', to: '/module/prayers' },
  { id: 'mosque', label: 'المسجد', hint: 'الجماعة والجمعة', to: '/module/prayers' },
  { id: 'qiyam', label: 'القيام والوتر', hint: 'ليلك مع الله', to: '/targets?tab=qiyam' },
  { id: 'dhikr', label: 'الأذكار والتسبيح', hint: 'الحصن اليومي', to: '/adhkar' },
  { id: 'quran', label: 'القرآن والحفظ', hint: 'التلاوة والختمات والتسميع', to: '/quran' },
  { id: 'awrad', label: 'الأوراد', hint: 'أورادك المتجددة', to: '/targets' },
  { id: 'fasting', label: 'الصيام', hint: 'صيام التطوع', to: '/module/fasting' },
  { id: 'seasons', label: 'المواسم', hint: 'رمضان والعشر والأيام الفاضلة', to: '/calendar' },
  { id: 'sadaqah', label: 'الصدقة', hint: 'العطاء ودوامه', to: '/sadaqah' },
  { id: 'knowledge', label: 'العلم', hint: 'الدروس والأسماء والحديث', to: '/study?tab=circles' },
  { id: 'habits', label: 'العادات والمهام', hint: 'ما ينفعك كل يوم', to: '/study?tab=habits' },
  { id: 'steadfast', label: 'الثبات', hint: 'المداومة على العبادة', to: '/stats' },
];

export const CATEGORY_BY_ID = Object.fromEntries(BADGE_CATEGORIES.map((c) => [c.id, c])) as Record<BadgeCategory, CategoryMeta>;

// ── Units (Arabic count forms: one, two, 3–10, 11+) ────────────────────────
export type Forms = [string, string, string, string];
export const UNITS = {
  days: ['يوم واحد', 'يومان', 'أيام', 'يوماً'],
  nights: ['ليلة واحدة', 'ليلتان', 'ليالٍ', 'ليلة'],
  rakaat: ['ركعة واحدة', 'ركعتان', 'ركعات', 'ركعة'],
  reps: ['مرة واحدة', 'مرتان', 'مرات', 'مرة'],
  pages: ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  khatma: ['ختمة واحدة', 'ختمتان', 'ختمات', 'ختمة'],
  weeks: ['أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعاً'],
  months: ['شهر واحد', 'شهران', 'أشهر', 'شهراً'],
  awrad: ['وِرد واحد', 'وِردان', 'أوراد', 'وِرداً'],
  sunnah: ['نافلة واحدة', 'نافلتان', 'نوافل', 'نافلة'], // not «٥٠ سنة» (reads as years)
  prayers: ['صلاة واحدة', 'صلاتان', 'صلوات', 'صلاة'],
  sessions: ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'],
  surahs: ['سورة واحدة', 'سورتان', 'سور', 'سورة'],
  lessons: ['درس واحد', 'درسان', 'دروس', 'درساً'],
  sadaqat: ['صدقة واحدة', 'صدقتان', 'صدقات', 'صدقة'],
  names: ['اسم واحد', 'اسمان', 'أسماء', 'اسماً'],
  hadith: ['حديث واحد', 'حديثان', 'أحاديث', 'حديثاً'],
  tasks: ['مهمة واحدة', 'مهمتان', 'مهام', 'مهمة'],
  fridays: ['جمعة واحدة', 'جمعتان', 'جُمَع', 'جمعة'],
  sets: ['باب واحد', 'بابان', 'أبواب', 'باباً'],
  series: ['سلسلة واحدة', 'سلسلتان', 'سلاسل', 'سلسلة'],
  subjects: ['علم واحد', 'علمان', 'علوم', 'علماً'],
  juz: ['جزء واحد', 'جزءان', 'أجزاء', 'جزءاً'],
  kinds: ['نوع واحد', 'نوعان', 'أنواع', 'نوعاً'],
} satisfies Record<string, Forms>;
export type Unit = keyof typeof UNITS;

// ── Metrics ────────────────────────────────────────────────────────────────
interface MetricMeta {
  /** The track's name. */
  label: string;
  cat: BadgeCategory;
  unit: Unit;
  /** A chain: the best-ever run unlocks it; locked progress shows the live run. */
  streak?: true;
  audience?: 'male';
}

/** Every measure. Computed in services/badgeMetrics.ts (that file must cover each key). */
export const METRICS = {
  // الثبات
  overall_streak: { label: 'سلسلة العبادة', cat: 'steadfast', unit: 'days', streak: true },
  active_days: { label: 'أيام العبادة', cat: 'steadfast', unit: 'days' },
  consistent_weeks: { label: 'أسابيع الثبات', cat: 'steadfast', unit: 'weeks' },
  active_full_months: { label: 'أشهر بلا انقطاع', cat: 'steadfast', unit: 'months' },
  early_days: { label: 'البكور', cat: 'steadfast', unit: 'days' },
  comeback: { label: 'العودة', cat: 'steadfast', unit: 'reps' },
  // الفرائض
  prayers_streak: { label: 'سلسلة الصلوات الخمس', cat: 'prayer', unit: 'days', streak: true },
  prayer_days: { label: 'أيام الفرائض الكاملة', cat: 'prayer', unit: 'days' },
  fard_total: { label: 'الفرائض المؤدّاة', cat: 'prayer', unit: 'prayers' },
  prayer_full_weeks: { label: 'أسابيع الفرائض', cat: 'prayer', unit: 'weeks' },
  prayer_months: { label: 'أشهر الفرائض', cat: 'prayer', unit: 'months' },
  fajr_streak: { label: 'سلسلة الفجر', cat: 'prayer', unit: 'days', streak: true },
  dhuhr_streak: { label: 'سلسلة الظهر', cat: 'prayer', unit: 'days', streak: true },
  asr_streak: { label: 'سلسلة العصر', cat: 'prayer', unit: 'days', streak: true },
  maghrib_streak: { label: 'سلسلة المغرب', cat: 'prayer', unit: 'days', streak: true },
  isha_streak: { label: 'سلسلة العشاء', cat: 'prayer', unit: 'days', streak: true },
  bardain_days: { label: 'البَردان', cat: 'prayer', unit: 'days' },
  // السنن والنوافل
  rawatib_full_days: { label: 'السنن الرواتب', cat: 'sunnah', unit: 'days' },
  rawatib_streak: { label: 'سلسلة الرواتب', cat: 'sunnah', unit: 'days', streak: true },
  fajr_sunnah_streak: { label: 'ركعتا الفجر', cat: 'sunnah', unit: 'days', streak: true },
  sunnah_total: { label: 'السنن والنوافل', cat: 'sunnah', unit: 'sunnah' },
  nawafil_rakaat: { label: 'ركعات النوافل', cat: 'sunnah', unit: 'rakaat' },
  duha_days: { label: 'أيام الضحى', cat: 'sunnah', unit: 'days' },
  duha_streak: { label: 'سلسلة الضحى', cat: 'sunnah', unit: 'days', streak: true },
  duha_rakaat: { label: 'ركعات الضحى', cat: 'sunnah', unit: 'rakaat' },
  duha_eight_days: { label: 'ضحى الثماني', cat: 'sunnah', unit: 'days' },
  sunnah_duha_days: { label: 'يوم السنن', cat: 'sunnah', unit: 'days' },
  // المسجد (men)
  mosque_prayers: { label: 'صلوات المسجد', cat: 'mosque', unit: 'prayers', audience: 'male' },
  mosque_full_days: { label: 'أيام المسجد الكاملة', cat: 'mosque', unit: 'days', audience: 'male' },
  mosque_full_streak: { label: 'سلسلة المسجد', cat: 'mosque', unit: 'days', streak: true, audience: 'male' },
  mosque_fajr: { label: 'الفجر في المسجد', cat: 'mosque', unit: 'prayers', audience: 'male' },
  mosque_fajr_streak: { label: 'سلسلة الفجر في المسجد', cat: 'mosque', unit: 'days', streak: true, audience: 'male' },
  mosque_fajr_isha_days: { label: 'العشاء والفجر في جماعة', cat: 'mosque', unit: 'days', audience: 'male' },
  jumuah: { label: 'الجمعة', cat: 'mosque', unit: 'fridays', audience: 'male' },
  // القيام والوتر
  qiyam_streak: { label: 'سلسلة القيام', cat: 'qiyam', unit: 'nights', streak: true },
  qiyam_nights: { label: 'ليالي القيام', cat: 'qiyam', unit: 'nights' },
  qiyam_rakaat: { label: 'ركعات القيام', cat: 'qiyam', unit: 'rakaat' },
  qiyam_witr: { label: 'ليالي الوتر', cat: 'qiyam', unit: 'nights' },
  qiyam_witr_streak: { label: 'سلسلة الوتر', cat: 'qiyam', unit: 'nights', streak: true },
  qiyam_eleven: { label: 'إحدى عشرة ركعة', cat: 'qiyam', unit: 'nights' },
  qiyam_last_third: { label: 'الثلث الأخير', cat: 'qiyam', unit: 'nights' },
  // الأذكار
  dhikr_streak: { label: 'سلسلة الأذكار', cat: 'dhikr', unit: 'days', streak: true },
  dhikr_days: { label: 'أيام الذكر', cat: 'dhikr', unit: 'days' },
  dhikr_reps: { label: 'عدد الذكر', cat: 'dhikr', unit: 'reps' },
  dhikr_morning_streak: { label: 'أذكار الصباح', cat: 'dhikr', unit: 'days', streak: true },
  dhikr_evening_streak: { label: 'أذكار المساء', cat: 'dhikr', unit: 'days', streak: true },
  dhikr_both_days: { label: 'الصباح والمساء معاً', cat: 'dhikr', unit: 'days' },
  dhikr_post_prayer_days: { label: 'أذكار الصلوات الخمس', cat: 'dhikr', unit: 'days' },
  post_prayer_adhkar: { label: 'التعقيب بعد الصلوات', cat: 'dhikr', unit: 'prayers' },
  post_prayer_streak: { label: 'سلسلة أذكار الصلوات', cat: 'dhikr', unit: 'days', streak: true },
  dhikr_sleep_streak: { label: 'أذكار النوم', cat: 'dhikr', unit: 'nights', streak: true },
  tasbih_100_days: { label: 'مئة تسبيحة', cat: 'dhikr', unit: 'days' },
  dhikr_day_max: { label: 'يومٌ لا يفتر', cat: 'dhikr', unit: 'reps' },
  dhikr_sets: { label: 'أبواب الأذكار', cat: 'dhikr', unit: 'sets' },
  // القرآن والحفظ
  quran_streak: { label: 'سلسلة القرآن', cat: 'quran', unit: 'days', streak: true },
  quran_pages: { label: 'صفحات الوِرد', cat: 'quran', unit: 'pages' },
  quran_khatmat: { label: 'الختمات', cat: 'quran', unit: 'khatma' },
  quran_juz_days: { label: 'جزء في يوم', cat: 'quran', unit: 'days' },
  quran_day_max: { label: 'مجلس طويل', cat: 'quran', unit: 'pages' },
  // أنواع الختمات في مصحفي — كلٌّ بمقياسه: الاستماع أسرع، والتفسير أبطأ
  quran_wird_days: { label: 'وِرد الختمات', cat: 'quran', unit: 'days' },
  quran_wird_streak: { label: 'سلسلة وِرد الختمات', cat: 'quran', unit: 'days', streak: true },
  listen_pages: { label: 'صفحات الاستماع', cat: 'quran', unit: 'pages' },
  listen_streak: { label: 'سلسلة الاستماع', cat: 'quran', unit: 'days', streak: true },
  listen_khatmat: { label: 'ختمات الاستماع', cat: 'quran', unit: 'khatma' },
  tafsir_pages: { label: 'صفحات التفسير', cat: 'quran', unit: 'pages' },
  tafsir_streak: { label: 'سلسلة التدبّر', cat: 'quran', unit: 'days', streak: true },
  tafsir_khatmat: { label: 'ختمات التفسير', cat: 'quran', unit: 'khatma' },
  review_pages: { label: 'صفحات المراجعة', cat: 'quran', unit: 'pages' },
  review_streak: { label: 'سلسلة المراجعة', cat: 'quran', unit: 'days', streak: true },
  review_khatmat: { label: 'ختمات المراجعة', cat: 'quran', unit: 'khatma' },
  quran_types_open: { label: 'نصيب من كل نوع', cat: 'quran', unit: 'kinds' },
  quran_types_done: { label: 'ألوان الختمات', cat: 'quran', unit: 'kinds' },
  day_quran_share: { label: 'يوم النصيبين', cat: 'quran', unit: 'days' },
  hifz_sessions: { label: 'جلسات التسميع', cat: 'quran', unit: 'sessions' },
  hifz_perfect: { label: 'تسميع بلا خطأ', cat: 'quran', unit: 'sessions' },
  hifz_surahs: { label: 'سور متقنة', cat: 'quran', unit: 'surahs' },
  // الأوراد
  awrad_done: { label: 'الأوراد المكتملة', cat: 'awrad', unit: 'awrad' },
  wird_streak: { label: 'سلسلة الوِرد اليومي', cat: 'awrad', unit: 'days', streak: true },
  awrad_extra: { label: 'النافلة فوق الوِرد', cat: 'awrad', unit: 'reps' },
  // الصيام
  fasting_days: { label: 'أيام الصيام', cat: 'fasting', unit: 'days' },
  fasting_mon_thu: { label: 'الاثنين والخميس', cat: 'fasting', unit: 'days' },
  fasting_white_months: { label: 'الأيام البيض', cat: 'fasting', unit: 'months' },
  // المواسم
  taraweeh_full: { label: 'التراويح', cat: 'seasons', unit: 'nights' },
  ramadan_fasted: { label: 'صيام رمضان', cat: 'seasons', unit: 'reps' },
  ramadan_last_ten: { label: 'العشر الأواخر', cat: 'seasons', unit: 'reps' },
  ramadan_odd_nights: { label: 'ليالي الوتر من العشر', cat: 'seasons', unit: 'reps' },
  ramadan_juz: { label: 'أجزاء رمضان', cat: 'seasons', unit: 'juz' },
  arafah: { label: 'يوم عرفة', cat: 'seasons', unit: 'reps' },
  ashura: { label: 'عاشوراء', cat: 'seasons', unit: 'reps' },
  tasua_ashura: { label: 'تاسوعاء وعاشوراء', cat: 'seasons', unit: 'reps' },
  muharram_fasts: { label: 'شهر الله المحرم', cat: 'seasons', unit: 'days' },
  shaban_fasts: { label: 'شعبان', cat: 'seasons', unit: 'days' },
  shawwal_fasts: { label: 'ستّ من شوال', cat: 'seasons', unit: 'days' },
  dhulhijjah_fasts: { label: 'عشر ذي الحجة', cat: 'seasons', unit: 'days' },
  friday_full: { label: 'الجمعة المحفوظة', cat: 'seasons', unit: 'fridays' },
  // الصدقة
  sadaqah_count: { label: 'الصدقات', cat: 'sadaqah', unit: 'sadaqat' },
  sadaqah_week_streak: { label: 'صدقة كل أسبوع', cat: 'sadaqah', unit: 'weeks', streak: true },
  sadaqah_month_streak: { label: 'صدقة كل شهر', cat: 'sadaqah', unit: 'months', streak: true },
  sadaqah_ramadan: { label: 'صدقات رمضان', cat: 'sadaqah', unit: 'sadaqat' },
  sadaqah_causes: { label: 'أبواب الخير', cat: 'sadaqah', unit: 'sets' },
  // العلم
  study_lessons: { label: 'الدروس', cat: 'knowledge', unit: 'lessons' },
  study_series: { label: 'السلاسل العلمية', cat: 'knowledge', unit: 'series' },
  study_subjects: { label: 'العلوم', cat: 'knowledge', unit: 'subjects' },
  study_week_streak: { label: 'أسابيع الطلب', cat: 'knowledge', unit: 'weeks', streak: true },
  asma_studied: { label: 'الأسماء الحسنى', cat: 'knowledge', unit: 'names' },
  hadith_favorites: { label: 'أحاديث محفوظة', cat: 'knowledge', unit: 'hadith' },
  // العادات والمهام
  habits_days: { label: 'أيام العادات', cat: 'habits', unit: 'days' },
  habits_streak: { label: 'سلسلة العادات', cat: 'habits', unit: 'days', streak: true },
  tasks_done: { label: 'المهام المنجزة', cat: 'habits', unit: 'tasks' },
  // الأيام الجامعة
  day_prayer_complete: { label: 'اليوم الكامل', cat: 'days', unit: 'days' },
  day_prayer_complete_streak: { label: 'سلسلة الأيام الكاملة', cat: 'days', unit: 'days', streak: true },
  day_guarded: { label: 'اليوم المحفوظ', cat: 'days', unit: 'days' },
  day_guarded_weeks: { label: 'الأسبوع المحفوظ', cat: 'days', unit: 'weeks' },
  day_golden: { label: 'اليوم الذهبي', cat: 'days', unit: 'days' },
  ishraq_days: { label: 'الإشراق', cat: 'days', unit: 'days' },
  day_fast_qiyam: { label: 'صائم قائم', cat: 'days', unit: 'days' },
  day_dhikr_all: { label: 'يوم الذاكرين', cat: 'days', unit: 'days' },
  day_mosque_sunnah: { label: 'يوم المسجد والسنن', cat: 'days', unit: 'days', audience: 'male' },
  day_khayr: { label: 'فاستبقوا الخيرات', cat: 'days', unit: 'days' },
  day_ihsan: { label: 'يوم الإحسان', cat: 'days', unit: 'days' },
} as const satisfies Record<string, MetricMeta>;

export type BadgeMetric = keyof typeof METRICS;
export const metricMeta = (m: BadgeMetric): MetricMeta => METRICS[m];

// ── Badges ─────────────────────────────────────────────────────────────────
export interface BadgeDefinition {
  id: string;
  titleAr: string;
  descriptionAr: string;
  icon: string; // emoji
  rarity: BadgeRarity;
  metric: BadgeMetric;
  target: number;
  /** Only offered to this audience (from the metric) — mosque badges are for men. */
  audience?: 'male';
  /** A secret: shown as «؟» with `hint` until unlocked. */
  hidden?: boolean;
  hint?: string;
}

const C = 'common', R = 'rare', E = 'epic', L = 'legendary', M = 'mythic';

function b(
  id: string,
  metric: BadgeMetric,
  target: number,
  rarity: BadgeRarity,
  icon: string,
  titleAr: string,
  descriptionAr: string,
  secret?: string,
): BadgeDefinition {
  const meta: MetricMeta = METRICS[metric];
  return {
    id,
    metric,
    target,
    rarity,
    icon,
    titleAr,
    descriptionAr,
    ...(meta.audience ? { audience: meta.audience } : {}),
    ...(secret ? { hidden: true, hint: secret } : {}),
  };
}

export const BADGES: BadgeDefinition[] = [
  // ══ الأيام الجامعة — one day that gathers several doors of good ══════════
  b('complete_day_1', 'day_prayer_complete', 1, R, '💎', 'اليوم الكامل', 'صلّيتَ في يوم واحد الفرائض الخمس والرواتب الاثنتي عشرة والضحى والوتر'),
  b('complete_day_7', 'day_prayer_complete', 7, E, '💎', 'سبعة أيام كاملة', 'سبعة أيام جمعتَ في كل منها الفرائض والرواتب والضحى والوتر'),
  b('complete_day_30', 'day_prayer_complete', 30, L, '👑', 'ثلاثون يوماً كاملة', 'ثلاثون يوماً كاملة بالفرائض والسنن والنوافل'),
  b('complete_day_100', 'day_prayer_complete', 100, M, '🌟', 'مئة يوم كاملة', 'مئة يوم كاملة — «وما تقرّب إليّ عبدي بشيء أحبّ إليّ مما افترضتُ عليه، ولا يزال عبدي يتقرّب إليّ بالنوافل حتى أحبّه»'),
  b('complete_streak_7', 'day_prayer_complete_streak', 7, L, '🔱', 'أسبوع بلا نقص', 'سبعة أيام متتالية، كل يوم منها كامل الفرائض والسنن والنوافل'),
  b('complete_streak_30', 'day_prayer_complete_streak', 30, M, '🏆', 'شهر بلا نقص', 'ثلاثون يوماً متتالية كاملة الفرائض والسنن والنوافل'),
  b('guarded_1', 'day_guarded', 1, C, '🛡️', 'يوم محفوظ', 'صلّيتَ الخمس وقرأتَ أذكار الصباح والمساء في يوم واحد'),
  b('guarded_30', 'day_guarded', 30, R, '🛡️', 'ثلاثون يوماً محفوظة', 'ثلاثون يوماً جمعتَ فيها الصلوات الخمس وأذكار الصباح والمساء'),
  b('guarded_100', 'day_guarded', 100, E, '🏰', 'مئة يوم محفوظة', 'مئة يوم محفوظة بالصلوات والأذكار'),
  b('guarded_365', 'day_guarded', 365, L, '🏯', 'عامٌ محفوظ', '٣٦٥ يوماً محفوظة بالصلوات الخمس وأذكار الصباح والمساء'),
  b('guarded_week_1', 'day_guarded_weeks', 1, R, '📆', 'أسبوع محفوظ', 'أسبوع من السبت إلى الجمعة، كل يوم فيه بالصلوات الخمس وأذكار الصباح والمساء'),
  b('guarded_week_4', 'day_guarded_weeks', 4, E, '🗓️', 'أربعة أسابيع محفوظة', 'أربعة أسابيع كاملة لم يخلُ يوم منها من الصلوات والأذكار'),
  b('guarded_week_12', 'day_guarded_weeks', 12, L, '🧱', 'اثنا عشر أسبوعاً محفوظة', 'اثنا عشر أسبوعاً كاملة من الأيام المحفوظة'),
  b('golden_1', 'day_golden', 1, E, '🥇', 'اليوم الذهبي', 'جمعتَ في يوم: الفرائض والرواتب والضحى والوتر، وأذكار الصباح والمساء وما بعد الصلوات الخمس، ووِرد القرآن'),
  b('golden_7', 'day_golden', 7, L, '🏅', 'سبعة أيام ذهبية', 'سبعة أيام ذهبية — «وفي ذلك فليتنافس المتنافسون»'),
  b('golden_30', 'day_golden', 30, M, '👑', 'ثلاثون يوماً ذهبية', 'ثلاثون يوماً ذهبية — «سابقوا إلى مغفرة من ربكم»'),
  b('ishraq_1', 'ishraq_days', 1, R, '🕋', 'كأجر حجة وعمرة', 'صلّيتَ الفجر (في جماعة للرجال) ثم أذكار الصباح ثم الضحى في يوم واحد — «كانت له كأجر حجة وعمرة تامة تامة تامة»'),
  b('ishraq_10', 'ishraq_days', 10, E, '🌄', 'عشرة أيام من الإشراق', 'عشرة أيام جمعتَ فيها الفجر وأذكار الصباح والضحى'),
  b('ishraq_40', 'ishraq_days', 40, L, '☀️', 'أربعون يوماً من الإشراق', 'أربعون يوماً جمعتَ فيها الفجر وأذكار الصباح والضحى'),
  b('fast_qiyam_1', 'day_fast_qiyam', 1, R, '🌙', 'صائم قائم', 'صمتَ يوماً وقمتَ ليلته مع الصلوات الخمس — «الصيام والقرآن يشفعان للعبد يوم القيامة»'),
  b('fast_qiyam_10', 'day_fast_qiyam', 10, E, '🌗', 'عشرة أيام صيام وقيام', 'عشرة أيام جمعتَ فيها الصيام والقيام والفرائض'),
  b('fast_qiyam_30', 'day_fast_qiyam', 30, L, '🌕', 'ثلاثون يوماً صيام وقيام', 'ثلاثون يوماً جمعتَ فيها الصيام والقيام والفرائض'),
  b('dhikr_all_1', 'day_dhikr_all', 1, C, '🕊️', 'يوم الذاكرين', 'قرأتَ أذكار الصباح والمساء وما بعد الصلوات الخمس والنوم في يوم واحد'),
  b('dhikr_all_7', 'day_dhikr_all', 7, R, '🕊️', 'أسبوع الذاكرين', 'سبعة أيام قرأتَ فيها الأذكار الأربعة كاملة'),
  b('dhikr_all_30', 'day_dhikr_all', 30, E, '🤍', 'ثلاثون يوماً من الذكر الكامل', 'ثلاثون يوماً قرأتَ فيها الأذكار الأربعة كاملة'),
  b('dhikr_all_100', 'day_dhikr_all', 100, L, '🌸', 'من الذاكرين الله كثيراً', 'مئة يوم قرأتَ فيها الأذكار الأربعة كاملة'),
  b('mosque_sunnah_1', 'day_mosque_sunnah', 1, R, '🕌', 'يوم المسجد والسنن', 'صلّيتَ الخمس في المسجد والرواتب الاثنتي عشرة في يوم واحد'),
  b('mosque_sunnah_30', 'day_mosque_sunnah', 30, L, '🏛️', 'ثلاثون يوماً في المسجد مع السنن', 'ثلاثون يوماً جمعتَ فيها الجماعة في الخمس والرواتب كاملة'),
  b('khayr_1', 'day_khayr', 1, E, '🌺', 'فاستبقوا الخيرات', 'جمعتَ في يوم واحد الصيام والصدقة وقيام الليل', 'ثلاثة أعمال إذا اجتمعت في يوم واحد…'),
  b('ihsan_1', 'day_ihsan', 1, L, '💠', 'يوم الإحسان', 'يومٌ ذهبي صمتَه وتصدّقتَ فيه — «الإحسان أن تعبد الله كأنك تراه»', 'يومٌ لم يترك باباً من أبواب الخير…'),

  // ══ الفرائض ══════════════════════════════════════════════════════════════
  b('streak_prayers_7', 'prayers_streak', 7, C, '🕌', 'مُداوم على الصلاة', '٧ أيام كاملة من الصلوات الخمس'),
  b('streak_prayers_30', 'prayers_streak', 30, R, '🕋', 'حافظ على الصلاة', '٣٠ يوماً من الصلوات الخمس'),
  b('streak_prayers_100', 'prayers_streak', 100, E, '🕌', 'مئة يوم من الفرائض', 'مئة يوم متتالٍ بالصلوات الخمس كاملة'),
  b('streak_prayers_365', 'prayers_streak', 365, L, '🏛️', 'عامٌ لم تفُته فريضة', '٣٦٥ يوماً متتالية بالصلوات الخمس كاملة — «والذين هم على صلواتهم يحافظون»'),
  b('prayer_days_1', 'prayer_days', 1, C, '✅', 'أول يوم كامل', 'صلّيتَ الفرائض الخمس كلها في يوم — «أرأيتم لو أن نهراً بباب أحدكم يغتسل فيه كل يوم خمساً»'),
  b('prayer_days_40', 'prayer_days', 40, R, '🌾', 'أربعون يوماً كاملة', 'أربعون يوماً صلّيتَ فيها الخمس كلها'),
  b('prayer_days_365', 'prayer_days', 365, E, '🕰️', 'عامٌ من الأيام الكاملة', '٣٦٥ يوماً كاملة الفرائض في سجلّك'),
  b('prayer_days_1000', 'prayer_days', 1000, L, '🏆', 'ألف يوم من الفرائض', 'ألف يوم صلّيتَ فيها الخمس — «إن الصلاة كانت على المؤمنين كتاباً موقوتاً»'),
  b('fard_100', 'fard_total', 100, C, '💯', 'مئة فريضة', 'أدّيتَ مئة صلاة مفروضة — «أول ما يُحاسب به العبد يوم القيامة الصلاة»'),
  b('fard_1000', 'fard_total', 1000, R, '🧎', 'ألف فريضة', 'ألف صلاة مفروضة في سجلّك'),
  b('fard_5000', 'fard_total', 5000, E, '🌌', 'خمسة آلاف فريضة', 'خمسة آلاف صلاة مفروضة'),
  b('fard_10000', 'fard_total', 10000, M, '💠', 'عشرة آلاف فريضة', 'عشرة آلاف صلاة — «قد أفلح المؤمنون الذين هم في صلاتهم خاشعون»'),
  b('prayers_week_1', 'prayer_full_weeks', 1, C, '🕌', 'أسبوع الصلوات', 'أسبوع من السبت إلى الجمعة بالصلوات الخمس كاملة'),
  b('prayers_week_4', 'prayer_full_weeks', 4, R, '🕋', 'أربعة أسابيع كاملة', 'أربعة أسابيع لم تفُتك فيها فريضة'),
  b('prayers_week_12', 'prayer_full_weeks', 12, E, '🏛️', 'اثنا عشر أسبوعاً', 'اثنا عشر أسبوعاً كاملاً من الفرائض'),
  b('prayers_week_52', 'prayer_full_weeks', 52, L, '🏛️', 'عام من الفرائض', 'اثنان وخمسون أسبوعاً كاملاً من الصلوات الخمس'),
  b('prayer_month_1', 'prayer_months', 1, R, '🗓️', 'شهر لم تفُتك فيه فريضة', 'شهر كامل بالصلوات الخمس كل يوم'),
  b('prayer_month_3', 'prayer_months', 3, E, '🌙', 'ثلاثة أشهر من الفرائض', 'ثلاثة أشهر كاملة لم تفُتك فيها فريضة'),
  b('prayer_month_12', 'prayer_months', 12, L, '👑', 'اثنا عشر شهراً من الفرائض', 'اثنا عشر شهراً كاملة بالصلوات الخمس — «وأمُر أهلك بالصلاة واصطبر عليها»'),
  b('fajr_streak_3', 'fajr_streak', 3, C, '🌅', 'فجرٌ بعد فجر', 'صلّيتَ الفجر ثلاثة أيام متتالية'),
  b('fajr_streak_7', 'fajr_streak', 7, C, '🌅', 'حارس الفجر', 'صلّيتَ الفجر سبعة أيام متتالية'),
  b('fajr_streak_40', 'fajr_streak', 40, E, '🌄', 'من أهل الفجر', 'أربعون يوماً متتالية لم تفُتك فيها صلاة الفجر'),
  b('fajr_streak_100', 'fajr_streak', 100, L, '🌅', 'نور الفجر', 'مئة يوم متتالٍ لم تفُتك فيها صلاة الفجر — «بشّر المشّائين في الظُّلَم»'),
  b('fajr_streak_365', 'fajr_streak', 365, M, '🌞', 'عامٌ من الفجر', '٣٦٥ يوماً متتالية لم تفُتك فيها صلاة الفجر — «إن قرآن الفجر كان مشهوداً»'),
  b('dhuhr_streak_7', 'dhuhr_streak', 7, C, '☀️', 'أسبوع الظهر', 'صلّيتَ الظهر سبعة أيام متتالية'),
  b('dhuhr_streak_30', 'dhuhr_streak', 30, R, '☀️', 'محافظ على الظهر', 'ثلاثون يوماً متتالية من صلاة الظهر'),
  b('dhuhr_streak_100', 'dhuhr_streak', 100, E, '🌞', 'مئة ظهر', 'مئة يوم متتالٍ من صلاة الظهر'),
  b('asr_streak_7', 'asr_streak', 7, C, '🌤️', 'أسبوع العصر', 'صلّيتَ العصر سبعة أيام متتالية'),
  b('asr_streak_30', 'asr_streak', 30, R, '🌤️', 'الصلاة الوسطى', 'حافظتَ على صلاة العصر ثلاثين يوماً متتالية'),
  b('asr_streak_100', 'asr_streak', 100, E, '🌤️', 'حافظوا على الصلوات', 'مئة يوم متتالٍ من صلاة العصر — «حافظوا على الصلوات والصلاة الوسطى»'),
  b('maghrib_streak_7', 'maghrib_streak', 7, C, '🌇', 'أسبوع المغرب', 'صلّيتَ المغرب سبعة أيام متتالية'),
  b('maghrib_streak_30', 'maghrib_streak', 30, R, '🌇', 'محافظ على المغرب', 'ثلاثون يوماً متتالية من صلاة المغرب'),
  b('maghrib_streak_100', 'maghrib_streak', 100, E, '🌆', 'مئة مغرب', 'مئة يوم متتالٍ من صلاة المغرب'),
  b('isha_streak_7', 'isha_streak', 7, C, '🌃', 'أسبوع العشاء', 'صلّيتَ العشاء سبعة أيام متتالية'),
  b('isha_streak_30', 'isha_streak', 30, R, '🌃', 'محافظ على العشاء', 'ثلاثون يوماً متتالية من صلاة العشاء'),
  b('isha_streak_100', 'isha_streak', 100, E, '🌌', 'مئة عشاء', 'مئة يوم متتالٍ من صلاة العشاء'),
  b('bardain_30', 'bardain_days', 30, R, '🌓', 'البَردان', 'ثلاثون يوماً صلّيتَ فيها الفجر والعصر — «من صلّى البَردين دخل الجنة»'),
  b('bardain_100', 'bardain_days', 100, E, '🌗', 'مئة يوم من البَردين', 'مئة يوم حافظتَ فيها على الفجر والعصر'),

  // ══ السنن والنوافل ═══════════════════════════════════════════════════════
  b('rawatib_full_1', 'rawatib_full_days', 1, C, '🏡', 'بيت في الجنة', 'صلّيتَ السنن الرواتب الاثنتي عشرة في يوم — «بُني له بهنّ بيت في الجنة»'),
  b('rawatib_full_40', 'rawatib_full_days', 40, R, '🏰', 'أربعون بيتاً', 'أربعون يوماً صلّيتَ فيها الرواتب كاملة'),
  b('rawatib_full_100', 'rawatib_full_days', 100, E, '🕍', 'قصور في الجنة', 'مئة يوم من الرواتب كاملة'),
  b('rawatib_full_365', 'rawatib_full_days', 365, L, '🏙️', 'عامٌ من الرواتب', '٣٦٥ يوماً صلّيتَ فيها الرواتب الاثنتي عشرة كاملة'),
  b('rawatib_streak_7', 'rawatib_streak', 7, R, '🧱', 'أسبوع الرواتب', 'الرواتب كاملة سبعة أيام متتالية'),
  b('rawatib_streak_30', 'rawatib_streak', 30, E, '🏘️', 'محافظ على الرواتب', 'ثلاثون يوماً متتالية من الرواتب كاملة'),
  b('rawatib_streak_100', 'rawatib_streak', 100, L, '🏯', 'رواتب لا تنقطع', 'مئة يوم متتالٍ من الرواتب الاثنتي عشرة'),
  b('fajr_sunnah_7', 'fajr_sunnah_streak', 7, C, '🌅', 'خير من الدنيا وما فيها', 'صلّيتَ سنة الفجر سبعة أيام متتالية — «ركعتا الفجر خير من الدنيا وما فيها»'),
  b('fajr_sunnah_40', 'fajr_sunnah_streak', 40, R, '💎', 'أربعون سنة فجر', 'أربعون يوماً متتالية من سنة الفجر'),
  b('fajr_sunnah_100', 'fajr_sunnah_streak', 100, E, '🌄', 'أشدّ النوافل تعاهداً', 'مئة يوم متتالٍ من سنة الفجر — «لم يكن النبي ﷺ على شيء من النوافل أشدّ تعاهداً منه على ركعتي الفجر»'),
  b('sunnah_100', 'sunnah_total', 100, C, '⭐', 'مُتّبع للسنة', 'مئة سنة ونافلة بين الرواتب والضحى'),
  b('sunnah_1000', 'sunnah_total', 1000, E, '💫', 'ولا يزال عبدي يتقرّب', 'ألف سنة ونافلة — «حتى أحبّه»'),
  b('sunnah_5000', 'sunnah_total', 5000, L, '✨', 'خمسة آلاف سنة', 'خمسة آلاف سنة ونافلة بين الرواتب والضحى'),
  b('nawafil_1000', 'nawafil_rakaat', 1000, R, '🌿', 'ألف ركعة نافلة', 'ألف ركعة تطوّعتَ بها بين الرواتب والضحى والقيام'),
  b('nawafil_5000', 'nawafil_rakaat', 5000, E, '🌳', 'خمسة آلاف ركعة نافلة', 'خمسة آلاف ركعة نافلة — «أعنّي على نفسك بكثرة السجود»'),
  b('nawafil_20000', 'nawafil_rakaat', 20000, L, '🌲', 'عشرون ألف ركعة', 'عشرون ألف ركعة نافلة — «فإنك لن تسجد لله سجدة إلا رفعك الله بها درجة»'),
  b('duha_days_1', 'duha_days', 1, C, '☀️', 'أول ضحى', 'صلّيتَ الضحى أول مرة — «ويُجزئ من ذلك ركعتان يركعهما من الضحى»'),
  b('duha_days_30', 'duha_days', 30, R, '🔆', 'ثلاثون ضحى', 'ثلاثون يوماً صلّيتَ فيها الضحى'),
  b('duha_days_100', 'duha_days', 100, E, '🏵️', 'صدقة عن كل مَفصِل', 'مئة يوم من الضحى — «ويُجزئ من ذلك ركعتان يركعهما من الضحى»'),
  b('duha_days_360', 'duha_days', 360, L, '🏵️', 'ثلاثمئة وستون مَفصِلاً', '٣٦٠ يوماً من الضحى — «خُلق كل إنسان على ستين وثلاثمئة مَفصِل»'),
  b('duha_streak_7', 'duha_streak', 7, C, '🌞', 'صلاة الأوّابين', 'صلّيتَ الضحى سبعة أيام متتالية'),
  b('duha_streak_30', 'duha_streak', 30, E, '🌻', 'لا يحافظ عليها إلا أوّاب', 'ثلاثون يوماً متتالية من صلاة الضحى — «وهي صلاة الأوّابين»'),
  b('duha_streak_100', 'duha_streak', 100, L, '🌅', 'من الأوّابين', 'مئة يوم متتالية لم تترك فيها الضحى'),
  b('duha_streak_365', 'duha_streak', 365, M, '🌻', 'عامٌ من الضحى', '٣٦٥ يوماً متتالية لم تترك فيها الضحى — «أوصاني خليلي ﷺ… بركعتي الضحى»'),
  b('duha_rakaat_500', 'duha_rakaat', 500, R, '🔆', 'خمسمئة ركعة ضحى', 'خمسمئة ركعة في ضحى أيامك'),
  b('duha_rakaat_2000', 'duha_rakaat', 2000, E, '🌞', 'ألفا ركعة ضحى', 'ألفا ركعة من صلاة الضحى'),
  b('duha_eight_10', 'duha_eight_days', 10, R, '🏳️', 'ضحى الفتح', 'عشرة أيام صلّيتَ فيها الضحى ثماني ركعات — كما صلّاها ﷺ يوم الفتح'),
  b('duha_eight_40', 'duha_eight_days', 40, E, '🌟', 'ثمانٍ في الضحى', 'أربعون يوماً بثماني ركعات ضحى فأكثر'),
  b('sunnah_duha_1', 'sunnah_duha_days', 1, C, '🌤️', 'يوم السنن', 'صلّيتَ الرواتب الاثنتي عشرة والضحى في يوم واحد'),
  b('sunnah_duha_30', 'sunnah_duha_days', 30, R, '🌼', 'ثلاثون يوماً من السنن', 'ثلاثون يوماً جمعتَ فيها الرواتب والضحى'),
  b('sunnah_duha_100', 'sunnah_duha_days', 100, E, '🏵️', 'مئة يوم من السنن', 'مئة يوم جمعتَ فيها الرواتب كاملة والضحى'),

  // ══ المسجد (للرجال) ══════════════════════════════════════════════════════
  b('mosque_1', 'mosque_prayers', 1, C, '🕌', 'نُزُلٌ في الجنة', 'أول صلاة في المسجد — «من غدا إلى المسجد أو راح أعدّ الله له نُزُله من الجنة»'),
  b('mosque_40', 'mosque_prayers', 40, C, '👣', 'بكل خطوة درجة', 'أربعون صلاة في المسجد — «لم يخطُ خطوة إلا رُفعت له بها درجة وحُطّت عنه بها خطيئة»'),
  b('mosque_200', 'mosque_prayers', 200, R, '🧎', 'سبعٌ وعشرون درجة', 'مئتا صلاة في جماعة — «تفضُل صلاة الفذّ بسبعٍ وعشرين درجة»'),
  b('mosque_1000', 'mosque_prayers', 1000, E, '🏛️', 'من عُمّار المساجد', 'ألف صلاة في المسجد — «إنما يعمر مساجد الله من آمن بالله واليوم الآخر»'),
  b('mosque_5000', 'mosque_prayers', 5000, L, '🌳', 'قلبه معلّق بالمساجد', 'خمسة آلاف صلاة في المسجد — من السبعة الذين يظلّهم الله في ظلّه'),
  b('mosque_full_1', 'mosque_full_days', 1, C, '🕋', 'يوم في بيوت الله', 'صلّيتَ الخمس كلها في المسجد في يوم — «في بيوتٍ أذن الله أن تُرفع ويُذكر فيها اسمه»'),
  b('mosque_full_40', 'mosque_full_days', 40, E, '📜', 'براءتان', 'أربعون يوماً صلّيتَ فيها الخمس في جماعة — «كُتبت له براءتان: براءة من النار وبراءة من النفاق»'),
  b('mosque_full_100', 'mosque_full_days', 100, L, '🕌', 'مئة يوم في الجماعة', 'مئة يوم صلّيتَ فيها الخمس في المسجد'),
  b('mosque_full_streak_7', 'mosque_full_streak', 7, R, '🕋', 'أسبوع في بيوت الله', 'سبعة أيام متتالية صلّيتَ فيها الخمس في المسجد'),
  b('mosque_full_streak_30', 'mosque_full_streak', 30, E, '🏛️', 'شهر في بيوت الله', 'ثلاثون يوماً متتالية صلّيتَ فيها الخمس في المسجد'),
  b('mosque_fajr_1', 'mosque_fajr', 1, C, '🌄', 'أول فجر في جماعة', 'صلّيتَ الفجر في المسجد — «ولو يعلمون ما في العتمة والصبح لأتوهما ولو حبواً»'),
  b('mosque_fajr_40', 'mosque_fajr', 40, E, '🌄', 'في ذمّة الله', 'أربعون فجراً في المسجد — «من صلّى الصبح فهو في ذمّة الله»'),
  b('mosque_fajr_100', 'mosque_fajr', 100, L, '🌅', 'مئة فجر في جماعة', 'مئة صلاة فجر في المسجد'),
  b('mosque_fajr_streak_7', 'mosque_fajr_streak', 7, R, '🔦', 'سبعة أيام في الظُّلَم', 'سبعة أيام متتالية صلّيتَ فيها الفجر في المسجد'),
  b('mosque_fajr_streak_40', 'mosque_fajr_streak', 40, E, '🌠', 'أربعون فجراً متتالية', 'أربعون يوماً متتالية من الفجر في جماعة'),
  b('mosque_fajr_isha_30', 'mosque_fajr_isha_days', 30, R, '🌙', 'كأنما قام الليل كله', 'ثلاثون يوماً صلّيتَ فيها العشاء والفجر في جماعة'),
  b('mosque_fajr_isha_100', 'mosque_fajr_isha_days', 100, E, '✨', 'النور التام', 'مئة يوم من العشاء والفجر في المسجد — «بشّر المشّائين في الظُّلَم إلى المساجد بالنور التام يوم القيامة»'),
  b('jumuah_4', 'jumuah', 4, C, '🕌', 'الجمعة إلى الجمعة', 'أربع جُمَع في المسجد — «والجمعة إلى الجمعة كفّارة لما بينهن»'),
  b('jumuah_12', 'jumuah', 12, R, '🕋', 'اثنتا عشرة جمعة', 'اثنتا عشرة جمعة شهدتها في المسجد'),
  b('jumuah_52', 'jumuah', 52, E, '🗓️', 'عامٌ من الجُمَع', 'اثنتان وخمسون جمعة — «من راح في الساعة الأولى فكأنما قرّب بدنة»'),

  // ══ القيام والوتر ════════════════════════════════════════════════════════
  b('streak_qiyam_3', 'qiyam_streak', 3, C, '🌒', 'ثلاث ليالٍ', 'قمتَ الليل ثلاث ليالٍ متتالية'),
  b('streak_qiyam_7', 'qiyam_streak', 7, R, '🌙', 'قائم الليل', '٧ ليالٍ من قيام الليل'),
  b('streak_qiyam_30', 'qiyam_streak', 30, E, '✨', 'ركّاعٌ ساجد', '٣٠ ليلة من قيام الليل'),
  b('streak_qiyam_100', 'qiyam_streak', 100, L, '🌌', 'دأب الصالحين', 'مئة ليلة متتالية من القيام — «فإنه دأب الصالحين قبلكم»'),
  b('streak_qiyam_365', 'qiyam_streak', 365, M, '🌌', 'عامٌ من القيام', '٣٦٥ ليلة متتالية من قيام الليل — «تتجافى جنوبهم عن المضاجع»'),
  b('qiyam_nights_1', 'qiyam_nights', 1, C, '🕯️', 'أول ليلة', 'سجّلتَ أول ليلة قيام — «عليكم بقيام الليل»'),
  b('qiyam_nights_10', 'qiyam_nights', 10, C, '🌙', 'عشر ليالٍ', 'قمتَ الليل عشر ليالٍ'),
  b('qiyam_nights_40', 'qiyam_nights', 40, R, '🌌', 'أربعون ليلة', 'أربعون ليلة من قيام الليل'),
  b('qiyam_nights_100', 'qiyam_nights', 100, E, '🌠', 'مئة ليلة', 'مئة ليلة قمتها لله'),
  b('qiyam_nights_365', 'qiyam_nights', 365, L, '🌃', 'ثلاثمئة وخمس وستون ليلة', '٣٦٥ ليلة قمتها — «كانوا قليلاً من الليل ما يهجعون»'),
  b('qiyam_nights_1000', 'qiyam_nights', 1000, M, '🌠', 'ألف ليلة', 'ألف ليلة من القيام — «ومن الليل فتهجّد به نافلةً لك»'),
  b('qiyam_rakaat_100', 'qiyam_rakaat', 100, C, '🕯️', 'مئة ركعة', 'صلّيتَ مئة ركعة في قيام الليل مع الوتر'),
  b('qiyam_rakaat_1000', 'qiyam_rakaat', 1000, E, '💎', 'ألف ركعة', 'ألف ركعة في جوف الليل'),
  b('qiyam_rakaat_5000', 'qiyam_rakaat', 5000, L, '👑', 'خمسة آلاف ركعة', 'خمسة آلاف ركعة في جوف الليل'),
  b('qiyam_rakaat_10000', 'qiyam_rakaat', 10000, M, '💫', 'عشرة آلاف ركعة', 'عشرة آلاف ركعة في جوف الليل'),
  b('qiyam_witr_1', 'qiyam_witr', 1, C, '🌙', 'أول وتر', 'ختمتَ ليلك بالوتر — «إن الله وترٌ يحب الوتر»'),
  b('qiyam_witr_30', 'qiyam_witr', 30, R, '⭐', 'أهل الوتر', 'ختمتَ ليلك بالوتر ثلاثين ليلة'),
  b('qiyam_witr_100', 'qiyam_witr', 100, E, '⭐', 'مئة وتر', 'مئة ليلة ختمتها بالوتر'),
  b('qiyam_witr_365', 'qiyam_witr', 365, L, '🌟', 'عامٌ من الوتر', '٣٦٥ ليلة ختمتها بالوتر — «اجعلوا آخر صلاتكم بالليل وتراً»'),
  b('witr_streak_7', 'qiyam_witr_streak', 7, C, '🌛', 'لا تبِت إلا على وتر', 'أوترتَ سبع ليالٍ متتالية — «وأن أوتر قبل أن أنام»'),
  b('witr_streak_40', 'qiyam_witr_streak', 40, R, '🌜', 'أربعون ليلة على وتر', 'أربعون ليلة متتالية لم تترك فيها الوتر'),
  b('witr_streak_100', 'qiyam_witr_streak', 100, E, '🌙', 'مئة ليلة على وتر', 'مئة ليلة متتالية من الوتر'),
  b('eleven_1', 'qiyam_eleven', 1, C, '🕯️', 'إحدى عشرة ركعة', 'صلّيتَ إحدى عشرة ركعة في ليلة — «ما كان يزيد في رمضان ولا في غيره على إحدى عشرة ركعة»'),
  b('eleven_30', 'qiyam_eleven', 30, R, '🪔', 'ثلاثون ليلة تامة', 'ثلاثون ليلة صلّيتَ فيها إحدى عشرة ركعة أو أكثر'),
  b('eleven_100', 'qiyam_eleven', 100, E, '🌟', 'مئة ليلة تامة', 'مئة ليلة بإحدى عشرة ركعة فأكثر'),
  b('last_third_1', 'qiyam_last_third', 1, R, '🌌', 'في الثلث الأخير', 'قمتَ في ثلث الليل الآخر — «ينزل ربنا تبارك وتعالى كل ليلة إلى السماء الدنيا حين يبقى ثلث الليل الآخر»', 'لليل ساعةٌ لها شأن…'),
  b('last_third_30', 'qiyam_last_third', 30, E, '🌠', 'المستغفرون بالأسحار', 'ثلاثون ليلة قمتها في الثلث الأخير — «وبالأسحار هم يستغفرون»', 'من عرف تلك الساعة فليداوم…'),

  // ══ الأذكار والتسبيح ═════════════════════════════════════════════════════
  b('streak_dhikr_7', 'dhikr_streak', 7, C, '📿', 'ذاكر لله', '٧ أيام من أذكار الصباح والمساء'),
  b('streak_dhikr_30', 'dhikr_streak', 30, R, '🤍', 'الذاكرون الله كثيراً', '٣٠ يوماً من المداومة على الأذكار'),
  b('streak_dhikr_100', 'dhikr_streak', 100, E, '🤲', 'مئة يوم من الذكر', 'مئة يوم متتالٍ من المداومة على الأذكار'),
  b('streak_dhikr_365', 'dhikr_streak', 365, L, '🌿', 'لسانٌ رطب', '٣٦٥ يوماً متتالية من الأذكار — «لا يزال لسانك رطباً من ذكر الله»'),
  b('count_dhikr_1', 'dhikr_days', 1, C, '🌸', 'أول ذكر', 'أتممتَ أول مجموعة أذكار — بداية مباركة'),
  b('count_dhikr_100', 'dhikr_days', 100, R, '⭐', 'مئة يومِ ذكر', 'أتممتَ أذكارك اليومية في ١٠٠ يوم'),
  b('count_dhikr_365', 'dhikr_days', 365, E, '📿', 'عامٌ من الذكر', 'أتممتَ أذكارك في ٣٦٥ يوماً'),
  b('count_dhikr_1000', 'dhikr_days', 1000, L, '🌺', 'ألف يوم ذكر', 'أتممتَ أذكارك في ألف يوم — «سبق المفرِّدون… الذاكرون الله كثيراً والذاكرات»'),
  b('dhikr_reps_100', 'dhikr_reps', 100, C, '🌱', 'مئة ذكر', 'ذكرتَ الله مئة مرة'),
  b('dhikr_reps_1000', 'dhikr_reps', 1000, C, '📿', 'ألف ذكر', 'ذكرتَ الله ألف مرة بين التسبيح والأذكار'),
  b('dhikr_reps_10000', 'dhikr_reps', 10000, R, '🤲', 'عشرة آلاف ذكر', 'عشرة آلاف مرة من ذكر الله'),
  b('dhikr_reps_50000', 'dhikr_reps', 50000, E, '🍃', 'خمسون ألف ذكر', 'خمسون ألف مرة من ذكر الله — «فاذكروني أذكركم»'),
  b('dhikr_reps_100000', 'dhikr_reps', 100000, L, '🌿', 'مئة ألف ذكر', 'مئة ألف مرة، ولسانك رطب بذكر الله'),
  b('dhikr_reps_1000000', 'dhikr_reps', 1000000, M, '🌳', 'مليون ذكر', 'مليون مرة من ذكر الله — «والذاكرين الله كثيراً والذاكرات أعدّ الله لهم مغفرة وأجراً عظيماً»'),
  b('dhikr_morning_7', 'dhikr_morning_streak', 7, C, '🌅', 'حصن الصباح', 'قرأتَ أذكار الصباح سبعة أيام متتالية'),
  b('dhikr_morning_30', 'dhikr_morning_streak', 30, R, '☀️', 'صباح محفوظ', 'ثلاثون يوماً متتالية من أذكار الصباح'),
  b('dhikr_morning_100', 'dhikr_morning_streak', 100, E, '🌄', 'صباحات مباركة', 'مئة يوم متتالٍ من أذكار الصباح'),
  b('dhikr_morning_365', 'dhikr_morning_streak', 365, L, '🌄', 'صباحات عام', '٣٦٥ يوماً متتالية من أذكار الصباح — «وسبّح بحمد ربك قبل طلوع الشمس»'),
  b('dhikr_evening_7', 'dhikr_evening_streak', 7, C, '🌇', 'حصن المساء', 'قرأتَ أذكار المساء سبعة أيام متتالية'),
  b('dhikr_evening_30', 'dhikr_evening_streak', 30, R, '🌆', 'مساء محفوظ', 'ثلاثون يوماً متتالية من أذكار المساء'),
  b('dhikr_evening_100', 'dhikr_evening_streak', 100, E, '🌆', 'أمسيات مباركة', 'مئة يوم متتالٍ من أذكار المساء'),
  b('dhikr_evening_365', 'dhikr_evening_streak', 365, L, '🌆', 'أمسيات عام', '٣٦٥ يوماً متتالية من أذكار المساء — «وقبل الغروب»'),
  b('dhikr_both_7', 'dhikr_both_days', 7, C, '🛡️', 'حصن اليوم', 'سبعة أيام قرأتَ فيها أذكار الصباح والمساء معاً'),
  b('dhikr_both_30', 'dhikr_both_days', 30, R, '🛡️', 'محفوظ صباحاً ومساءً', 'ثلاثون يوماً قرأتَ فيها أذكار الصباح والمساء معاً'),
  b('dhikr_both_100', 'dhikr_both_days', 100, E, '🏯', 'في حفظ الله', 'مئة يوم من أذكار الصباح والمساء معاً'),
  b('dhikr_both_365', 'dhikr_both_days', 365, L, '🏰', 'عامٌ في حفظ الله', '٣٦٥ يوماً من أذكار الصباح والمساء معاً — «فسبحان الله حين تُمسون وحين تُصبحون»'),
  b('dhikr_post_7', 'dhikr_post_prayer_days', 7, C, '📿', 'معقّبات', 'سبعة أيام قلتَ فيها أذكار الصلاة بعد الفروض الخمسة كلها — «معقّبات لا يخيب قائلهن»'),
  b('dhikr_post_30', 'dhikr_post_prayer_days', 30, R, '📿', 'دُبُر كل صلاة', 'ثلاثون يوماً قلتَ فيها أذكار الصلاة بعد الفروض الخمسة كلها'),
  b('dhikr_post_100', 'dhikr_post_prayer_days', 100, E, '🤍', 'لا تدعنّ دبر كل صلاة', 'مئة يوم قلتَ فيها أذكار الصلاة بعد الفروض الخمسة كلها'),
  b('dhikr_post_365', 'dhikr_post_prayer_days', 365, L, '🤍', 'عامٌ دبر الصلوات', '٣٦٥ يوماً قلتَ فيها أذكار الصلاة بعد الفروض الخمسة كلها'),
  b('after_prayer_1', 'post_prayer_adhkar', 1, C, '🤲', 'أوّل التعقيب', 'قلتَ أذكار ما بعد الصلاة عقب فريضة — «أستغفر الله ثلاثاً، اللهم أنت السلام ومنك السلام»'),
  b('after_prayer_50', 'post_prayer_adhkar', 50, C, '📿', 'خمسون تعقيباً', 'أذكار ما بعد الصلاة عقب خمسين فريضة'),
  b('after_prayer_200', 'post_prayer_adhkar', 200, R, '📿', 'مُعقِّب', 'أذكار ما بعد الصلاة عقب مئتي فريضة'),
  b('after_prayer_500', 'post_prayer_adhkar', 500, E, '🤍', 'خمسمئة دُبُر صلاة', 'أذكار ما بعد الصلاة عقب خمسمئة فريضة'),
  b('after_prayer_1000', 'post_prayer_adhkar', 1000, L, '🌟', 'ألف دُبُر صلاة', 'أذكار ما بعد الصلاة عقب ألف فريضة'),
  b('after_prayer_2500', 'post_prayer_adhkar', 2500, M, '✨', 'وإن كانت مثل زبد البحر', 'أذكار ما بعد الصلاة عقب ٢٥٠٠ فريضة — «من سبّح الله في دبر كل صلاة ثلاثاً وثلاثين… غُفرت خطاياه وإن كانت مثل زبد البحر»'),
  b('after_streak_3', 'post_prayer_streak', 3, C, '🔗', 'ثلاثة أيام دبر كل صلاة', 'أذكار الصلاة بعد الفروض الخمسة ثلاثة أيام متتالية'),
  b('after_streak_7', 'post_prayer_streak', 7, R, '📿', 'أسبوع التعقيب', 'أذكار الصلاة بعد الفروض الخمسة سبعة أيام متتالية'),
  b('after_streak_40', 'post_prayer_streak', 40, E, '🤍', 'أربعون يوماً من التعقيب', 'أذكار الصلاة بعد الفروض الخمسة أربعين يوماً متتالية'),
  b('after_streak_100', 'post_prayer_streak', 100, L, '🏵️', 'مئة يوم من التعقيب', 'أذكار الصلاة بعد الفروض الخمسة مئة يوم متتالية — في آية الكرسي دبر كل صلاة: «لم يمنعه من دخول الجنة إلا أن يموت»'),
  b('dhikr_sleep_7', 'dhikr_sleep_streak', 7, C, '🛏️', 'نوم على ذكر', 'أذكار النوم سبع ليالٍ متتالية'),
  b('dhikr_sleep_30', 'dhikr_sleep_streak', 30, R, '🌙', 'بات طاهراً ذاكراً', 'أذكار النوم ثلاثين ليلة متتالية'),
  b('dhikr_sleep_100', 'dhikr_sleep_streak', 100, E, '🛌', 'مئة ليلة في حفظ الله', 'أذكار النوم مئة ليلة متتالية — «لن يزال عليك من الله حافظ»'),
  b('tasbih100_1', 'tasbih_100_days', 1, C, '📿', 'حُطّت خطاياه', 'سبّحتَ في المسبحة مئة مرة في يوم — «من قال سبحان الله وبحمده في يوم مئة مرة حُطّت خطاياه وإن كانت مثل زبد البحر»'),
  b('tasbih100_30', 'tasbih_100_days', 30, R, '🌊', 'ثلاثون يوماً من التسبيح', 'ثلاثون يوماً سبّحتَ فيها مئة مرة فأكثر'),
  b('tasbih100_100', 'tasbih_100_days', 100, E, '🌊', 'مئة يوم من التسبيح', 'مئة يوم سبّحتَ فيها مئة مرة فأكثر'),
  b('dhikr_day_1000', 'dhikr_day_max', 1000, R, '🔥', 'ألفٌ في يوم', 'ذكرتَ الله ألف مرة في يوم واحد — «ألا بذكر الله تطمئن القلوب»', 'يومٌ لا يفتر فيه اللسان…'),
  b('dhikr_sets_5', 'dhikr_sets', 5, C, '🗝️', 'من حصن المسلم', 'قرأتَ من خمسة أبواب مختلفة من الأذكار'),
  b('dhikr_sets_12', 'dhikr_sets', 12, R, '📖', 'أذكار اليوم والليلة', 'قرأتَ من اثني عشر باباً من أبواب الأذكار'),
  b('dhikr_sets_24', 'dhikr_sets', 24, E, '🏯', 'حصنٌ حصين', 'قرأتَ من أربعة وعشرين باباً من الأذكار — «ألا أنبّئكم بخير أعمالكم… ذكر الله»'),

  // ══ القرآن والحفظ ════════════════════════════════════════════════════════
  b('streak_quran_3', 'quran_streak', 3, C, '📖', 'ثلاثة أيام مع القرآن', 'قرأتَ وِردك ثلاثة أيام متتالية'),
  b('streak_quran_7', 'quran_streak', 7, C, '📖', 'صديق المصحف', '٧ أيام من قراءة القرآن'),
  b('streak_quran_30', 'quran_streak', 30, R, '📚', 'وَرد القرآن', '٣٠ يوماً من المداومة على الورد'),
  b('streak_quran_100', 'quran_streak', 100, E, '📗', 'أهل القرآن', 'مئة يوم متتالٍ مع القرآن — «أهل الله وخاصّته»'),
  b('streak_quran_365', 'quran_streak', 365, L, '📗', 'عامٌ مع القرآن', '٣٦٥ يوماً متتالية مع القرآن — «اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه»'),
  b('quran_pages_10', 'quran_pages', 10, C, '📄', 'عشر صفحات', 'قرأتَ عشر صفحات في وردك — «من قرأ حرفاً من كتاب الله فله به حسنة، والحسنة بعشر أمثالها»'),
  b('quran_pages_100', 'quran_pages', 100, C, '📖', 'مئة صفحة', 'قرأتَ مئة صفحة من المصحف في وردك'),
  b('quran_pages_1000', 'quran_pages', 1000, R, '📜', 'ألف صفحة', 'ألف صفحة من المصحف في وردك'),
  b('quran_pages_5000', 'quran_pages', 5000, E, '📚', 'خمسة آلاف صفحة', 'خمسة آلاف صفحة من كتاب الله'),
  b('quran_pages_10000', 'quran_pages', 10000, L, '🏛️', 'عشرة آلاف صفحة', 'عشرة آلاف صفحة من كتاب الله في وردك'),
  b('quran_khatma_1', 'quran_khatmat', 1, E, '📗', 'ختمة كاملة', 'أتممتَ ستمئة وأربع صفحات، ختمة كاملة'),
  b('quran_khatma_3', 'quran_khatmat', 3, L, '📚', 'ثلاث ختمات', 'ختمتَ القرآن ثلاث مرات'),
  b('quran_khatma_5', 'quran_khatmat', 5, L, '📘', 'خمس ختمات', 'ختمتَ القرآن خمس مرات'),
  b('quran_khatma_10', 'quran_khatmat', 10, M, '💎', 'عشر ختمات', 'ختمتَ القرآن عشر مرات — «اقرأ وارتقِ ورتّل كما كنت ترتّل في الدنيا»'),
  b('juz_day_1', 'quran_juz_days', 1, C, '📖', 'جزءٌ في يوم', 'قرأتَ عشرين صفحة في يوم واحد'),
  b('juz_day_30', 'quran_juz_days', 30, R, '🗓️', 'ختمة الشهر', 'ثلاثون يوماً قرأتَ في كل منها جزءاً — «اقرأ القرآن في شهر»'),
  b('juz_day_100', 'quran_juz_days', 100, E, '📚', 'مئة يوم بجزء', 'مئة يوم قرأتَ في كل منها جزءاً فأكثر'),
  b('quran_day_60', 'quran_day_max', 60, E, '🌟', 'ثلاثة أجزاء في يوم', 'قرأتَ ستين صفحة في يوم واحد — «ورتّل القرآن ترتيلاً»', 'يومٌ طال فيه المجلس مع المصحف…'),
  // وِرد الختمات: كل ما في ختماتك الجارية لليوم
  b('quran_wird_1', 'quran_wird_days', 1, C, '✅', 'وِرد تامّ', 'أتممتَ وِرد ختماتك كلها في يوم — «أحبّ الأعمال إلى الله أدومها وإن قلّ»'),
  b('quran_wird_7', 'quran_wird_days', 7, C, '📗', 'سبعة أوراد تامّة', 'سبعة أيام أتممتَ فيها وِرد ختماتك كله'),
  b('quran_wird_30', 'quran_wird_days', 30, R, '📘', 'ثلاثون وِرداً تامّاً', 'ثلاثون يوماً لم يبقَ فيها من وِرد ختماتك شيء'),
  b('quran_wird_100', 'quran_wird_days', 100, E, '📚', 'مئة وِرد تامّ', 'مئة يوم أتممتَ فيها وِرد ختماتك كله'),
  b('quran_wird_365', 'quran_wird_days', 365, L, '🏛️', 'عامٌ من الأوراد التامّة', '٣٦٥ يوماً أتممتَ فيها وِرد ختماتك'),
  b('quran_wird_streak_3', 'quran_wird_streak', 3, C, '🔗', 'ثلاثة أوراد متصلة', 'أتممتَ وِرد ختماتك ثلاثة أيام متتالية'),
  b('quran_wird_streak_7', 'quran_wird_streak', 7, R, '⛓️', 'أسبوع لم يفُتك فيه وِرد', 'سبعة أيام متتالية أتممتَ فيها وِرد ختماتك كله'),
  b('quran_wird_streak_30', 'quran_wird_streak', 30, E, '🏹', 'شهر على وِرد الختمات', 'ثلاثون يوماً متتالية لم يبقَ فيها من وِردك شيء'),
  b('quran_wird_streak_100', 'quran_wird_streak', 100, L, '🎖️', 'مئة يوم على الوِرد التامّ', 'مئة يوم متتالٍ أتممتَ فيها وِرد ختماتك — «خيركم من تعلّم القرآن وعلّمه»'),
  // الاستماع — أسرع الأنواع، فعتباته أعلى
  b('listen_pages_50', 'listen_pages', 50, C, '🎧', 'أذنٌ مُنصتة', 'استمعتَ إلى خمسين صفحة في ختمة استماع — «وإذا قُرئ القرآن فاستمعوا له وأنصتوا لعلكم تُرحمون»'),
  b('listen_pages_300', 'listen_pages', 300, C, '🎧', 'نصف الختمة سماعاً', 'ثلاثمئة صفحة استمعتَ إليها'),
  b('listen_pages_1000', 'listen_pages', 1000, R, '🎶', 'ألف صفحة سماعاً', 'ألف صفحة من كتاب الله بصوت قارئ'),
  b('listen_pages_3000', 'listen_pages', 3000, E, '📻', 'ثلاثة آلاف صفحة سماعاً', 'ثلاثة آلاف صفحة استمعتَ إليها'),
  b('listen_pages_10000', 'listen_pages', 10000, L, '🌌', 'عشرة آلاف صفحة سماعاً', 'عشرة آلاف صفحة استمعتَ إليها — «إني أحب أن أسمعه من غيري»'),
  b('listen_streak_3', 'listen_streak', 3, C, '🎧', 'ثلاثة أيام مُنصتاً', 'استمعتَ إلى ختمتك ثلاثة أيام متتالية'),
  b('listen_streak_7', 'listen_streak', 7, C, '🔊', 'أسبوع من الإنصات', 'سبعة أيام متتالية من الاستماع'),
  b('listen_streak_30', 'listen_streak', 30, R, '🎼', 'شهر من الإنصات', 'ثلاثون يوماً متتالية تستمع فيها إلى كتاب الله'),
  b('listen_streak_100', 'listen_streak', 100, E, '🌙', 'مئة يوم من الإنصات', 'مئة يوم متتالٍ من الاستماع'),
  b('listen_khatma_1', 'listen_khatmat', 1, R, '🎧', 'ختمة استماع', 'أتممتَ ختمة كاملة استماعاً لقارئ'),
  b('listen_khatma_3', 'listen_khatmat', 3, E, '🎙️', 'ثلاث ختمات استماع', 'ثلاث ختمات استماعاً'),
  b('listen_khatma_10', 'listen_khatmat', 10, L, '👂', 'عشر ختمات استماع', 'عشر ختمات استمعتَ فيها إلى القرآن كاملاً'),
  // التفسير — أبطأ الأنواع، فصفحة فيه بصفحات
  b('tafsir_pages_10', 'tafsir_pages', 10, C, '🔍', 'أول التدبّر', 'تدبّرتَ عشر صفحات بتفسيرها — «أفلا يتدبّرون القرآن»'),
  b('tafsir_pages_50', 'tafsir_pages', 50, C, '📝', 'خمسون صفحة مفسَّرة', 'خمسون صفحة قرأتَ تفسيرها'),
  b('tafsir_pages_150', 'tafsir_pages', 150, R, '💡', 'ربع القرآن تدبّراً', 'مئة وخمسون صفحة بتفسيرها، نحو ربع القرآن'),
  b('tafsir_pages_300', 'tafsir_pages', 300, E, '🕯️', 'نصف القرآن تدبّراً', 'ثلاثمئة صفحة بتفسيرها، نحو نصف القرآن'),
  b('tafsir_khatma_1', 'tafsir_khatmat', 1, L, '📜', 'ختمة تفسير', 'أتممتَ تفسير القرآن كله — «كتابٌ أنزلناه إليك مبارك ليدّبّروا آياته»'),
  b('tafsir_khatma_3', 'tafsir_khatmat', 3, M, '🏺', 'ثلاث ختمات تفسير', 'ختمتَ تفسير القرآن ثلاث مرات'),
  b('tafsir_streak_3', 'tafsir_streak', 3, C, '🔍', 'ثلاثة أيام من التدبّر', 'تدبّرتَ من ختمة التفسير ثلاثة أيام متتالية'),
  b('tafsir_streak_7', 'tafsir_streak', 7, R, '💡', 'أسبوع من التدبّر', 'سبعة أيام متتالية مع التفسير'),
  b('tafsir_streak_30', 'tafsir_streak', 30, E, '🕯️', 'شهر من التدبّر', 'ثلاثون يوماً متتالية تتدبّر فيها كتاب الله'),
  b('tafsir_streak_100', 'tafsir_streak', 100, L, '🌟', 'مئة يوم من التدبّر', 'مئة يوم متتالٍ مع التفسير'),
  // المراجعة غيباً
  b('review_pages_20', 'review_pages', 20, C, '🧠', 'تعاهدٌ للمحفوظ', 'راجعتَ عشرين صفحة غيباً — «تعاهدوا هذا القرآن»'),
  b('review_pages_100', 'review_pages', 100, C, '🧠', 'مئة صفحة غيباً', 'مئة صفحة راجعتها من حفظك'),
  b('review_pages_300', 'review_pages', 300, R, '🏔️', 'نصف القرآن غيباً', 'ثلاثمئة صفحة راجعتها من حفظك'),
  b('review_pages_604', 'review_pages', 604, E, '💠', 'مصحفٌ في الصدر', 'ستمئة وأربع صفحات راجعتها غيباً'),
  b('review_pages_2000', 'review_pages', 2000, L, '👑', 'ألفا صفحة غيباً', 'ألفا صفحة راجعتها من حفظك — «اقرأ وارتقِ ورتّل»'),
  b('review_khatma_1', 'review_khatmat', 1, L, '💠', 'ختمة غيباً', 'راجعتَ القرآن كله من حفظك — «الماهر بالقرآن مع السفرة الكرام البررة»'),
  b('review_khatma_3', 'review_khatmat', 3, M, '💎', 'ثلاث ختمات غيباً', 'راجعتَ القرآن كله غيباً ثلاث مرات'),
  b('review_streak_7', 'review_streak', 7, C, '🔁', 'أسبوع من المراجعة', 'راجعتَ محفوظك سبعة أيام متتالية'),
  b('review_streak_30', 'review_streak', 30, R, '🔁', 'شهر من المراجعة', 'ثلاثون يوماً متتالية تتعاهد فيها حفظك'),
  b('review_streak_100', 'review_streak', 100, E, '🏆', 'مئة يوم من المراجعة', 'مئة يوم متتالٍ لم يتفلّت فيها حفظك'),
  // النصيب من كل نوع
  b('types_open_2', 'quran_types_open', 2, C, '🌿', 'نصيبان', 'لك ختمتان جاريتان من نوعين مختلفين'),
  b('types_open_3', 'quran_types_open', 3, R, '🌸', 'ثلاثة أنصبة', 'لك ختمات جارية من ثلاثة أنواع'),
  b('types_open_4', 'quran_types_open', 4, E, '💐', 'لكل نوع ختمة', 'تلاوة واستماع وتفسير ومراجعة، كلها جارية معاً'),
  b('types_done_2', 'quran_types_done', 2, E, '🌈', 'ختمتان من نوعين', 'أتممتَ ختمات من نوعين مختلفين'),
  b('types_done_4', 'quran_types_done', 4, M, '🕌', 'من كل نوع ختمة', 'ختمتَ تلاوةً واستماعاً وتفسيراً ومراجعة — نصيبٌ من كل باب'),
  b('quran_share_1', 'day_quran_share', 1, C, '🤝', 'يوم النصيبين', 'تقدّمتَ في كل أنواع ختماتك الجارية في يوم واحد'),
  b('quran_share_7', 'day_quran_share', 7, R, '🌿', 'سبعة أيام جامعة', 'سبعة أيام تقدّمتَ فيها في كل أنواع ختماتك'),
  b('quran_share_30', 'day_quran_share', 30, E, '🌳', 'ثلاثون يوماً جامعة', 'ثلاثون يوماً لم تترك فيها نوعاً من ختماتك'),
  b('quran_share_100', 'day_quran_share', 100, L, '🏞️', 'مئة يوم جامعة', 'مئة يوم تقدّمتَ فيها في كل أنواع ختماتك'),
  b('hifz_1', 'hifz_sessions', 1, C, '🧠', 'أول تسميع', 'أتممتَ أول جلسة حفظ وتسميع — «ولقد يسّرنا القرآن للذكر فهل من مدّكر»'),
  b('hifz_10', 'hifz_sessions', 10, R, '🎧', 'عشر جلسات تسميع', 'عشر جلسات حفظ وتسميع — «تعاهدوا هذا القرآن»'),
  b('hifz_100', 'hifz_sessions', 100, E, '🏅', 'مئة جلسة تسميع', 'مئة جلسة حفظ وتسميع'),
  b('hifz_perfect_1', 'hifz_perfect', 1, R, '✨', 'بلا خطأ', 'سمّعتَ جلسة اختبار كاملة دون خطأ — «الماهر بالقرآن مع السفرة الكرام البررة»'),
  b('hifz_perfect_10', 'hifz_perfect', 10, E, '💎', 'عشر جلسات متقنة', 'عشر جلسات اختبار دون خطأ واحد'),
  b('hifz_surah_1', 'hifz_surahs', 1, C, '🌱', 'أول سورة متقنة', 'أتقنتَ تسميع سورة في المراجعة'),
  b('hifz_surah_10', 'hifz_surahs', 10, R, '🌿', 'عشر سور متقنة', 'عشر سور متقنة في مراجعتك'),
  b('hifz_surah_37', 'hifz_surahs', 37, E, '🌳', 'سبع وثلاثون سورة', 'سبع وثلاثون سورة متقنة — بعدد سور جزء عمّ'),
  b('hifz_surah_114', 'hifz_surahs', 114, M, '👑', 'حافظٌ لكتاب الله', 'سور القرآن كلها متقنة في مراجعتك — «بل هو آياتٌ بيّنات في صدور الذين أوتوا العلم»'),

  // ══ الأوراد ══════════════════════════════════════════════════════════════
  b('awrad_1', 'awrad_done', 1, C, '🎯', 'أول وِرد', 'أتممتَ أول وِرد لك'),
  b('awrad_10', 'awrad_done', 10, C, '🎯', 'صاحب وِرد', 'أتممتَ أورادك عشر مرات'),
  b('awrad_50', 'awrad_done', 50, R, '🏹', 'ثابت على الوِرد', 'خمسون وِرداً مكتملاً'),
  b('awrad_200', 'awrad_done', 200, E, '🏆', 'أحبّ الأعمال أدومها', 'مئتا وِرد مكتمل'),
  b('awrad_500', 'awrad_done', 500, L, '🏆', 'المداوم', 'خمسمئة وِرد مكتمل — أحبّ الأعمال إلى الله أدومها وإن قلّ'),
  b('awrad_1000', 'awrad_done', 1000, M, '🏆', 'ألف وِرد', 'ألف وِرد مكتمل — «اكلَفوا من العمل ما تطيقون»'),
  b('wird_streak_7', 'wird_streak', 7, C, '🔗', 'أسبوع على الوِرد', 'أتممتَ وِرداً يومياً سبعة أيام متتالية'),
  b('wird_streak_30', 'wird_streak', 30, R, '⛓️', 'شهر على الوِرد', 'ثلاثون يوماً متتالية على وِردك اليومي'),
  b('wird_streak_100', 'wird_streak', 100, E, '🏹', 'مئة يوم على الوِرد', 'مئة يوم متتالٍ لم ينقطع فيها وِردك'),
  b('wird_streak_365', 'wird_streak', 365, L, '🎖️', 'عامٌ على الوِرد', '٣٦٥ يوماً متتالية على وِرد يومي'),
  b('extra_100', 'awrad_extra', 100, C, '➕', 'زيادة خير', 'زدتَ على أورادك مئة نافلة'),
  b('extra_1000', 'awrad_extra', 1000, R, '🌟', 'ألف نافلة', 'ألف زيادة فوق أورادك — «وسارعوا إلى مغفرة من ربكم»'),
  b('extra_10000', 'awrad_extra', 10000, E, '🌠', 'عشرة آلاف نافلة', 'عشرة آلاف زيادة فوق أورادك'),

  // ══ الصيام ═══════════════════════════════════════════════════════════════
  b('count_fasting_1', 'fasting_days', 1, C, '🌙', 'أول صيام', 'سجّلتَ أول يوم صيام — «من صام يوماً في سبيل الله باعد الله وجهه عن النار سبعين خريفاً»'),
  b('count_fasting_5', 'fasting_days', 5, C, '🌘', 'أول الصيام', 'خمسة أيام من الصيام'),
  b('count_fasting_15', 'fasting_days', 15, R, '🌘', 'خمسة عشر يوماً', 'خمسة عشر يوماً من الصيام — «الصيام جُنّة»'),
  b('count_fasting_30', 'fasting_days', 30, E, '🌒', 'مُداوم على الصيام', '٣٠ يوماً من الصيام'),
  b('count_fasting_100', 'fasting_days', 100, L, '🚪', 'باب الريّان', 'مئة يوم من الصيام — «إن في الجنة باباً يقال له الريّان»'),
  b('count_fasting_300', 'fasting_days', 300, M, '🚪', 'ثلاثمئة يوم صيام', 'ثلاثمئة يوم صمتها لله — «الصوم لي وأنا أجزي به»'),
  b('fasting_mon_thu_4', 'fasting_mon_thu', 4, C, '🌗', 'الاثنين والخميس', 'صمتَ أربعة أيام من الاثنين والخميس'),
  b('fasting_mon_thu_20', 'fasting_mon_thu', 20, R, '🌗', 'صائم الاثنين والخميس', 'عشرون يوماً صمتها من الاثنين والخميس — «تُعرض فيهما الأعمال»'),
  b('fasting_mon_thu_50', 'fasting_mon_thu', 50, E, '🌓', 'خمسون اثنين وخميس', 'خمسون يوماً من صيام الاثنين والخميس'),
  b('fasting_mon_thu_100', 'fasting_mon_thu', 100, L, '🌑', 'مئة اثنين وخميس', 'مئة يوم من صيام الاثنين والخميس — «فأحبّ أن يُعرض عملي وأنا صائم»'),
  b('white_1', 'fasting_white_months', 1, C, '🌕', 'الأيام البيض', 'صمتَ الثالث عشر والرابع عشر والخامس عشر من شهر هجري'),
  b('white_3', 'fasting_white_months', 3, R, '🌕', 'كصيام الدهر', 'صمتَ الأيام البيض ثلاثة أشهر — «صوم ثلاثة أيام من كل شهر صوم الدهر كله»'),
  b('white_12', 'fasting_white_months', 12, E, '🌝', 'عامٌ من الأيام البيض', 'صمتَ الأيام البيض في اثني عشر شهراً — «أوصاني خليلي بثلاث: صيام ثلاثة أيام من كل شهر…»'),

  // ══ المواسم ══════════════════════════════════════════════════════════════
  b('taraweeh_10', 'taraweeh_full', 10, C, '🕌', 'عشر ليالٍ من التراويح', 'صلّيتَ التراويح عشر ليالٍ من رمضان — «من قام مع الإمام حتى ينصرف كُتب له قيام ليلة»'),
  b('taraweeh_20', 'taraweeh_full', 20, R, '🌙', 'عشرون ليلة تراويح', 'صلّيتَ التراويح عشرين ليلة من رمضان'),
  b('ramadan_full', 'taraweeh_full', 30, L, '🌙', 'رمضان مكتمل', 'أتممتَ التراويح كل ليالي رمضان — «من قام رمضان إيماناً واحتساباً غُفر له ما تقدّم من ذنبه»'),
  b('ramadan_fast_1', 'ramadan_fasted', 1, E, '🌙', 'صام رمضان', 'صمتَ رمضان كاملاً — «من صام رمضان إيماناً واحتساباً غُفر له ما تقدّم من ذنبه»'),
  b('ramadan_fast_3', 'ramadan_fasted', 3, L, '🌙', 'ثلاثة رمضانات', 'سجّلتَ صيام رمضان كاملاً ثلاث مرات — «ورمضان إلى رمضان مكفّرات ما بينهن»'),
  b('last_ten_1', 'ramadan_last_ten', 1, L, '🏮', 'أحيا العشر', 'قمتَ كل ليالي العشر الأواخر — «كان إذا دخل العشر أحيا الليل وأيقظ أهله وجدّ وشدّ المئزر»'),
  b('odd_nights_1', 'ramadan_odd_nights', 1, E, '✨', 'تحرّى ليلة القدر', 'قمتَ ليالي الوتر من العشر الأواخر — «تحرّوا ليلة القدر في الوتر من العشر الأواخر»'),
  b('ramadan_juz_30', 'ramadan_juz', 30, E, '📗', 'ختمة رمضان', 'ختمتَ ثلاثين جزءاً في رمضان — «شهر رمضان الذي أُنزل فيه القرآن»'),
  b('arafah_1', 'arafah', 1, R, '🏔️', 'يوم عرفة', 'صمتَ يوم عرفة — «أحتسب على الله أن يكفّر السنة التي قبله والسنة التي بعده»'),
  b('ashura_1', 'ashura', 1, R, '🌊', 'يوم عاشوراء', 'صمتَ يوم عاشوراء — «أحتسب على الله أن يكفّر السنة التي قبله»'),
  b('tasua_ashura_1', 'tasua_ashura', 1, E, '🌊', 'تاسوعاء وعاشوراء', 'صمتَ التاسع والعاشر من محرم — «لئن بقيتُ إلى قابلٍ لأصومنّ التاسع»'),
  b('muharram_10', 'muharram_fasts', 10, R, '🌑', 'شهر الله المحرم', 'صمتَ عشرة أيام من محرم — «أفضل الصيام بعد رمضان شهر الله المحرم»'),
  b('shaban_15', 'shaban_fasts', 15, R, '🌘', 'صيام شعبان', 'صمتَ خمسة عشر يوماً من شعبان — «ما رأيته أكثر صياماً منه في شعبان»'),
  b('shawwal_6', 'shawwal_fasts', 6, R, '🌒', 'ستٌّ من شوال', 'صمتَ ستة أيام من شوال — «من صام رمضان ثم أتبعه ستاً من شوال كان كصيام الدهر»'),
  b('dhulhijjah_9', 'dhulhijjah_fasts', 9, E, '🐪', 'العشر من ذي الحجة', 'صمتَ الأيام التسعة الأولى من ذي الحجة — «ما من أيام العمل الصالح فيهن أحبّ إلى الله من هذه الأيام العشر»'),
  b('friday_4', 'friday_full', 4, C, '🕌', 'أربع جُمَع محفوظة', 'أربع جُمَع صلّيتَ فيها الخمس وقرأتَ أذكار الصباح والمساء — «خير يوم طلعت عليه الشمس يوم الجمعة»'),
  b('friday_12', 'friday_full', 12, R, '🗓️', 'اثنتا عشرة جمعة محفوظة', 'اثنتا عشرة جمعة محفوظة بالصلوات والأذكار'),
  b('friday_52', 'friday_full', 52, E, '🌟', 'عامٌ من الجُمَع المحفوظة', 'اثنتان وخمسون جمعة محفوظة بالصلوات والأذكار'),

  // ══ الصدقة ═══════════════════════════════════════════════════════════════
  b('sadaqah_1', 'sadaqah_count', 1, C, '🤲', 'أول صدقة', 'سجّلتَ أول صدقة — «والصدقة تطفئ الخطيئة كما يطفئ الماء النار»'),
  b('sadaqah_10', 'sadaqah_count', 10, C, '💝', 'عشر صدقات', 'عشر صدقات في سجلّك — «اتقوا النار ولو بشقّ تمرة»'),
  b('sadaqah_50', 'sadaqah_count', 50, R, '🎁', 'خمسون صدقة', 'خمسون صدقة — «ما نقصت صدقة من مال»'),
  b('sadaqah_100', 'sadaqah_count', 100, E, '🌾', 'مئة صدقة', 'مئة صدقة — «كمثل حبةٍ أنبتت سبع سنابل»'),
  b('sadaqah_365', 'sadaqah_count', 365, L, '🌻', 'صدقة لكل يوم', '٣٦٥ صدقة، بعدد أيام السنة'),
  b('sadaqah_weeks_4', 'sadaqah_week_streak', 4, R, '📅', 'صدقة كل أسبوع', 'أربعة أسابيع متتالية لم يخلُ أسبوع منها من صدقة'),
  b('sadaqah_weeks_12', 'sadaqah_week_streak', 12, E, '🗓️', 'اثنا عشر أسبوعاً من العطاء', 'اثنا عشر أسبوعاً متتالية من الصدقة — «اللهم أعطِ منفقاً خلَفاً»'),
  b('sadaqah_weeks_52', 'sadaqah_week_streak', 52, L, '💫', 'عامٌ من العطاء', 'اثنان وخمسون أسبوعاً متتالية لم تنقطع فيها صدقتك'),
  b('sadaqah_months_3', 'sadaqah_month_streak', 3, C, '🌱', 'ثلاثة أشهر من العطاء', 'ثلاثة أشهر متتالية لم يخلُ شهر منها من صدقة'),
  b('sadaqah_months_12', 'sadaqah_month_streak', 12, E, '🌙', 'صدقة كل شهر', 'اثنا عشر شهراً متتالية لم يخلُ شهر منها من صدقة'),
  b('sadaqah_ramadan_1', 'sadaqah_ramadan', 1, R, '🌙', 'أجود ما يكون في رمضان', 'تصدّقتَ في رمضان — «وكان أجود ما يكون في رمضان»'),
  b('sadaqah_ramadan_10', 'sadaqah_ramadan', 10, E, '🌙', 'عشر صدقات رمضانية', 'عشر صدقات في رمضان'),
  b('sadaqah_causes_5', 'sadaqah_causes', 5, R, '🚪', 'أبواب الخير', 'تصدّقتَ في خمسة أبواب مختلفة من الخير'),

  // ══ العلم ════════════════════════════════════════════════════════════════
  b('study_1', 'study_lessons', 1, C, '📘', 'أول درس', 'حضرتَ أول درس — «من سلك طريقاً يلتمس فيه علماً سهّل الله له به طريقاً إلى الجنة»'),
  b('study_10', 'study_lessons', 10, C, '📗', 'عشرة دروس', 'عشرة دروس بين حضور ومشاهدة — «وقل ربّ زدني علماً»'),
  b('study_50', 'study_lessons', 50, R, '📚', 'خمسون درساً', 'خمسون درساً في طلب العلم'),
  b('study_100', 'study_lessons', 100, E, '🎓', 'مئة درس', 'مئة درس — «من يُرد الله به خيراً يفقّهه في الدين»'),
  b('study_300', 'study_lessons', 300, L, '🏛️', 'ثلاثمئة درس', 'ثلاثمئة درس — «يرفع الله الذين آمنوا منكم والذين أوتوا العلم درجات»'),
  b('study_series_1', 'study_series', 1, R, '📜', 'أتممتَ سلسلة', 'أتممتَ سلسلة دروس كاملة'),
  b('study_series_5', 'study_series', 5, E, '📜', 'خمس سلاسل', 'أتممتَ خمس سلاسل علمية'),
  b('subjects_3', 'study_subjects', 3, R, '🧩', 'علوم متنوعة', 'طلبتَ ثلاثة علوم شرعية مختلفة'),
  b('subjects_6', 'study_subjects', 6, E, '🌐', 'طالب علم جامع', 'طلبتَ ستة علوم شرعية مختلفة'),
  b('study_weeks_4', 'study_week_streak', 4, R, '📅', 'أسابيع الطلب', 'أربعة أسابيع متتالية لم يخلُ أسبوع منها من درس'),
  b('study_weeks_12', 'study_week_streak', 12, E, '🎖️', 'اثنا عشر أسبوعاً من الطلب', 'اثنا عشر أسبوعاً متتالية في طلب العلم'),
  b('asma_10', 'asma_studied', 10, C, '✨', 'عشرة من الأسماء الحسنى', 'تعرّفتَ على عشرة من أسماء الله الحسنى — «ولله الأسماء الحسنى فادعوه بها»'),
  b('asma_33', 'asma_studied', 33, R, '💫', 'ثلاثة وثلاثون اسماً', 'تعرّفتَ على ثلاثة وثلاثين اسماً من أسماء الله الحسنى'),
  b('asma_99', 'asma_studied', 99, E, '🌟', 'من أحصاها', 'تعرّفتَ على أسماء الله التسعة والتسعين — «إن لله تسعة وتسعين اسماً، من أحصاها دخل الجنة»'),
  b('hadith_fav_10', 'hadith_favorites', 10, C, '📜', 'من مشكاة النبوة', 'حفظتَ عشرة أحاديث في مفضّلتك — «نضّر الله امرأً سمع منا حديثاً فحفظه حتى يبلّغه»'),
  b('hadith_fav_40', 'hadith_favorites', 40, R, '📜', 'الأربعون', 'أربعون حديثاً في مفضّلتك'),

  // ══ العادات والمهام ══════════════════════════════════════════════════════
  b('habits_days_1', 'habits_days', 1, C, '⭐', 'يوم العادات', 'أتممتَ كل عاداتك في يوم — «احرص على ما ينفعك واستعن بالله ولا تعجز»'),
  b('habits_days_30', 'habits_days', 30, R, '🌟', 'ثلاثون يوماً من العادات', 'ثلاثون يوماً أتممتَ فيها عاداتك كلها'),
  b('habits_days_100', 'habits_days', 100, E, '💫', 'مئة يوم من العادات', 'مئة يوم أتممتَ فيها عاداتك كلها'),
  b('habits_days_365', 'habits_days', 365, L, '🌠', 'عامٌ من العادات', '٣٦٥ يوماً أتممتَ فيها عاداتك كلها'),
  b('habits_streak_7', 'habits_streak', 7, C, '🔥', 'أسبوع العادات', 'أتممتَ عاداتك سبعة أيام متتالية'),
  b('habits_streak_30', 'habits_streak', 30, R, '🔥', 'شهر العادات', 'ثلاثون يوماً متتالية أتممتَ فيها عاداتك'),
  b('habits_streak_100', 'habits_streak', 100, E, '🔥', 'مئة يوم من العادات المتصلة', 'مئة يوم متتالٍ أتممتَ فيها عاداتك'),
  b('tasks_10', 'tasks_done', 10, C, '✔️', 'عشر مهام', 'أنجزتَ عشر مهام — «إن الله كتب الإحسان على كل شيء»'),
  b('tasks_100', 'tasks_done', 100, R, '📋', 'مئة مهمة', 'أنجزتَ مئة مهمة'),
  b('tasks_500', 'tasks_done', 500, E, '🗂️', 'خمسمئة مهمة', 'خمسمئة مهمة منجزة — «اغتنم خمساً قبل خمس»'),

  // ══ الثبات ═══════════════════════════════════════════════════════════════
  b('streak_overall_3', 'overall_streak', 3, C, '🌱', 'بداية الطريق', 'ثلاثة أيام متتالية من العبادة — والقليل الدائم خير'),
  b('streak_overall_7', 'overall_streak', 7, C, '🌟', 'أسبوع كامل', 'حافظتَ على عبادتك سبعة أيام متتالية'),
  b('streak_overall_14', 'overall_streak', 14, C, '🌿', 'أسبوعان من الثبات', 'أربعة عشر يوماً متتالية من العبادة'),
  b('streak_overall_30', 'overall_streak', 30, R, '🏅', 'شهر من الانتظام', '٣٠ يوماً متتالية من العبادة'),
  b('streak_overall_100', 'overall_streak', 100, E, '💫', 'مئة يوم', 'مئة يوم متتالٍ — مَن صَبَر ظَفِر'),
  b('streak_overall_365', 'overall_streak', 365, L, '👑', 'سنة كاملة', '٣٦٥ يوماً متتالية — إنجاز عظيم'),
  b('streak_overall_1000', 'overall_streak', 1000, M, '🏔️', 'ألف يوم', 'ألف يوم متتالٍ — «واعبد ربك حتى يأتيك اليقين»'),
  b('active_days_10', 'active_days', 10, C, '📅', 'عشرة أيام', 'عشرة أيام سجّلتَ فيها عبادة'),
  b('active_days_100', 'active_days', 100, R, '🗓️', 'مئة يوم عبادة', 'مئة يوم في سجلّك عامرة بالطاعة'),
  b('active_days_365', 'active_days', 365, E, '📆', 'عامٌ من الأيام العامرة', '٣٦٥ يوماً سجّلتَ فيها عبادة'),
  b('active_days_1000', 'active_days', 1000, L, '🏛️', 'ألف يوم عامر', 'ألف يوم في سجلّك — «أحبّ الأعمال إلى الله أدومها وإن قلّ»'),
  b('weeks_4', 'consistent_weeks', 4, C, '🧭', 'أربعة أسابيع ثابتة', 'أربعة أسابيع تعبّدتَ فيها خمسة أيام أو أكثر'),
  b('weeks_12', 'consistent_weeks', 12, R, '🌳', 'موسم من الثبات', 'اثنا عشر أسبوعاً من المداومة'),
  b('weeks_52', 'consistent_weeks', 52, L, '👑', 'عام من الثبات', 'اثنان وخمسون أسبوعاً من المداومة'),
  b('weeks_104', 'consistent_weeks', 104, M, '🌲', 'عامان من الثبات', 'مئة وأربعة أسابيع تعبّدتَ فيها خمسة أيام أو أكثر — «فاستقم كما أُمرت»'),
  b('months_full_1', 'active_full_months', 1, R, '🌙', 'شهر بلا انقطاع', 'شهر كامل لم يخلُ يوم منه من عبادة'),
  b('months_full_6', 'active_full_months', 6, E, '🌗', 'ستة أشهر عامرة', 'ستة أشهر كاملة، كل يوم فيها عبادة'),
  b('months_full_12', 'active_full_months', 12, L, '🌕', 'اثنا عشر شهراً عامرة', 'اثنا عشر شهراً كاملة لم ينقطع فيها يوم — «إن الذين قالوا ربنا الله ثم استقاموا»'),
  b('early_10', 'early_days', 10, C, '🌄', 'من أهل البكور', 'بدأتَ عبادتك قبل السابعة صباحاً في عشرة أيام'),
  b('early_40', 'early_days', 40, R, '🌞', 'بورك في بكورك', 'أربعون يوماً بدأتها بالعبادة قبل السابعة'),
  b('early_100', 'early_days', 100, E, '🐦', 'مبارك في بكوره', 'مئة يوم بدأتها بالعبادة قبل السابعة — «اللهم بارك لأمتي في بكورها»'),
  b('early_365', 'early_days', 365, L, '☀️', 'عامٌ من البكور', '٣٦٥ يوماً بدأتها بالعبادة قبل السابعة'),
  b('comeback_1', 'comeback', 1, R, '🕊️', 'عودٌ حميد', 'عدتَ بعد انقطاع أسبوع فأكثر وثبتَّ ثلاثة أيام — «إن الله يحب التوابين»', 'لكل من غاب ثم رجع…'),
];

export const BADGE_BY_ID: ReadonlyMap<string, BadgeDefinition> = new Map(BADGES.map((x) => [x.id, x]));
export const categoryOf = (x: BadgeDefinition): BadgeCategory => METRICS[x.metric].cat;
export const unitOf = (x: BadgeDefinition): Forms => UNITS[METRICS[x.metric].unit];

/** Is the badge offered to this user (mosque badges: men only)? */
export const badgeVisible = (x: BadgeDefinition, gender: 'male' | 'female' | null | undefined): boolean =>
  !x.audience || x.audience === gender;

/** The catalog as this user sees it. */
export const badgesFor = (gender: 'male' | 'female' | null | undefined): BadgeDefinition[] =>
  BADGES.filter((x) => badgeVisible(x, gender));

/** Unlocked ids that are still in the catalog and offered to this user. */
export const unlockedCount = (unlocked: readonly string[], gender: 'male' | 'female' | null | undefined): number =>
  unlocked.filter((id) => {
    const x = BADGE_BY_ID.get(id);
    return !!x && badgeVisible(x, gender);
  }).length;

// ── Tracks: the badges of one metric, easiest first ───────────────────────
export interface BadgeTrack {
  metric: BadgeMetric;
  label: string;
  category: BadgeCategory;
  tiers: BadgeDefinition[];
}

export const TRACKS: BadgeTrack[] = (() => {
  const byMetric = new Map<BadgeMetric, BadgeDefinition[]>();
  for (const x of BADGES) byMetric.set(x.metric, [...(byMetric.get(x.metric) ?? []), x]);
  return [...byMetric].map(([metric, tiers]) => ({
    metric,
    label: METRICS[metric].label,
    category: METRICS[metric].cat,
    tiers: [...tiers].sort((p, q) => p.target - q.target),
  }));
})();

export const TRACK_BY_METRIC = new Map(TRACKS.map((t) => [t.metric, t]));

// ── Levels — every badge earns points by rarity ───────────────────────────
export interface Level {
  rank: number;
  titleAr: string;
  /** Points needed to reach this level. */
  min: number;
}

export const LEVELS: Level[] = [
  { rank: 1, titleAr: 'مبتدئ', min: 0 },
  { rank: 2, titleAr: 'سالك', min: 40 },
  { rank: 3, titleAr: 'مجتهد', min: 120 },
  { rank: 4, titleAr: 'مداوم', min: 260 },
  { rank: 5, titleAr: 'محافظ', min: 480 },
  { rank: 6, titleAr: 'ذاكر', min: 800 },
  { rank: 7, titleAr: 'قانت', min: 1250 },
  { rank: 8, titleAr: 'منيب', min: 1850 },
  { rank: 9, titleAr: 'مُخبِت', min: 2650 },
  { rank: 10, titleAr: 'أوّاب', min: 3700 },
  { rank: 11, titleAr: 'صابر', min: 5100 },
  { rank: 12, titleAr: 'محسن', min: 7000 },
  { rank: 13, titleAr: 'ربّاني', min: 10000 },
];

/** Total points of the given unlocked badge ids (only those offered to `gender`, when given). */
export function badgePoints(unlocked: Iterable<string>, gender?: 'male' | 'female' | null): number {
  let n = 0;
  for (const id of new Set(unlocked)) {
    const x = BADGE_BY_ID.get(id);
    if (x && (gender === undefined || badgeVisible(x, gender))) n += RARITY_POINTS[x.rarity];
  }
  return n;
}

/** The level for `points`, the next one (null at the top), and % of the way there. */
export function levelFor(points: number): { level: Level; next: Level | null; pct: number } {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const level = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const pct = next ? Math.floor(((points - level.min) / (next.min - level.min)) * 100) : 100;
  return { level, next, pct };
}
