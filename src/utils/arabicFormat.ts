/**
 * Arabic numeral + label formatting helpers, shared across the Quran section
 * (the reader, tafsir sheet, audio player, wird, landing) so there is one
 * source of truth instead of the copies that had drifted between
 * MushafPageView and TafsirSheet.
 */

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Convert any Western digits in a value to Arabic-Indic digits. */
export function toArabicDigits(value: number | string): string {
  return String(value)
    .split('')
    .map((c) => (c >= '0' && c <= '9' ? ARABIC_INDIC[Number(c)] : c))
    .join('');
}

/** Format a `surah:ayah` key as Arabic-Indic, e.g. `2:255` → `٢:٢٥٥`. */
export function arabicVerseKey(verseKey: string): string {
  return toArabicDigits(verseKey);
}

/** Seconds → `m:ss` with Arabic-Indic digits (for the audio seek bar). */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${toArabicDigits(m)}:${toArabicDigits(String(s).padStart(2, '0'))}`;
}
