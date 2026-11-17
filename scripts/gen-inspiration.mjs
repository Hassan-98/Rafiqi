// Generate the bundled, offline «آية وحديث» corpus:
//   src/data/inspiration/hadith.json  and  src/data/inspiration/ayat.json
//
// Run:  node scripts/gen-inspiration.mjs
//
// SOURCES (verified 2026-09-27)
// • Hadith — fawazahmed0/hadith-api, released under The Unlicense (public
//   domain; https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/LICENSE):
//     https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{ara-nawawi,ara-qudsi,ara-bukhari,ara-muslim}.min.json
//   The diacritised editions (without the trailing "1") are used; the "…1"
//   variants strip hamzas (اخبرنا، عايشة) and read worse.
// • Qur'an — quran.com API v4, Uthmani script (the text is the Madinah
//   Mushaf, not copyrightable scripture; used verbatim — only the ۞ hizb mark is
//   dropped and each verse is followed by its number ﴿n﴾):
//     https://api.quran.com/api/v4/quran/verses/uthmani
//
// NOTHING RELIGIOUS IS TYPED BY HAND HERE. Ayat are chosen by VERSE KEY only;
// hadith texts come straight from the edition. The only transformations are
// removing bidi control marks + collapsing whitespace, and — for Bukhari and
// Muslim — keeping the Prophet's quoted words (the matn) instead of the full
// isnad chain. A matn is only taken when (a) the record has exactly ONE quoted
// segment, (b) the text right before it ends "…صلى الله عليه وسلم [قال|يقول]"
// so the quote is his speech, and (c) nothing but punctuation follows it
// (no dialogue / "ثم ذكر مثله" continuation). Nawawi 40 and Qudsi 40 are kept
// whole (they already carry narrator + source line).
//
// GRADES: Bukhari and Muslim → sahih (by inclusion in the two Sahihs).
// Nawawi / Qudsi → read from the collection's own source line: "حسن" → hasan,
// "صحيح" or a Bukhari/Muslim attribution → sahih, otherwise no grade (the UI
// hides the badge; we never guess).
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'data', 'inspiration');
const HADITH_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const QURAN_URL = 'https://api.quran.com/api/v4/quran/verses/uthmani';
const MAX_HADITH = 900;
const MAX_BYTES = 350 * 1024;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// The Nawawi/Qudsi editions separate the text from its source line with a
// literal "<br>" — keep that break as "\n" (rendered with pre-line).
const clean = (s) =>
  s
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .split(/<br\s*\/?>/i)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
/** Tag-matching form: no harakat/Quranic marks/tatweel, unified alifs, ى→ي (ة kept so أمه ≠ أمة). */
const norm = (s) =>
  s
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/صلي الله عليه وسلم/g, ' ');

