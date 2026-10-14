'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { AccountForm } from './account-form';

type Mode = 'login' | 'signup';
// How long the picture takes to slide across (the CSS).
const slide = 650;

// Sign-in and sign-up in one card: the picture half invites to the other
// form, and choosing it slides the picture across while the forms trade
// places. The address follows (/login, /signup), so Back slides back. The
// form being left stays only while the slide runs. The picture: misty
// mountains by Adrien Tutin (Unsplash), lightly tinted with the theme.
export function AuthCard({
  initial,
  next = null,
}: {
  initial: Mode;
  // Where sign-in returns to (already checked by nextPath).
  next?: string | null;
}) {
  const t = useTranslations('Auth');
  // The picture (a CSS background) is fetched with the page, not after it.
  preload('/auth/hero.webp', { as: 'image', fetchPriority: 'high' });
  const [mode, setMode] = useState(initial);
  const [leaving, setLeaving] = useState<Mode | null>(null);
  const current = useRef(mode);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), slide);
    return () => clearTimeout(timer);
  }, [leaving]);
  const show = useCallback((to: Mode) => {
    if (to === current.current) return;
    setLeaving(current.current);
    current.current = to;
    setMode(to);
  }, []);
  useEffect(() => {
    const sync = () =>
      show(location.pathname.startsWith('/signup') ? 'signup' : 'login');
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [show]);
  const go = (to: Mode) => {
    show(to);
    history.pushState(
      null,
      '',
      to === 'signup'
        ? '/signup'
        : next
          ? `/login?${new URLSearchParams({ next })}`
          : '/login',
    );
  };
  const there = (form: Mode) => mode === form || leaving === form;
  const hero = (form: Mode) => (
    <div className={`auth-hero for-${form}`}>
      <h2>{t(form === 'login' ? 'heroLoginTitle' : 'heroSignupTitle')}</h2>
      <p>{t(form === 'login' ? 'heroLoginText' : 'heroSignupText')}</p>
      <button
        type="button"
        className="auth-switch"
        onClick={() => go(form === 'login' ? 'signup' : 'login')}
      >
        {t(form === 'login' ? 'createAccount' : 'login')}
      </button>
    </div>
  );
  return (
    <main className="auth-page">
      <Link
        href="/"
        className="auth-card-home icon-disc"
        aria-label={t('backHome')}
      >
        <Icon name="back" className="directional-icon" />
      </Link>
      <div className={`auth-card${mode === 'signup' ? ' is-signup' : ''}`}>
        <div className="auth-card-bg" aria-hidden="true" />
        {hero('signup')}
        <div className="auth-panel for-signup">
          {there('signup') && <AccountForm signup />}
        </div>
        {hero('login')}
        <div className="auth-panel for-login">
          {there('login') && <AccountForm next={next} />}
        </div>
      </div>
    </main>
  );
}
