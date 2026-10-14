import { useTranslations, useFormatter } from 'next-intl';
import Link from 'next/link';
import { Icon } from '@/components/icon';

// The two-step verification pages (sign-in and sign-up have their own card).
export function AuthShell({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'verify' | 'setup';
}) {
  const t = useTranslations('Auth');
  const f = useFormatter();
  return (
    <main className={`auth-shell auth-${variant}`}>
      <div className="auth-decor" aria-hidden="true">
        <span className="auth-circle" />
        <span className="auth-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
        <span className="sphere sphere-3" />
      </div>
      <aside className="auth-brand">
        <span className="brand-dash" aria-hidden="true" />
        <Link
          href="/"
          className="brand-mobile-icon icon-disc"
          aria-label={t('home')}
        >
          <Icon name="book" />
        </Link>
        <h2>{t(variant === 'setup' ? 'setupBrand' : 'verifyBrand')}</h2>
        <p>{t(variant === 'setup' ? 'setupTagline' : 'verifyTagline')}</p>
        {variant === 'setup' ? (
          <ol className="brand-features">
            {[1, 2, 3].map((i) => (
              <li key={i}>
                <span className="icon-disc">{f.number(i)}</span>
                {t(`step${i}`)}
              </li>
            ))}
          </ol>
        ) : (
          <span className="verify-disc icon-disc">
            <Icon name="shield" />
          </span>
        )}
      </aside>
      <section className="auth-content">{children}</section>
    </main>
  );
}
