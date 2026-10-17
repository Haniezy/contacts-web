'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// The profile: the contacts page backdrop, a back button to the list and,
// on desktop, the header bar with the logo.
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Account');
  const a = useTranslations('Auth');
  return (
    <div className="contacts-page account-page account-profile">
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
      </div>
      <header className="account-header">
        <Link href="/contacts" className="contacts-logo">
          <span>
            <Icon name="book" />
          </span>
          {a('brand')}
        </Link>
        <Link
          href="/contacts"
          className="account-back icon-disc"
          aria-label={t('back')}
        >
          <Icon name="back" className="directional-icon" />
        </Link>
      </header>
      <main className="account-main">{children}</main>
    </div>
  );
}

// Settings (the owner's choice, 25 Mehr 1405): a narrow column on the landing
// page's blurred picture, the back button beside the title.
export function SettingsShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Account');
  return (
    <main className="settings-page">
      <div className="landing-backdrop" aria-hidden="true" />
      <div className="settings-column">
        <div className="settings-head">
          <Link
            href="/contacts"
            className="settings-back icon-disc"
            aria-label={t('back')}
          >
            <Icon name="back" className="directional-icon" />
          </Link>
          <h1 className="settings-title">{t('settingsTitle')}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
