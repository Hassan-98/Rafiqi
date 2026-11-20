import { Check } from 'lucide-react';
import { Star8 } from '@/components/ui/Ornament';
import { useSettingsStore, type AppPalette } from '@/store/settingsStore';
import { hapticsService } from '@/services/HapticsService';

/**
 * Literal preview colours for each palette. Tokens can't be used here: the
 * palette tokens are scoped to `html[data-palette]`, so a live token would
 * paint every preview in the CURRENT palette. Keep in sync with index.css.
 */
const PREVIEW: Record<AppPalette, Record<'light' | 'dark', { bg: string; card: string; accent: string; gold: string }>> = {
  emerald: {
    light: { bg: '#f4f0e6', card: '#ffffff', accent: '#11725c', gold: '#b8923f' },
    dark: { bg: '#08120f', card: '#132520', accent: '#2a9d7f', gold: '#d4b26a' },
  },
  turquoise: {
    light: { bg: '#eef3f2', card: '#ffffff', accent: '#0c6f80', gold: '#b4863a' },
    dark: { bg: '#061318', card: '#10262f', accent: '#4cbccb', gold: '#e2b86f' },
  },
  lapis: {
    light: { bg: '#f2f1ec', card: '#ffffff', accent: '#274c96', gold: '#b08a3e' },
    dark: { bg: '#070c1a', card: '#121d37', accent: '#86a9ea', gold: '#dfc07f' },
  },
  dusk: {
    light: { bg: '#f4f1f2', card: '#ffffff', accent: '#6b4a83', gold: '#b8823a' },
    dark: { bg: '#100c15', card: '#1f1828', accent: '#c2a3dc', gold: '#e7b56b' },
  },
  clay: {
    light: { bg: '#f6f0eb', card: '#ffffff', accent: '#a24e42', gold: '#b0863f' },
    dark: { bg: '#150e0d', card: '#261b19', accent: '#d39d88', gold: '#dcb878' },
  },
  brass: {
    light: { bg: '#f3eee3', card: '#ffffff', accent: '#8a6430', gold: '#b88a45' },
    dark: { bg: '#0b0f1a', card: '#172036', accent: '#c9a36a', gold: '#e3c58e' },
  },
  sage: {
    light: { bg: '#f4f1ea', card: '#ffffff', accent: '#56715a', gold: '#a9844a' },
    dark: { bg: '#141311', card: '#22211d', accent: '#93b096', gold: '#d2b27c' },
  },
  ink: {
    light: { bg: '#f3f2ef', card: '#ffffff', accent: '#2c2f33', gold: '#a7884a' },
    dark: { bg: '#0d0e0f', card: '#1b1c1e', accent: '#c4c1ba', gold: '#cdb07a' },
  },
};

/** Ordered round the colour wheel (green → blue → violet → rose → amber), ink last. */
export const PALETTE_OPTIONS: { id: AppPalette; label: string; hint: string }[] = [
  { id: 'emerald', label: 'زمرد', hint: 'زمرّد وذهب' },
  { id: 'turquoise', label: 'فيروز وخزف', hint: 'فيروز البلاط وخزف أبيض' },
  { id: 'lapis', label: 'لازورد وذهب', hint: 'لازورد المصاحف وذهبها' },
  { id: 'dusk', label: 'بنفسج الغروب', hint: 'بنفسج خافت وكهرمان' },
  { id: 'clay', label: 'ورد وطين', hint: 'طين دافئ وورد هادئ' },
  { id: 'brass', label: 'ليل ونحاس', hint: 'حبر الليل ونحاس دافئ' },
  { id: 'sage', label: 'رمل ومريمية', hint: 'حجر هادئ ومريمية' },
  { id: 'ink', label: 'حبر وورق', hint: 'حبر هادئ ولمسة ذهب' },
];

/**
 * Palette picker: a miniature screen per palette (page · card · accent · gold
 * star) drawn in the current light/dark mode. `compact` drops the hint line
 * (used on «أنا» and in onboarding).
 */
export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const palette = useSettingsStore((s) => s.palette);
  const setPalette = useSettingsStore((s) => s.setPalette);
  const mode = useSettingsStore((s) => (s.darkMode ? 'dark' : 'light'));

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5" role="radiogroup" aria-label="لوحة الألوان">
      {PALETTE_OPTIONS.map((p) => {
        const on = palette === p.id;
        const c = PREVIEW[p.id][mode];
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (on) return;
              void hapticsService.selection();
              setPalette(p.id);
            }}
            className={[
              'group rounded-[var(--radius-inner)] p-2 text-start bg-white dark:bg-dark-card transition-shadow duration-200',
              on
                ? 'ring-2 ring-teal shadow-[var(--shadow-sm)]'
                : 'ring-1 ring-black/[0.05] dark:ring-white/[0.07] hover:ring-teal/30',
            ].join(' ')}
          >
            {/* Miniature screen */}
            <span
              className="relative block h-[4.5rem] rounded-xl overflow-hidden ring-1 ring-black/[0.06]"
              style={{ background: c.bg }}
              aria-hidden
            >
              <span
                className="absolute inset-x-2 top-2 h-6 rounded-lg"
                style={{ background: c.accent }}
              />
              <span className="absolute top-3.5 end-3.5" style={{ color: c.gold }}>
                <Star8 size={10} />
              </span>
              <span
                className="absolute inset-x-2 bottom-2 h-7 rounded-lg flex items-center gap-1 px-1.5"
                style={{ background: c.card }}
              >
                <span className="w-3.5 h-3.5 rounded-[5px]" style={{ background: c.accent, opacity: 0.25 }} />
                <span className="flex-1 h-1 rounded-full" style={{ background: c.gold, opacity: 0.55 }} />
              </span>
              {on ? (
                <span className="absolute top-1 start-1 w-5 h-5 rounded-full bg-white text-teal inline-flex items-center justify-center shadow-[var(--shadow-xs)]">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span
              className={[
                'block mt-2 text-xs font-bold truncate',
                on ? 'text-teal dark:text-teal-light' : 'text-text-primary dark:text-text-on-dark',
              ].join(' ')}
            >
              {p.label}
            </span>
            {!compact ? (
              <span className="block text-[10.5px] text-text-muted leading-snug truncate">{p.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
