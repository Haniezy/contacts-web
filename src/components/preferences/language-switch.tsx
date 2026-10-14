'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/actions';
import type { Locale } from '@/i18n/config';
import { PreferenceIcon } from './icons';

// The language everywhere (the landing header, the sidebar, the phone
// drawer): one button, a globe and the name of the language it switches to.
export function LanguageSwitch() {
  const locale = useLocale() as Locale;
  const t = useTranslations('Preferences');
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);
  const [error, setError] = useState(false);
  const next: Locale = locale === 'fa' ? 'en' : 'fa';
  // What the button offers: at once the other language after a click, and
  // back again if the change fails.
  const offer: Locale = shown === 'fa' ? 'en' : 'fa';
  function change() {
    setError(false);
    startTransition(async () => {
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
        className="language-switch"
        lang={offer}
        dir={offer === 'en' ? 'ltr' : 'rtl'}
        aria-busy={pending}
        disabled={pending}
        onClick={change}
      >
        <PreferenceIcon name="globe" />
        <span>{offer === 'en' ? 'English' : 'فارسی'}</span>
      </button>
      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {t('error')}
        </p>
      )}
    </div>
  );
}
