/**
 * Recitations for the bundled adhkar (listening mode), keyed by DhikrItem id.
 *
 * Source: the official Hisn al-Muslim audio (hisnmuslim.com/audio/ar/{id}.mp3).
 * Built once by fuzzy-matching our texts against the Hisn API texts
 * (normalised Arabic, Levenshtein), then checked against a Whisper transcript
 * of each recording, because the recordings also speak things that are not
 * part of the dhikr: chapter titles («أذكار الصباح والمساء…يقرأ»), repetition
 * notes («ثلاث مرات»، «مائة مرة إذا أصبح») and «وإذا أمسى قال…» variants.
 * `from`/`to` (seconds) cut those off at a measured silence gap, so what plays
 * is only the words on the card.
 *
 * Hisn's audio never speaks the evening forms (أمسينا…، أمسيت…، ما أمسى بي…),
 * words some texts differently, or fuses two adhkar in one recording — most
 * of those now come from masnun-dua (below). Still NOT mapped (read, not heard):
 *  - (يا ربّ لك الحمد كما ينبغي، اللهم أنت ربي عليك توكلت have no human
 *    recording anywhere — they play the synthetic readings below);
 *  - tasbihat that exist only inside a hadith narration with no clean pause.
 * The four Quranic surahs are recited per āyah (Mahmoud Khalil Al-Husary, everyayah.com — Alafasy removed by owner).
 *
 * 2026-10-29 gap fill (owner asked for real recordings, not TTS): eleven of
 * the unmapped morning/evening items come from github.com/islamicapi/masnun-dua
 * («free and open source… any purpose… no attribution required»), each file
 * Whisper-transcribed and matched word-for-word to our card. Pinned to a
 * commit via jsDelivr so the files can't change under us. Their own labels are
 * wrong in places (109 is labelled «أمسيت أشهدك» but says «صلّ وسلّم») — map a
 * new file only after transcribing it. A different reciter from the Hisn clips.
 */

export interface AudioSeg {
  url: string;
  /** Start offset in seconds (skip a spoken title). */
  from?: number;
  /** Stop at this offset in seconds (cut a spoken repetition note). */
  to?: number;
}

const H = (id: number, from?: number, to?: number): AudioSeg => ({
  url: `https://www.hisnmuslim.com/audio/ar/${id}.mp3`,
  from,
  to,
});

const pad = (n: number) => String(n).padStart(3, '0');
const ayah = (s: number, a: number): AudioSeg => ({
  url: `https://everyayah.com/data/Husary_128kbps/${pad(s)}${pad(a)}.mp3`,
});
/** Mishary Alafasy's full evening track (IslamHouse, 1434) — cut per dhikr; owner approved 2026-10-29. */
const ALAFASY_MSA = 'https://d1.islamhouse.com/data/ar/ih_sounds/chain_01/Mishari_Raashid/Azkar_AlSba7_w_AlMsa/ar_1434_Azkar_AlMsa.mp3';
/**
 * Synthetic readings, bundled (public/audio/adhkar) — ONLY where no human
 * recording exists anywhere (owner approved 2026-10-29). Piper (MIT) voice
 * ar_JO-kareem-medium, phoneme-corrected tashkeel, −16 LUFS; every word
 * Whisper-verified in order. Replace with a human recording if one turns up.
 */
const TTS = (name: string): AudioSeg[] => [{ url: `${import.meta.env?.BASE_URL ?? '/'}audio/adhkar/${name}.mp3` }];
const MASNUN = 'https://cdn.jsdelivr.net/gh/islamicapi/masnun-dua@5b615c53c271f348432cc8913b81f7a220aea114/audio';
/** A whole masnun-dua recording (see the header: transcript-verified). */
const M = (n: number): AudioSeg[] => [{ url: `${MASNUN}/${n}.mp3` }];

/** Basmala (1:1) then every āyah of a short surah. */
const surah = (s: number, ayahs: number): AudioSeg[] => [
  ayah(1, 1),
  ...Array.from({ length: ayahs }, (_, i) => ayah(s, i + 1)),
];

/** Isti'ādhah, then Āyat al-Kursī — the spoken label «آية الكرسي» between them is skipped. */
const KURSI = [H(75, 13.78, 16.83), H(75, 18.38)];
const IKHLAS = surah(112, 4);
const FALAQ = surah(113, 5);
const NAS = surah(114, 6);

