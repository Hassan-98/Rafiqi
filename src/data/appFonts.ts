/**
 * «خط التطبيق» — every UI font the user can pick. All are bundled (Fontsource,
 * offline) but loaded LAZILY: each `load()` is a dynamic CSS import that Vite
 * splits into its own chunk, so only the chosen font (plus the ones previewed
 * in the picker) is ever fetched. Quranic text keeps its own fonts
 * (--font-quran / page fonts) and ornamental titles keep Amiri (--font-ornate).
 *
 * Default: Alan Sans (owner's choice; it has an Arabic subset).
 */

export type AppFontId =
  | 'alan-sans'
  | 'vazirmatn'
  | 'cairo'
  | 'tajawal'
  | 'almarai'
  | 'ibm-plex'
  | 'noto-sans'
  | 'readex'
  | 'rubik'
  | 'alexandria'
  | 'mada'
  | 'zain'
  | 'baloo'
  | 'noto-kufi'
  | 'kufam'
  | 'reem-kufi'
  | 'changa'
  | 'el-messiri'
  | 'noto-naskh'
  | 'amiri'
  | 'scheherazade'
  | 'lateef'
  | 'markazi'
  | 'harmattan';

export type AppFontGroup = 'modern' | 'kufi' | 'naskh';

export interface AppFont {
  id: AppFontId;
  /** Arabic display name. */
  label: string;
  /** CSS font-family as registered by the Fontsource package. */
  family: string;
  group: AppFontGroup;
  /** Short character note shown in the picker. */
  hint: string;
  load: () => Promise<unknown>;
}

export const DEFAULT_APP_FONT: AppFontId = 'alan-sans';

export const APP_FONT_GROUPS: { id: AppFontGroup; label: string }[] = [
  { id: 'modern', label: 'عصرية' },
  { id: 'kufi', label: 'كوفية' },
  { id: 'naskh', label: 'نسخ وتقليدية' },
];

// Static (non-variable) packages ship one CSS file per weight; the UI uses
// 400/500/700 (600/800 resolve to the nearest loaded weight).
const w = (a: () => Promise<unknown>, b: () => Promise<unknown>, c: () => Promise<unknown>) => () =>
  Promise.all([a(), b(), c()]);

