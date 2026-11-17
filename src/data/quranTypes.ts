import { BookOpen, Brain, Headphones, ScrollText, type LucideIcon } from 'lucide-react';

/**
 * أنواع الختمات in «مصحفي» (`ty` on a khatma; none = تلاوة). They move at very
 * different speeds — listening runs fastest, تفسير slowest — so every number
 * that compares them (badges, challenges) is per type, never summed blindly.
 */
export type QuranType = 'tilawa' | 'listen' | 'tafsir' | 'hifz';

export const QURAN_TYPE_IDS: QuranType[] = ['tilawa', 'listen', 'tafsir', 'hifz'];

export const quranTypeOf = (ty: string | undefined): QuranType =>
  QURAN_TYPE_IDS.includes(ty as QuranType) ? (ty as QuranType) : 'tilawa';

export interface QuranTypeMeta {
  label: string;
  /** مصحفي's own sub-label. */
  sub: string;
  Icon: LucideIcon;
  /** One line: why this kind of khatma. */
  benefit: string;
  /** The text behind it, and its source. */
  quote: string;
  source: string;
  /** Its natural pace — why a day of it looks different. */
  pace: string;
}

export const QURAN_TYPES: Record<QuranType, QuranTypeMeta> = {
  tilawa: {
    label: 'تلاوة',
    sub: 'بالنظر في المصحف',
    Icon: BookOpen,
    benefit: 'بكل حرف حسنة، والحسنة بعشر أمثالها',
    quote: '«من قرأ حرفاً من كتاب الله فله به حسنة، والحسنة بعشر أمثالها»',
    source: 'رواه الترمذي',
    pace: 'ختمة في شهر تعني جزءاً كل يوم، نحو عشرين صفحة',
  },
  listen: {
    label: 'استماع',
    sub: 'لقارئ تحبه',
    Icon: Headphones,
    benefit: 'سببٌ للرحمة، ويصحبك في طريقك وعملك',
    quote: '﴿وَإِذَا قُرِئَ الْقُرْآنُ فَاسْتَمِعُوا لَهُ وَأَنصِتُوا لَعَلَّكُمْ تُرْحَمُونَ﴾',
    source: 'الأعراف: ٢٠٤',
    pace: 'أسرع الأنواع: الجزء في نحو نصف ساعة، فتكثر صفحاته',
  },
  tafsir: {
    label: 'تفسير',
    sub: 'وتدبّر',
    Icon: ScrollText,
    benefit: 'تفهم ما تقرأ، فيصير القرآن عملاً',
    quote: '﴿كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ وَلِيَتَذَكَّرَ أُولُو الْأَلْبَابِ﴾',
    source: 'ص: ٢٩',
    pace: 'أبطأ الأنواع: صفحتان إلى خمس بتأنٍّ يومٌ عامر',
  },
  hifz: {
    label: 'مراجعة',
    sub: 'غيباً من حفظك',
    Icon: Brain,
    benefit: 'تثبّت ما حفظت فلا يتفلّت منك',
    quote: '«تعاهدوا هذا القرآن، فوالذي نفس محمد بيده لهو أشدّ تفلّتاً من الإبل في عُقُلها»',
    source: 'متفق عليه',
    pace: 'بقدر محفوظك: من ربع إلى جزء في اليوم',
  },
};
