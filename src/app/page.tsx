import Link from 'next/link';
import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LandingFooter,
  LandingHeader,
  LandingSections,
} from '@/components/auth/landing-sections';
import { getUser } from '@/lib/session';
import app from '../../package.json';

export default async function Home() {
  // Signed in: straight into the book, as from the sign-in and sign-up
  // pages; the landing page is for those without an account. If the
  // session can't be checked, the page shows.
  const user = await getUser().catch(() => null);
  if (user) redirect('/contacts');
  return <Landing />;
}

function Landing() {
  const t = useTranslations('Landing');
  const a = useTranslations('Auth');
  return (
    <>
      {/* The sign-in picture behind the whole page, blurred and matte. */}
      <div className="landing-backdrop" aria-hidden="true" />
      <LandingHeader />
      <main>
        <section className="landing">
          <div className="landing-copy">
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
        </section>
        <LandingSections />
      </main>
      <LandingFooter version={app.version} />
    </>
  );
}
