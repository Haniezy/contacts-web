import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// Profile and settings (the owner's choice, 25 Mehr 1405): a column on the
// landing page's blurred picture, the back button beside the title.
export function AccountShell({
  variant,
  children,
}: {
  variant: 'profile' | 'settings';
  children: ReactNode;
}) {
  const t = useTranslations('Account');
  return (
    <main className="account-page">
      <div className="landing-backdrop" aria-hidden="true" />
      <div className="account-column">
        <div className="account-head">
          <Link
            href="/contacts"
            className="account-back icon-disc"
            aria-label={t('back')}
          >
            <Icon name="back" className="directional-icon" />
          </Link>
          <h1 className="account-title">
            {t(variant === 'profile' ? 'profileTitle' : 'settingsTitle')}
          </h1>
        </div>
        {children}
      </div>
    </main>
  );
}