const MAP: Record<string, AudioSeg[]> = {
  // ── الصباح ──
  'morning-1': KURSI,
  'morning-2': IKHLAS,
  'morning-3': FALAQ,
  'morning-4': NAS,
  'morning-5': [H(77, 0, 40.65)],
  'morning-6': [H(79)],
  'morning-7': [H(87, 0, 10.47)],
  'morning-8': [H(80, 0, 20.63)],
  'morning-9': [H(81)],
  'morning-10': [H(83, 0, 7.57)],
  'morning-11': [H(86, 0, 8.73)],
  'morning-12': [H(78, 0, 11.61)],
  'morning-13': [H(90)],
  'morning-14': [H(94, 0, 11.53)],
  'morning-17': [H(84)],
  'morning-18': [H(88)],
  'morning-19': [H(89)],
  'morning-20': [H(85)],
  'morning-21': [H(97, 0, 5.57)],
  'morning-27': [H(95, 0, 9.39)],
  'morning-29': [H(93, 0, 10.35)],
  'morning-30': [H(91, 0, 2.83)],
  'morning-31': [H(96, 0, 4.15)],

  // ── المساء ──
  'evening-1': KURSI,
  'evening-2': [H(101)],
  'evening-3': IKHLAS,
  'evening-4': FALAQ,
  'evening-5': NAS,
  'evening-7': [H(79)],
  'evening-8': [H(87, 0, 10.47)],
  'evening-11': [H(83, 0, 7.57)],
  'evening-12': [H(86, 0, 8.73)],
  // Hisn 78 recites the morning form, then «وإذا أمسى قال:» and the evening form.
  'evening-13': [H(78, 15.08)],
  'evening-15': [H(94, 0, 11.53)],
  'evening-18': [H(84)],
  'evening-19': [H(88)],
  'evening-21': [H(85)],
  'evening-22': [H(97, 0, 5.57)],
  'evening-28': [H(92, 0, 10.99)],
  'evening-30': [H(91, 0, 2.83)],

  // ── masnun-dua gap fill (transcript-verified, see header) ──
  'evening-6': M(79), // أمسينا وأمسى الملك لله والحمد لله…
  'evening-20': M(83), // أمسينا وأمسى الملك لله رب العالمين…
  'evening-14': M(85), // أمسينا على فطرة الإسلام…
  'morning-15': M(708), // اللهم عافني في بدني…
  'evening-16': M(708),
  'morning-16': M(709), // اللهم إني أعوذ بك من الكفر والفقر…
  'evening-17': M(709),
  'morning-23': M(743), // اللهم إنا نعوذ بك من أن نشرك بك…
  'evening-24': M(743),
  'morning-25': M(12), // أستغفر الله العظيم الذي لا إله إلا هو…
  'evening-26': M(12),
  'morning-22': M(109), // اللهم صلّ وسلّم على نبينا محمد (card reworded to the recording)
  'evening-23': M(109),
  'morning-24': M(20), // الهم والحزن، بلفظ البخاري ٢٨٩٣ (card reworded to the recording)
  'evening-25': M(20),
  // Alafasy evening track, one recitation each (Whisper-checked windows; 323–334 s is the MORNING «ما أصبح بي»).
  'morning-26': TTS('dhikr-ya-rabb-lakal-hamd'), // يا رب لك الحمد كما ينبغي… (synthetic)
  'evening-27': TTS('dhikr-ya-rabb-lakal-hamd'),
  'morning-28': TTS('dhikr-anta-rabbi-tawakkaltu'), // اللهم أنت ربي… عليك توكلت (synthetic)
  'evening-29': TTS('dhikr-anta-rabbi-tawakkaltu'),
  'evening-9': [{ url: ALAFASY_MSA, from: 302.74, to: 323.18 }], // اللهم إني أمسيت أشهدك…
  'evening-10': [{ url: ALAFASY_MSA, from: 334.5, to: 346.55 }], // اللهم ما أمسى بي من نعمة…

  // ── بعد السلام من الصلاة (islambook/azkar/9) ──
  // Only clips already verified for the SAME words; the rest are read, not heard.
  'postPrayer-ib220': [H(92, 0, 10.99)],
  'postPrayer-ib80': [...IKHLAS, ...FALAQ, ...NAS],
  'postPrayer-ib81': KURSI,

  // ── النوم (islambook/azkar/11) ──
  'sleep-ib90': [H(103)],
  'sleep-ib91': [H(104, 0, 4.85)],
  'sleep-ib92': [H(105)],
  'sleep-ib96': [H(240, 5.7)],
  'sleep-ib222': [H(241)],
  'sleep-ib97': [...IKHLAS, ...FALAQ, ...NAS],
  'sleep-ib99': KURSI,
};

/** Dhikr ids that have a recitation (the test checks none is orphaned). */
export const MAPPED_ADHKAR_IDS = Object.keys(MAP);

/** Every distinct clip used by listening mode (the offline «الأذكار الصوتية» pack). */
export const ALL_ADHKAR_AUDIO_URLS: string[] = [...new Set(Object.values(MAP).flatMap((segs) => segs.map((s) => s.url)))];

/** The recitation for a dhikr (one or more segments played back to back), or null. */
export function adhkarAudio(itemId: string): AudioSeg[] | null {
  return MAP[itemId] ?? null;
}
