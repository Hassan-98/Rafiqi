/**
 * «صلة الرحم وبرّ الوالدين» — the catalog: relations (ordered by closeness),
 * contact types and their points, and the texts. Every text is Qur'an (with
 * its sura and ayah) or a hadith from the two Sahihs, with its collection.
 * (The ready messages are the user's own words to send, not quoted as hadith.)
 */

export type SilatCategory = 'parents' | 'kin' | 'neighbors' | 'friends';
export const CATEGORIES: SilatCategory[] = ['parents', 'kin', 'neighbors', 'friends'];
export const CATEGORY_SHORT: Record<SilatCategory, string> = {
  parents: 'الوالدان',
  kin: 'الأرحام',
  neighbors: 'الجيران',
  friends: 'الأصدقاء',
};

type Gender = 'male' | 'female' | null | undefined;

export interface Relation {
  id: string;
  label: string;
  /** The label when the USER is a woman (in-laws, teacher, colleague). */
  labelF?: string;
  category: SilatCategory;
  /** Default rhythm in days. */
  everyDays: number;
  /** Hidden from a user of the other gender (friendship across genders). */
  only?: 'male' | 'female';
  /** The person is a woman (pronouns in the copy: «وصلتها»). */
  f?: true;
  /** …a woman when the user is one (her teacher, her colleague). */
  fIfF?: true;
  /**
   * A lumped relation from before the precise ones: never offered again, but
   * people saved with it keep their label and closeness.
   */
  legacy?: true;
  /** The picker's line inside its category (kin: near family, uncles, nephews, cousins, others). */
  row?: number;
}