// ─── Tags by keyword rule (matched on norm(text)) ──────────────────────────
const TAG_RULES = [
  ['صلاة', /الصلاة|صلاة|المسجد|المساجد|يسجد|السجود|ركع|الوضوء|توضا|الاذان|المؤذن|المؤذن/],
  ['قيام', /قيام الليل|قام الليل|من الليل|تهجد|ثلث الليل|ينزل ربنا|يقوم الليل/],
  ['صيام', /صوم|صيام|صام|الصائم|يصوم|صائم|السحور|تسحروا|افطر|الفطر/],
  ['رمضان', /رمضان/],
  ['ليلة القدر', /ليلة القدر|العشر الاواخر|اعتكف/],
  ['جمعة', /الجمعة/],
  ['صدقة', /صدقة|تصدق|الصدقة|انفق|ينفق|الزكاة|زكاة|المنفق/],
  ['ذكر', /سبحان الله|الحمد لله|لا اله الا الله|الله اكبر|ذكر الله|يذكر الله|ذكرني|الذاكرين|اذكروا الله|فاذكروني|سبحان/],
  ['دعاء', /الدعاء|دعوة|ادعو|يدعو|اللهم|سالني|يسالني|فاستجيب|استجب|دعاني/],
  ['قرآن', /القران|يقرا|اقرءوا|اقرا|سورة|تلا|الكتاب/],
  ['أخلاق', /حسن الخلق|اخلاق|خلقا|الحياء|الغضب|تغضب|الرفق|رفيق|الجار|جاره|لاخيه|المسلم اخو|تبسم|الظلم|تحاسدوا|الحسد|الغيبة|تواضع|الكذب|الصدق|يرحم|الكبر|العفو|يعفو/],
  ['والدين', /والديه|الوالدين|والدي|بر الوالدين|امك|ابيك|ابويه|الوالد|بوالديه|بالوالدين/],
  ['توبة', /التوبة|توبة|تاب الله|تاب عليه|يتوب|توبوا|تائب|التواب|استغفر|الاستغفار|اغفر|مغفرة|غفر له|غفر الله|يغفر|الغفور|غفار/],
  ['صبر', /صبر|الصابر|يصبر|اصبر|مصيبة|المصيبة|البلاء|ابتلي|الصبر/],
  ['علم', /العلم|علما|يتعلم|تعلموا|يفقهه|الفقه|العلماء|فقيه/],
  ['حج', /الحج|حجة|حجه|عمرة|العمرة|عرفة|عرفات|البيت الحرام|الكعبة|لبيك|المشعر|مناسك|بالحج/],
  ['عشر ذي الحجة', /ذي الحجة|عرفة|عرفات|الاضحي|اضحية|يوم النحر|ايام العشر|التشريق|ايام معلومات|ايام معدودات|وليال عشر|وانحر/],
  ['عاشوراء', /عاشوراء|شهر الله المحرم|موسي/],
  ['الآخرة', /الجنة|القيامة|الاخرة|الفردوس|الحساب|الميزان/],
  ['رحمة', /رحمة|الرحمن|رحمته|الرحيم|ارحم|يرحم/],
  ['إخلاص', /النيات|نية|بالنية|الرياء|اخلاص|مخلصين|وجه الله|وجه ربه/],
  ['الصلاة على النبي', /صلي علي|الصلاة علي|صلوا عليه|يصلون علي النبي/],
  ['شكر', /شكر|يشكر|الشاكرين|اشكر|الشكور/],
  ['توكل', /توكل|يتوكل|توكلت|حسبي الله|حسبنا الله|وكيلا|فهو حسبه/],
  ['أمل', /لا تقنطوا|لا تياسوا|يسرا|اليسر|روح الله|فرجا|مخرجا/],
  ['هجرة', /هجرة|هجرته|هاجر|يهاجر|المهاجر/],
];
const tagsFor = (text, extra = []) => {
  const n = norm(text);
  const out = new Set(extra);
  for (const [tag, re] of TAG_RULES) if (re.test(n)) out.add(tag);
  return [...out];
};

// ─── Hadith ────────────────────────────────────────────────────────────────
const BOOK_AR = {
  'ara-nawawi': 'الأربعون النووية',
  'ara-qudsi': 'الأحاديث القدسية',
  'ara-bukhari': 'صحيح البخاري',
  'ara-muslim': 'صحيح مسلم',
};
// Sections (reference.book) whose matn suits a standalone reminder.
const SECTIONS = {
  'ara-bukhari': new Set([2, 3, 8, 9, 10, 11, 13, 14, 19, 23, 24, 25, 26, 30, 31, 32, 33, 46, 51, 53, 66, 69, 70, 75, 78, 79, 80, 81, 82, 96, 97]),
  'ara-muslim': new Set([1, 4, 5, 6, 7, 8, 12, 13, 14, 15, 38, 39, 40, 45, 46, 47, 48, 49, 50, 53, 55]),
};
const REFLECTIVE = {
  'ara-bukhari': new Set([78, 80, 81]),
  'ara-muslim': new Set([38, 45, 48, 49, 55]),
};
// Out of context a random notification is the wrong place for these topics.
const BLOCK = /النساء|الشوم|الشؤم|رواية|\s[-\u0640]\s|فرج|الحيض|حائض|جماع|الزنا|زني|اقتل|قتل|السيف|الكلب|الخنزير|الخمر|اليهود|النصاري|المشركين|الكفار|يعذب|اوقال|او قال|نحوه|بمثله|مثله/;

function gradeFromSourceLine(text) {
  const tail = norm(text).slice(-160);
  if (/حسن/.test(tail)) return 'hasan';
  if (/صحيح|البخاري|مسلم/.test(tail)) return 'sahih';
  return undefined;
}

function extractMatn(text) {
  const parts = clean(text).split('"');
  if (parts.length !== 3) return null;
  // norm() blanks the honorific, so test a harakat-stripped tail instead.
  const lead = parts[0].replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').trim();
  if (!/صلى الله عليه وسلم\s*(قال|يقول|انه قال)?\s*[:،,]?$/.test(lead)) return null;
  if (norm(parts[2]).replace(/[\s.،:؛]/g, '').length > 0) return null;
  const matn = parts[1].trim().replace(/[\s.،]+$/, '');
  return matn;
}

