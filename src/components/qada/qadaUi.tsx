import { useState, type ReactNode } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toArabicDigits } from '@/utils/arabicFormat';

/** A verified text with its source, in the ornate face. */
export function Quote({ text, source, className = '' }: { text: string; source: string; className?: string }) {
  return (
    <figure className={['rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/25 px-4 py-3 text-center', className].join(' ')}>
      <blockquote className="font-ornate text-[17px] leading-loose text-text-primary dark:text-text-on-dark text-balance">{text}</blockquote>
      <figcaption className="mt-0.5 text-[11px] text-text-muted">{source}</figcaption>
    </figure>
  );
}

/** A careful fiqh note: muted, never alarming. */
export function FiqhNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
      {children}
    </p>
  );
}

/** − n + with 44px targets. Clamps on tap only (no typing here). */
export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const btn =
    'w-11 h-11 rounded-xl inline-flex items-center justify-center bg-cream-dark/60 dark:bg-white/[0.06] text-teal dark:text-teal-light disabled:opacity-35 active:scale-95 transition-transform duration-150 ease-out-soft';
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="أقل">
        <Minus size={18} />
      </button>
      <span className="min-w-8 text-center font-counter tabular-nums text-xl font-bold text-text-primary dark:text-text-on-dark" aria-live="polite">
        {toArabicDigits(value)}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="أكثر">
        <Plus size={18} />
      </button>
    </div>
  );
}

/** Trash icon that asks first. */
export function DeleteButton({ label, message, onConfirm }: { label: string; message: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className="w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
      >
        <Trash2 size={16} />
      </button>
      <ConfirmDialog
        open={open}
        title={label}
        message={message}
        confirmLabel="احذف"
        confirmVariant="danger"
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

/** A captioned group of pills (a <label> would forward taps to its first button). */
export function PillGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export const dateInputClass =
  'min-h-11 rounded-xl bg-cream-dark/55 dark:bg-dark-surface px-3 text-sm font-counter tabular-nums text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40';
