import { useHadithStore, type Hadith } from '@/store/hadithStore';
import { dateKeyOf, loadCorpus, pickForDay, type InspirationItem } from './inspirationService';

/**
 * Hadith adapter over the bundled «آية وحديث» corpus (services/inspirationService).
 * The old runtime fetch of the whole Bukhari edition + a 30-item fallback is
 * gone: the corpus ships ≈٧٥٠ authentic hadith offline.
 */

/** Corpus item → the persisted `Hadith` record favourites/stats use. */
export function toHadith(i: InspirationItem): Hadith {
  return { id: i.id, arabic: i.text, book: i.book, number: i.number, ...(i.grade ? { grade: i.grade } : {}) };
}

class HadithService {
  /** Day-appropriate hadith of the day; also logs it in the day cache (read by the learning stats). */
  async getHadithOfDay(date: Date = new Date()): Promise<InspirationItem | null> {
    const item = pickForDay(await loadCorpus(), date, 'hadith');
    const dateKey = dateKeyOf(date);
    const st = useHadithStore.getState();
    if (item && st.cache[dateKey]?.id !== item.id) st.setCached(dateKey, toHadith(item));
    return item;
  }
}

export const hadithService = new HadithService();
