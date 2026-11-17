import React, { forwardRef, useId } from 'react';
import { useImeValue } from './TextInput';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  value: string;
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, className = '', id, value, onChange, onCompositionStart, onCompositionEnd, onBlur, ...props },
  ref,
) {
  // A STABLE id per instance. Using Math.random() here regenerated the id on
  // every render → the input's `id` mutated on each keystroke, which reset the
  // Android IME composing region and dropped the last (composing) word on blur.
  const reactId = useId();
  const inputId = id ?? reactId;

  // IME-safe: see useImeValue (the field shows local state so the caret stays
  // put mid-word; onChange fires with complete text on compositionend + blur
  // too — `target.value` exists on all three events, so consumers reading
  // `e.target.value` work unchanged).
  const ime = useImeValue<HTMLInputElement>(value, (e) =>
    onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>),
  );

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute start-3 text-text-muted pointer-events-none">{leftIcon}</span>
        )}

        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full rounded-[var(--radius-btn)] border px-4 py-2.5 text-base',
            'bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark',
            'placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent',
            'transition-colors duration-150',
            error
              ? 'border-danger'
              : 'border-teal/20 dark:border-dark-border hover:border-teal/40',
            leftIcon ? 'ps-10' : '',
            rightIcon ? 'pe-10' : '',
            className,
          ].join(' ')}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          value={ime.value}
          onChange={ime.onChange}
          onCompositionStart={(e) => {
            ime.onCompositionStart();
            onCompositionStart?.(e);
          }}
          onCompositionEnd={(e) => {
            ime.onCompositionEnd(e);
            onCompositionEnd?.(e);
          }}
          onBlur={(e) => {
            ime.onBlur(e);
            onBlur?.(e);
          }}
          {...props}
        />

        {rightIcon && (
          <span className="absolute end-3 text-text-muted pointer-events-none">{rightIcon}</span>
        )}
      </div>

      {error && (
        <p id={`${inputId}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});
