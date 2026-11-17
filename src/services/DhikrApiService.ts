import { morningAdhkar, eveningAdhkar, postPrayerAdhkar } from '@/data/adhkar';
import type { DhikrItem, DhikrCategory, PrayerName } from '@/types';

/**
 * DhikrApiService — Abstracts dhikr/adhkar data fetching.
 *
 * Currently serves from bundled hardcoded data (Hisn al-Muslim).
 * Interface is designed to be swappable for a live REST API in future:
 * - Implement IDhikrApiService against a remote endpoint
 * - Inject the implementation via DI or module swap
 */

export interface IDhikrApiService {
  getMorning(): Promise<DhikrItem[]>;
  getEvening(): Promise<DhikrItem[]>;
  getPostPrayer(prayer?: PrayerName): Promise<DhikrItem[]>;
  getByCategory(category: DhikrCategory): Promise<DhikrItem[]>;
}

export class DhikrApiService implements IDhikrApiService {
  async getMorning(): Promise<DhikrItem[]> {
    return morningAdhkar;
  }

  async getEvening(): Promise<DhikrItem[]> {
    return eveningAdhkar;
  }

  /**
   * Returns post-prayer tasbihat. Currently the same set regardless of
   * which prayer was just completed; a future API could filter by prayer.
   */
  async getPostPrayer(_prayer?: PrayerName): Promise<DhikrItem[]> {
    return postPrayerAdhkar;
  }

  async getByCategory(category: DhikrCategory): Promise<DhikrItem[]> {
    switch (category) {
      case 'morning': return morningAdhkar;
      case 'evening': return eveningAdhkar;
      case 'postPrayer': return postPrayerAdhkar;
      default: return [];
    }
  }
}

export const dhikrApiService = new DhikrApiService();