/** Ordered by closeness: parents (the mother first), children, siblings, grandparents… */
export const RELATIONS: Relation[] = [
  { id: 'mother', label: 'أمي', category: 'parents', everyDays: 2, f: true },
  { id: 'father', label: 'أبي', category: 'parents', everyDays: 2 },
  { id: 'motherInLaw', label: 'أم زوجتي', labelF: 'أم زوجي', category: 'parents', everyDays: 7, f: true },
  { id: 'fatherInLaw', label: 'أبو زوجتي', labelF: 'أبو زوجي', category: 'parents', everyDays: 7 },
  { id: 'son', label: 'ابني', category: 'kin', everyDays: 3 },
  { id: 'daughter', label: 'ابنتي', category: 'kin', everyDays: 3, f: true },
  { id: 'brother', label: 'أخي', category: 'kin', everyDays: 7 },
  { id: 'sister', label: 'أختي', category: 'kin', everyDays: 7, f: true },
  { id: 'grandfather', label: 'جدّي', category: 'kin', everyDays: 7 },
  { id: 'grandmother', label: 'جدّتي', category: 'kin', everyDays: 7, f: true },
  { id: 'grandson', label: 'حفيدي', category: 'kin', everyDays: 14 },
  { id: 'granddaughter', label: 'حفيدتي', category: 'kin', everyDays: 14, f: true },
  { id: 'uncleP', label: 'عمّي', category: 'kin', everyDays: 30, row: 1 },
  { id: 'auntP', label: 'عمّتي', category: 'kin', everyDays: 30, f: true, row: 1 },
  { id: 'uncleM', label: 'خالي', category: 'kin', everyDays: 30, row: 1 },
  { id: 'auntM', label: 'خالتي', category: 'kin', everyDays: 30, f: true, row: 1 },
  { id: 'brotherSon', label: 'ابن أخي', category: 'kin', everyDays: 30, row: 2 },
  { id: 'brotherDaughter', label: 'ابنة أخي', category: 'kin', everyDays: 30, f: true, row: 2 },
  { id: 'sisterSon', label: 'ابن أختي', category: 'kin', everyDays: 30, row: 2 },
  { id: 'sisterDaughter', label: 'ابنة أختي', category: 'kin', everyDays: 30, f: true, row: 2 },
  { id: 'nephew', label: 'ابن أخي أو أختي', category: 'kin', everyDays: 30, legacy: true, row: 2 },
  { id: 'niece', label: 'ابنة أخي أو أختي', category: 'kin', everyDays: 30, f: true, legacy: true, row: 2 },
  { id: 'cousinAmm', label: 'ابن عمّي', category: 'kin', everyDays: 30, row: 3 },
  { id: 'cousinAmmF', label: 'ابنة عمّي', category: 'kin', everyDays: 30, f: true, row: 3 },
  { id: 'cousinAmma', label: 'ابن عمّتي', category: 'kin', everyDays: 30, row: 3 },
  { id: 'cousinAmmaF', label: 'ابنة عمّتي', category: 'kin', everyDays: 30, f: true, row: 3 },
  { id: 'cousinKhal', label: 'ابن خالي', category: 'kin', everyDays: 30, row: 3 },
  { id: 'cousinKhalF', label: 'ابنة خالي', category: 'kin', everyDays: 30, f: true, row: 3 },
  { id: 'cousinKhala', label: 'ابن خالتي', category: 'kin', everyDays: 30, row: 3 },
  { id: 'cousinKhalaF', label: 'ابنة خالتي', category: 'kin', everyDays: 30, f: true, row: 3 },
  { id: 'cousin', label: 'ابن عمّي أو خالي', category: 'kin', everyDays: 30, legacy: true, row: 3 },
  { id: 'cousinF', label: 'ابنة عمّي أو خالي', category: 'kin', everyDays: 30, f: true, legacy: true, row: 3 },
  { id: 'milkMother', label: 'أمي من الرضاعة', category: 'kin', everyDays: 14, f: true, row: 4 },
  { id: 'milkBrother', label: 'أخي من الرضاعة', category: 'kin', everyDays: 30, row: 4 },
  { id: 'milkSister', label: 'أختي من الرضاعة', category: 'kin', everyDays: 30, f: true, row: 4 },
  { id: 'kinOther', label: 'قريب', category: 'kin', everyDays: 30, row: 4 },
  { id: 'neighbor', label: 'جاري', category: 'neighbors', everyDays: 14 },
  { id: 'neighborF', label: 'جارتي', category: 'neighbors', everyDays: 14, f: true },
  { id: 'brotherInAllah', label: 'أخي في الله', category: 'friends', everyDays: 14, only: 'male' },
  { id: 'sisterInAllah', label: 'أختي في الله', category: 'friends', everyDays: 14, only: 'female', f: true },
  { id: 'friend', label: 'صديقي', category: 'friends', everyDays: 14, only: 'male' },
  { id: 'friendF', label: 'صديقتي', category: 'friends', everyDays: 14, only: 'female', f: true },
  { id: 'teacher', label: 'شيخي أو معلّمي', labelF: 'شيختي أو معلّمتي', category: 'friends', everyDays: 30, fIfF: true },
  { id: 'colleague', label: 'زميلي', labelF: 'زميلتي', category: 'friends', everyDays: 30, fIfF: true },
];

const REL_BY_ID = new Map(RELATIONS.map((r, i) => [r.id, { ...r, rank: i }]));
export const relationOf = (id: string) => REL_BY_ID.get(id);
/** Closeness rank (0 = mother); unknown relations last. */
export const closenessOf = (id: string): number => REL_BY_ID.get(id)?.rank ?? RELATIONS.length;
export const categoryOfRelation = (id: string): SilatCategory => REL_BY_ID.get(id)?.category ?? 'kin';

/** A woman: by relation, or a teacher/colleague of a woman user. */
export function isFemaleRelation(id: string, gender: Gender): boolean {
  const r = REL_BY_ID.get(id);
  return !!r && (!!r.f || (gender === 'female' && !!r.fIfF));
}

/** Fill «{ه}» with the person's pronoun: «زرت{ه}» → «زرته» / «زرتها» (`dual` → «زرتهما»). */
export const withPronoun = (t: string, female: boolean, dual = false): string => t.split('{ه}').join(dual ? 'هما' : female ? 'ها' : 'ه');

export function relationLabel(id: string, gender: Gender): string {
  const r = REL_BY_ID.get(id);
  if (!r) return 'قريب';
  return gender === 'female' && r.labelF ? r.labelF : r.label;
}

/**
 * The relations a user picks from (a man doesn't befriend women here, nor a
 * woman men). Legacy ones only when `current` is one (editing such a person).
 */
