/**
 * Curated subset of Hisnul Muslim (حصن المسلم) covering common categories.
 * Each entry is short, in clean Arabic, with reference attribution.
 */

export interface DuaaCategory {
  id: string;
  nameAr: string;
  icon: string; // emoji
  order: number;
}

export interface DuaaLibraryEntry {
  id: string;
  categoryId: string;
  arabic: string;
  reference: string;
  benefit?: string;
}

export const DUAA_CATEGORIES: DuaaCategory[] = [
  { id: 'morning', nameAr: 'أذكار الصباح', icon: '🌅', order: 1 },
  { id: 'evening', nameAr: 'أذكار المساء', icon: '🌇', order: 2 },
  { id: 'sleep', nameAr: 'أذكار النوم والاستيقاظ', icon: '🌙', order: 3 },
  { id: 'prayer', nameAr: 'أذكار الصلاة', icon: '🕌', order: 4 },
  { id: 'travel', nameAr: 'أذكار السفر', icon: '✈️', order: 5 },
  { id: 'food', nameAr: 'أذكار الطعام والشراب', icon: '🍽️', order: 6 },
  { id: 'illness', nameAr: 'أذكار المرض والشفاء', icon: '🤲', order: 7 },
  { id: 'rain', nameAr: 'أذكار المطر والرياح', icon: '🌧️', order: 8 },
  { id: 'home', nameAr: 'دخول المنزل والخروج', icon: '🏠', order: 9 },
  { id: 'distress', nameAr: 'الكرب والهم', icon: '💔', order: 10 },
];

