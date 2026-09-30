'use client';
import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, errorKey } from '@/lib/api';
import { useEnrollment, type Enrollment } from './enrollment-context';
import { Field } from './field';
import { CodeInput } from './code-input';
import { Icon } from './icon';

export function SetupForm() {
  const t = useTranslations('Auth');
  const e = useTranslations('Errors');
  const { enrollment, setEnrollment } = useEnrollment();
  const [stage, setStage] = useState<'qr' | 'code' | 'recovery'>('qr');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get('setupPassword') ?? '');
    if (!password) {
      setError('required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setEnrollment(await api<Enrollment>('auth/2fa/setup', { password }));
      form.reset();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError('sixDigits');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ recoveryCodes: string[] }>(
        'auth/2fa/confirm',
        { code },
      );
      setCodes(result.recoveryCodes);
      setEnrollment(null);
      setStage('recovery');
      setCode('');
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError('clipboard');
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([codes.join('\n')], { type: 'text/plain' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
  const expired = error === 'setupExpired' || error === 'rateLimit';
  if (stage === 'recovery')
    return (
      <>
        <h1>{t('recoveryTitle')}</h1>
        <p className="auth-description">{t('saveRecoveryHelp')}</p>
        <ul className="recovery-codes" dir="ltr">
          {codes.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
        <div className="recovery-tools">
          <button
            type="button"
            className="text-link"
            onClick={() => copy(codes.join('\n'))}
          >
            <Icon name="copy" />
            {t(copied ? 'copied' : 'copyCodes')}
          </button>
          <button type="button" className="text-link" onClick={download}>
            <Icon name="download" />
            {t('downloadCodes')}
          </button>
        </div>
        <label className="saved-codes">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
          />
          {t('savedCodes')}
        </label>
        {error && (
          <p className="form-error" role="alert">
            {e(error)}
          </p>
        )}
        <div className="auth-actions">
          {saved ? (
            <Link
              className="button-primary"
              href="/contacts"
              onClick={() => setCodes([])}
            >
              {t('goContacts')}
            </Link>
          ) : (
            <button className="button-primary" disabled>
              {t('goContacts')}
            </button>
          )}
        </div>
      </>
    );
  return (
    <>
      <Link
        href="/contacts"
        className="auth-back icon-disc"
        aria-label={t('back')}
      >
        <Icon name="back" className="directional-icon" />
      </Link>
      <h1>{t(stage === 'code' ? 'verifyTitle' : 'setupTitle')}</h1>
      <p className="auth-description">
        {t(
          stage === 'code'
            ? 'verifyHelp'
            : enrollment
              ? 'setupHelp'
              : 'setupPasswordHelp',
        )}
      </p>
      {!enrollment ? (
        <form onSubmit={setup} aria-busy={busy}>
          <Field
            name="setupPassword"
            label={t('password')}
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
          {error && (
            <p role="alert" className="form-error">
              {e(error)}
            </p>
          )}
          <div className="auth-actions">
            <button className="button-primary" disabled={busy}>
              {t(busy ? 'working' : 'createQr')}
            </button>
            <Link href="/contacts">{t('skip')}</Link>
          </div>
        </form>
      ) : stage === 'qr' ? (
        <>
          <div className="qr-layout">
            <Image
              className="qr-image"
              src={enrollment.qrCodeDataUrl}
              width={224}
              height={224}
              alt={t('qrAlt')}
              unoptimized
            />
            <div>
              <p className="text-ink2">{t('manualCode')}</p>
              <button
                className="secret-code"
                onClick={() => copy(enrollment.secret)}
                aria-label={t('copySecret')}
              >
                <code dir="ltr">
                  {enrollment.secret.match(/.{1,4}/g)?.join(' ')}
                </code>
                <Icon name="copy" />
              </button>
              <p aria-live="polite" className="text-link">
                {copied ? t('copied') : ''}
              </p>
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {e(error)}
            </p>
          )}
          <div className="auth-actions">
            <button
              className="button-primary"
              onClick={() => {
                setStage('code');
                setError('');
              }}
            >
              {t('continue')}
            </button>
            <Link href="/contacts" onClick={() => setEnrollment(null)}>
              {t('skip')}
            </Link>
          </div>
        </>
      ) : (
        <form onSubmit={confirm} aria-busy={busy}>
          <CodeInput value={code} onChange={setCode} invalid={!!error} />
          {error && (
            <p role="alert" className="form-error">
              {e(error)}
            </p>
          )}
          <div className="auth-actions">
            <button className="button-primary" disabled={busy || expired}>
              {t(busy ? 'working' : 'activate')}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setStage('qr');
                setError('');
                setCode('');
                if (expired) setEnrollment(null);
              }}
            >
              {t(expired ? 'restartSetup' : 'backToQr')}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
