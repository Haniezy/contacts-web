'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, errorKey } from '@/lib/api';
import { emailSuggestion } from '@/lib/email';
import { Field } from './field';
import { useEnrollment, type Enrollment } from './enrollment-context';

export function AccountForm({
  signup = false,
  next = null,
}: {
  signup?: boolean;
  // Where login returns to (already checked by nextPath).
  next?: string | null;
}) {
  const t = useTranslations('Auth');
  const e = useTranslations('Errors');
  const router = useRouter();
  const { setEnrollment } = useEnrollment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, ReactNode>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '');
    const email = value('email').trim();
    const password = value('password');
    const firstName = value('firstName').trim();
    const lastName = value('lastName').trim();
    const invalid: Record<string, ReactNode> = {};
    const suggestion = emailSuggestion(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      invalid.email = e('email');
    else if (suggestion)
      // A misspelt popular domain (gmial.com): one click puts the fix in.
      invalid.email = e.rich('emailTypo', {
        email: suggestion,
        fix: (chunks) => (
          <button
            type="button"
            className="email-fix"
            dir="ltr"
            onClick={() => {
              const input = form.elements.namedItem('email');
              if (input instanceof HTMLInputElement) {
                input.value = suggestion;
                input.focus();
              }
              setFields((current) => ({ ...current, email: undefined }));
            }}
          >
            {chunks}
          </button>
        ),
      });
    // New passwords take 6–16 characters; a login accepts any stored one.
    if (
      !password ||
      password.length > (signup ? 16 : 128) ||
      (signup && password.length < 6)
    )
      invalid.password = e(signup ? 'password' : 'required');
    if (signup) {
      if (firstName.length < 2 || firstName.length > 16)
        invalid.firstName = e('firstName');
      if (lastName.length < 2 || lastName.length > 28)
        invalid.lastName = e('lastName');
      if (value('confirmPassword') !== password)
        invalid.confirmPassword = e('mismatch');
    }
    setFields(invalid);
    setError('');
    if (Object.keys(invalid).length) {
      // Focus the first invalid field in visual order.
      [...form.elements]
        .find(
          (el): el is HTMLInputElement =>
            el instanceof HTMLInputElement && el.name in invalid,
        )
        ?.focus();
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ twoFactorRequired?: boolean }>(
        `auth/${signup ? 'signup' : 'login'}`,
        signup ? { email, password, firstName, lastName } : { email, password },
      );
      if (signup) {
        try {
          setEnrollment(await api<Enrollment>('auth/2fa/setup', { password }));
        } catch {
          setEnrollment(null);
        }
        form.reset();
        router.replace('/2fa/setup');
      } else {
        form.reset();
        router.replace(
          result.twoFactorRequired
            ? next
              ? `/2fa?${new URLSearchParams({ next })}`
              : '/2fa'
            : (next ?? '/contacts'),
        );
      }
      router.refresh();
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{t(signup ? 'signup' : 'login')}</h1>
      <form
        method="post"
        onSubmit={submit}
        noValidate
        className={`account-form${signup ? ' is-signup' : ''}`}
        aria-busy={busy}
      >
        {signup && (
          <div className="name-fields">
            <Field
              name="firstName"
              label={t('firstName')}
              placeholder={t('firstNameExample')}
              autoComplete="given-name"
              maxLength={16}
              error={fields.firstName}
            />
            <Field
              name="lastName"
              label={t('lastName')}
              placeholder={t('lastNameExample')}
              autoComplete="family-name"
              maxLength={28}
              error={fields.lastName}
            />
          </div>
        )}
        <Field
          name="email"
          label={t('email')}
          type="email"
          autoComplete="email"
          placeholder="example@email.com"
          maxLength={254}
          error={fields.email}
        />
        <Field
          name="password"
          label={t('password')}
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder={signup ? t('passwordHint') : '••••••••'}
          maxLength={signup ? 16 : 128}
          error={fields.password}
        />
        {signup && (
          <Field
            name="confirmPassword"
            label={t('confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder={t('confirmHint')}
            maxLength={16}
            error={fields.confirmPassword}
          />
        )}
        {error && (
          <p role="alert" className="form-error">
            {e(error)}
          </p>
        )}
        <div className="auth-actions">
          <button className="button-primary" disabled={busy}>
            {t(busy ? 'working' : signup ? 'createAccount' : 'login')}
          </button>
          <p>
            {t(signup ? 'haveAccount' : 'noAccount')}{' '}
            <Link href={signup ? '/login' : '/signup'}>
              {t(signup ? 'login' : 'signup')}
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}
