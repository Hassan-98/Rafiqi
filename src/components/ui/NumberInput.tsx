import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/** Number from user text, accepting Arabic-Indic / Persian digits and «٫»; NaN when empty or invalid. */
export function parseNumber(text: string): number {
  const t = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٫،,]/g, '.');
  return t === '' ? NaN : Number(t);
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
};

/**
 * A number field you can clear and retype. Clamping on every keystroke (the old
 * `Math.max(1, Number(v) || 1)`) rewrote the field under the caret: deleting the
 * last digit snapped straight back to the minimum, so a new value could never be
 * typed. This keeps the raw text while editing, reports in-range numbers as they
 * are typed, and clamps (or restores the last value) on blur.
 */
export function NumberInput({ value, onValueChange, min, max, onFocus, onBlur, ...rest }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      type="text"
      inputMode="numeric"
      {...rest}
      value={text}
      onFocus={(e) => {
        editing.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseNumber(t);
        if (Number.isFinite(n) && n === clamp(n)) onValueChange(n);
      }}
      onBlur={(e) => {
        editing.current = false;
        const n = parseNumber(e.currentTarget.value);
        const next = Number.isFinite(n) ? clamp(n) : value;
        setText(String(next));
        if (next !== value) onValueChange(next);
        onBlur?.(e);
      }}
    />
  );
}
