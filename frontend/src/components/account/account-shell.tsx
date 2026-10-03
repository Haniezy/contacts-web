'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// Profile and settings: the contacts page backdrop, a back button to the
// list and, on desktop, the header bar with the logo.
export function AccountShell({
  variant,
  children,
}: {
  variant: 'profile' | 'settings';
  children: ReactNode;
}) {
  const t = useTranslations('Account');
  const a = useTranslations('Auth');
  return (
    <div className={`contacts-page account-page account-${variant}`}>
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
