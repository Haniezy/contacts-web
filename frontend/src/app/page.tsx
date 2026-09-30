import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/auth/icon';
import { LandingPreview } from '@/components/auth/landing-preview';
export default function Home() {
  const t = useTranslations('Landing');
  const a = useTranslations('Auth');
  return (
    <main className="landing">
      <div className="landing-blob" aria-hidden="true" />
      <span className="auth-sphere landing-sphere-one" aria-hidden="true" />
      <span className="auth-sphere landing-sphere-two" aria-hidden="true" />
      <div className="landing-copy">
        <p className="landing-logo">
          <span>
            <Icon name="book" />
          </span>
          {a('brand')}
        </p>
        <h1>{t('title')}</h1>
        <p className="landing-subtitle">{t('subtitle')}</p>
        <div className="landing-actions">
          <Link href="/signup" className="button-primary">
            {a('createAccount')}
          </Link>
          <Link href="/login" className="button-secondary">
            {a('login')}
          </Link>
        </div>
      </div>
      <LandingPreview />
    </main>
  );
}
