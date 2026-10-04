import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { StatusScreen } from '@/components/status-screen';

export default async function NotFound() {
  const t = await getTranslations('Errors');
  return (
    <StatusScreen
      icon="search"
      title={t('notFoundTitle')}
      text={t('notFoundHelp')}
    >
      <Link href="/" className="button-primary">
        {t('home')}
      </Link>
    </StatusScreen>
  );
}
