'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusScreen } from '@/components/status-screen';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('Errors');
  return (
    <StatusScreen icon="alert" title={t('errorTitle')} text={t('service')}>
      <button type="button" className="button-primary" onClick={reset}>
        {t('retry')}
      </button>
      <Link href="/" className="text-link">
        {t('home')}
      </Link>
    </StatusScreen>
  );
}
