import { hapticsService } from '@/services/HapticsService';
import type { Gender } from '@/store/settingsStore';

const OPTIONS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'رجل' },
  { id: 'female', label: 'امرأة' },
];

/** رجل / امرأة — tailors prayers (mosque, Jumu'ah / excused days) and adhkar wording. */
export function GenderPicker({ value, onChange }: { value: Gender | null; onChange: (g: Gender) => void }) {
  return (
    <div role="radiogroup" aria-label="الجنس" className="grid grid-cols-2 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => {
            void hapticsService.selection();
            onChange(o.id);
          }}
          className={[
            'min-h-10 rounded-xl text-sm font-bold transition-colors',
            value === o.id ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
