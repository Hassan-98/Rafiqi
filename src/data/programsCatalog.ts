/**
 * «برامج التدرّج» — the curated catalogue: each program's intro, authentic
 * source, day-by-day escalation and how a day is verified. Content only — the
 * engine (schedules, grace, verification) is src/store/programsModel.ts.
 *
 * `steps[i]` is the target of step i (0-based). A step is one successful day:
 * with forgiving grace a missed day repeats its step, with strict grace it
 * restarts the count, so a run can take longer than `steps.length` days.
 */
import { toArabicDigits as ar } from '@/utils/arabicFormat';

export type VerifyKind =
  | 'check' // «تمّ / سلمتُ اليوم» (manual)
  | 'count' // a number entered by hand
  | 'takbeer' // the five prayers ticked one by one (self-reported)
  | 'mosque' // prayer log: prayed in the mosque
  | 'onTime' // prayer log: prayed at the start of its time (women)
  | 'rawatib' // prayer log: sunnah before/after
  | 'qiyam' // qiyamStore: rakaat + witr of the night
  | 'duha' // prayer log: الضحى rakaat
  | 'adhkar' // activity log: morning / evening sets
  | 'quran' // مصحفي pages of the day
  | 'fasting' // progressStore 'fasting'
  | 'istighfar'; // a linked tasbih counter + hand count

export type ProgramUnit = 'check' | 'count' | 'rakaat' | 'pages' | 'prayers' | 'sets' | 'slots' | 'fasts';
export type Grace = 'strict' | 'forgiving';
export type Curve = 'linear' | 'weekly' | 'fixed';
export type ProgramIcon =
  | 'mosque'
  | 'takbeer'
  | 'clock'
  | 'rawatib'
  | 'sun'
  | 'moon'
  | 'adhkar'
  | 'istighfar'
  | 'quran'
  | 'khatma'
  | 'fast'
  | 'shield'
  | 'custom';
export type ProgramCategory = 'prayer' | 'nawafil' | 'quran' | 'fasting' | 'nafs';
export type ReminderAnchor = 'time' | 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface ReminderSpec {
  anchor: ReminderAnchor;
  /** Minutes after (negative: before) the anchor prayer. */
  offset: number;
  /** HH:mm, used when anchor is 'time'. */
  time: string;
  /** Fire the evening BEFORE a due day (fasting: the intention and suhoor). */
  eve?: boolean;
  /** Only while the step's target is at least this (adhkar: the evening set). */
  minTarget?: number;
  label?: string;
}

export interface Source {
  text: string;
  ref: string;
  /** Quranic text: rendered in the Quran face. */
  ayah?: boolean;
}

export interface StepCtx {
  male: boolean;
  /** «ترك عادة»: what is being left. */
  name?: string;
  /** 0 = Sunday. */
  weekday?: number;
  /** السنن الرواتب of the step on that day. */
  slots?: { label: string; rakaat: number }[];
}

export interface ProgramTemplate {
  id: string;
  title: string;
  /** One line under the title on the catalogue tile. */
  short: string;
  category: ProgramCategory;
  icon: ProgramIcon;
  level: 1 | 2 | 3;
  gender?: 'male' | 'female';
  why: string;
  source?: Source;
  more?: Source[];
  /** Overrides «٤٠ يوماً» (programs with rest days). */
  lengthLabel?: string;
  steps: number[];
  unit: ProgramUnit;
  verify: VerifyKind;
  /** One line: how a day gets verified. */
  verifyText: string;
  grace: Grace;
  /** Grace can't be changed — why (shown in place of the switch). */
  graceLocked?: string;
  /** A woman's excused days (حيض/نفاس) neither count nor break it. */
  excusable?: boolean;
  /** Days that carry a step (others are rest). `weekday` 0 = Sunday. */
  dueOn?: (weekday: number, step: number) => boolean;
  stepText: (target: number, ctx: StepCtx) => string;
  /** [from step, tip] — the tip of the phase a step falls in. */
  tips?: [number, string][];
  reminders: ReminderSpec[];
  remindText?: (target: number, ctx: StepCtx, spec: ReminderSpec) => string;
  /** The next level, offered on completion. */
  next?: string;
  /** Where the deed itself is logged. */
  link?: { to: string; label: string };
  needsName?: boolean;
  lengthChoices?: number[];
}