export function relationsFor(gender: Gender, current?: string): Relation[] {
  return RELATIONS.filter((r) => (!r.only || !gender || r.only === gender) && (!r.legacy || r.id === current));
}

// ── rhythm ───────────────────────────────────────────────────────────────────

export const RHYTHMS: { days: number; label: string }[] = [
  { days: 1, label: 'يومياً' },
  { days: 2, label: 'كل يومين' },
  { days: 3, label: 'كل ٣ أيام' },
  { days: 7, label: 'أسبوعياً' },
  { days: 14, label: 'كل أسبوعين' },
  { days: 30, label: 'شهرياً' },
];

/** «متى وصلته آخر مرة؟» — asked once when adding (silatModel.baselineFor). */
export const SINCE_CHOICES: { id: 'soon' | 'month' | 'long'; label: string }[] = [
  { id: 'soon', label: 'قريباً (هذا الأسبوع)' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'long', label: 'منذ زمن' },
];

// ── contact types ────────────────────────────────────────────────────────────

/**
 * Ids are persisted in every logged entry (and synced): never rename or remove
 * one. The first eight are the originals; their points never change.
 */
export type ContactType =
  | 'visit' | 'help' | 'gift' | 'call' | 'message' | 'dua' | 'sadaqah' | 'wudd'
  | 'video' | 'voice' | 'iyada' | 'invite' | 'outing' | 'food' | 'money' | 'congrats' | 'condole' | 'islah'
  | 'grave' | 'debt' | 'hajj' | 'gathering';

export interface ContactDef {
  /** The generic label (lists, «الترتيب»): a pronoun in it is the masculine «ه». */
  label: string;
  /** …for a woman, where the label has a pronoun (typeLabel). */
  labelF?: string;
  /** Past tense for the toast, «{ه}» = the pronoun (withPronoun). */
  done: string;
  /** Points on «الترتيب», by effort. */
  points: number;
}

export const CONTACT: Record<ContactType, ContactDef> = {
  visit: { label: 'زيارة', done: 'زرت{ه}', points: 8 },
  help: { label: 'قضاء حاجة', done: 'قضيت ل{ه} حاجة', points: 6 },
  gift: { label: 'هدية', done: 'أهديت{ه}', points: 5 },
  call: { label: 'اتصال', done: 'اتصلت ب{ه}', points: 4 },
  message: { label: 'رسالة', done: 'راسلت{ه}', points: 2 },
  dua: { label: 'دعاء بظهر الغيب', done: 'دعوت ل{ه}', points: 1 },
  sadaqah: { label: 'صدقة عنه', labelF: 'صدقة عنها', done: 'تصدّقت عن{ه}', points: 5 },
  wudd: { label: 'صلة أهل ودّه', labelF: 'صلة أهل ودّها', done: 'وصلت أهل ودّ{ه}', points: 6 },
  video: { label: 'مكالمة فيديو', done: 'كلّمت{ه} بالفيديو', points: 5 },
  voice: { label: 'رسالة صوتية', done: 'أرسلت ل{ه} رسالة صوتية', points: 3 },
  iyada: { label: 'عيادة مريض', done: 'عدت{ه} في مرض{ه}', points: 10 },
  invite: { label: 'دعوة إلى طعام', done: 'دعوت{ه} إلى طعامك', points: 8 },
  outing: { label: 'نزهة أو وقت معه', labelF: 'نزهة أو وقت معها', done: 'قضيت مع{ه} وقتاً طيباً', points: 7 },
  food: { label: 'طبق من طعامك', done: 'أهديت{ه} من طعامك', points: 4 },
  money: { label: 'عون بمال أو قرض', done: 'أعنت{ه} بمال', points: 7 },
  congrats: { label: 'تهنئة', done: 'هنّأت{ه}', points: 3 },
  condole: { label: 'تعزية ومواساة', done: 'عزّيت{ه} وواسيت{ه}', points: 6 },
  islah: { label: 'إصلاح ذات البين', done: 'أصلحت بين{ه} وبين من خاصم{ه}', points: 10 },
  grave: { label: 'زيارة قبره', labelF: 'زيارة قبرها', done: 'زرت قبر{ه} ودعوت ل{ه}', points: 5 },
  debt: { label: 'قضاء دَينه أو وصيته', labelF: 'قضاء دَينها أو وصيتها', done: 'وفّيت عن{ه} ديناً أو وصية', points: 8 },
  hajj: { label: 'حجّ أو عمرة عنه', labelF: 'حجّ أو عمرة عنها', done: 'حججت أو اعتمرت عن{ه}', points: 10 },
  /** One entry per person met; `points` is the base — the real share is gatheringPoints. */
  gathering: { label: 'اجتماع عائلي', done: 'لقيت{ه} في اجتماع العائلة', points: 1 },
};