async function buildHadith() {
  const whole = [];
  const picked = [];
  for (const ed of ['ara-nawawi', 'ara-qudsi']) {
    const data = await getJson(`${HADITH_BASE}/${ed}.min.json`);
    for (const h of data.hadiths) {
      const text = arDigits(clean(h.text)); // "[رقم:4102]" → Arabic-Indic like the rest of the app
      if (text.length < 25) continue;
      const grade = gradeFromSourceLine(text);
      whole.push({
        id: `${ed}_${h.hadithnumber}`,
        text,
        book: BOOK_AR[ed],
        number: h.hadithnumber,
        ...(grade ? { grade } : {}),
        tags: tagsFor(text, ed === 'ara-qudsi' ? ['قدسي'] : []),
      });
    }
  }
  const seen = new Set();
  const key = (t) => norm(t).replace(/[^ء-ي]/g, '');
  const candidates = [];
  for (const ed of ['ara-bukhari', 'ara-muslim']) {
    const data = await getJson(`${HADITH_BASE}/${ed}.min.json`);
    for (const h of data.hadiths) {
      if (!SECTIONS[ed].has(h.reference?.book)) continue;
      const matn = extractMatn(h.text ?? '');
      if (!matn || matn.length < 25 || matn.length > 260) continue;
      if (BLOCK.test(norm(matn))) continue;
      // Starts mid-story ("ثم فتر عني الوحي…") → not self-contained.
      if (/^(ثم|فقال|قال|قالت|فلما|حتي|فاذا|بينا|بينما) /.test(norm(matn))) continue;
      const k = key(matn);
      if (seen.has(k)) continue;
      seen.add(k);
      // Muslim's `hadithnumber` is a running index; the familiar (Fuad
      // Abdul-Baqi) number is the integer part of `arabicnumber`.
      const num = ed === 'ara-muslim' ? Math.floor(Number(h.arabicnumber)) || h.hadithnumber : h.hadithnumber;
      const tags = tagsFor(matn);
      // Untagged matn usually needs its story for context — keep it only from
      // the inherently reflective books (manners, invocations, heart-softeners).
      if (tags.length === 0 && !REFLECTIVE[ed].has(h.reference?.book)) continue;
      candidates.push({ id: `${ed}_${h.hadithnumber}`, text: matn, book: BOOK_AR[ed], number: num, grade: 'sahih', tags });
    }
  }
  // Tagged + mid-length first; stable tie-break keeps the output reproducible.
  const score = (h) => h.tags.length * 2 + (h.text.length >= 40 && h.text.length <= 200 ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a) || a.text.length - b.text.length || a.id.localeCompare(b.id));
  const out = [...whole];
  let bytes = Buffer.byteLength(JSON.stringify(out));
  for (const c of candidates) {
    if (out.length >= MAX_HADITH) break;
    const b = Buffer.byteLength(JSON.stringify(c)) + 1;
    if (bytes + b > MAX_BYTES) break;
    out.push(c);
    picked.push(c);
    bytes += b;
  }
  console.log(`hadith: ${whole.length} whole (Nawawi+Qudsi) + ${picked.length} matn of ${candidates.length} candidates = ${out.length}, ${(bytes / 1024).toFixed(0)}KB`);
  return out;
}

