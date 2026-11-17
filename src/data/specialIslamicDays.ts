export interface SpecialIslamicDay {
  id: string;
  hijriMonth: number; // 1..12
  hijriDay: number; // 1..30
  nameAr: string;
  significance: string;
  suggestedAction?: string;
}

/**
 * Major Islamic days by Hijri month/day. Used to highlight cells on the
 * Hijri calendar and to schedule one-shot notifications.
 */
export const SPECIAL_ISLAMIC_DAYS: SpecialIslamicDay[] = [
  { id: 'hijri_ny', hijriMonth: 1, hijriDay: 1, nameAr: 'رأس السنة الهجرية', significance: 'بداية العام الهجري الجديد', suggestedAction: 'استقبل عامك بالاستغفار والدعاء' },
  { id: 'tasua', hijriMonth: 1, hijriDay: 9, nameAr: 'يوم تاسوعاء', significance: 'يوم التاسع من محرم', suggestedAction: 'يستحب صيامه مع عاشوراء' },
  { id: 'ashura', hijriMonth: 1, hijriDay: 10, nameAr: 'يوم عاشوراء', significance: 'يوم نجى الله فيه موسى وقومه', suggestedAction: 'يكفّر صيامه السنة الماضية' },
  { id: 'middle_shaban', hijriMonth: 8, hijriDay: 15, nameAr: 'منتصف شعبان', significance: 'استعداداً لرمضان', suggestedAction: 'أكثر من الذكر والاستغفار' },
  { id: 'ramadan_start', hijriMonth: 9, hijriDay: 1, nameAr: 'بداية رمضان', significance: 'أول أيام شهر الصيام', suggestedAction: 'اعقد العزم على الصيام والقيام' },
  { id: 'laylat_qadr_21', hijriMonth: 9, hijriDay: 21, nameAr: 'ليلة ٢١ من رمضان', significance: 'من ليالي العشر الأواخر', suggestedAction: 'اطلب ليلة القدر' },
  { id: 'laylat_qadr_23', hijriMonth: 9, hijriDay: 23, nameAr: 'ليلة ٢٣ من رمضان', significance: 'من ليالي العشر الأواخر', suggestedAction: 'اطلب ليلة القدر' },
  { id: 'laylat_qadr_25', hijriMonth: 9, hijriDay: 25, nameAr: 'ليلة ٢٥ من رمضان', significance: 'من ليالي العشر الأواخر', suggestedAction: 'اطلب ليلة القدر' },
  { id: 'laylat_qadr_27', hijriMonth: 9, hijriDay: 27, nameAr: 'ليلة ٢٧ من رمضان (أرجى ليالي القدر)', significance: 'ليلة القدر — خير من ألف شهر', suggestedAction: 'أحْيِ هذه الليلة بالصلاة والدعاء' },
  { id: 'laylat_qadr_29', hijriMonth: 9, hijriDay: 29, nameAr: 'ليلة ٢٩ من رمضان', significance: 'من ليالي العشر الأواخر', suggestedAction: 'اطلب ليلة القدر' },
  { id: 'eid_fitr', hijriMonth: 10, hijriDay: 1, nameAr: 'عيد الفطر المبارك', significance: 'تقبل الله منا ومنكم', suggestedAction: 'صلاة العيد وزكاة الفطر' },
  { id: 'arafah', hijriMonth: 12, hijriDay: 9, nameAr: 'يوم عرفة', significance: 'أعظم أيام السنة', suggestedAction: 'صيام يوم عرفة يكفّر سنتين' },
  { id: 'eid_adha', hijriMonth: 12, hijriDay: 10, nameAr: 'عيد الأضحى المبارك', significance: 'يوم النحر', suggestedAction: 'صلاة العيد والأضحية' },
  { id: 'tashreeq_11', hijriMonth: 12, hijriDay: 11, nameAr: 'أيام التشريق', significance: 'من أيام الحج', suggestedAction: 'الذكر والتكبير' },
  { id: 'tashreeq_12', hijriMonth: 12, hijriDay: 12, nameAr: 'أيام التشريق', significance: 'من أيام الحج', suggestedAction: 'الذكر والتكبير' },
  { id: 'tashreeq_13', hijriMonth: 12, hijriDay: 13, nameAr: 'أيام التشريق', significance: 'آخر أيام الحج', suggestedAction: 'الذكر والتكبير' },
];

export function specialDayFor(hijriMonth: number, hijriDay: number): SpecialIslamicDay | undefined {
  return SPECIAL_ISLAMIC_DAYS.find(
    (d) => d.hijriMonth === hijriMonth && d.hijriDay === hijriDay,
  );
}

/**
 * Extra calendar-only occasions (shown on /calendar, NOT scheduled as
 * notifications — IslamicCalendarScheduler iterates SPECIAL_ISLAMIC_DAYS only).
 */
export const CALENDAR_EXTRA_DAYS: SpecialIslamicDay[] = [
  { id: 'rajab_start', hijriMonth: 7, hijriDay: 1, nameAr: 'بداية شهر رجب', significance: 'رجب من الأشهر الحرم', suggestedAction: 'اجتنب الظلم وأكثر من العمل الصالح' },
  { id: 'dhul_hijjah_start', hijriMonth: 12, hijriDay: 1, nameAr: 'بداية العشر من ذي الحجة', significance: 'أفضل أيام الدنيا', suggestedAction: 'أكثر من التكبير والتهليل والعمل الصالح' },
  { id: 'tarwiyah', hijriMonth: 12, hijriDay: 8, nameAr: 'يوم التروية', significance: 'أول أيام مناسك الحج', suggestedAction: 'أكثر من التكبير والذكر' },
];
