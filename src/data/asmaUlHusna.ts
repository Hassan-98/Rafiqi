/**
 * The 99 Names of Allah (الأسماء الحسنى).
 *
 * Audio URLs point at the free public mp3quran CDN where the names are
 * available individually; offline fallback returns no audio.
 */

export interface AsmaName {
  index: number;
  arabic: string;
  transliteration: string;
  meaningAr: string;
  explanationAr?: string;
  audioUrl?: string;
}

// Audio CDN base (Mishary Al-Afasy recitation of the names).
const AUDIO_BASE = 'https://www.gulfup.co/files/audio/asma/';

function aud(i: number): string {
  return `${AUDIO_BASE}${String(i).padStart(2, '0')}.mp3`;
}

export const ASMA_UL_HUSNA: AsmaName[] = [
  { index: 1, arabic: 'الرَّحْمٰنُ', transliteration: 'Ar-Rahman', meaningAr: 'الرحيم بجميع خلقه في الدنيا', audioUrl: aud(1) },
  { index: 2, arabic: 'الرَّحِيمُ', transliteration: 'Ar-Raheem', meaningAr: 'الرحيم بالمؤمنين في الآخرة', audioUrl: aud(2) },
  { index: 3, arabic: 'الْمَلِكُ', transliteration: 'Al-Malik', meaningAr: 'المالك المتصرف في كل شيء', audioUrl: aud(3) },
  { index: 4, arabic: 'الْقُدُّوسُ', transliteration: 'Al-Quddus', meaningAr: 'المنزّه عن كل عيب ونقص', audioUrl: aud(4) },
  { index: 5, arabic: 'السَّلَامُ', transliteration: 'As-Salam', meaningAr: 'السالم من كل نقص، الواهب السلام', audioUrl: aud(5) },
  { index: 6, arabic: 'الْمُؤْمِنُ', transliteration: 'Al-Mu\'min', meaningAr: 'المصدِّق نفسَه ورسلَه، المؤمِّن خلقه', audioUrl: aud(6) },
  { index: 7, arabic: 'الْمُهَيْمِنُ', transliteration: 'Al-Muhaymin', meaningAr: 'الشاهد على عباده، الرقيب عليهم', audioUrl: aud(7) },
  { index: 8, arabic: 'الْعَزِيزُ', transliteration: 'Al-Aziz', meaningAr: 'الغالب الذي لا يُغلب', audioUrl: aud(8) },
  { index: 9, arabic: 'الْجَبَّارُ', transliteration: 'Al-Jabbar', meaningAr: 'الذي يَجبر خلقه ولا يُقهر', audioUrl: aud(9) },
  { index: 10, arabic: 'الْمُتَكَبِّرُ', transliteration: 'Al-Mutakabbir', meaningAr: 'المتعالي عن صفات الخلق', audioUrl: aud(10) },
  { index: 11, arabic: 'الْخَالِقُ', transliteration: 'Al-Khaliq', meaningAr: 'موجِد الأشياء من العدم', audioUrl: aud(11) },
  { index: 12, arabic: 'الْبَارِئُ', transliteration: 'Al-Bari\'', meaningAr: 'المُبدع للخلق بلا مثال سابق', audioUrl: aud(12) },
  { index: 13, arabic: 'الْمُصَوِّرُ', transliteration: 'Al-Musawwir', meaningAr: 'مُشكِّل الأشياء على ما أراد', audioUrl: aud(13) },
  { index: 14, arabic: 'الْغَفَّارُ', transliteration: 'Al-Ghaffar', meaningAr: 'كثير المغفرة، المتجاوز عن الذنوب', audioUrl: aud(14) },
  { index: 15, arabic: 'الْقَهَّارُ', transliteration: 'Al-Qahhar', meaningAr: 'القاهر كل شيء بقدرته', audioUrl: aud(15) },
  { index: 16, arabic: 'الْوَهَّابُ', transliteration: 'Al-Wahhab', meaningAr: 'كثير العطاء بلا مقابل', audioUrl: aud(16) },
  { index: 17, arabic: 'الرَّزَّاقُ', transliteration: 'Ar-Razzaq', meaningAr: 'الذي يَرزق جميع خلقه', audioUrl: aud(17) },
  { index: 18, arabic: 'الْفَتَّاحُ', transliteration: 'Al-Fattah', meaningAr: 'فاتح أبواب الرحمة والرزق', audioUrl: aud(18) },
  { index: 19, arabic: 'الْعَلِيمُ', transliteration: 'Al-Aleem', meaningAr: 'العالم بكل شيء جليّه وخفيّه', audioUrl: aud(19) },
  { index: 20, arabic: 'الْقَابِضُ', transliteration: 'Al-Qabid', meaningAr: 'الذي يقبض الأرزاق والأرواح بحكمته', audioUrl: aud(20) },
  { index: 21, arabic: 'الْبَاسِطُ', transliteration: 'Al-Basit', meaningAr: 'الذي يبسط الرزق والرحمة', audioUrl: aud(21) },
  { index: 22, arabic: 'الْخَافِضُ', transliteration: 'Al-Khafid', meaningAr: 'مُذِلّ الجبابرة والمتكبرين', audioUrl: aud(22) },
  { index: 23, arabic: 'الرَّافِعُ', transliteration: 'Ar-Rafi\'', meaningAr: 'رافع المؤمنين بطاعته', audioUrl: aud(23) },
  { index: 24, arabic: 'الْمُعِزُّ', transliteration: 'Al-Mu\'izz', meaningAr: 'المعزّ لمن يشاء من عباده', audioUrl: aud(24) },
  { index: 25, arabic: 'الْمُذِلُّ', transliteration: 'Al-Mudhill', meaningAr: 'المذلّ لمن استكبر عليه', audioUrl: aud(25) },
  { index: 26, arabic: 'السَّمِيعُ', transliteration: 'As-Sami\'', meaningAr: 'السامع لكل شيء بلا حواس', audioUrl: aud(26) },
  { index: 27, arabic: 'الْبَصِيرُ', transliteration: 'Al-Basir', meaningAr: 'المبصِر لكل شيء بلا جوارح', audioUrl: aud(27) },
  { index: 28, arabic: 'الْحَكَمُ', transliteration: 'Al-Hakam', meaningAr: 'الفاصل بين الخلائق بالحق', audioUrl: aud(28) },
  { index: 29, arabic: 'الْعَدْلُ', transliteration: 'Al-\'Adl', meaningAr: 'العادل في حكمه وقضائه', audioUrl: aud(29) },
  { index: 30, arabic: 'اللَّطِيفُ', transliteration: 'Al-Latif', meaningAr: 'الرفيق بعباده، العالم بدقائق الأمور', audioUrl: aud(30) },
  { index: 31, arabic: 'الْخَبِيرُ', transliteration: 'Al-Khabir', meaningAr: 'العالم بحقائق الأمور وبواطنها', audioUrl: aud(31) },
  { index: 32, arabic: 'الْحَلِيمُ', transliteration: 'Al-Halim', meaningAr: 'كثير الحلم، الذي لا يعجل بالعقوبة', audioUrl: aud(32) },
  { index: 33, arabic: 'الْعَظِيمُ', transliteration: 'Al-\'Azim', meaningAr: 'العظيم في ذاته وصفاته', audioUrl: aud(33) },
  { index: 34, arabic: 'الْغَفُورُ', transliteration: 'Al-Ghafur', meaningAr: 'الساتر للذنوب والمتجاوز عنها', audioUrl: aud(34) },
  { index: 35, arabic: 'الشَّكُورُ', transliteration: 'Ash-Shakur', meaningAr: 'المُجزل الثواب على القليل من العمل', audioUrl: aud(35) },
  { index: 36, arabic: 'الْعَلِيُّ', transliteration: 'Al-\'Aliyy', meaningAr: 'العلي فوق كل شيء بذاته وصفاته', audioUrl: aud(36) },
  { index: 37, arabic: 'الْكَبِيرُ', transliteration: 'Al-Kabir', meaningAr: 'الكبير في كل شيء عن مماثلة الخلق', audioUrl: aud(37) },
  { index: 38, arabic: 'الْحَفِيظُ', transliteration: 'Al-Hafiz', meaningAr: 'الحافظ لخلقه وأعمالهم', audioUrl: aud(38) },
  { index: 39, arabic: 'الْمُقِيتُ', transliteration: 'Al-Muqit', meaningAr: 'الذي خلق الأقوات وأوصلها للخلائق', audioUrl: aud(39) },
  { index: 40, arabic: 'الْحَسِيبُ', transliteration: 'Al-Hasib', meaningAr: 'الكافي عباده، المحاسب لهم', audioUrl: aud(40) },
  { index: 41, arabic: 'الْجَلِيلُ', transliteration: 'Al-Jalil', meaningAr: 'الموصوف بصفات الجلال والكمال', audioUrl: aud(41) },
  { index: 42, arabic: 'الْكَرِيمُ', transliteration: 'Al-Karim', meaningAr: 'الكثير الخير، الجواد المعطي', audioUrl: aud(42) },
  { index: 43, arabic: 'الرَّقِيبُ', transliteration: 'Ar-Raqib', meaningAr: 'المراقب لأحوال خلقه وأعمالهم', audioUrl: aud(43) },
  { index: 44, arabic: 'الْمُجِيبُ', transliteration: 'Al-Mujib', meaningAr: 'مجيب دعوة الداعين، حاجة السائلين', audioUrl: aud(44) },
  { index: 45, arabic: 'الْوَاسِعُ', transliteration: 'Al-Wasi\'', meaningAr: 'الواسع رحمتُه وعلمُه ورزقه', audioUrl: aud(45) },
  { index: 46, arabic: 'الْحَكِيمُ', transliteration: 'Al-Hakim', meaningAr: 'المحكم في صنعته وأفعاله', audioUrl: aud(46) },
  { index: 47, arabic: 'الْوَدُودُ', transliteration: 'Al-Wadud', meaningAr: 'المحب لعباده الصالحين والمحبوب لهم', audioUrl: aud(47) },
  { index: 48, arabic: 'الْمَجِيدُ', transliteration: 'Al-Majid', meaningAr: 'العظيم الجليل، شريف الذات والصفات', audioUrl: aud(48) },
  { index: 49, arabic: 'الْبَاعِثُ', transliteration: 'Al-Ba\'ith', meaningAr: 'الذي يبعث الخلق يوم القيامة', audioUrl: aud(49) },
  { index: 50, arabic: 'الشَّهِيدُ', transliteration: 'Ash-Shaheed', meaningAr: 'الحاضر المطلع على كل شيء', audioUrl: aud(50) },
  { index: 51, arabic: 'الْحَقُّ', transliteration: 'Al-Haqq', meaningAr: 'الموجود حقاً، الثابت إلهيته', audioUrl: aud(51) },
  { index: 52, arabic: 'الْوَكِيلُ', transliteration: 'Al-Wakil', meaningAr: 'القائم بأمور خلقه، الكفيل بأرزاقهم', audioUrl: aud(52) },
  { index: 53, arabic: 'الْقَوِيُّ', transliteration: 'Al-Qawiyy', meaningAr: 'الذي لا يُغلب ولا يُقهر', audioUrl: aud(53) },
  { index: 54, arabic: 'الْمَتِينُ', transliteration: 'Al-Matin', meaningAr: 'شديد القوة، لا تنقطع قدرته', audioUrl: aud(54) },
  { index: 55, arabic: 'الْوَلِيُّ', transliteration: 'Al-Waliyy', meaningAr: 'الناصر للمؤمنين، المتولي شؤونهم', audioUrl: aud(55) },
  { index: 56, arabic: 'الْحَمِيدُ', transliteration: 'Al-Hameed', meaningAr: 'المحمود على كل حال، المستحق للحمد', audioUrl: aud(56) },
  { index: 57, arabic: 'الْمُحْصِي', transliteration: 'Al-Muhsi', meaningAr: 'العالم بعدد كل شيء، حاصياً تفاصيله', audioUrl: aud(57) },
  { index: 58, arabic: 'الْمُبْدِئُ', transliteration: 'Al-Mubdi\'', meaningAr: 'الذي بدأ الخلق من العدم', audioUrl: aud(58) },
  { index: 59, arabic: 'الْمُعِيدُ', transliteration: 'Al-Mu\'id', meaningAr: 'الذي يعيد الخلق بعد فنائهم', audioUrl: aud(59) },
  { index: 60, arabic: 'الْمُحْيِي', transliteration: 'Al-Muhyi', meaningAr: 'موجد الحياة لمن شاء من خلقه', audioUrl: aud(60) },
  { index: 61, arabic: 'الْمُمِيتُ', transliteration: 'Al-Mumit', meaningAr: 'الذي يقدّر الموت على عباده', audioUrl: aud(61) },
  { index: 62, arabic: 'الْحَيُّ', transliteration: 'Al-Hayy', meaningAr: 'الحي الذي لا يموت أبداً', audioUrl: aud(62) },
  { index: 63, arabic: 'الْقَيُّومُ', transliteration: 'Al-Qayyum', meaningAr: 'القائم بنفسه، المقيم لغيره', audioUrl: aud(63) },
  { index: 64, arabic: 'الْوَاجِدُ', transliteration: 'Al-Wajid', meaningAr: 'الغني الذي لا يحتاج إلى شيء', audioUrl: aud(64) },
  { index: 65, arabic: 'الْمَاجِدُ', transliteration: 'Al-Majid', meaningAr: 'الكريم الواسع الفضل والإحسان', audioUrl: aud(65) },
  { index: 66, arabic: 'الْوَاحِدُ', transliteration: 'Al-Wahid', meaningAr: 'الفرد المنفرد بالألوهية والكمال', audioUrl: aud(66) },
  { index: 67, arabic: 'الْأَحَدُ', transliteration: 'Al-Ahad', meaningAr: 'الفرد الذي ليس له شريك ولا مثيل', audioUrl: aud(67) },
  { index: 68, arabic: 'الصَّمَدُ', transliteration: 'As-Samad', meaningAr: 'الذي تقصده الخلائق في الحوائج', audioUrl: aud(68) },
  { index: 69, arabic: 'الْقَادِرُ', transliteration: 'Al-Qadir', meaningAr: 'القادر على كل شيء، لا يعجزه شيء', audioUrl: aud(69) },
  { index: 70, arabic: 'الْمُقْتَدِرُ', transliteration: 'Al-Muqtadir', meaningAr: 'القوي الذي لا يُمتنع عليه شيء', audioUrl: aud(70) },
  { index: 71, arabic: 'الْمُقَدِّمُ', transliteration: 'Al-Muqaddim', meaningAr: 'الذي يقدّم من شاء برحمته', audioUrl: aud(71) },
  { index: 72, arabic: 'الْمُؤَخِّرُ', transliteration: 'Al-Mu\'akhkhir', meaningAr: 'الذي يؤخّر من شاء بحكمته', audioUrl: aud(72) },
  { index: 73, arabic: 'الْأَوَّلُ', transliteration: 'Al-Awwal', meaningAr: 'السابق على كل شيء، الأزلي بلا بداية', audioUrl: aud(73) },
  { index: 74, arabic: 'الْآخِرُ', transliteration: 'Al-Akhir', meaningAr: 'الباقي بعد فناء خلقه، الأبدي بلا نهاية', audioUrl: aud(74) },
  { index: 75, arabic: 'الظَّاهِرُ', transliteration: 'Az-Zahir', meaningAr: 'الظاهر بآياته وقدرته فوق كل شيء', audioUrl: aud(75) },
  { index: 76, arabic: 'الْبَاطِنُ', transliteration: 'Al-Batin', meaningAr: 'العالم ببواطن الأمور وخفاياها', audioUrl: aud(76) },
  { index: 77, arabic: 'الْوَالِي', transliteration: 'Al-Wali', meaningAr: 'المتولي أمور خلقه بتدبيره', audioUrl: aud(77) },
  { index: 78, arabic: 'الْمُتَعَالِي', transliteration: 'Al-Muta\'ali', meaningAr: 'المرتفع عن صفات الخلق ونقائصهم', audioUrl: aud(78) },
  { index: 79, arabic: 'الْبَرُّ', transliteration: 'Al-Barr', meaningAr: 'كثير الخير والإحسان لعباده', audioUrl: aud(79) },
  { index: 80, arabic: 'التَّوَّابُ', transliteration: 'At-Tawwab', meaningAr: 'كثير قبول التوبة من عباده', audioUrl: aud(80) },
  { index: 81, arabic: 'الْمُنْتَقِمُ', transliteration: 'Al-Muntaqim', meaningAr: 'الذي يَنتقم من الظالمين والمستكبرين', audioUrl: aud(81) },
  { index: 82, arabic: 'الْعَفُوُّ', transliteration: 'Al-\'Afuww', meaningAr: 'كثير العفو، الذي يمحو السيئات', audioUrl: aud(82) },
  { index: 83, arabic: 'الرَّؤُوفُ', transliteration: 'Ar-Ra\'uf', meaningAr: 'الرفيق الرحيم بعباده الصالحين', audioUrl: aud(83) },
  { index: 84, arabic: 'مَالِكُ الْمُلْكِ', transliteration: 'Malik Al-Mulk', meaningAr: 'المالك المتصرف في الملك كما يشاء', audioUrl: aud(84) },
  { index: 85, arabic: 'ذُو الْجَلَالِ وَالْإِكْرَامِ', transliteration: 'Dhul-Jalali wal-Ikram', meaningAr: 'صاحب العظمة والكرم العظيمين', audioUrl: aud(85) },
  { index: 86, arabic: 'الْمُقْسِطُ', transliteration: 'Al-Muqsit', meaningAr: 'العادل في حكمه، المنصف من ظُلم', audioUrl: aud(86) },
  { index: 87, arabic: 'الْجَامِعُ', transliteration: 'Al-Jami\'', meaningAr: 'جامع الخلق ليوم لا ريب فيه', audioUrl: aud(87) },
  { index: 88, arabic: 'الْغَنِيُّ', transliteration: 'Al-Ghaniyy', meaningAr: 'الغني عن خلقه، لا يحتاج لشيء', audioUrl: aud(88) },
  { index: 89, arabic: 'الْمُغْنِي', transliteration: 'Al-Mughni', meaningAr: 'الذي يغني عباده بفضله', audioUrl: aud(89) },
  { index: 90, arabic: 'الْمَانِعُ', transliteration: 'Al-Mani\'', meaningAr: 'الذي يمنع ما يشاء عمن يشاء بحكمته', audioUrl: aud(90) },
  { index: 91, arabic: 'الضَّارُّ', transliteration: 'Ad-Darr', meaningAr: 'الذي يقدّر الضرر على من شاء بحكمته', audioUrl: aud(91) },
  { index: 92, arabic: 'النَّافِعُ', transliteration: 'An-Nafi\'', meaningAr: 'الذي يقدّر النفع لمن شاء من خلقه', audioUrl: aud(92) },
  { index: 93, arabic: 'النُّورُ', transliteration: 'An-Nur', meaningAr: 'منوّر السماوات والأرض، وهادي القلوب', audioUrl: aud(93) },
  { index: 94, arabic: 'الْهَادِي', transliteration: 'Al-Hadi', meaningAr: 'الذي يهدي عباده إلى الحق وما ينفعهم', audioUrl: aud(94) },
  { index: 95, arabic: 'الْبَدِيعُ', transliteration: 'Al-Badi\'', meaningAr: 'مبدع السماوات والأرض على غير مثال', audioUrl: aud(95) },
  { index: 96, arabic: 'الْبَاقِي', transliteration: 'Al-Baqi', meaningAr: 'الذي لا يفنى، أزليّ أبديّ', audioUrl: aud(96) },
  { index: 97, arabic: 'الْوَارِثُ', transliteration: 'Al-Warith', meaningAr: 'الباقي بعد فناء خلقه، يَرث الأرض ومن عليها', audioUrl: aud(97) },
  { index: 98, arabic: 'الرَّشِيدُ', transliteration: 'Ar-Rasheed', meaningAr: 'المُرشد عباده إلى ما فيه خير لهم', audioUrl: aud(98) },
  { index: 99, arabic: 'الصَّبُورُ', transliteration: 'As-Saboor', meaningAr: 'الذي لا يعجل بالعقوبة على من عصاه', audioUrl: aud(99) },
];
