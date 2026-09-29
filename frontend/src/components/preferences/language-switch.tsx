'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/actions';
import type { Locale } from '@/i18n/config';

export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations('Preferences');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  function change(value: Locale) {
    if (value === locale) return;
    setError(false);
    startTransition(async () => {
      try {
        await setLocale(value);
      } catch {
        setError(true);
      }
    });
  }
  return (
    <div>
      <div
        className="language-switch"
        role="group"
        aria-label={t('language')}
        aria-busy={pending}
        dir="ltr"
      >
        <button
          type="button"
          lang="en"
          aria-label="English"
          aria-pressed={locale === 'en'}
          disabled={pending}
          onClick={() => change('en')}
        >
          EN
        </button>
        <button
          type="button"
          lang="fa"
          aria-label="فارسی"
          aria-pressed={locale === 'fa'}
          disabled={pending}
          onClick={() => change('fa')}
        >
          فارسی
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-ink2">
          {t('error')}
        </p>
      )}
    </div>
  );
}
