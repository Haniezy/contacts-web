'use client';
import { useTranslations } from 'next-intl';
import { AccountShell } from '@/components/account/account-shell';

// Shown by the route loading files while a page waits for its data. The
// static parts are real; only the data areas are placeholders.
function Bars({ count, className }: { count: number; className: string }) {
  return Array.from({ length: count }, (_, i) => (
    <span key={i} className={`skeleton ${className}`} />
  ));
}

function Loading({ children }: { children: React.ReactNode }) {
  const t = useTranslations('Errors');
  return (
    <>
      {children}
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
    </>
  );
}

export function ContactsSkeleton() {
  return (
    <Loading>
      <div className="contacts-page is-loading">
        <div className="contacts-decor" aria-hidden="true">
          <span className="contacts-circle" />
          <span className="contacts-mint" />
        </div>
        <header className="contacts-header">
          <span className="skeleton skeleton-disc" />
          <span className="skeleton skeleton-search" />
          <span className="skeleton skeleton-title" />
        </header>
        <main className="contacts-main">
          <section className="contacts-column">
            <span className="skeleton skeleton-title only-desktop" />
            <div className="contacts-scroll">
              <Bars count={7} className="skeleton-row" />
            </div>
          </section>
          <aside className="contact-panel">
            <span className="skeleton skeleton-avatar" />
            <Bars count={2} className="skeleton-line" />
          </aside>
        </main>
      </div>
    </Loading>
  );
}

export function DuplicatesSkeleton() {
  const t = useTranslations('Duplicates');
  return (
    <Loading>
      <div className="contacts-page duplicates-page">
        <div className="contacts-decor" aria-hidden="true">
          <span className="contacts-circle" />
          <span className="contacts-mint" />
        </div>
        <header className="duplicates-header">
          <span className="duplicates-back icon-disc" aria-hidden="true" />
          <h1>{t('title')}</h1>
        </header>
        <main className="duplicates-main">
          <span className="skeleton skeleton-line" />
          <div className="duplicate-groups">
            <Bars count={2} className="skeleton-card" />
          </div>
        </main>
      </div>
    </Loading>
  );
}

export function AccountSkeleton({
  variant,
}: {
  variant: 'profile' | 'settings';
}) {
  const t = useTranslations('Account');
  return (
    <Loading>
      <AccountShell variant={variant}>
        {variant === 'profile' ? (
          <div className="profile-card">
            <div className="profile-head">
              <h1>{t('profileTitle')}</h1>
              <span className="skeleton skeleton-avatar profile-avatar" />
            </div>
            <div className="profile-fields">
              <Bars count={2} className="skeleton-field" />
            </div>
          </div>
        ) : (
          <>
            <h1 className="settings-title">{t('settingsTitle')}</h1>
            <div className="settings-list">
              <Bars count={2} className="skeleton-card" />
            </div>
          </>
        )}
      </AccountShell>
    </Loading>
  );
}
