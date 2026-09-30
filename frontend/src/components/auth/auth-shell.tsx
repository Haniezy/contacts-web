import { useTranslations, useFormatter } from 'next-intl';
import Link from 'next/link';
import { Icon } from './icon';

export function AuthShell({
  children,
  variant = 'account',
}: {
  children: React.ReactNode;
  variant?: 'account' | 'verify' | 'setup';
}) {
  const t = useTranslations('Auth');
  const f = useFormatter();
  return (
    <main className={`auth-shell auth-${variant}`}>
      <div className="auth-blue-blob" aria-hidden="true" />
      <div className="auth-sphere sphere-one" aria-hidden="true" />
      <div className="auth-sphere sphere-two" aria-hidden="true" />
      <div className="auth-sphere sphere-three" aria-hidden="true" />
      <aside className="auth-brand">
        <div className="brand-mint" aria-hidden="true" />
        <div className="brand-copy">
          <span className="brand-dash" aria-hidden="true" />
          <Link
            href="/"
            className="brand-mobile-icon icon-disc"
            aria-label={t('home')}
          >
            <Icon name={variant === 'account' ? 'book' : 'shield'} />
          </Link>
          <h2>
            {t(
              variant === 'account'
                ? 'brand'
                : variant === 'setup'
                  ? 'setupBrand'
                  : 'verifyBrand',
            )}
          </h2>
          <p>
            {t(
              variant === 'account'
                ? 'tagline'
                : variant === 'setup'
                  ? 'setupTagline'
                  : 'verifyTagline',
            )}
          </p>
          {variant === 'account' ? (
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
        </div>
      </aside>
      <section className="auth-content">{children}</section>
    </main>
  );
}