export const DUAA_LIBRARY: DuaaLibraryEntry[] = [
  // Morning
  { id: 'm1', categoryId: 'morning', arabic: 'أصبحنا وأصبح المُلكُ لله، والحمدُ لله، لا إله إلا الله وحدَه لا شريكَ له، له المُلكُ وله الحمدُ وهو على كلِّ شيءٍ قدير', reference: 'صحيح مسلم' },
  { id: 'm2', categoryId: 'morning', arabic: 'اللهم بك أصبحنا، وبك أمسينا، وبك نحيا، وبك نموت، وإليك النشور', reference: 'صحيح الترمذي' },
  { id: 'm3', categoryId: 'morning', arabic: 'اللهم أنت ربي لا إله إلا أنت، خلقتني وأنا عبدُك، وأنا على عهدِكَ ووعدِكَ ما استطعت، أعوذُ بكَ من شرِّ ما صنعت، أبوءُ لك بنعمتِكَ علي، وأبوءُ بذنبي، فاغفرْ لي فإنه لا يَغفرُ الذنوبَ إلا أنت', reference: 'صحيح البخاري', benefit: 'سيد الاستغفار' },
  { id: 'm4', categoryId: 'morning', arabic: 'سبحان الله وبحمده عدد خلقه، ورضا نفسه، وزِنة عرشه، ومداد كلماته', reference: 'صحيح مسلم' },
  { id: 'm5', categoryId: 'morning', arabic: 'بسم الله الذي لا يضرُّ مع اسمه شيءٌ في الأرض ولا في السماء، وهو السميع العليم', reference: 'صحيح الترمذي', benefit: 'تقال ثلاث مرات' },
  { id: 'm6', categoryId: 'morning', arabic: 'رضيت بالله رباً، وبالإسلام ديناً، وبمحمدٍ ﷺ نبياً', reference: 'صحيح الترمذي' },

  // Evening
  { id: 'e1', categoryId: 'evening', arabic: 'أمسينا وأمسى المُلكُ لله، والحمدُ لله، لا إله إلا الله وحدَه لا شريكَ له', reference: 'صحيح مسلم' },
  { id: 'e2', categoryId: 'evening', arabic: 'اللهم بك أمسينا، وبك أصبحنا، وبك نحيا، وبك نموت، وإليك المصير', reference: 'صحيح الترمذي' },
  { id: 'e3', categoryId: 'evening', arabic: 'أعوذ بكلمات الله التامات من شر ما خلق', reference: 'صحيح مسلم', benefit: 'تقال ثلاث مرات' },
  { id: 'e4', categoryId: 'evening', arabic: 'اللهم إني أعوذ بك من الهم والحزن، والعجز والكسل، والبخل والجبن، وضلع الدين، وغلبة الرجال', reference: 'صحيح البخاري' },

  // Sleep
  { id: 's1', categoryId: 'sleep', arabic: 'باسمك اللهم أموت وأحيا', reference: 'صحيح البخاري' },
  { id: 's2', categoryId: 'sleep', arabic: 'اللهم قِني عذابك يوم تبعث عبادك', reference: 'صحيح الترمذي' },
  { id: 's3', categoryId: 'sleep', arabic: 'اللهم خلقت نفسي وأنت تتوفّاها، لك مماتها ومحياها، إن أحييتها فاحفظها، وإن أمتّها فاغفر لها، اللهم إني أسألك العافية', reference: 'صحيح مسلم' },
  { id: 's4', categoryId: 'sleep', arabic: 'الحمد لله الذي أحيانا بعدما أماتنا وإليه النشور', reference: 'صحيح البخاري', benefit: 'عند الاستيقاظ' },

  // Prayer
  { id: 'p1', categoryId: 'prayer', arabic: 'اللهم باعد بيني وبين خطاياي كما باعدتَ بين المشرق والمغرب، اللهم نقّني من خطاياي كما يُنقّى الثوب الأبيض من الدنس، اللهم اغسلني من خطاياي بالماء والثلج والبَرَد', reference: 'صحيح البخاري', benefit: 'دعاء الاستفتاح' },
  { id: 'p2', categoryId: 'prayer', arabic: 'سبحان ربي العظيم', reference: 'صحيح', benefit: 'في الركوع — ثلاث مرات أو أكثر' },
  { id: 'p3', categoryId: 'prayer', arabic: 'سبحان ربي الأعلى', reference: 'صحيح', benefit: 'في السجود — ثلاث مرات أو أكثر' },
  { id: 'p4', categoryId: 'prayer', arabic: 'اللهم اغفر لي ما قدّمت وما أخّرت، وما أسررت وما أعلنت، وما أسرفت، وما أنت أعلم به مني، أنت المُقدّم وأنت المؤخّر لا إله إلا أنت', reference: 'صحيح مسلم', benefit: 'في التشهد قبل السلام' },

  // Travel
  { id: 't1', categoryId: 'travel', arabic: 'اللهم إنا نسألك في سفرنا هذا البرَّ والتقوى، ومن العمل ما ترضى، اللهم هوّن علينا سفرنا هذا واطوِ عنا بُعده، اللهم أنت الصاحب في السفر والخليفة في الأهل', reference: 'صحيح مسلم' },
  { id: 't2', categoryId: 'travel', arabic: 'سبحان الذي سخّر لنا هذا وما كنا له مُقرنين وإنا إلى ربنا لمنقلبون', reference: 'القرآن — الزخرف 13-14', benefit: 'عند ركوب الدابة' },
  { id: 't3', categoryId: 'travel', arabic: 'اللهم إني أعوذ بك من وعثاء السفر، وكآبة المنظر، وسوء المنقلب في المال والأهل والولد', reference: 'صحيح مسلم' },

  // Food
  { id: 'f1', categoryId: 'food', arabic: 'بسم الله', reference: 'صحيح', benefit: 'قبل الأكل' },
  { id: 'f2', categoryId: 'food', arabic: 'الحمد لله الذي أطعمني هذا ورزقَنيه من غير حول مني ولا قوة', reference: 'صحيح الترمذي', benefit: 'بعد الأكل — يُغفر له ما تقدم من ذنبه' },
  { id: 'f3', categoryId: 'food', arabic: 'اللهم بارك لنا فيما رزقتنا وقِنا عذاب النار', reference: 'صحيح ابن السني' },

  // Illness
  { id: 'i1', categoryId: 'illness', arabic: 'أعوذ بعزة الله وقدرته من شر ما أجد وأحاذر', reference: 'صحيح مسلم', benefit: 'يُقال سبع مرات' },
  { id: 'i2', categoryId: 'illness', arabic: 'اللهم رب الناس، أذهب البأس، اشفِ أنت الشافي، لا شفاء إلا شفاؤك، شفاءً لا يغادر سَقَماً', reference: 'صحيح البخاري' },
  { id: 'i3', categoryId: 'illness', arabic: 'أسأل الله العظيم رب العرش العظيم أن يَشفيك', reference: 'صحيح الترمذي', benefit: 'تقال سبع مرات' },

  // Rain
  { id: 'r1', categoryId: 'rain', arabic: 'اللهم صيِّباً نافعاً', reference: 'صحيح البخاري', benefit: 'عند نزول المطر' },
  { id: 'r2', categoryId: 'rain', arabic: 'مُطرنا بفضل الله ورحمته', reference: 'صحيح البخاري', benefit: 'بعد نزول المطر' },
  { id: 'r3', categoryId: 'rain', arabic: 'اللهم إني أسألك خيرها وأعوذ بك من شرها', reference: 'صحيح أبو داود', benefit: 'عند هبوب الريح' },

  // Home
  { id: 'h1', categoryId: 'home', arabic: 'بسم الله ولجنا، وبسم الله خرجنا، وعلى الله ربِّنا توكلنا', reference: 'صحيح أبو داود', benefit: 'دخول المنزل' },
  { id: 'h2', categoryId: 'home', arabic: 'بسم الله، توكلت على الله، ولا حول ولا قوة إلا بالله', reference: 'صحيح الترمذي', benefit: 'الخروج من المنزل' },

  // Distress
  { id: 'd1', categoryId: 'distress', arabic: 'لا إله إلا الله العظيم الحليم، لا إله إلا الله رب العرش العظيم، لا إله إلا الله رب السموات ورب الأرض ورب العرش الكريم', reference: 'صحيح البخاري', benefit: 'دعاء الكرب' },
  { id: 'd2', categoryId: 'distress', arabic: 'اللهم رحمتك أرجو فلا تَكِلني إلى نفسي طرفة عين، وأصلح لي شأني كله، لا إله إلا أنت', reference: 'صحيح أبو داود' },
  { id: 'd3', categoryId: 'distress', arabic: 'لا إله إلا أنت سبحانك إني كنت من الظالمين', reference: 'القرآن — الأنبياء 87', benefit: 'دعاء ذي النون' },
];
