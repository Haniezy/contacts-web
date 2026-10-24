import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// The pages beside the list (profile, settings, duplicates, trash), after
// the owner's choice (25 Mehr 1405): a column on the landing page's blurred
// picture, the back button to the list beside the title.
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations('Account');
  return (
    <main className="page-shell">
      <div className="landing-backdrop" aria-hidden="true" />
      <div className="page-column">
        <div className="page-head">
          <Link
            href="/contacts"
            className="page-back icon-disc"
            aria-label={t('back')}
          >
            <Icon name="back" className="directional-icon" />
          </Link>
          <h1 className="page-title">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