/**
 * «اجتماع عائلي»: many met at once, so not a visit (8) each — the parents
 * (the «الوالدان» circle) 5, the uncles and aunts (both sides) 4, a brother or
 * sister 3, everyone else 1 (owner 2026-11-27).
 */
const UNCLES = new Set(['uncleP', 'auntP', 'uncleM', 'auntM']);
export const gatheringPoints = (relation: string): number =>
  categoryOfRelation(relation) === 'parents'
    ? 5
    : UNCLES.has(relation)
      ? 4
      : relation === 'brother' || relation === 'sister'
        ? 3
        : 1;

/** A contact's points for this person (only «اجتماع عائلي» depends on who). */
export const pointsFor = (t: ContactType, relation: string): number => (t === 'gathering' ? gatheringPoints(relation) : CONTACT[t].points);

/** The label for this person: «صدقة عنها» for a woman. */
export const typeLabel = (t: ContactType, female = false): string => (female && CONTACT[t].labelF) || CONTACT[t].label;

export type ContactGroupId = 'reach' | 'meet' | 'give' | 'occasion' | 'ghayb' | 'after';

/** Every type in exactly one group, the everyday ones first (the log sheet's order). */
export const CONTACT_GROUPS: { id: ContactGroupId; label: string; types: ContactType[] }[] = [
  { id: 'reach', label: 'تواصل', types: ['call', 'message', 'voice', 'video'] },
  { id: 'meet', label: 'زيارة ولقاء', types: ['visit', 'gathering', 'iyada', 'invite', 'outing'] },
  { id: 'give', label: 'عطاء وعون', types: ['gift', 'food', 'help', 'money'] },
  { id: 'occasion', label: 'مناسبات وإصلاح', types: ['congrats', 'condole', 'islah'] },
  { id: 'ghayb', label: 'بظهر الغيب', types: ['dua'] },
  { id: 'after', label: 'برٌّ بعد الموت', types: ['sadaqah', 'wudd', 'grave', 'debt', 'hajj'] },
];
/** The groups a living person's log sheet shows. */
export const LIVING_GROUPS = CONTACT_GROUPS.filter((g) => g.id !== 'after');
export const groupOf = (t: ContactType): ContactGroupId => CONTACT_GROUPS.find((g) => g.types.includes(t))?.id ?? 'reach';

/** What can be logged for a living person. */
export const LIVING_TYPES: ContactType[] = LIVING_GROUPS.flatMap((g) => g.types);
/** Deeds that still reach a parent or relative who has died. */
export const DECEASED_TYPES: ContactType[] = ['dua', 'sadaqah', 'wudd', 'grave', 'debt', 'hajj'];
/** «بظهر الغيب»: deeds for a living person that are not contact with them. */
export const GHAYB_TYPES: ContactType[] = ['dua'];
/** Contact with a living person: it keeps their rhythm (silatModel.countsFor). */
export const isContact = (t: ContactType): boolean => LIVING_TYPES.includes(t) && !GHAYB_TYPES.includes(t);
/** Preferred channels a person can be given. */
export const CHANNELS: ContactType[] = ['call', 'message', 'video', 'visit', 'gift'];

/** The first contact after a broken tie (إصلاح قطيعة). */
export const RECONCILE_POINTS = 15;
/** One day's ceiling for this section on «الترتيب» (the server keeps 600 for everything). */
export const SILAT_DAY_MAX = 60;

// ── texts ────────────────────────────────────────────────────────────────────

export interface SilatText {
  text: string;
  source: string;
  quran?: boolean;
}

