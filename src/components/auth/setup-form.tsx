'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { api, errorKey } from '@/lib/api';
import { useEnrollment, type Enrollment } from './enrollment-context';
import { Field } from './field';
import { CodeInput } from './code-input';
import { Icon } from '@/components/icon';

// Where the setup is: the password, then the QR code, then its code.
function Steps({ current }: { current: number }) {
  const t = useTranslations('Auth');
  const f = useFormatter();
  return (
    <ol className="setup-steps" aria-label={t('setupSteps')}>
      {(['stepPassword', 'stepScan', 'stepCode'] as const).map((key, i) => (
        <li
          key={key}
          className={
            i + 1 < current ? 'is-done' : i + 1 === current ? 'is-current' : ''
          }
          aria-current={i + 1 === current ? 'step' : undefined}
        >
          <span>
            {i + 1 < current ? <Icon name="check" /> : f.number(i + 1)}
          </span>
          {t(key)}
        </li>
      ))}
    </ol>
  );
}

export function SetupForm({
  done = '/contacts',
}: {
  done?: '/contacts' | '/settings';
}) {
  const t = useTranslations('Auth');
  const e = useTranslations('Errors');
  const { enrollment, setEnrollment } = useEnrollment();
  const [stage, setStage] = useState<'qr' | 'code' | 'recovery'>('qr');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  // Which copy button last worked: the setup key or the recovery codes.
  // Each shows its own "copied" for a moment, then reads as before.
  const [copied, setCopied] = useState<'key' | 'codes' | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
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
  async function copy(value: string, what: 'key' | 'codes') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2500);
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
            onClick={() => copy(codes.join('\n'), 'codes')}
          >
            <Icon name="copy" />
            {t(copied === 'codes' ? 'codesCopied' : 'copyCodes')}
          </button>
          <span className="sr-only" role="status">
            {copied === 'codes' ? t('codesCopied') : ''}
          </span>
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
              href={done}
              onClick={() => setCodes([])}
            >
              {t(done === '/settings' ? 'goSettings' : 'goContacts')}
            </Link>
          ) : (
            <button className="button-primary" disabled>
              {t(done === '/settings' ? 'goSettings' : 'goContacts')}
            </button>
          )}
        </div>
      </>
    );
  const step = !enrollment ? 1 : stage === 'code' ? 3 : 2;
  return (
    <>
      <Link
        href={done}
        className="auth-card-home icon-disc"
        aria-label={t('back')}
      >
        <Icon name="back" className="directional-icon" />
      </Link>
      <Steps current={step} />
      <h1>
        {t(
          step === 1
            ? 'setupStartTitle'
            : step === 2
              ? 'setupTitle'
              : 'setupCodeTitle',
        )}
      </h1>
      <p className="auth-description">
        {t(
          step === 1
            ? 'setupPasswordHelp'
            : step === 2
              ? 'setupHelp'
              : 'setupCodeHelp',
        )}
      </p>
      {!enrollment ? (
        <form method="post" onSubmit={setup} aria-busy={busy}>
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
            <Link href={done}>{t('skip')}</Link>
          </div>
        </form>
      ) : stage === 'qr' ? (
        <>
          <div className="qr-card">
            <Image
              src={enrollment.qrCodeDataUrl}
              width={190}
              height={190}
              alt={t('qrAlt')}
              unoptimized
            />
          </div>
          <div className="qr-manual">
            <p className="manual-label">{t('manualCode')}</p>
            <p className="manual-hint">{t('manualHint')}</p>
            <button
              type="button"
              className="secret-code"
              onClick={() => copy(enrollment.secret, 'key')}
              aria-label={t('copySecret')}
            >
              <code dir="ltr">
                {enrollment.secret.match(/.{1,4}/g)?.join(' ')}
              </code>
              <Icon name={copied === 'key' ? 'check' : 'copy'} />
            </button>
            <p aria-live="polite" className="sr-only">
              {copied === 'key' ? t('keyCopied') : ''}
            </p>
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
            {/* The QR secret goes with the auth layout once the next page
                opens; clearing it on click would flash the password step. */}
            <Link href={done}>{t('skip')}</Link>
          </div>
        </>
      ) : (
        <form method="post" onSubmit={confirm} aria-busy={busy}>
          <CodeInput
            value={code}
            onChange={setCode}
            invalid={!!error}
            onPastedKey={() => setError('pastedKey')}
          />
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
