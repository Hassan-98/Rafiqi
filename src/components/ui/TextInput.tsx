import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, InputHTMLAttributes, SyntheticEvent, TextareaHTMLAttributes } from 'react';

/**
 * IME-safe controlled text inputs.
 *
 * Arabic (and other composed) text on Android WebView / Gboard is entered via
 * an IME *composition* session: the last word stays uncommitted until the user
 * inserts a separator or moves focus. If the field loses focus mid-composition
 * the final word must still be saved (e.g. "ورد الصلاة على النبي" → "ورد الصلاة على").
 *
 * Two rules, both in useImeValue:
 *  - the field renders LOCAL state that follows every keystroke, composing or
 *    not. Rendering the parent's (stale, mid-composition) value made React
 *    rewrite the DOM value, which throws the caret to the end — editing inside
 *    a word («تحصير» → «تحضير») was impossible, you could only type at the end;
 *  - the parent is told on each non-composing change, on compositionend and on
 *    blur, so whatever is visible is always saved. At those commit points the
 *    DOM value is re-read into local state too: a change that fired no input
 *    event (autofill, a native keyboard shim) is adopted instead of being
 *    rendered away on the next re-render.
 *
 * NB the Android-wide «caret jumps to the end / text vanishes on blur» bug was
 * NOT these components: it was capacitor.config.ts `captureInput: true`, which
 * replaced the WebView's keyboard connection (see the note there).
 * Pass `value` + `onValueChange` instead of `onChange`.
 */
type Field = HTMLInputElement | HTMLTextAreaElement;

export function useImeValue<E extends Field>(value: string, commit: (e: SyntheticEvent<E>) => void) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  const sent = useRef(value);
  // The parent changed the value itself (form reset, programmatic fill) → show it.
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setLocal(value);
    }
  }, [value]);
  const send = (e: SyntheticEvent<E>) => {
    const dom = e.currentTarget.value;
    sent.current = dom;
    setLocal(dom);
    commit(e);
  };
  return {
    value: local,
    onChange: (e: ChangeEvent<E>) => {
      setLocal(e.target.value);
      if (!composing.current) send(e);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: SyntheticEvent<E>) => {
      composing.current = false;
      send(e);
    },
    onBlur: (e: SyntheticEvent<E>) => {
      composing.current = false;
      send(e);
    },
  };
}

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;
interface TextInputProps extends BaseInputProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onValueChange, onBlur, onCompositionStart, onCompositionEnd, ...rest },
  ref,
) {
  const ime = useImeValue<HTMLInputElement>(value, (e) => onValueChange(e.currentTarget.value));
  return (
    <input
      ref={ref}
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
      {...rest}
    />
  );
});

type BaseTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;
interface TextAreaProps extends BaseTextareaProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { value, onValueChange, onBlur, onCompositionStart, onCompositionEnd, ...rest },
  ref,
) {
  const ime = useImeValue<HTMLTextAreaElement>(value, (e) => onValueChange(e.currentTarget.value));
  return (
    <textarea
      ref={ref}
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
      {...rest}
    />
  );
});
