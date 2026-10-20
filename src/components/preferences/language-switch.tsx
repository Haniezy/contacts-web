'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/actions';
import type { Locale } from '@/i18n/config';
import { PreferenceIcon } from './icons';

const names: Record<Locale, string> = { fa: 'فارسی', en: 'English' };

// Switching the language, shared by the landing header's button and the
// sidebar's row: shown at once, back again if the change fails.
function useLanguage() {
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);
  const [error, setError] = useState(false);
  function change() {
    const next: Locale = locale === 'fa' ? 'en' : 'fa';
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
  return { shown, pending, error, change };
}

function LanguageError() {
  const t = useTranslations('Preferences');
  return (
    <p role="alert" className="text-sm text-ink-muted">
      {t('error')}
    </p>
  );
}

// The landing header: a globe and the name of the language it switches to.
export function LanguageSwitch() {
  const { shown, pending, error, change } = useLanguage();
  const offer: Locale = shown === 'fa' ? 'en' : 'fa';
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
        <span>{names[offer]}</span>
      </button>
      {error && <LanguageError />}
    </div>
  );
}

// The sidebar (and phone drawer): a row like the others naming the language
// in use; a click switches to the other.
export function LanguageRow() {
  const t = useTranslations('Preferences');
  const { shown, pending, error, change } = useLanguage();
  return (
    <>
      <button
        type="button"
        className="desk-nav-item"
        aria-busy={pending}
        disabled={pending}
        onClick={change}
      >
        <PreferenceIcon name="globe" />
        <span className="desk-label">
          <span className="sr-only">{t('language')}: </span>
          <span lang={shown}>{names[shown]}</span>
        </span>
      </button>
      {error && <LanguageError />}
    </>
  );
}
