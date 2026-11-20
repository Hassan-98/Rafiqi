import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * «المجموعات» — the pure parts (no network, no React): invite codes and the
 * share text, the khatma's 30-juz grid and picks, goal progress and deadlines,
 * the completion duas, and the Arabic wording of server errors.
 * Tested by scripts/groups.test.ts. The server side is
 * supabase/migrations/20261118120000_groups.sql.
 */

const ar = toArabicDigits;

// ── invite codes ───────────────────────────────────────────────────────────
// Codes are drawn on the server (from a CSPRNG, see `_group_code()`); the app
// only cleans up what people type or paste.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Typed text → the code as stored: Arabic-Indic digits, case, spaces and dashes forgiven. */
export function normalizeCode(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

export const isValidCode = (s: string) => CODE_RE.test(normalizeCode(s));

/** The code in anything pasted: the share message, a `?join=` path, or the code itself. */
export function extractCode(text: string): string | null {
  const q = /join=([A-Za-z0-9-]+)/.exec(text);
  if (q && isValidCode(q[1])) return normalizeCode(q[1]);
  if (isValidCode(text)) return normalizeCode(text);
  for (const tok of text.split(/[^A-Za-z0-9٠-٩]+/)) if (isValidCode(tok)) return normalizeCode(tok);
  return null;
}

export const APP_NAME = 'رفيقي';
export const joinPath = (code: string) => `/groups?join=${code}`;

export function inviteText(name: string, code: string): string {
  return [
    `انضمّ إلى مجموعتي «${name}» في تطبيق «${APP_NAME}»: نتعاون فيها على ختم القرآن والذكر، ونتنافس في الخير.`,
    `رمز الدعوة: ${code}`,
    `في التطبيق: المجموعات ← الانضمام برمز، أو افتح ${joinPath(code)}`,
  ].join('\n');
}

// ── people ─────────────────────────────────────────────────────────────────
export interface Person {
  /** null = hidden (or never set) → «مجهول», as on «الترتيب». */
  name: string | null;
  tag: number;
  isMe: boolean;
}
export const personName = (p: Person) => (p.isMe ? 'أنت' : (p.name ?? 'مجهول'));

/** Arabic counting: [one, two, 3–10, 11+] → «عضو واحد» / «عضوان» / «٥ أعضاء» / «١٢ عضواً». */
const counted = (n: number, [one, two, few, many]: readonly [string, string, string, string]) =>
  n === 1 ? one : n === 2 ? two : `${ar(n)} ${n >= 3 && n <= 10 ? few : many}`;
export const membersLabel = (n: number) => counted(n, ['عضو واحد', 'عضوان', 'أعضاء', 'عضواً']);
export const khatmasLabel = (n: number) => counted(n, ['ختمة واحدة', 'ختمتان', 'ختمات', 'ختمة']);
export const juzCount = (n: number) => counted(n, ['جزء واحد', 'جزآن', 'أجزاء', 'جزءاً']);

// ── «الختمة الجماعية» ──────────────────────────────────────────────────────
export interface KhatmaPart extends Person {
  juz: number;
  done: boolean;
}
export type JuzState = 'free' | 'taken' | 'mine' | 'done' | 'mineDone';
export interface JuzCell {
  juz: number;
  state: JuzState;
  part: KhatmaPart | null;
}

export function juzCells(parts: readonly KhatmaPart[]): JuzCell[] {
  const by = new Map(parts.map((p) => [p.juz, p]));
  return Array.from({ length: 30 }, (_, i) => {
    const part = by.get(i + 1) ?? null;
    const state: JuzState = !part ? 'free' : part.done ? (part.isMe ? 'mineDone' : 'done') : part.isMe ? 'mine' : 'taken';
    return { juz: i + 1, state, part };
  });
}

export function khatmaProgress(parts: readonly KhatmaPart[]) {
  const done = parts.filter((p) => p.done).length;
  return { done, reading: parts.length - done, free: 30 - parts.length, pct: Math.round((done / 30) * 100) };
}

/** Up to `n` free juz from `from` onwards (wrapping past 30): what «أقرأ n أجزاء» takes. */
export function pickFreeJuz(parts: readonly KhatmaPart[], from: number, n: number): number[] {
  const held = new Set(parts.map((p) => p.juz));
  const out: number[] = [];
  for (let i = 0; i < 30 && out.length < n; i++) {
    const j = ((from - 1 + i) % 30) + 1;
    if (!held.has(j)) out.push(j);
  }
  return out;
}

/** «الجزء ٣» / «الجزآن ٣ و٤» / «الأجزاء ٣، ٤، ٥». */
export function juzList(js: readonly number[]): string {
  const s = [...js].sort((a, b) => a - b).map(ar);
  if (s.length === 1) return `الجزء ${s[0]}`;
  if (s.length === 2) return `الجزآن ${s[0]} و${s[1]}`;
  return `الأجزاء ${s.join('، ')}`;
}

export interface Dua {
  text: string;
  source: string;
  quran?: boolean;
}

/**
 * There is no authentic dua fixed for completing the Qur'an, so the app shows
 * an authentic general one: a Qur'anic dua for accepting a deed, plus one that
 * fits the dedication (the departed / the sick) when it names one.
 */
export const ACCEPT_DUA: Dua = { text: 'رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ', source: 'البقرة: ١٢٧', quran: true };
const DEPARTED_DUA: Dua = {
  text: 'رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ وَلَا تَجْعَلْ فِي قُلُوبِنَا غِلًّا لِّلَّذِينَ آمَنُوا رَبَّنَا إِنَّكَ رَءُوفٌ رَّحِيمٌ',
  source: 'الحشر: ١٠',
  quran: true,
};
const HEALING_DUA: Dua = {
  text: 'اللَّهُمَّ رَبَّ النَّاسِ، مُذْهِبَ الْبَاسِ، اشْفِ أَنْتَ الشَّافِي، لَا شَافِيَ إِلَّا أَنْتَ، شِفَاءً لَا يُغَادِرُ سَقَمًا',
  source: 'رواه البخاري (رقية النبي ﷺ)',
};
/** The practice of a Companion at a khatm — a deed, not a fixed wording. */
export const ANAS_KHATM: Dua = { text: 'كان أنسٌ إذا ختم القرآنَ جمع ولدَه وأهلَ بيته فدعا لهم', source: 'رواه الدارمي' };

export function completionDuas(dedication: string | null | undefined): Dua[] {
  const d = dedication ?? '';
  const out = [ACCEPT_DUA];
  if (/روح|المرحوم|فقيد|ميت|موتى|أموات/.test(d)) out.push(DEPARTED_DUA);
  if (/شفاء|مريض|مرض/.test(d)) out.push(HEALING_DUA);
  return out;
}

// ── «هدف الذكر الجماعي» ────────────────────────────────────────────────────
export const MAX_ADD = 10_000;
export const MAX_TARGET = 10_000_000;

/** pct is floored, so 100 only shows once the goal is really reached. */
export function goalProgress(total: number, target: number) {
  const pct = target > 0 ? Math.min(100, Math.floor((total * 100) / target)) : 0;
  return { pct, left: Math.max(0, target - total), reached: target > 0 && total >= target };
}

/** Whole days from `today` to `deadline` ('yyyy-MM-dd', local): 0 = today, < 0 = passed. */
export function daysLeft(deadline: string, today: string): number {
  return Math.round((Date.parse(`${deadline}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
}

export function deadlineLabel(days: number): string {
  if (days < 0) return 'انتهى وقته';
  if (days === 0) return 'ينتهي اليوم';
  if (days === 1) return 'باقٍ يوم';
  if (days === 2) return 'باقٍ يومان';
  return `باقٍ ${ar(days)} ${days <= 10 ? 'أيام' : 'يوماً'}`;
}

/** This Friday (today when it is Friday) as 'yyyy-MM-dd'. */
export function comingFriday(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((5 - now.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 10000 → «١٠٬٠٠٠». */
export const num = (n: number) => ar(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');

// ── Home / reminders ───────────────────────────────────────────────────────
export interface GroupNudge {
  id: string;
  kind: 'juz' | 'goal';
  title: string;
  body: string;
  to: string;
}

/** What a group asks of me today: my unread juz, a shared goal ending today or tomorrow. */
export function groupNudges(
  groups: readonly { id: string; name: string; myJuzLeft?: number; goalDeadline?: string | null }[],
  today: string,
): GroupNudge[] {
  const out: GroupNudge[] = [];
  for (const g of groups) {
    const n = g.myJuzLeft ?? 0;
    if (n > 0) {
      out.push({
        id: `group.juz.${g.id}`,
        kind: 'juz',
        title: `جزؤك في ختمة «${g.name}»`,
        body: n === 1 ? 'لم تُعلّمه مقروءاً بعد، أتمّه ليكتمل ما تقاسمتموه' : `معك ${juzCount(n)} لم تُتمّها بعد`,
        to: `/groups?id=${g.id}&tab=khatma`,
      });
    }
    const d = g.goalDeadline ? daysLeft(g.goalDeadline, today) : -1;
    if (d === 0 || d === 1) {
      out.push({
        id: `group.goal.${g.id}`,
        kind: 'goal',
        title: `هدف الذكر في «${g.name}»`,
        body: d === 0 ? 'ينتهي اليوم، شارك ولو بقليل' : 'ينتهي غداً، شارك ولو بقليل',
        to: `/groups?id=${g.id}&tab=goal`,
      });
    }
  }
  return out;
}

/** Local day → how many group khatmas I read in completed that day (each counted once). */
export function myKhatmaDays(history: readonly { id: string; completedAt: string; mine?: boolean }[]): Record<string, number> {
  const out: Record<string, number> = {};
  const seen = new Set<string>();
  for (const h of history) {
    if (!h.mine || seen.has(h.id)) continue;
    seen.add(h.id);
    const d = new Date(h.completedAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ── server errors → Arabic (never raw text) ────────────────────────────────
const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);
/** The migration isn't applied yet → «قيد التجهيز». */
export const isMissing = (e: { code?: string } | null | undefined) => MISSING.has(e?.code ?? '');

const ERR: Record<string, string> = {
  not_signed_in: 'تعذّر التعرّف عليك، أعد المحاولة بعد قليل',
  not_member: 'لم تعد عضواً في هذه المجموعة',
  not_owner: 'هذا لمشرف المجموعة فقط',
  bad_code: 'رمز الدعوة غير صحيح، تأكّد منه أو اطلب رمزاً جديداً',
  group_full: 'اكتمل عدد أعضاء المجموعة (٥٠ عضواً)',
  too_many_groups: 'بلغت الحد الأعلى للمجموعات (٢٠ مجموعة)',
  bad_input: 'تحقّق مما أدخلته ثم أعد المحاولة',
  not_found: 'لم يعد موجوداً، حدّث الصفحة',
  khatma_open: 'في المجموعة ختمة جارية، أتمّوها أولاً',
  khatma_closed: 'اكتملت هذه الختمة',
  not_yours: 'هذا الجزء ليس معك',
  goal_open: 'في المجموعة هدف جارٍ لم يكتمل بعد',
  goal_closed: 'انتهى هذا الهدف',
};

export function errorText(e: { code?: string; message?: string } | null | undefined): string {
  return ERR[e?.message?.trim() ?? ''] ?? (e?.code === 'P0001' ? 'تعذّر إتمام الطلب' : 'تعذّر الاتصال، تحقّق من الإنترنت ثم أعد المحاولة');
}
