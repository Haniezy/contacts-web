'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, errorKey, asciiDigits } from '@/lib/api';
import { CodeInput } from './code-input';
import { Field } from './field';
import { Icon } from './icon';
export function VerifyForm() {
  const t = useTranslations('Auth');
  const e = useTranslations('Errors');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleaned = asciiDigits(recoveryCode.trim());
    if (
      recovery
        ? !/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{8}){3})$/.test(
            cleaned,
          )
        : !/^\d{6}$/.test(code)
    ) {
      setError(recovery ? 'recoveryFormat' : 'sixDigits');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(
        'auth/2fa/verify',
        recovery ? { recoveryCode: cleaned } : { code },
      );
      router.replace('/contacts');
      router.refresh();
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href="/login"
        className="auth-back icon-disc"
        aria-label={t('back')}
      >
        <Icon name="back" className="directional-icon" />
      </Link>
      <span className="mobile-shield icon-disc">
        <Icon name="shield" />
      </span>
      <h1>{t(recovery ? 'recoveryTitle' : 'verifyTitle')}</h1>
      <p className="auth-description">
        {t(recovery ? 'recoveryHelp' : 'verifyHelp')}
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        {recovery ? (
          <Field
            name="recoveryCode"
            label={t('recoveryCode')}
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(event.target.value)}
            autoComplete="off"
            dir="ltr"
            maxLength={35}
          />
        ) : (
          <CodeInput value={code} onChange={setCode} invalid={!!error} />
        )}
        {error && (
          <p role="alert" className="form-error">
            {e(error)}
            {(error === 'expired' || error === 'unauthenticated') && (
              <>
                {' '}
                <Link href="/login">{t('login')}</Link>
              </>
            )}
          </p>
        )}
        <div className="auth-actions">
          <button className="button-primary" disabled={busy}>
            {t(busy ? 'working' : 'verifyLogin')}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setRecovery(!recovery);
              setError('');
              setCode('');
              setRecoveryCode('');
            }}
          >
            {t(recovery ? 'useAuthenticator' : 'useRecovery')}
          </button>
        </div>
      </form>
    </>
  );
}