export const T = {
  rizq: { text: '«مَن سَرَّه أن يُبسَطَ له في رزقه، أو يُنسَأَ له في أثره، فليَصِلْ رحمَه»', source: 'متفق عليه' },
  arsh: { text: '«الرَّحِمُ معلَّقةٌ بالعرش تقول: مَن وصلني وصله الله، ومَن قطعني قطعه الله»', source: 'رواه مسلم' },
  nisa1: { text: 'وَاتَّقُوا اللَّهَ الَّذِي تَسَاءَلُونَ بِهِ وَالْأَرْحَامَ ۚ إِنَّ اللَّهَ كَانَ عَلَيْكُمْ رَقِيبًا', source: 'النساء ١', quran: true },
  ihsan: { text: 'وَقَضَىٰ رَبُّكَ أَلَّا تَعْبُدُوا إِلَّا إِيَّاهُ وَبِالْوَالِدَيْنِ إِحْسَانًا', source: 'الإسراء ٢٣', quran: true },
  uff: { text: 'فَلَا تَقُل لَّهُمَا أُفٍّ وَلَا تَنْهَرْهُمَا وَقُل لَّهُمَا قَوْلًا كَرِيمًا', source: 'الإسراء ٢٣', quran: true },
  irhamhuma: { text: 'رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', source: 'الإسراء ٢٤', quran: true },
  ibrahim41: { text: 'رَبَّنَا اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ', source: 'إبراهيم ٤١', quran: true },
  nuh28: { text: 'رَّبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَلِمَن دَخَلَ بَيْتِيَ مُؤْمِنًا وَلِلْمُؤْمِنِينَ وَالْمُؤْمِنَاتِ', source: 'نوح ٢٨', quran: true },
  raghima: {
    text: '«رَغِمَ أنفُ، ثم رَغِمَ أنفُ، ثم رَغِمَ أنفُ» قيل: مَن يا رسول الله؟ قال: «مَن أدرك أبويه عند الكِبَر، أحدَهما أو كليهما، فلم يدخل الجنة»',
    source: 'رواه مسلم',
  },
  ummuk: {
    text: 'قال رجل: يا رسول الله، مَن أحقُّ الناس بحُسن صحابتي؟ قال: «أمُّك» قال: ثم مَن؟ قال: «ثم أمُّك» قال: ثم مَن؟ قال: «ثم أمُّك» قال: ثم مَن؟ قال: «ثم أبوك»',
    source: 'متفق عليه',
  },
  ahabb: {
    text: 'سُئل ﷺ: أيُّ العمل أحبُّ إلى الله؟ قال: «الصلاة على وقتها» قيل: ثم أيّ؟ قال: «ثم برُّ الوالدين»',
    source: 'متفق عليه',
  },
  inqata: {
    text: '«إذا مات الإنسان انقطع عنه عملُه إلا من ثلاثة: إلا من صدقةٍ جارية، أو علمٍ يُنتفَع به، أو ولدٍ صالحٍ يدعو له»',
    source: 'رواه مسلم',
  },
  wudd: { text: '«إنّ أبرَّ البرِّ صِلةُ الولدِ أهلَ وُدِّ أبيه»', source: 'رواه مسلم' },
  hajjAnha: { text: 'قالت امرأة: إنّ أمي نذرت أن تحجّ فلم تحجّ حتى ماتت، أفأحجّ عنها؟ قال: «نعم، حُجّي عنها»', source: 'رواه البخاري' },
  jar: { text: '«ما زال جبريلُ يوصيني بالجار حتى ظننتُ أنه سيُورِّثه»', source: 'متفق عليه' },
  maraqa: { text: '«يا أبا ذرّ، إذا طبختَ مَرَقةً فأكثِرْ ماءها، وتعاهَدْ جيرانَك»', source: 'رواه مسلم' },
  firsin: { text: '«يا نساءَ المسلمات، لا تحقِرَنّ جارةٌ لجارتها ولو فِرْسِنَ شاة»', source: 'متفق عليه' },
  ghayb: {
    text: '«دعوةُ المرءِ المسلمِ لأخيه بظهر الغيب مستجابة، عند رأسه مَلَكٌ موكَّل، كلما دعا لأخيه بخيرٍ قال الملَك الموكَّل به: آمين، ولك بمِثل»',
    source: 'رواه مسلم',
  },
  zara: {
    text: 'زار رجلٌ أخاً له في قرية أخرى، فأرصد الله له على مَدرَجته مَلَكاً… قال: «فإني رسولُ الله إليك بأنّ الله قد أحبّك كما أحببتَه فيه»',
    source: 'رواه مسلم',
  },
  wasil: { text: '«ليس الواصلُ بالمكافئ، ولكنِ الواصلُ الذي إذا قُطِعت رحمُه وصلها»', source: 'رواه البخاري' },
  hajr: {
    text: '«لا يحلّ لمسلمٍ أن يهجر أخاه فوق ثلاث ليال، يلتقيان فيُعرض هذا ويُعرض هذا، وخيرُهما الذي يبدأ بالسلام»',
    source: 'متفق عليه',
  },
  mall: {
    text: 'قال رجل: يا رسول الله، إنّ لي قرابةً أصلُهم ويقطعونني، وأُحسن إليهم ويُسيئون إليّ، وأحلُم عنهم ويجهلون عليّ. فقال: «لئن كنتَ كما قلتَ فكأنما تُسِفُّهم المَلّ، ولا يزال معك من الله ظهيرٌ عليهم ما دمتَ على ذلك»',
    source: 'رواه مسلم',
  },
  iyada: { text: '«إنّ المسلمَ إذا عاد أخاه المسلمَ لم يزل في خُرْفةِ الجنة حتى يرجع»', source: 'رواه مسلم' },
  hajah: { text: '«ومَن كان في حاجة أخيه كان اللهُ في حاجته»', source: 'متفق عليه' },
  salam: { text: '«أوَلا أدلُّكم على شيءٍ إذا فعلتموه تحاببتم؟ أفشُوا السلامَ بينكم»', source: 'رواه مسلم' },
  falyasil: { text: '«مَن كان يؤمن بالله واليوم الآخر فليَصِلْ رحمَه»', source: 'رواه البخاري' },
  kalima: { text: '«والكلمةُ الطيّبةُ صدقة»', source: 'متفق عليه' },
  dayf: { text: '«مَن كان يؤمن بالله واليوم الآخر فليُكرِمْ ضيفَه»', source: 'متفق عليه' },
  hadiyya: { text: 'كان رسولُ الله ﷺ يقبلُ الهديّةَ ويُثيبُ عليها', source: 'رواه البخاري' },
  haqq: {
    text: 'قال سلمانُ لأبي الدرداء: «إنّ لربّك عليك حقّاً، ولنفسك عليك حقّاً، ولأهلك عليك حقّاً، فأعطِ كلَّ ذي حقٍّ حقَّه»، فقال النبي ﷺ: «صدق سلمان»',
    source: 'رواه البخاري',
  },
  ajran: { text: 'في صدقة المرأة على زوجها وأيتامٍ في حِجرها: «لهما أجران: أجرُ القرابة، وأجرُ الصدقة»', source: 'متفق عليه، واللفظ لمسلم' },
  hannaani: {
    text: 'قال كعبُ بن مالك يوم تاب الله عليه: «فقام إليّ طلحةُ بن عبيد الله يُهرول حتى صافحني وهنّأني… ولا أنساها لطلحة»',
    source: 'متفق عليه',
  },
  jasad: {
    text: '«مَثَلُ المؤمنين في توادِّهم وتراحمهم وتعاطفهم مَثَلُ الجسد، إذا اشتكى منه عضوٌ تداعى له سائرُ الجسد بالسهر والحُمّى»',
    source: 'متفق عليه، واللفظ لمسلم',
  },
  najwa: { text: 'لَّا خَيْرَ فِي كَثِيرٍ مِّن نَّجْوَاهُمْ إِلَّا مَنْ أَمَرَ بِصَدَقَةٍ أَوْ مَعْرُوفٍ أَوْ إِصْلَاحٍ بَيْنَ النَّاسِ', source: 'النساء ١١٤', quran: true },
  qubur: {
    text: 'كان ﷺ يعلّمهم إذا خرجوا إلى المقابر أن يقولوا: «السلامُ عليكم أهلَ الديار من المؤمنين والمسلمين، وإنّا إن شاء الله للاحقون، أسأل الله لنا ولكم العافية»',
    source: 'رواه مسلم',
  },
  dayn: { text: '«أرأيتِ لو كان على أمّكِ دَينٌ أكنتِ قاضيتَه؟ اقضوا اللهَ، فاللهُ أحقُّ بالوفاء»', source: 'رواه البخاري' },
} satisfies Record<string, SilatText>;

