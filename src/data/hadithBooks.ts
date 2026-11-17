/**
 * «الكتب التسعة» as published by islambook.com/hadith — 62,169 hadith, each
 * book numbered 1…count exactly like the site. Texts ship gzipped in
 * public/hadith/b{id}/c{chunk}.json.gzip (HADITH_CHUNK per file) plus the
 * normalised search vocabulary (vocab.txt.gzip).
 */
export interface HadithBook {
  id: number;
  name: string;
  author: string;
  count: number;
  /** صحيح البخاري/مسلم; the rest hold graded and ungraded narrations. */
  sahih?: boolean;
}

export const HADITH_BOOKS: HadithBook[] = [
  { id: 0, name: 'صحيح البخاري', author: 'الإمام محمد بن إسماعيل البخاري', count: 7008, sahih: true },
  { id: 1, name: 'صحيح مسلم', author: 'الإمام مسلم بن الحجاج النيسابوري', count: 5362, sahih: true },
  { id: 2, name: 'سنن الترمذي', author: 'الإمام محمد بن عيسى الترمذي', count: 3891 },
  { id: 3, name: 'سنن النسائي', author: 'الإمام أحمد بن شعيب النسائي', count: 5662 },
  { id: 4, name: 'سنن أبي داود', author: 'الإمام سليمان بن الأشعث السجستاني', count: 4590 },
  { id: 5, name: 'سنن ابن ماجه', author: 'الإمام محمد بن يزيد ابن ماجه القزويني', count: 4332 },
  { id: 6, name: 'مسند أحمد بن حنبل', author: 'الإمام أحمد بن حنبل الشيباني', count: 26363 },
  { id: 7, name: 'موطأ مالك', author: 'الإمام مالك بن أنس', count: 1594 },
  { id: 8, name: 'سنن الدارمي', author: 'الإمام عبد الله بن عبد الرحمن الدارمي', count: 3367 },
];

export const HADITH_TOTAL = HADITH_BOOKS.reduce((n, b) => n + b.count, 0);
export const HADITH_CHUNK = 1000;
