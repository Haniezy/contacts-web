'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/actions';
import type { Locale } from '@/i18n/config';

// One button, like the theme switch: a click anywhere flips the language.
// It is named after the language it switches to.
export function LanguageSwitch() {
  const locale = useLocale() as Locale;
  const t = useTranslations('Preferences');
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);
  const [error, setError] = useState(false);
  const next: Locale = locale === 'fa' ? 'en' : 'fa';
  function change() {
    setError(false);
    startTransition(async () => {
      // The knob slides at once; it slides back if the change fails.
      setShown(next);
      try {
        await setLocale(next);
      } catch {
        setError(true);
      }
    });
  }
  return (
    <div>
      <button
        type="button"
        className={`language-switch is-${shown}`}
        lang={next}
        aria-label={next === 'en' ? 'English' : 'فارسی'}
        aria-busy={pending}
        disabled={pending}
        dir="ltr"
        onClick={change}
      >
        <span className="language-knob" aria-hidden="true" />
        <span
          className={`language-option${shown === 'en' ? ' is-active' : ''}`}
          lang="en"
          aria-hidden="true"
        >
          EN
        </span>
        <span
          className={`language-option${shown === 'fa' ? ' is-active' : ''}`}
          lang="fa"
          aria-hidden="true"
        >
          فارسی
        </span>
      </button>
      {error && (
        <p role="alert" className="text-sm text-ink2">
          {t('error')}
        </p>
      )}
    </div>
  );
}
