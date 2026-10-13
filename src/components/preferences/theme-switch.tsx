'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { PreferenceIcon } from './icons';

const subscribe = () => () => {};

export function ThemeSwitch() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('Preferences');
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-label={t('darkMode')}
      aria-checked={dark}
      disabled={!mounted}
      className="theme-switch"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <span className="theme-knob">
        <span className="sun-icon">
          <PreferenceIcon name="sun" />
        </span>
        <span className="moon-icon">
          <PreferenceIcon name="moon" />
        </span>
      </span>
    </button>
  );
}

// The desktop top bar: a sun and a moon, the current theme's one lit.
export function ThemeButtons() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('Contacts');
  const p = useTranslations('Preferences');
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <div className="theme-buttons" role="group" aria-label={p('theme')}>
      <button
        type="button"
        aria-label={t('darkTheme')}
        aria-pressed={dark}
        disabled={!mounted}
        onClick={() => setTheme('dark')}
      >
        <PreferenceIcon name="moon" />
      </button>
      <button
        type="button"
        aria-label={t('lightTheme')}
        aria-pressed={mounted && !dark}
        disabled={!mounted}
        onClick={() => setTheme('light')}
      >
        <PreferenceIcon name="sun" />
      </button>
    </div>
  );
}
