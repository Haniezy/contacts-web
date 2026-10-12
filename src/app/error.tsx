'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusScreen } from '@/components/status-screen';

export default function ErrorPage() {
  const t = useTranslations('Errors');
  return (
    <StatusScreen icon="alert" title={t('errorTitle')} text={t('service')}>
      {/* A full load asks the server again, and offline the service worker
          answers with the saved page instead. */}
      <button
        type="button"
        className="button-primary"
        onClick={() => location.reload()}
      >
        {t('retry')}
      </button>
      <Link href="/" className="text-link">
        {t('home')}
      </Link>
    </StatusScreen>
  );
}
