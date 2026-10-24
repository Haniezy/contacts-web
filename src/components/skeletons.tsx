'use client';
import { useTranslations } from 'next-intl';
import { PageShell } from '@/components/page-shell';

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

export function DuplicatesSkeleton() {
  const t = useTranslations('Duplicates');
  return (
    <Loading>
      <PageShell title={t('title')}>
        <span className="skeleton skeleton-line" />
        <div className="duplicate-groups">
          <Bars count={2} className="skeleton-card" />
        </div>
      </PageShell>
    </Loading>
  );
}

export function ContactDetailsSkeleton() {
  return (
    <Loading>
      <div className="contacts-page contact-details-page is-loading">
        <div className="contacts-decor" aria-hidden="true">
          <span className="contacts-circle" />
          <span className="contacts-mint" />
        </div>
        <header className="details-header">
          <span className="details-back icon-disc" aria-hidden="true" />
        </header>
        <main className="details-main">
          <div className="details-card">
            <span className="skeleton skeleton-avatar" />
            <Bars count={2} className="skeleton-line" />
            <div className="panel-cards">
              <Bars count={2} className="skeleton-card" />
            </div>
          </div>
        </main>
      </div>
    </Loading>
  );
}

export function ProfileSkeleton() {
  const t = useTranslations('Account');
  return (
    <Loading>
      <PageShell title={t('profileTitle')}>
        <div className="profile-card">
          <div className="profile-me">
            <span className="skeleton skeleton-avatar profile-avatar" />
            <div className="profile-form">
              <Bars count={2} className="skeleton-field" />
            </div>
          </div>
        </div>
      </PageShell>
    </Loading>
  );
}

export function SettingsSkeleton() {
  const t = useTranslations('Account');
  return (
    <Loading>
      <PageShell title={t('settingsTitle')}>
        <div className="settings-list">
          <Bars count={2} className="skeleton-card" />
        </div>
      </PageShell>
    </Loading>
  );
}
