import type { Gender } from '@/store/settingsStore';
import type { DhikrItem } from '@/types';

// Only where the reciter speaks of HERSELF; «عبدك» for the Prophet ﷺ, Dawud or
// the deceased stays. Matching tolerates tashkeel / tatweel / alef forms.
const MARKS = '[\\u064B-\\u065F\\u0670\\u0640]*';
const loose = (plain: string) =>
  new RegExp([...plain].map((c) => (c === ' ' ? '\\s+' : (c === 'ا' ? '[اأإآٱ]' : c) + MARKS)).join(''), 'g');

const FEMININE: [RegExp, string][] = [
  [loose('اني عبدك ابن عبدك ابن امتك'), 'إِنِّي أَمَتُكَ بِنْتُ عَبْدِكَ بِنْتُ أَمَتِكَ'],
  [loose('وانا عبدك'), 'وَأَنَا أَمَتُكَ'],
];

/** The dhikr as a woman says it (سيد الاستغفار، دعاء الهم، دعاء الاستفتاح…). */
export function feminize(text: string): string {
  return FEMININE.reduce((t, [re, to]) => t.replace(re, to), text);
}

export const forGender = (items: DhikrItem[], gender: Gender | null): DhikrItem[] =>
  gender !== 'female'
    ? items
    : items.map((it) => {
        const arabic = feminize(it.arabic);
        return arabic === it.arabic ? it : { ...it, arabic };
      });