// ─── Ayat (chosen by verse key; "s:a" or "s:a-b") ──────────────────────────
const AYAT_THEMES = {
  رحمة: ['39:53', '7:156', '6:54', '12:87', '15:56', '2:218', '7:56', '40:7', '21:107', '4:110', '42:25', '15:49', '35:2', '6:12', '18:58', '4:26-28'],
  توبة: ['66:8', '11:3', '11:52', '71:10-12', '3:135-136', '25:70-71', '20:82', '8:33', '110:1-3', '47:19', '5:74', '4:17', '39:54', '7:23', '9:104', '2:37', '3:133'],
  صبر: ['2:153', '2:155-157', '3:200', '16:127', '39:10', '11:115', '12:18', '70:5', '31:17', '42:43', '103:1-3', '8:46', '2:45', '52:48', '40:55', '3:186', '16:96', '13:24', '76:12', '2:177', '46:35'],
  أمل: ['94:1-8', '93:1-11', '65:7', '2:286', '2:216', '12:64', '3:139', '12:86', '21:88', '6:17', '10:107', '64:11', '9:51', '2:214', '29:2-3', '57:22-23', '13:11', '28:7', '3:173', '12:21', '30:47', '14:7', '24:55', '47:7', '40:44', '3:160', '8:30'],
  توكل: ['65:3', '3:159', '8:2', '11:88', '14:12', '25:58', '33:3', '39:36', '9:129', '64:13', '26:217-220', '11:6', '51:22', '51:58', '29:60'],
  شكر: ['2:152', '2:172', '16:18', '31:12', '34:13', '27:19', '39:66', '4:147', '16:114', '93:11', '14:34', '16:53', '7:10', '67:23'],
  دعاء: ['2:186', '40:60', '7:55', '27:62', '2:201', '2:250', '2:286', '3:8-9', '3:16', '3:147', '3:191-194', '14:40-41', '17:80', '18:10', '20:25-28', '21:83', '21:87', '21:89', '23:109', '23:118', '25:65-66', '25:74', '26:83-85', '28:24', '59:10', '3:53', '2:127-128', '12:101', '7:89', '10:85-86', '3:38', '19:4', '17:24', '71:28', '23:97-98', '66:11', '7:126', '44:12'],
  ذكر: ['13:28', '33:41-42', '29:45', '63:9', '7:205', '62:10', '20:14', '18:24', '76:25-26', '73:8', '57:16', '24:36-37', '8:45', '17:44', '33:35', '2:200', '50:39-40', '15:97-99', '30:17-18', '48:9'],
  توحيد: ['112:1-4', '2:255', '59:22-24', '57:1-6', '6:103', '42:11', '24:35', '3:190-191', '67:1-4', '55:26-27', '28:88', '20:8', '7:180', '17:110-111', '6:162-163', '51:56', '1:1-7', '6:59', '3:26-27', '2:163-164', '40:65', '64:1-4', '50:16', '57:4', '2:115', '58:7', '87:1-5'],
  صلاة: ['2:238-239', '4:103', '11:114', '17:78', '20:132', '23:1-11', '29:45', '14:31', '2:43', '2:110', '70:22-23', '70:34-35', '107:4-5', '19:31', '98:5', '62:9', '5:55'],
  قيام: ['17:79', '32:16-17', '51:15-18', '25:64', '39:9', '73:1-6', '73:20', '76:26', '96:19', '52:49', '3:17', '3:113'],
  صيام: ['2:183-185', '33:35'],
  رمضان: ['2:185', '97:1-5', '44:3-6', '2:186'],
  قرآن: ['17:9', '17:82', '38:29', '47:24', '54:17', '73:4', '35:29-30', '10:57-58', '59:21', '2:2', '16:98', '7:204', '39:23', '15:9', '18:1-2', '17:88', '20:2-4', '12:2', '41:44', '4:82', '25:32', '29:49', '56:77-80', '2:121', '50:45', '6:155', '14:1', '36:69-70'],
  جمعة: ['62:9-11', '33:56', '18:1-10', '18:13-14', '18:23-24', '18:27-28', '18:39', '18:44-46', '18:49', '18:103-110', '18:65-66'],
  حج: ['2:196-203', '3:96-97', '22:26-29', '22:32-37', '2:125-128', '2:158', '5:97', '14:37', '48:27'],
  'عشر ذي الحجة': ['89:1-5', '22:28', '2:203', '108:1-3', '37:102-111', '22:36-37', '6:162-163'],
  عاشوراء: ['26:61-68', '2:49-50', '20:77-80', '10:90-92', '28:5-7', '20:25-36', '20:46', '44:30-31', '7:137', '28:21-24'],
  هجرة: ['9:40', '9:36', '4:100', '3:190', '24:44', '59:18', '8:30', '16:41-42', '9:20-22', '2:218', '28:85', '17:80'],
  عيد: ['2:185', '87:14-15', '10:58', '22:36-37', '108:1-3', '5:114'],
  والدين: ['17:23-24', '31:14-15', '46:15-17', '29:8', '4:36', '6:151', '2:83', '19:14', '19:32', '14:41', '71:28', '27:19', '2:215'],
  علم: ['20:114', '58:11', '39:9', '35:28', '96:1-5', '3:18', '16:43', '2:269', '29:43', '18:65-66', '2:32', '17:36', '9:122', '17:85', '4:113'],
  أخلاق: ['3:134', '41:34-35', '16:90', '49:10-13', '31:18-19', '17:37', '25:63', '2:83', '24:22', '42:37-40', '5:8', '4:135', '68:4', '7:199', '17:53', '33:70-71', '61:2-3', '9:119', '4:58', '23:8', '16:128', '2:263', '4:86', '25:72', '28:55', '3:104', '3:110', '5:2', '6:152', '17:26-29', '17:34-35', '31:13', '31:16', '49:6', '60:8', '83:1-3', '104:1'],
  صدقة: ['2:261-262', '2:245', '2:267', '2:271', '2:274', '3:92', '57:7', '57:11', '57:18', '64:16', '34:39', '76:8-9', '63:10', '92:5-7', '90:11-16', '2:195', '2:272-273', '9:103', '2:276-277', '30:39', '107:1-3'],
  الآخرة: ['3:185', '3:102', '59:18-19', '65:2', '8:29', '7:96', '29:69', '16:97', '18:30', '99:1-8', '57:20-21', '3:14-15', '87:16-17', '28:77', '29:64', '6:32', '40:39', '17:19', '32:17', '10:62-64', '41:30-32', '46:13', '89:27-30', '55:46', '55:60', '36:58', '3:30', '2:281', '23:115', '50:19', '63:11', '102:1-8', '101:6-11', '82:6', '84:6', '47:15'],
};

