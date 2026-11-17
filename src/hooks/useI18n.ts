import { useCallback } from 'react';
import { t as translate } from '@/data/translations';

/**
 * Arabic-only i18n hook.
 *
 * The app is locked to Arabic / RTL; this hook exists as a small seam so
 * components don't import `translations.ts` directly. If multiple languages
 * are reintroduced later, only this file needs to add the reactive `lang`.
 */
export interface UseI18nResult {
  t: (key: string) => string;
  lang: 'ar';
  dir: 'rtl';
  isRTL: true;
}

export function useI18n(): UseI18nResult {
  const t = useCallback((key: string): string => translate(key), []);

  return {
    t,
    lang: 'ar',
    dir: 'rtl',
    isRTL: true,
  };
}
