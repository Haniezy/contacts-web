'use client';
import { useTranslations } from 'next-intl';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('Errors');
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <p role="alert">{t('service')}</p>
      <button
        className="button-primary mt-6"
        onClick={reset}
        aria-label={t('retry')}
      >
        ↻
      </button>
    </main>
  );
}