/** The rotating line on the main screen (one a day). */
export const DAILY_TEXTS: SilatText[] = [T.rizq, T.arsh, T.nisa1, T.wasil, T.jar, T.ghayb, T.hajah, T.salam, T.ahabb];

/** The «دعاء للوالدين» card: Qur'anic du'as for the parents, الإسراء ٢٤ first. */
export const PARENT_DUAS: SilatText[] = [T.irhamhuma, T.ibrahim41, T.nuh28];

/** One text per category, for its section header. */
export const CATEGORY_TEXT: Record<SilatCategory, SilatText> = {
  parents: T.ihsan,
  kin: T.arsh,
  neighbors: T.jar,
  friends: T.zara,
};

/** The fadl of each kind: under the suggested type in the log sheet, and in the toast of the day's first one. */
export const TYPE_TEXT: Record<ContactType, SilatText> = {
  call: T.falyasil,
  message: T.salam,
  voice: T.kalima,
  video: T.rizq,
  visit: T.zara,
  iyada: T.iyada,
  invite: T.dayf,
  outing: T.haqq,
  gift: T.hadiyya,
  food: T.maraqa,
  help: T.hajah,
  money: T.ajran,
  congrats: T.hannaani,
  condole: T.jasad,
  islah: T.najwa,
  dua: T.ghayb,
  sadaqah: T.inqata,
  wudd: T.wudd,
  grave: T.qubur,
  debt: T.dayn,
  hajj: T.hajjAnha,
  gathering: T.arsh,
};