export const APP_FONTS: AppFont[] = [
  // ── عصرية ─────────────────────────────────────────────────
  { id: 'alan-sans', label: 'آلان سانس', family: 'Alan Sans Variable', group: 'modern', hint: 'الافتراضي · هندسي أنيق', load: () => import('@fontsource-variable/alan-sans') },
  { id: 'vazirmatn', label: 'وزير متن', family: 'Vazirmatn Variable', group: 'modern', hint: 'واضح ومتوازن', load: () => import('@fontsource-variable/vazirmatn') },
  { id: 'cairo', label: 'القاهرة', family: 'Cairo Variable', group: 'modern', hint: 'عريض ومقروء', load: () => import('@fontsource-variable/cairo') },
  { id: 'tajawal', label: 'تجوّل', family: 'Tajawal', group: 'modern', hint: 'خفيف ونظيف', load: w(() => import('@fontsource/tajawal/400.css'), () => import('@fontsource/tajawal/500.css'), () => import('@fontsource/tajawal/700.css')) },
  { id: 'almarai', label: 'المراعي', family: 'Almarai', group: 'modern', hint: 'بسيط للشاشات', load: w(() => import('@fontsource/almarai/300.css'), () => import('@fontsource/almarai/400.css'), () => import('@fontsource/almarai/700.css')) },
  { id: 'ibm-plex', label: 'بلكس العربي', family: 'IBM Plex Sans Arabic', group: 'modern', hint: 'مهني ودقيق', load: w(() => import('@fontsource/ibm-plex-sans-arabic/400.css'), () => import('@fontsource/ibm-plex-sans-arabic/500.css'), () => import('@fontsource/ibm-plex-sans-arabic/700.css')) },
  { id: 'noto-sans', label: 'نوتو سانس', family: 'Noto Sans Arabic Variable', group: 'modern', hint: 'محايد وشامل', load: () => import('@fontsource-variable/noto-sans-arabic') },
  { id: 'readex', label: 'ريدكس', family: 'Readex Pro Variable', group: 'modern', hint: 'مريح للقراءة الطويلة', load: () => import('@fontsource-variable/readex-pro') },
  { id: 'rubik', label: 'روبيك', family: 'Rubik Variable', group: 'modern', hint: 'حواف ناعمة', load: () => import('@fontsource-variable/rubik') },
  { id: 'alexandria', label: 'الإسكندرية', family: 'Alexandria Variable', group: 'modern', hint: 'عصري واسع', load: () => import('@fontsource-variable/alexandria') },
  { id: 'mada', label: 'مدى', family: 'Mada Variable', group: 'modern', hint: 'رشيق', load: () => import('@fontsource-variable/mada') },
  { id: 'zain', label: 'زين', family: 'Zain', group: 'modern', hint: 'ودود', load: w(() => import('@fontsource/zain/400.css'), () => import('@fontsource/zain/700.css'), () => import('@fontsource/zain/800.css')) },
  { id: 'baloo', label: 'بالو بهيجان', family: 'Baloo Bhaijaan 2 Variable', group: 'modern', hint: 'مستدير لطيف', load: () => import('@fontsource-variable/baloo-bhaijaan-2') },
  // ── كوفية ─────────────────────────────────────────────────
  { id: 'noto-kufi', label: 'نوتو كوفي', family: 'Noto Kufi Arabic Variable', group: 'kufi', hint: 'كوفي متزن', load: () => import('@fontsource-variable/noto-kufi-arabic') },
  { id: 'kufam', label: 'كوفام', family: 'Kufam Variable', group: 'kufi', hint: 'كوفي معاصر', load: () => import('@fontsource-variable/kufam') },
  { id: 'reem-kufi', label: 'ريم كوفي', family: 'Reem Kufi Variable', group: 'kufi', hint: 'كوفي هندسي', load: () => import('@fontsource-variable/reem-kufi') },
  { id: 'changa', label: 'تشانغا', family: 'Changa Variable', group: 'kufi', hint: 'كوفي مضغوط', load: () => import('@fontsource-variable/changa') },
  { id: 'el-messiri', label: 'المسيري', family: 'El Messiri Variable', group: 'kufi', hint: 'بطابع مخطوط', load: () => import('@fontsource-variable/el-messiri') },
  // ── نسخ وتقليدية ──────────────────────────────────────────
  { id: 'noto-naskh', label: 'نوتو نسخ', family: 'Noto Naskh Arabic Variable', group: 'naskh', hint: 'نسخ واضح', load: () => import('@fontsource-variable/noto-naskh-arabic') },
  { id: 'amiri', label: 'أميري', family: 'Amiri', group: 'naskh', hint: 'نسخ كلاسيكي', load: () => Promise.resolve() /* bundled in main.tsx */ },
  { id: 'scheherazade', label: 'شهرزاد', family: 'Scheherazade New', group: 'naskh', hint: 'نسخ تراثي', load: w(() => import('@fontsource/scheherazade-new/400.css'), () => import('@fontsource/scheherazade-new/500.css'), () => import('@fontsource/scheherazade-new/700.css')) },
  { id: 'lateef', label: 'لطيف', family: 'Lateef', group: 'naskh', hint: 'نسخ رقيق', load: w(() => import('@fontsource/lateef/400.css'), () => import('@fontsource/lateef/500.css'), () => import('@fontsource/lateef/700.css')) },
  { id: 'markazi', label: 'مركزي', family: 'Markazi Text Variable', group: 'naskh', hint: 'نصّي صحفي', load: () => import('@fontsource-variable/markazi-text') },
  { id: 'harmattan', label: 'هرمتان', family: 'Harmattan', group: 'naskh', hint: 'نسخ مبسّط', load: w(() => import('@fontsource/harmattan/400.css'), () => import('@fontsource/harmattan/500.css'), () => import('@fontsource/harmattan/700.css')) },
];

export function appFontById(id: string | undefined): AppFont {
  return APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];
}

/** Font-family stack for a UI font (Vazirmatn stays as the safety net). */
export function fontStack(font: AppFont): string {
  return `"${font.family}", "Vazirmatn", system-ui, sans-serif`;
}

/** Load a font (idempotent) and make it the app's UI + heading + number font. */
export async function applyAppFont(id: string | undefined): Promise<void> {
  const font = appFontById(id);
  try {
    await font.load();
  } catch {
    return; // keep the current font rather than flash a fallback
  }
  const root = document.documentElement.style;
  const stack = fontStack(font);
  root.setProperty('--font-arabic', stack);
  root.setProperty('--font-display', stack);
  root.setProperty('--font-counter', stack);
}
