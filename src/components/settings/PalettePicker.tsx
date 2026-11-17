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
  brass: {
    light: { bg: '#f3eee3', card: '#ffffff', accent: '#8a6430', gold: '#b88a45' },
    dark: { bg: '#0b0f1a', card: '#172036', accent: '#c9a36a', gold: '#e3c58e' },
  },
  sage: {
    light: { bg: '#f4f1ea', card: '#ffffff', accent: '#56715a', gold: '#a9844a' },
    dark: { bg: '#141311', card: '#22211d', accent: '#93b096', gold: '#d2b27c' },
  },
};

export const PALETTE_OPTIONS: { id: AppPalette; label: string; hint: string }[] = [
  { id: 'emerald', label: 'زمرد', hint: 'زمرّد وذهب' },
  { id: 'brass', label: 'ليل ونحاس', hint: 'حبر الليل ونحاس دافئ' },
  { id: 'sage', label: 'رمل ومريمية', hint: 'حجر هادئ ومريمية' },
];

/**
 * Palette picker: three miniature screens (page · card · accent · gold star)
 * drawn in the current light/dark mode. `compact` drops the hint line (used
 * in onboarding).
 */
export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const palette = useSettingsStore((s) => s.palette);
  const setPalette = useSettingsStore((s) => s.setPalette);
  const mode = useSettingsStore((s) => (s.darkMode ? 'dark' : 'light'));

  return (
    <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="لوحة الألوان">
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
