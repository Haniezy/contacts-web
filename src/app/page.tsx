import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { LandingPreview } from '@/components/auth/landing-preview';
import {
  LandingFooter,
  LandingSections,
} from '@/components/auth/landing-sections';
import app from '../../package.json';
export default function Home() {
  const t = useTranslations('Landing');
  const a = useTranslations('Auth');
  return (
    <>
      <main>
        <section className="landing">
          <div className="landing-decor" aria-hidden="true">
            <span className="landing-circle" />
            <span className="landing-mint" />
            <span className="sphere sphere-1" />
            <span className="sphere sphere-2" />
            <span className="sphere sphere-3" />
          </div>
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
        </section>
        <LandingSections />
      </main>
      <LandingFooter version={app.version} />
    </>
  );
}
