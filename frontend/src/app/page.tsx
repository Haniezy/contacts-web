import { useTranslations } from 'next-intl';
import { Preferences } from '@/components/preferences/preferences';

export default function Home() {
  const t = useTranslations('Home');
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:px-10 sm:py-20">
      <h1 className="text-3xl font-bold text-ink">{t('title')}</h1>
      <p className="mt-4 text-ink2">{t('description')}</p>
      <p className="text-ink2">{t('next')}</p>
      <Preferences />
    </main>
  );
}
