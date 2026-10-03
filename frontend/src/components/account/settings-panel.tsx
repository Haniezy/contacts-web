'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, asciiDigits, displayDigits } from '@/lib/api';
import { Icon } from '@/components/icon';
import { Field } from '@/components/auth/field';

export function SettingsPanel({
  twoFactor: initialTwoFactor,
  version,
}: {
  twoFactor: boolean;
  version: string;
}) {
  const t = useTranslations('Account');
  const locale = useLocale();
  const [twoFactor, setTwoFactor] = useState(initialTwoFactor);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<'disable' | 'delete' | null>(null);

  // Every session ends, this one too, so the next stop is the sign-in page.
  async function logoutAll() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api('account/logout-all', {});
      location.replace('/login');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return location.replace('/login');
      setFailed(true);
      setBusy(false);
    }
  }

  const status = t(twoFactor ? 'on' : 'off');
  const twoFactorCard = (
    <>
      <span className="settings-icon icon-shield">
        <Icon name="shield" />
      </span>
      <span className="settings-text">
        <span className="settings-name">{t('twoFactor')}</span>
        <span className="settings-help">
          {t('twoFactorStatus', { state: status })}
        </span>
      </span>
      <span className={`status-chip${twoFactor ? '' : ' is-off'}`}>
        {status}
      </span>
    </>
  );

  return (
    <>
      <h1 className="settings-title">{t('settingsTitle')}</h1>
      <ul className="settings-list">
        <li>
          {/* On: turning it off needs the password and a code. Off: the
              setup flow, which comes back here when done. */}
          {twoFactor ? (
            <button
              type="button"
              className="settings-card"
              aria-haspopup="dialog"
              onClick={() => setDialog('disable')}
            >
              {twoFactorCard}
            </button>
          ) : (
            <Link href="/2fa/setup?from=settings" className="settings-card">
              {twoFactorCard}
            </Link>
          )}
        </li>
        <li className={`settings-expand${open ? ' is-open' : ''}`}>
          <button
            type="button"
            className="settings-card"
            aria-expanded={open}
            aria-controls="logout-all"
            onClick={() => setOpen(!open)}
          >
            <span className="settings-icon icon-logout">
              <Icon name="logout" />
            </span>
            <span className="settings-text">
              <span className="settings-name">{t('logoutAll')}</span>
              <span className="settings-help">{t('logoutAllHelp')}</span>
            </span>
            <Icon name="chevron" className="settings-chevron" />
          </button>
          <div className="settings-reveal" id="logout-all" inert={!open}>
            <div>
              <p>{t('logoutAllNote')}</p>
              {failed && (
                <p role="alert" className="form-error">
                  {t('failed')}
                </p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={logoutAll}
              >
                <Icon name="logout" />
                {t('logoutAllConfirm')}
              </button>
            </div>
          </div>
        </li>
      </ul>
      <section className="danger-card" aria-labelledby="danger-title">
        <div className="danger-head">
          <span className="danger-icon">
            <Icon name="alert" />
          </span>
          <h2 id="danger-title">{t('deleteAccount')}</h2>
        </div>
        <p>{t('deleteAccountHelp')}</p>
        <button
          type="button"
          className="danger-button"
          aria-haspopup="dialog"
          onClick={() => setDialog('delete')}
        >
          <Icon name="trash" />
          {t('deleteButton')}
        </button>
      </section>
      <p className="app-version">
        {t('version', { version: displayDigits(version, locale) })}
      </p>
      <SecondFactorDialog
        kind={dialog}
        twoFactor={twoFactor}
        onClose={() => setDialog(null)}
        onDisabled={() => {
          setTwoFactor(false);
          setDialog(null);
        }}
      />
    </>
  );
}

// Turning 2FA off and deleting the account both ask for the password and,
// while 2FA is on, a code. Deleting first asks once more in plain words.
function SecondFactorDialog({
  kind,
  twoFactor,
  onClose,
  onDisabled,
}: {
  kind: 'disable' | 'delete' | null;
  twoFactor: boolean;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const t = useTranslations('Account');
  const e = useTranslations('Errors');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(kind);
  const [step, setStep] = useState<'confirm' | 'verify'>('confirm');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (kind && kind !== shown) {
    setShown(kind);
    setStep(kind === 'delete' ? 'confirm' : 'verify');
    setRecovery(false);
    setError('');
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (kind && !element.open) element.showModal();
    if (!kind && element.open) element.close();
  }, [kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const code = asciiDigits(String(data.get('code') ?? '').trim());
    const recoveryCode = String(data.get('recoveryCode') ?? '').trim();
    if (!password) return setError('required');
    if (twoFactor && !recovery && !/^\d{6}$/.test(code))
      return setError('sixDigits');
    if (twoFactor && recovery && !recoveryCode)
      return setError('recoveryFormat');
    setBusy(true);
    setError('');
    const body = {
      password,
      ...(twoFactor ? (recovery ? { recoveryCode } : { code }) : {}),
    };
    try {
      if (shown === 'disable') {
        await api('auth/2fa/disable', body);
        setBusy(false);
        router.refresh();
        onDisabled();
      } else {
        await api('account/delete', body);
        // Nothing of this account is left; start over from the landing page.
        location.replace('/');
      }
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'UNAUTHENTICATED') return location.replace('/login');
      setError(
        code === 'INVALID_CREDENTIALS'
          ? 'wrongPassword'
          : code === 'INVALID_TWO_FACTOR_CODE'
            ? recovery
              ? 'invalidRecovery'
              : 'invalidCode'
            : code === 'TOO_MANY_REQUESTS'
              ? 'rateLimit'
              : code === 'INVALID_INPUT'
                ? recovery
                  ? 'recoveryFormat'
                  : 'invalid'
                : 'failed',
      );
    }
  }

  const deleting = shown === 'delete';
  const message = (key: string) =>
    ['wrongPassword', 'failed'].includes(key) ? t(key) : e(key);
  return (
    <dialog
      ref={dialog}
      className="delete-dialog account-dialog"
      aria-labelledby="account-dialog-title"
      aria-describedby="account-dialog-help"
      onClose={() => {
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="delete-sheet">
        <span className={`delete-badge${deleting ? '' : ' badge-shield'}`}>
          <Icon name={deleting ? 'trash' : 'shield'} />
        </span>
        {step === 'confirm' ? (
          <>
            <h2 id="account-dialog-title">{t('deleteConfirmTitle')}</h2>
            <p id="account-dialog-help">{t('deleteAccountHelp')}</p>
            <div className="delete-actions">
              <button
                type="button"
                className="button-danger-solid"
                onClick={() => setStep('verify')}
              >
                {t('continue')}
              </button>
              <button
                type="button"
                className="button-mint"
                onClick={onClose}
                autoFocus
              >
                {t('cancel')}
              </button>
            </div>
          </>
        ) : (
          <form method="post" noValidate onSubmit={submit} aria-busy={busy}>
            <h2 id="account-dialog-title">
              {t(deleting ? 'deleteVerifyTitle' : 'disableTitle')}
            </h2>
            <p id="account-dialog-help">
              {deleting
                ? t(twoFactor ? 'deleteVerifyHelpCode' : 'deleteVerifyHelp')
                : t(recovery ? 'disableHelpRecovery' : 'disableHelp')}
            </p>
            <div className="account-dialog-fields">
              <Field
                name="password"
                label={t('password')}
                type="password"
                autoComplete="current-password"
                maxLength={128}
                autoFocus
              />
              {twoFactor &&
                (recovery ? (
                  <Field
                    key="recoveryCode"
                    name="recoveryCode"
                    label={t('recoveryCode')}
                    autoComplete="off"
                    maxLength={35}
                    dir="ltr"
                  />
                ) : (
                  <Field
                    key="code"
                    name="code"
                    label={t('code')}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    dir="ltr"
                  />
                ))}
              {twoFactor && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setRecovery(!recovery);
                    setError('');
                  }}
                >
                  {t(recovery ? 'useCode' : 'useRecovery')}
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {message(error)}
              </p>
            )}
            <div className="delete-actions">
              <button className="button-danger-solid" disabled={busy}>
                {t(deleting ? 'deleteForever' : 'disable')}
              </button>
              <button
                type="button"
                className="button-mint"
                disabled={busy}
                onClick={onClose}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
