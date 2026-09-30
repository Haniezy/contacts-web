'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, errorKey } from '@/lib/api';
import { Field } from './field';
import { useEnrollment, type Enrollment } from './enrollment-context';

export function AccountForm({ signup = false }: { signup?: boolean }) {
  const t = useTranslations('Auth');
  const e = useTranslations('Errors');
  const router = useRouter();
  const { setEnrollment } = useEnrollment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
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
    const invalid: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      invalid.email = e('email');
    if (!password || password.length > 128 || (signup && password.length < 8))
      invalid.password = e(signup ? 'password' : 'required');
    if (signup) {
      if (!firstName || firstName.length > 100) invalid.firstName = e('name');
      if (!lastName || lastName.length > 100) invalid.lastName = e('name');
      if (value('confirmPassword') !== password)
        invalid.confirmPassword = e('mismatch');
    }
    setFields(invalid);
    setError('');
    if (Object.keys(invalid).length) {
      form
        .querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)
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
        router.replace(result.twoFactorRequired ? '/2fa' : '/contacts');
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
        onSubmit={submit}
        noValidate
        className="account-form"
        aria-busy={busy}
      >
        {signup && (
          <div className="name-fields">
            <Field
              name="firstName"
              label={t('firstName')}
              placeholder={t('firstNameExample')}
              autoComplete="given-name"
              maxLength={100}
              error={fields.firstName}
            />
            <Field
              name="lastName"
              label={t('lastName')}
              placeholder={t('lastNameExample')}
              autoComplete="family-name"
              maxLength={100}
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
          maxLength={128}
          error={fields.password}
        />
        {signup && (
          <Field
            name="confirmPassword"
            label={t('confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder={t('confirmHint')}
            maxLength={128}
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
