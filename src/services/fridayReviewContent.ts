/**
 * «محاسبة الجمعة» — the fixed Arabic content: the muhasaba questions, the
 * Friday sunan and the focus suggestions. Every quoted text carries its source
 * (Qur'an by surah:ayah, hadith by its collectors; no AI-written content).
 */
import type { DomainId } from '@/services/fridayReview';

export const MUHASABA_VERSE = {
  text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ وَلْتَنظُرْ نَفْسٌ مَّا قَدَّمَتْ لِغَدٍ',
  source: 'الحشر: ١٨',
};

export interface MuhasabaQuestion {
  id: string;
  text: string;
  /** scale = 1–5 (5 = best); yesno = 1 / 0. */
  kind: 'scale' | 'yesno';
  source?: string;
}

/** Asked every week unless the user picks their own set. */
export const CORE_QUESTIONS = ['tongue', 'gaze', 'birr', 'khushu', 'time'];

export const QUESTION_BANK: MuhasabaQuestion[] = [
  {
    id: 'tongue',
    text: 'هل حفظت لسانك من الغيبة والنميمة والكذب؟',
    kind: 'scale',
    source: '«من كان يؤمن بالله واليوم الآخر فليقل خيراً أو ليصمت» — متفق عليه',
  },
  {
    id: 'gaze',
    text: 'هل غضضت بصرك عمّا حرّم الله؟',
    kind: 'scale',
    source: '﴿قُل لِّلْمُؤْمِنِينَ يَغُضُّوا مِنْ أَبْصَارِهِمْ﴾ — النور: ٣٠',
  },
  {
    id: 'birr',
    text: 'هل بررت والديك بكلمة أو زيارة أو اتصال؟',
    kind: 'yesno',
    source: '﴿وَبِالْوَالِدَيْنِ إِحْسَانًا﴾ — الإسراء: ٢٣',
  },
  {
    id: 'khushu',
    text: 'كيف كان خشوعك وحضور قلبك في الصلاة؟',
    kind: 'scale',
    source: '﴿قَدْ أَفْلَحَ الْمُؤْمِنُونَ ۝ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ﴾ — المؤمنون: ١–٢',
  },
  {
    id: 'time',
    text: 'هل حفظت وقتك من اللهو وما لا ينفع؟',
    kind: 'scale',
    source: '«نعمتان مغبون فيهما كثير من الناس: الصحة والفراغ» — رواه البخاري',
  },
  {
    id: 'heart',
    text: 'هل سلم قلبك من الحسد والبغضاء؟',
    kind: 'scale',
    source: '«لا تباغضوا، ولا تحاسدوا، ولا تدابروا، وكونوا عباد الله إخواناً» — متفق عليه',
  },
  {
    id: 'rahim',
    text: 'هل وصلت رحمك هذا الأسبوع؟',
    kind: 'yesno',
    source: '«من أحبّ أن يُبسط له في رزقه، ويُنسأ له في أثره، فليصل رحمه» — متفق عليه',
  },
  {
    id: 'family',
    text: 'هل أحسنت إلى أهلك ومن في بيتك؟',
    kind: 'scale',
    source: '«خيركم خيركم لأهله، وأنا خيركم لأهلي» — رواه الترمذي وصححه الألباني',
  },
  {
    id: 'amanah',
    text: 'هل أدّيت الأمانات وحقوق الناس؟',
    kind: 'scale',
    source: '﴿إِنَّ اللَّهَ يَأْمُرُكُمْ أَن تُؤَدُّوا الْأَمَانَاتِ إِلَىٰ أَهْلِهَا﴾ — النساء: ٥٨',
  },
  {
    id: 'niyyah',
    text: 'هل استحضرت النية لله في أعمالك؟',
    kind: 'scale',
    source: '«إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى» — متفق عليه',
  },
  {
    id: 'tawbah',
    text: 'هل بادرت بالتوبة والاستغفار كلما زللت؟',
    kind: 'yesno',
    source: '«والله إني لأستغفر الله وأتوب إليه في اليوم أكثر من سبعين مرة» — رواه البخاري',
  },
  {
    id: 'tadabbur',
    text: 'هل تدبّرت شيئاً مما قرأت أو سمعت من القرآن؟',
    kind: 'yesno',
    source: '﴿أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ﴾ — النساء: ٨٢',
  },
  {
    id: 'halal',
    text: 'هل تحرّيت الحلال في كسبك ومطعمك؟',
    kind: 'yesno',
    source: '«إن الله طيب لا يقبل إلا طيباً» — رواه مسلم',
  },
];