// ── ideas ────────────────────────────────────────────────────────────────────

export interface Idea {
  text: string;
  /** Logging it records this contact type. */
  type?: ContactType;
}

/** Gentle «بِرّ» ideas for a living parent (no pronouns: they fit one parent or both); three a day, rotating. */
export const BIRR_IDEAS: Idea[] = [
  { text: 'بادِر بالاتصال قبل أن يُنتظَر، واستمع أكثر مما تتكلم', type: 'call' },
  { text: 'قبّل اليد والرأس، وقل كلمة حبٍّ صريحة', type: 'visit' },
  { text: 'اسأل عن حاجةٍ واقضها قبل أن تُطلب منك', type: 'help' },
  { text: 'رافِق إلى الطبيب أو المشوار الذي يثقل', type: 'help' },
  { text: 'شارِك الطعام بلا هاتف ولا عجلة', type: 'visit' },
  { text: 'أهدِ شيئاً محبوباً، ولو كان يسيراً', type: 'gift' },
  { text: 'خُصّ والديك بدعوةٍ في سجودك', type: 'dua' },
  { text: 'أرسل رسالة صباحية دافئة', type: 'message' },
  { text: 'اصحب أولادك في الزيارة؛ فالأحفاد قرّة عين', type: 'visit' },
  { text: 'شارِك خبراً يُفرح، واستشِر في أمرك', type: 'call' },
  { text: 'اخفض صوتك، ولا تقل «أفّ» ولو في نفسك' },
  { text: 'أعِن في شأن البيت أو الأوراق والمعاملات', type: 'help' },
  { text: 'اخرج في نزهة قصيرة إلى مكانٍ يُحَبّ، على مهل', type: 'outing' },
  { text: 'ادعُ إلى طعامٍ في بيتك، وقدّم أطيب ما عندك', type: 'invite' },
  { text: 'مكالمة فيديو تجمع الأحفاد بجدّهم وجدّتهم', type: 'video' },
];

