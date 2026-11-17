import { stripTashkeel } from '@/lib/arabicSearch';

/**
 * The matn (the Prophet's ﷺ words) of a hadith as the library stores it —
 * isnad included («حدثنا الحميدي… قال سمعت رسول الله ﷺ يقول: إنما الأعمال…»).
 * Search engines like الدرر السنية index the matn, so a query built from the
 * opening words (the isnad) finds nothing.
 *
 * Heuristic, no tashkeel: after the first «صلى الله عليه وسلم» (or ﷺ), skip the
 * speech verbs that introduce the words; failing that, after the last
 * «قال»/«يقول»; failing that, the whole text.
 */
const SPEECH = new Set(['قال', 'فقال', 'يقول', 'وقال', 'قالت', 'فقالت', 'انه', 'أنه', 'إنه', 'يوما', 'لنا', 'لهم']);
const NOISE = /\s*(صلى الله عليه وسلم|ﷺ|رضي الله عنهما|رضي الله عنها|رضي الله عنه)\s*/g;

export function matnWords(text: string): string[] {
  const plain = stripTashkeel(text).replace(/[^ء-يﷺ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const marker = plain.search(/صلى الله عليه وسلم|ﷺ/);
  let rest: string;
  if (marker >= 0) {
    rest = plain.slice(marker).replace(/^(صلى الله عليه وسلم|ﷺ)/, '');
  } else {
    const m = [...plain.matchAll(/(?:^|\s)(?:قال|يقول|قالت)\s/g)].pop();
    rest = m ? plain.slice((m.index ?? 0) + m[0].length) : plain;
  }
  const words = rest.replace(NOISE, ' ').split(' ').filter((w) => w.length > 1);
  let i = 0;
  while (i < words.length && SPEECH.has(words[i])) i++;
  const out = words.slice(i);
  return out.length >= 3 ? out : plain.replace(NOISE, ' ').split(' ').filter((w) => w.length > 1);
}

/**
 * Search الدرر السنية (الموسوعة الحديثية) by the matn's opening words. `&all`
 * opens the «للمتخصصين» tab — every hadith; without it only the general-public
 * tab is searched, which holds a small subset and usually shows no results.
 */
export function dorarSearchUrl(text: string, words = 6): string {
  return `https://www.dorar.net/hadith/search?q=${encodeURIComponent(matnWords(text).slice(0, words).join(' '))}&all`;
}