// ── Arabic counting (nominative: «ركعتان»، «٣ ركعات»، «١١ ركعة»، «١٠٠ مرة») ──

export function nounCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${ar(n)} ${few}`;
  return `${ar(n)} ${many}`;
}
export const rakaatAr = (n: number) => nounCount(n, 'ركعة واحدة', 'ركعتان', 'ركعات', 'ركعة');
export const pagesAr = (n: number) => nounCount(n, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة');
export const timesAr = (n: number) => nounCount(n, 'مرة واحدة', 'مرتان', 'مرات', 'مرة');
export const prayersAr = (n: number) => nounCount(n, 'صلاة واحدة', 'صلاتان', 'صلوات', 'صلاة');
export const daysAr = (n: number) => nounCount(n, 'يوم واحد', 'يومان', 'أيام', n % 100 === 0 ? 'يوم' : 'يوماً');
export const fastsAr = (n: number) => nounCount(n, 'صوم واحد', 'صومان', 'أيام صيام', 'صوماً');

export const WEEKDAY_NAME = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** rep([2, 5], [3, 5]) → [2,2,2,2,2,3,3,3,3,3] */
export const rep = (...parts: [number, number][]): number[] => parts.flatMap(([v, n]) => Array<number>(n).fill(v));

const qiyamText = (t: number) => (t % 2 ? (t === 1 ? 'الوتر' : `${rakaatAr(t - 1)} والوتر`) : rakaatAr(t));

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  // ── الصلاة ───────────────────────────────────────────────────────────────
  {
    id: 'jamaah21',
    title: 'صلاة الجماعة: من صلاةٍ إلى خمس',
    short: 'صلاةٌ في المسجد تزيد حتى الخمس',
    category: 'prayer',
    icon: 'mosque',
    level: 1,
    gender: 'male',
    why: 'تبدأ بصلاةٍ واحدة تختارها في المسجد، ثم تزيد صلاةً كل أربعة أيام حتى تصلّي الخمس جماعة. هو تمهيدٌ لبرنامج «تكبيرة الإحرام أربعين يوماً».',
    source: { text: 'صلاة الجماعة أفضل من صلاة الفذّ بسبعٍ وعشرين درجة', ref: 'متفق عليه (البخاري ٦٤٥، مسلم ٦٥٠)' },
    steps: rep([1, 4], [2, 4], [3, 4], [4, 4], [5, 5]),
    unit: 'prayers',
    verify: 'mosque',
    verifyText: 'يتحقّق تلقائياً من سجلّ صلواتك: كل صلاة علّمتها «في المسجد».',
    grace: 'forgiving',
    stepText: (t) => (t >= 5 ? 'الصلوات الخمس في المسجد' : `${prayersAr(t)} في المسجد`),
    tips: [
      [0, 'اختر أيسر صلاةٍ عليك اليوم، والعشاء أو المغرب أقربها غالباً.'],
      [4, 'أضف صلاةً قريبة من الأولى حتى يصير المسجد طريقك اليومي.'],
      [8, 'ثلاث صلوات: اجعل الفجر منها متى استطعت.'],
      [12, 'أربع صلوات: رتّب يومك حول الأذان لا العكس.'],
      [16, 'الخمس كلها، بارك الله فيك. بعدها يأتي برنامج التكبيرة الأولى.'],
    ],
    reminders: [{ anchor: 'fajr', offset: -25, time: '04:30' }],
    remindText: (t) => `الفجر بعد قليل. خطوتك اليوم: ${t >= 5 ? 'الخمس في المسجد' : `${prayersAr(t)} في المسجد`}`,
    next: 'takbeer40',
    link: { to: '/module/prayers', label: 'سجلّ الصلوات' },
  },
  {
    id: 'takbeer40',
    title: 'تكبيرة الإحرام أربعين يوماً',
    short: 'براءتان: من النار ومن النفاق',
    category: 'prayer',
    icon: 'takbeer',
    level: 3,
    gender: 'male',
    why: 'وعدٌ نبويّ لمن ثبت أربعين يوماً يدرك تكبيرة الإحرام مع الإمام في كل صلاة. العدد لا يتدرّج، فالحديث يطلب الخمس من أول يوم، لكن الاستعداد يتدرّج: البكور إلى المسجد، ثم السنة القبلية، ثم انتظار الصلاة بعد الصلاة.',
    source: {
      text: 'من صلّى لله أربعين يوماً في جماعة يدرك التكبيرة الأولى كُتبت له براءتان: براءةٌ من النار، وبراءةٌ من النفاق',
      ref: 'الترمذي (٢٤١)، وحسّنه الألباني',
    },
    steps: rep([5, 40]),
    unit: 'prayers',
    verify: 'takbeer',
    verifyText: 'تعلّم كل صلاة أدركتَ تكبيرتها الأولى، فتُسجَّل أيضاً جماعةً في سجلّ صلواتك.',
    grace: 'strict',
    graceLocked:
      'الأربعون في الحديث متتابعة، فإن فاتتك تكبيرةٌ بدأ العدّ من جديد. ولا يضيع شيء: كل صلاةٍ أدركتها مكتوبةٌ لك، والعودة نفسها عبادة.',
    stepText: () => 'التكبيرة الأولى في الصلوات الخمس',
    tips: [
      [0, 'احضر قبل الإقامة بدقائق، فالتكبيرة تُدرَك بالبكور لا بالعجلة.'],
      [7, 'أضف السنة القبلية في المسجد، ثم انتظر الإقامة.'],
      [14, 'انتظار الصلاة بعد الصلاة رباط، فأطِل جلوسك بعد الفجر قليلاً.'],
      [20, 'نصف الطريق. نَمْ مبكراً ليصفو لك الفجر.'],
      [30, 'العشر الأخيرة من الأربعين: أكثِر من سؤال الله الثبات.'],
    ],
    reminders: [{ anchor: 'fajr', offset: -20, time: '04:30' }],
    remindText: () => 'الفجر بعد عشرين دقيقة. توضّأ وامشِ لتدرك التكبيرة الأولى.',
    next: 'rawatib35',
    link: { to: '/module/prayers', label: 'سجلّ الصلوات' },
  },
  {
    id: 'onTime40',
    title: 'الصلاة على أول وقتها أربعين يوماً',
    short: 'أحبّ الأعمال إلى الله',
    category: 'prayer',
    icon: 'clock',
    level: 3,
    gender: 'female',
    why: 'سُئل النبي ﷺ عن أحبّ الأعمال إلى الله فبدأ بالصلاة على وقتها. أربعون يوماً تصلّين فيها كل فريضة حين يؤذَّن لها، حتى يصير الأذان موعداً لا يؤجَّل. أيام العذر لا تُحتسب ولا تقطع البرنامج.',
    source: { text: 'أيُّ العمل أحبُّ إلى الله؟ قال: الصلاة على وقتها', ref: 'متفق عليه (البخاري ٥٢٧، مسلم ٨٥)' },
    steps: rep([5, 40]),
    unit: 'prayers',
    verify: 'onTime',
    verifyText: 'يتحقّق تلقائياً من «على وقتها» في سجلّ صلواتك.',
    grace: 'strict',
    excusable: true,
    stepText: () => 'الصلوات الخمس على أول وقتها',
    tips: [
      [0, 'اجعلي الوضوء قبل الأذان بدقائق.'],
      [10, 'رتّبي أعمال البيت حول أوقات الصلاة لا العكس.'],
      [20, 'نصف الطريق. أذكار ما بعد الصلاة تُمسك الوقت وتبارك فيه.'],
      [30, 'العشر الأخيرة: اسألي الله القبول والثبات.'],
    ],
    reminders: [{ anchor: 'fajr', offset: 5, time: '05:00' }],
    remindText: () => 'أُذّن للفجر. صلاتك على أول وقتها خطوة اليوم.',
    next: 'rawatib35',
    link: { to: '/module/prayers', label: 'سجلّ الصلوات' },
  },
  {
    id: 'rawatib35',
    title: 'السنن الرواتب الاثنتا عشرة',
    short: 'بيتٌ في الجنة، سنّةً بعد سنّة',
    category: 'prayer',
    icon: 'rawatib',
    level: 2,
    why: 'اثنتا عشرة ركعة كل يوم وعد صاحبَها النبيُّ ﷺ ببيتٍ في الجنة. تبدأ بسنة الفجر وهي آكدها، ثم تضيف سنّةً كل أسبوع: بعدية المغرب، فبعدية العشاء، فبعدية الظهر، ثم قبلية الظهر الأربع.',
    source: {
      text: 'ما من عبدٍ مسلم يصلّي لله كل يومٍ ثنتي عشرة ركعةً تطوّعاً غير فريضة إلا بنى الله له بيتاً في الجنة',
      ref: 'مسلم (٧٢٨)',
    },
    more: [{ text: 'ركعتا الفجر خيرٌ من الدنيا وما فيها', ref: 'مسلم (٧٢٥)' }],
    steps: rep([1, 7], [2, 7], [3, 7], [4, 7], [5, 7]),
    unit: 'slots',
    verify: 'rawatib',
    verifyText: 'يتحقّق تلقائياً من السنن التي تسجّلها مع كل صلاة. ويوم الجمعة للرجال أربعٌ بعدها ولا قبلية.',
    grace: 'forgiving',
    excusable: true,
    stepText: (_t, ctx) => {
      const s = ctx.slots ?? [];
      const n = s.reduce((a, x) => a + x.rakaat, 0);
      return s.length ? `${rakaatAr(n)}: ${s.map((x) => x.label).join('، ')}` : 'السنن الرواتب';
    },
    tips: [
      [0, 'سنة الفجر وحدها هذا الأسبوع: ركعتان خفيفتان قبل الفريضة.'],
      [7, 'أضف ركعتين بعد المغرب.'],
      [14, 'أضف ركعتين بعد العشاء.'],
      [21, 'أضف ركعتين بعد الظهر.'],
      [28, 'اكتملت: أربعٌ قبل الظهر. هي اثنتا عشرة ركعة كل يوم.'],
    ],
    reminders: [{ anchor: 'fajr', offset: -10, time: '04:40' }],
    remindText: () => 'سنة الفجر قبل الفريضة، خيرٌ من الدنيا وما فيها.',
    next: 'duha30',
    link: { to: '/module/prayers', label: 'سجلّ الصلوات' },
  },

  // ── النوافل ──────────────────────────────────────────────────────────────
  {
    id: 'duha30',
    title: 'الضحى كل يوم',
    short: 'صدقةٌ عن كل مفصلٍ فيك',
    category: 'nawafil',
    icon: 'sun',
    level: 1,
    why: 'على كل مفصلٍ في جسدك صدقةٌ كل يوم، وتجزئ عنها ركعتا الضحى. تبدأ بركعتين، ثم أربع، ثم ست، ثم ثمانٍ كما صلّاها النبي ﷺ يوم الفتح. وقتها من ارتفاع الشمس إلى قبيل الظهر، وأفضله حين يشتدّ الحرّ.',
    source: {
      text: 'يُصبح على كل سُلامى من أحدكم صدقة… ويُجزئ من ذلك ركعتان يركعهما من الضحى',
      ref: 'مسلم (٧٢٠)',
    },
    steps: rep([2, 9], [4, 8], [6, 7], [8, 6]),
    unit: 'rakaat',
    verify: 'duha',
    verifyText: 'يتحقّق تلقائياً من صلاة الضحى المسجّلة اليوم بعدد ركعاتها.',
    grace: 'forgiving',
    excusable: true,
    stepText: (t) => (t === 2 ? 'ركعتا الضحى' : `${rakaatAr(t)} من الضحى`),
    tips: [
      [0, 'ركعتان خفيفتان تكفيان، والمهم ألّا يمرّ يومٌ بلا ضحى.'],
      [9, 'أربع ركعات، كما كان النبي ﷺ يصلّيها ويزيد ما شاء الله.'],
      [17, 'ست ركعات: اجعلها في استراحة العمل أو بعد أعمال البيت.'],
      [24, 'ثمانٍ، صلاة النبي ﷺ يوم الفتح.'],
    ],
    reminders: [{ anchor: 'sunrise', offset: 120, time: '08:30' }],
    remindText: (t) => `وقت الضحى. خطوتك اليوم: ${t === 2 ? 'ركعتان' : rakaatAr(t)}`,
    next: 'qiyam30',
    link: { to: '/module/prayers', label: 'سجلّ الصلوات' },
  },
  {
    id: 'qiyam30',
    title: 'قيام الليل: من ركعتين إلى إحدى عشرة',
    short: 'دأب الصالحين، خطوةً كل خمس ليالٍ',
    category: 'nawafil',
    icon: 'moon',
    level: 2,
    why: 'كان النبي ﷺ يصلّي من الليل إحدى عشرة ركعة. تبدأ بركعتين بعد العشاء أو قبل النوم، ثم يُضاف الوتر، وتزيد ركعتين كل خمس ليالٍ حتى تبلغ عشر ركعات والوتر. الليلة تُنسب إلى مسائها، فقيام الثالثة فجراً لليلة التي قبلها.',
    source: {
      text: 'عليكم بقيام الليل فإنه دأب الصالحين قبلكم، وهو قُربةٌ إلى ربكم، ومكفرةٌ للسيئات، ومنهاةٌ عن الإثم',
      ref: 'الترمذي (٣٥٤٩)، وحسّنه الألباني',
    },
    more: [{ text: 'ما كان رسول الله ﷺ يزيد في رمضان ولا في غيره على إحدى عشرة ركعة', ref: 'متفق عليه (البخاري ١١٤٧، مسلم ٧٣٨)' }],
    steps: rep([2, 5], [3, 5], [5, 5], [7, 5], [9, 5], [11, 5]),
    unit: 'rakaat',
    verify: 'qiyam',
    verifyText: 'يتحقّق تلقائياً من سجلّ القيام: الركعات والوتر (والوتر ركعة). يمكن تسجيل الليلة حتى ظهر الغد.',
    grace: 'forgiving',
    excusable: true,
    stepText: (t) => qiyamText(t),
    tips: [
      [0, 'ركعتان قبل النوم بدايةٌ حسنة، و«من قام بعشر آياتٍ لم يُكتب من الغافلين» (أبو داود).'],
      [5, 'أضف الوتر بعدهما، ولو ركعة.'],
      [10, 'أربع ركعات والوتر. أطِل السجود قليلاً.'],
      [15, 'ست ركعات والوتر. جرّب الثلث الأخير ليلةً في الأسبوع.'],
      [20, 'ثمانٍ والوتر. قسّمها إن شئت: بعضها أول الليل وبعضها آخره.'],
      [25, 'عشر ركعات والوتر: إحدى عشرة كقيام النبي ﷺ.'],
    ],
    reminders: [{ anchor: 'isha', offset: 60, time: '21:30' }],
    remindText: (t) => `قيامك الليلة: ${qiyamText(t)}. ولو قبل النوم.`,
    next: 'fastMonThu',
    link: { to: '/targets?tab=qiyam', label: 'سجلّ القيام' },
  },

  // ── القرآن والذكر ────────────────────────────────────────────────────────
  {
    id: 'adhkar30',
    title: 'أذكار الصباح والمساء ثلاثين يوماً',
    short: 'حصنٌ يومي يبدأ بالصباح',
    category: 'quran',
    icon: 'adhkar',
    level: 1,
    why: 'أذكار طرفي النهار حصن المسلم في يومه وليلته. عشرة أيام لأذكار الصباح وحدها حتى تثبت، ثم تُضاف أذكار المساء عشرين يوماً. «المختصر» يُحتسب إن ضاق وقتك.',
    source: { text: 'وَسَبِّحْ بِحَمْدِ رَبِّكَ قَبْلَ طُلُوعِ الشَّمْسِ وَقَبْلَ الْغُرُوبِ', ref: 'ق: ٣٩', ayah: true },
    more: [
      {
        text: 'من قال حين يصبح وحين يمسي: سبحان الله وبحمده مئة مرة، لم يأتِ أحدٌ يوم القيامة بأفضل مما جاء به إلا أحدٌ قال مثل ما قال أو زاد عليه',
        ref: 'مسلم (٢٦٩٢)',
      },
    ],
    steps: rep([1, 10], [2, 20]),
    unit: 'sets',
    verify: 'adhkar',
    verifyText: 'يتحقّق تلقائياً حين تقرأ الأذكار في التطبيق. إن قرأتها من كتاب فعلّمها بنفسك.',
    grace: 'forgiving',
    stepText: (t) => (t >= 2 ? 'أذكار الصباح والمساء' : 'أذكار الصباح'),
    tips: [
      [0, 'بعد الفجر مباشرةً، قبل الهاتف والعمل.'],
      [10, 'أُضيفت أذكار المساء: بعد العصر إلى المغرب.'],
      [20, 'العشر الأخيرة: اقرأها بتدبّر، لا بسرعة.'],
    ],
    reminders: [
      { anchor: 'fajr', offset: 40, time: '05:30', label: 'الصباح' },
      { anchor: 'asr', offset: 20, time: '16:00', minTarget: 2, label: 'المساء' },
    ],
    remindText: (_t, _c, spec) => (spec.minTarget ? 'أذكار المساء: حصنك لليلتك.' : 'أذكار الصباح: حصنك ليومك.'),
    next: 'istighfar40',
    link: { to: '/adhkar', label: 'الأذكار' },
  },
  {
    id: 'istighfar40',
    title: 'الاستغفار: من ١٠ إلى ١٠٠٠',
    short: 'من عشر مرات إلى ألفٍ في أربعين يوماً',
    category: 'quran',
    icon: 'istighfar',
    level: 1,
    why: 'كان النبي ﷺ يستغفر الله في اليوم أكثر من سبعين مرة. تبدأ بعشر، وتزيد كل خمسة أيام: ٣٠ ثم ٧٠ ثم ١٠٠، ثم ٢٠٠ و٤٠٠ و٧٠٠ حتى الألف. اربطه بعدّادٍ في السبحة ليُحسب تلقائياً.',
    source: { text: 'والله إني لأستغفر الله وأتوب إليه في اليوم أكثر من سبعين مرة', ref: 'البخاري (٦٣٠٧)' },
    more: [
      { text: 'فَقُلْتُ اسْتَغْفِرُوا رَبَّكُمْ إِنَّهُ كَانَ غَفَّارًا', ref: 'نوح: ١٠', ayah: true },
      { text: 'يا أيها الناس توبوا إلى الله، فإني أتوب في اليوم إليه مئة مرة', ref: 'مسلم (٢٧٠٢)' },
    ],
    steps: rep([10, 5], [30, 5], [70, 5], [100, 5], [200, 5], [400, 5], [700, 5], [1000, 5]),
    unit: 'count',
    verify: 'istighfar',
    verifyText: 'يُحسب تلقائياً من عدّاد السبحة المربوط، وتضيف بيدك ما عددته خارجها.',
    grace: 'forgiving',
    stepText: (t) => `«أستغفر الله» ${timesAr(t)}`,
    tips: [
      [0, 'عشر مرات بحضور قلب: تمهّل في كل واحدة.'],
      [10, 'سبعون: عدد ما كان النبي ﷺ يزيد عليه.'],
      [15, 'مئة، كما أمر النبي ﷺ بالتوبة كل يوم.'],
      [20, 'فرّقها على اليوم: بعد كل صلاة جزء.'],
      [35, 'الألف: في الطريق والانتظار وقبل النوم.'],
    ],
    reminders: [{ anchor: 'asr', offset: 15, time: '16:00' }],
    remindText: (t) => `استغفارك اليوم: ${timesAr(t)}`,
    next: 'quran60',
    link: { to: '/tasbih', label: 'السبحة' },
  },
  {
    id: 'quran60',
    title: 'وِرد القرآن: من صفحةٍ إلى جزء',
    short: 'صفحةٌ تكبر حتى تصير جزءاً كل يوم',
    category: 'quran',
    icon: 'quran',
    level: 2,
    why: 'القليل الدائم يصنع الختمة. ستون يوماً تبدأ بصفحة واحدة وتزيد كل ستة أيام: صفحتان، ثم ٣ و٤ و٥ و٧ و١٠ و١٣ و١٦، حتى ٢٠ صفحة، أي جزءٌ كامل كل يوم.',
    source: { text: 'اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه', ref: 'مسلم (٨٠٤)' },
    more: [{ text: 'أحبُّ الأعمال إلى الله أدومها وإن قلّ', ref: 'متفق عليه (البخاري ٦٤٦٤، مسلم ٧٨٣)' }],
    steps: rep([1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [7, 6], [10, 6], [13, 6], [16, 6], [20, 6]),
    unit: 'pages',
    verify: 'quran',
    verifyText: 'يتحقّق تلقائياً من صفحات «مصحفي» اليوم، أو تؤكّد قراءتك بنفسك.',
    grace: 'forgiving',
    stepText: (t) => (t >= 20 ? 'جزءٌ كامل (٢٠ صفحة)' : pagesAr(t)),
    tips: [
      [0, 'صفحة واحدة بتمهّل، واقرأ تفسيرها إن تيسّر.'],
      [24, 'خمس صفحات: اقسمها بين الفجر والمغرب.'],
      [36, 'عشر صفحات: نصف جزء كل يوم.'],
      [54, 'جزءٌ كامل: ختمةٌ كل شهر إن دمت عليه.'],
    ],
    reminders: [{ anchor: 'time', offset: 0, time: '20:30' }],
    remindText: (t) => `وِردك اليوم: ${t >= 20 ? 'جزءٌ كامل' : pagesAr(t)}`,
    next: 'khatma30',
    link: { to: '/quran', label: 'القرآن' },
  },
  {
    id: 'khatma30',
    title: 'ختمةٌ في شهر: جزءٌ كل يوم',
    short: 'ثلاثون جزءاً في ثلاثين يوماً',
    category: 'quran',
    icon: 'khatma',
    level: 3,
    why: 'أوصى النبي ﷺ عبد الله بن عمرو أن يختم القرآن في شهر. بعد أن صار الجزء عادتك، اجعله ختمةً كاملة.',
    source: { text: 'اقرأ القرآن في شهر', ref: 'متفق عليه (البخاري ٥٠٥٤، مسلم ١١٥٩)' },
    steps: rep([20, 30]),
    unit: 'pages',
    verify: 'quran',
    verifyText: 'يتحقّق تلقائياً من صفحات «مصحفي» اليوم، أو تؤكّد قراءتك بنفسك.',
    grace: 'forgiving',
    stepText: () => 'جزءٌ كامل (٢٠ صفحة)',
    tips: [
      [0, 'اجعل للجزء وقتاً ثابتاً لا يزاحمه شيء.'],
      [15, 'نصف الختمة. أحسنت، فاستعن بالله على ما بقي.'],
    ],
    reminders: [{ anchor: 'time', offset: 0, time: '20:30' }],
    remindText: () => 'جزؤك اليوم في ختمة الشهر.',
    link: { to: '/quran', label: 'القرآن' },
  },

  // ── الصيام ───────────────────────────────────────────────────────────────
  {
    id: 'fastMonThu',
    title: 'صيام الاثنين والخميس ثمانية أسابيع',
    short: 'تُعرض الأعمال وأنت صائم',
    category: 'fasting',
    icon: 'fast',
    level: 3,
    lengthLabel: 'ثمانية أسابيع · ١٣ صوماً',
    why: 'يومان تُعرض فيهما الأعمال على الله. ثلاثة أسابيع تصوم فيها الاثنين وحده، ثم خمسة أسابيع تصوم الاثنين والخميس. الأيام الأخرى استراحة لا تُحتسب.',
    source: {
      text: 'تُعرض الأعمال يوم الاثنين والخميس، فأحبّ أن يُعرض عملي وأنا صائم',
      ref: 'الترمذي (٧٤٧)، وصحّحه الألباني',
    },
    steps: rep([1, 13]),
    unit: 'fasts',
    verify: 'fasting',
    verifyText: 'يتحقّق تلقائياً من سجلّ الصيام، أو تسجّل صومك بلمسة.',
    grace: 'forgiving',
    excusable: true,
    dueOn: (wd, step) => (step < 3 ? wd === 1 : wd === 1 || wd === 4),
    stepText: (_t, ctx) => `صيام ${WEEKDAY_NAME[ctx.weekday ?? 1]}`,
    tips: [
      [0, 'الاثنين وحده ثلاثة أسابيع. تسحّر ولو بجرعة ماء، ففي السحور بركة.'],
      [3, 'أُضيف الخميس. نَمْ مبكراً ليلة الصيام.'],
      [8, 'آخر الأسابيع: أكثِر من الدعاء وأنت صائم.'],
    ],
    reminders: [{ anchor: 'time', offset: 0, time: '21:30', eve: true }],
    remindText: (_t, ctx) => `غداً ${WEEKDAY_NAME[ctx.weekday ?? 1]}: صومك في البرنامج. انوِ من الليل وتسحّر.`,
    link: { to: '/module/fasting', label: 'سجلّ الصيام' },
  },

  // ── تزكية النفس ──────────────────────────────────────────────────────────
  {
    id: 'quitHabit',
    title: 'ترك عادة',
    short: 'يومٌ سالم بعد يوم',
    category: 'nafs',
    icon: 'shield',
    level: 2,
    why: 'العادة تُترك كما تُكتسب: يوماً بعد يوم. سمِّ ما تريد تركه، فالاسم يبقى عندك وحدك، وسجّل كل مساء «سلمتُ اليوم». وإن زللتَ فتُب وابدأ من جديد.',
    source: { text: 'كلُّ ابن آدم خطّاء، وخير الخطّائين التوّابون', ref: 'الترمذي (٢٤٩٩)، وحسّنه الألباني' },
    more: [{ text: 'وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا', ref: 'العنكبوت: ٦٩', ayah: true }],
    steps: rep([1, 40]),
    unit: 'check',
    verify: 'check',
    verifyText: 'تسجّل بنفسك كل مساء «سلمتُ اليوم».',
    grace: 'strict',
    stepText: (_t, ctx) => (ctx.name ? `يومٌ بلا ${ctx.name}` : 'يومٌ سالم'),
    tips: [
      [0, 'اعرف مواضع الضعف: الوقت والمكان والرفقة، وابتعد عنها هذه الأيام.'],
      [3, 'إذا هاجتك النفس فتوضّأ وصلِّ ركعتين أو اخرج من المكان.'],
      [7, 'أسبوعٌ سالم. ضع مكان العادة عملاً صالحاً في وقتها نفسه.'],
      [20, 'نصف الطريق. جدّد النية ولا تأمن نفسك.'],
      [30, 'الأيام الأخيرة: احمد الله على العافية واسأله الثبات.'],
    ],
    reminders: [{ anchor: 'time', offset: 0, time: '21:30' }],
    remindText: (_t, ctx) => `كيف كان يومك${ctx.name ? ` مع ترك ${ctx.name}` : ''}؟ سجّل سلامتك.`,
    needsName: true,
    lengthChoices: [21, 40, 66, 90],
  },
];

export const CATEGORIES: { id: ProgramCategory; title: string; subtitle: string }[] = [
  { id: 'prayer', title: 'الصلاة', subtitle: 'الجماعة والوقت والسنن' },
  { id: 'nawafil', title: 'النوافل', subtitle: 'الضحى وقيام الليل' },
  { id: 'quran', title: 'القرآن والذكر', subtitle: 'الوِرد والأذكار والاستغفار' },
  { id: 'fasting', title: 'الصيام', subtitle: 'صيام التطوّع' },
  { id: 'nafs', title: 'تزكية النفس', subtitle: 'ترك ما يُثقلك' },
];

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'بداية', 2: 'متوسط', 3: 'همّة عالية' };

export const templateById = (id: string | undefined): ProgramTemplate | undefined =>
  id ? PROGRAM_TEMPLATES.find((t) => t.id === id) : undefined;

/** The catalogue for a gender (null: everything). */
export const templatesFor = (gender: 'male' | 'female' | null | undefined): ProgramTemplate[] =>
  PROGRAM_TEMPLATES.filter((t) => !t.gender || !gender || t.gender === gender);

/** Asked for after finishing any program: authentic, short. */
export const COMPLETION_DUAS: Source[] = [
  { text: 'رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ', ref: 'البقرة: ١٢٧', ayah: true },
  { text: 'اللهم أعنّي على ذكرك وشكرك وحسن عبادتك', ref: 'أبو داود (١٥٢٢) والنسائي، وصحّحه الألباني' },
  { text: 'يا مقلّب القلوب ثبّت قلبي على دينك', ref: 'الترمذي (٢١٤٠)، وصحّحه الألباني' },
];

/** The rule behind the cap on programs running at once. */
export const STEADY_HADITH: Source = { text: 'أحبُّ الأعمال إلى الله أدومها وإن قلّ', ref: 'متفق عليه (البخاري ٦٤٦٤، مسلم ٧٨٣)' };