/** Deeds that continue after a parent dies — «{ه}» = the pronoun (withPronoun, or «هما» for both). */
export const CONTINUING_DEEDS: { type: ContactType; title: string; body: string }[] = [
  { type: 'dua', title: 'الدعاء والاستغفار ل{ه}', body: 'في سجودك، وبين الأذان والإقامة، وفي آخر الليل' },
  { type: 'sadaqah', title: 'صدقة جارية عن{ه}', body: 'ماء، أو مصحف، أو سهم في مسجد، أو كفالة' },
  { type: 'wudd', title: 'صلة أهل ودّ{ه}', body: 'أصدقاؤ{ه} وأرحام{ه} ومن كان بينكم ودّ' },
  { type: 'grave', title: 'زيارة قبر{ه}', body: 'تسلّم وتدعو، وتتذكّر الآخرة' },
  { type: 'debt', title: 'قضاء دَين{ه} وإنفاذ وصيت{ه}', body: 'ما بقي علي{ه} من دَينٍ أو نذرٍ أو وصية' },
];

/** «إصلاح قطيعة»: a gentle plan — du'a, a greeting, a call, then a visit. */
export const REPAIR_STEPS: { type: ContactType; title: string; body: string }[] = [
  { type: 'dua', title: 'ادعُ له بظهر الغيب', body: 'سَل الله أن يُصلح ما بينكما ويؤلّف بين قلبيكما؛ فالدعاء يُليّن القلب قبل اللقاء.' },
  { type: 'message', title: 'أرسل سلاماً', body: 'رسالة قصيرة دافئة، بلا عتابٍ ولا تذكيرٍ بما مضى.' },
  { type: 'call', title: 'اتصل به', body: '«وخيرُهما الذي يبدأ بالسلام» — بادِر أنت، ولو كان الخطأ منه.' },
  { type: 'visit', title: 'زُره', body: 'زيارة قصيرة، ولو بهدية يسيرة تفتح القلب.' },
];

/** The greeting the repair plan (and «أرسل سلاماً») offers to send. */
export const GREETING = 'السلام عليكم ورحمة الله وبركاته، اشتقت إليك، وأسأل الله أن يحفظك ويبارك فيك.';

// ── ready messages ───────────────────────────────────────────────────────────

export interface MessageTemplate {
  id: string;
  label: string;
  /** Written to read right to a man or a woman (no gendered verb endings). */
  text: string;
  /** What sending it logs. */
  type: ContactType;
}

/** «رسالة جاهزة»: opened in WhatsApp (or the share sheet) with the text, then logged. Order: silatModel.templatesFor. */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 'hal', label: 'سلام وسؤال عن الحال', type: 'message', text: 'السلام عليكم ورحمة الله وبركاته، كيف حالك وحال أهلك؟ اشتقت إليك، أسأل الله أن يحفظك ويسعدك.' },
  { id: 'dua', label: 'دعاء', type: 'message', text: 'أسأل الله أن يبارك لك في عمرك وأهلك ورزقك، وأن يحفظك من كل سوء، وأن يجمعنا في جنته.' },
  { id: 'jumuah', label: 'تذكير يوم الجمعة', type: 'message', text: 'أذكّرك ونفسي في هذا اليوم المبارك بسورة الكهف والإكثار من الصلاة على النبي ﷺ، تقبّل الله منا ومنك.' },
  { id: 'sick', label: 'دعاء لمريض', type: 'message', text: 'لا بأس، طهورٌ إن شاء الله. أسأل الله العظيم ربّ العرش العظيم أن يشفيك ويعافيك.' },
  { id: 'eid', label: 'تهنئة بالعيد', type: 'congrats', text: 'تقبّل الله منا ومنكم، وكل عام وأنتم بخير، أعاده الله علينا وعليكم بالخير والبركة.' },
  { id: 'baby', label: 'تهنئة بمولود', type: 'congrats', text: 'بارك الله لك في الموهوب لك، وشكرت الواهب، وبلغ أشدّه، ورُزقت برّه.' },
  { id: 'wedding', label: 'تهنئة بزواج', type: 'congrats', text: 'بارك الله لكما، وبارك عليكما، وجمع بينكما في خير.' },
  { id: 'success', label: 'تهنئة بنجاح', type: 'congrats', text: 'مبارك ما وفّقك الله إليه، أسأل الله أن يجعله فاتحة خير، وأن ينفع بك ويزيدك من فضله.' },
  { id: 'condole', label: 'تعزية', type: 'condole', text: 'إنّ لله ما أخذ، وله ما أعطى، وكلٌّ عنده بأجلٍ مسمّى. أحسن الله عزاءكم، وغفر لميتكم، وربط على قلوبكم.' },
];