function surahNames() {
  const src = readFileSync(join(root, 'src', 'data', 'surahs.ts'), 'utf8');
  const map = {};
  for (const m of src.matchAll(/number:\s*(\d+),\s*nameArabic:\s*'([^']+)'/g)) map[m[1]] = m[2];
  return map;
}

/** A range spec becomes consecutive passages of ≤ MAX_PASSAGE chars, so a
 *  continuation verse ("إنه هو السميع العليم") never stands alone. */
const MAX_PASSAGE = 360;
const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

async function buildAyat() {
  const { verses } = await getJson(QURAN_URL);
  // "۞" (rub' al-hizb) is a Mushaf division mark, not part of the verse — dropped.
  const byKey = new Map(verses.map((v) => [v.verse_key, v.text_uthmani.replace(/\u06DE/g, '').replace(/\s+/g, ' ').trim()]));
  const verse = (s, v) => {
    const t = byKey.get(`${s}:${v}`);
    if (!t) throw new Error(`unknown verse key ${s}:${v}`);
    return t;
  };
  const names = surahNames();
  const passages = new Map(); // key → { s, a, b, tags }, insertion order = curated order
  const add = (s, a, b, tag) => {
    const key = a === b ? `${s}:${a}` : `${s}:${a}-${b}`;
    if (!passages.has(key)) passages.set(key, { s, a, b, tags: new Set() });
    passages.get(key).tags.add(tag);
  };
  for (const [tag, specs] of Object.entries(AYAT_THEMES)) {
    for (const spec of specs) {
      const [s, range] = spec.split(':');
      const [a, b = a] = range.split('-').map(Number);
      let from = a;
      let len = 0;
      for (let v = a; v <= b; v++) {
        const l = verse(s, v).length;
        if (v > from && len + l > MAX_PASSAGE) {
          add(s, from, v - 1, tag);
          from = v;
          len = 0;
        }
        len += l;
      }
      add(s, from, b, tag);
    }
  }
  const out = [...passages].map(([key, p]) => {
    // Verse text verbatim, each followed by its number: "… ﴿٥﴾ … ﴿٦﴾".
    const text = Array.from({ length: p.b - p.a + 1 }, (_, i) => `${verse(p.s, p.a + i)} ﴿${arDigits(p.a + i)}﴾`).join(' ');
    return { key, text, surah: names[p.s], ayah: p.a, ...(p.b !== p.a ? { ayahEnd: p.b } : {}), tags: tagsFor(text, [...p.tags]) };
  });
  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`ayat: ${out.length} items (${out.filter((x) => x.ayahEnd).length} passages), ${(bytes / 1024).toFixed(0)}KB`);
  return out;
}

mkdirSync(outDir, { recursive: true });
const [hadith, ayat] = await Promise.all([buildHadith(), buildAyat()]);
writeFileSync(join(outDir, 'hadith.json'), JSON.stringify(hadith));
writeFileSync(join(outDir, 'ayat.json'), JSON.stringify(ayat));
const tagCount = (list) => {
  const c = {};
  for (const x of list) for (const t of x.tags) c[t] = (c[t] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' ');
};
console.log('hadith tags', tagCount(hadith));
console.log('ayat tags', tagCount(ayat));
