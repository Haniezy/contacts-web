import { useTranslations, useFormatter } from 'next-intl';
import Link from 'next/link';
import { Icon } from '@/components/icon';

export function AuthShell({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'login' | 'signup' | 'verify' | 'setup';
}) {
  const t = useTranslations('Auth');
  const f = useFormatter();
  const account = variant === 'login' || variant === 'signup';
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
        <h2>
          {t(
            account
              ? 'brand'
              : variant === 'setup'
                ? 'setupBrand'
                : 'verifyBrand',
          )}
        </h2>
        {account ? (
          <p>
            <span className="only-desktop">{t('tagline')}</span>
            <span className="only-mobile">{t('taglineMobile')}</span>
          </p>
        ) : (
          <p>{t(variant === 'setup' ? 'setupTagline' : 'verifyTagline')}</p>
        )}
        {account ? (
          <ul className="brand-features">
            {(['search', 'users', 'shield'] as const).map((icon, i) => (
              <li key={icon}>
                <span className="icon-disc">
                  <Icon name={icon} />
                </span>
                {t(`feature${i + 1}`)}
              </li>
            ))}
          </ul>
        ) : variant === 'setup' ? (
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