export interface FridaySunnah {
  id: string;
  title: string;
  text: string;
  source: string;
  /** Tied to attending الجمعة — shown to men only. */
  menOnly?: boolean;
  to?: string;
}

export const FRIDAY_SUNAN: FridaySunnah[] = [
  {
    id: 'kahf',
    title: 'سورة الكهف',
    text: '«من قرأ سورة الكهف في يوم الجمعة أضاء له من النور ما بين الجمعتين»',
    source: 'رواه الحاكم والبيهقي، وصححه الألباني في صحيح الجامع (٦٤٧٠)',
    to: '/quran/read/18',
  },
  {
    id: 'salawat',
    title: 'الإكثار من الصلاة على النبي ﷺ',
    text: '«إن من أفضل أيامكم يوم الجمعة… فأكثروا عليّ من الصلاة فيه، فإن صلاتكم معروضة عليّ»',
    source: 'رواه أبو داود (١٠٤٧) والنسائي وابن ماجه، وصححه الألباني',
    to: '/tasbih',
  },
  {
    id: 'ghusl',
    title: 'الغسل والطيب',
    text: '«الغسل يوم الجمعة واجب على كل محتلم، وأن يستنّ، وأن يمسّ طيباً إن وجد»',
    source: 'متفق عليه',
    menOnly: true,
  },
  {
    id: 'early',
    title: 'التبكير إلى الجمعة',
    text: '«من اغتسل يوم الجمعة غسل الجنابة ثم راح فكأنما قرّب بدنة…»',
    source: 'متفق عليه',
    menOnly: true,
  },
  {
    id: 'hour',
    title: 'ساعة الإجابة',
    text: '«فيه ساعة لا يوافقها عبد مسلم وهو قائم يصلي يسأل الله شيئاً إلا أعطاه إياه» — «فالتمسوها آخر ساعة بعد العصر»',
    source: 'الأول متفق عليه، والثاني رواه أبو داود (١٠٤٨) والنسائي وصححه الألباني',
    to: '/duaa-library',
  },
];

/** One focus goal for next week, by the week's weakest door. */
export function focusSuggestions(weak: DomainId | null, male: boolean): string[] {
  const by: Record<DomainId, string[]> = {
    fard: ['أصلّي كل فريضة في أول وقتها', 'لا تفوتني صلاة الفجر في وقتها'],
    jamaah: male
      ? ['أصلّي الفجر والعشاء في المسجد', 'أدرك تكبيرة الإحرام مع الإمام']
      : ['أصلّي الفجر على وقتها', 'أبادر بالصلاة أول وقتها'],
    rawatib: ['أحافظ على ركعتي الفجر كل يوم', 'أصلّي الرواتب الثنتي عشرة كل يوم'],
    duha: ['ركعتا الضحى كل يوم', 'أصلّي الضحى بعد أذكار الصباح'],
    adhkar: ['أذكار الصباح والمساء كل يوم', 'أذكار المساء قبل المغرب'],
    quran: ['صفحتان من القرآن بعد الفجر كل يوم', 'أقرأ جزءاً كاملاً هذا الأسبوع'],
    qiyam: ['ركعتان من قيام الليل قبل الوتر', 'أوتر كل ليلة قبل أن أنام'],
    fasting: ['أصوم الاثنين أو الخميس', 'أصوم الاثنين والخميس معاً'],
    awrad: ['أتمّ وِردي اليومي قبل النوم', 'أبدأ وِردي بعد صلاة الفجر'],
    tasks: ['أنجز أهم مهمة قبل الظهر', 'أراجع مهامي كل مساء'],
    sadaqah: ['صدقة ولو قليلة كل يوم جمعة', 'صدقة خفية هذا الأسبوع'],
  };
  const general = ['أكثر من الاستغفار كل يوم', 'أصل رحمي بزيارة أو اتصال', 'أحفظ لساني من الغيبة'];
  return weak ? [...by[weak], general[0]] : general;
}
