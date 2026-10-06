'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icon';

type Fields = { current: string; next: string; confirm: string };
type Errors = Partial<Record<keyof Fields, string>>;
const empty: Fields = { current: '', next: '', confirm: '' };
const order = ['current', 'next', 'confirm'] as const;

function problems(fields: Fields): Errors {
  const errors: Errors = {};
  if (!fields.current) errors.current = 'currentRequired';
  // Same rule as signup: 6 to 16 characters.
  if (fields.next.length < 6 || fields.next.length > 16)
    errors.next = 'password';
  else if (fields.next === fields.current) errors.next = 'samePassword';
  if (fields.confirm !== fields.next) errors.confirm = 'mismatch';
  return errors;
}

// The profile's password section: closed by default, so saving the profile
// never involves it. "Change password" opens its own small form with its
// own save and cancel; the server checks the current password.
export function PasswordChange() {
  const t = useTranslations('Account');
  const e = useTranslations('Errors');
  const a = useTranslations('Auth');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Fields>(empty);
  // Errors belong to saving: they appear only after "save" is pressed, then
  // update as the user types. Leaving a field or cancelling never shows any.
  const [submitted, setSubmitted] = useState(false);
  const [visible, setVisible] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  // Read-only until focused, so password managers do not fill it in: the
  // user types the current password themselves.
  const [unlocked, setUnlocked] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Opening the form puts the cursor in the current password.
  useEffect(() => {
    if (open) form.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);

  const errors: Errors = {
    ...problems(fields),
    ...(wrongCurrent ? { current: 'wrongCurrent' } : {}),
  };
  const message = (key: string) =>
    ['currentRequired', 'wrongCurrent', 'samePassword'].includes(key)
      ? t(key)
      : e(key);
  const shown = (key: keyof Fields) =>
    submitted && errors[key] ? message(errors[key]) : undefined;

  function close() {
    setOpen(false);
    setFields(empty);
    setSubmitted(false);
    setVisible({});
    setWrongCurrent(false);
    setError('');
    setUnlocked(false);
    toggle.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const first = order.find((key) => errors[key]);
    if (first) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('account/password', {
        currentPassword: fields.current,
        newPassword: fields.next,
      });
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'UNAUTHENTICATED') return router.replace('/login');
      if (code === 'INVALID_CREDENTIALS') {
        setWrongCurrent(true);
        form.current
          ?.querySelector<HTMLInputElement>('[name="current"]')
          ?.focus();
        return;
      }
      setError(code === 'TOO_MANY_REQUESTS' ? e('rateLimit') : t('saveFailed'));
      return;
    }
    setBusy(false);
    close();
    setChanged(true);
  }

  const field = (key: keyof Fields, label: string, placeholder: string) => (
    <div className={`contact-field field-${key}`}>
      <label htmlFor={`password-${key}`}>{label}</label>
      <div className="field-line">
        <input
          id={`password-${key}`}
          name={key}
          type={visible[key] ? 'text' : 'password'}
          value={fields[key]}
          onChange={(event) => {
            setFields((current) => ({
              ...current,
              [key]: event.target.value,
            }));
            if (key === 'current') setWrongCurrent(false);
          }}
          onFocus={key === 'current' ? () => setUnlocked(true) : undefined}
          readOnly={key === 'current' && !unlocked}
          placeholder={placeholder}
          autoComplete={key === 'current' ? 'off' : 'new-password'}
          maxLength={key === 'current' ? 128 : 16}
          dir="ltr"
          aria-invalid={Boolean(shown(key))}
          aria-describedby={shown(key) ? `password-${key}-error` : undefined}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={a(visible[key] ? 'hidePassword' : 'showPassword')}
          aria-pressed={Boolean(visible[key])}
          onClick={() =>
            setVisible((current) => ({ ...current, [key]: !current[key] }))
          }
        >
          <Icon name={visible[key] ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {shown(key) && (
        <p className="field-error" id={`password-${key}-error`}>
          {shown(key)}
        </p>
      )}
    </div>
  );

  return (
    <section className="password-change" aria-labelledby="password-title">
      <p className="profile-divider">
        <span id="password-title">{a('password')}</span>
      </p>
      {open ? (
        <form
          ref={form}
          className="password-form"
          method="post"
          noValidate
          onSubmit={submit}
          aria-busy={busy}
        >
          <div className="password-fields">
            {field('current', t('currentPassword'), t('currentHint'))}
            {field('next', t('newPassword'), t('newPasswordHint'))}
            {field('confirm', t('confirmPassword'), t('confirmHint'))}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="password-actions">
            <button
              className="button-primary"
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
            >
              {t(busy ? 'saving' : 'savePassword')}
            </button>
            <button
              type="button"
              className="text-link"
              // Cancel works even with the cursor in a field.
              onMouseDown={(event) => event.preventDefault()}
              onClick={close}
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="password-row">
          <span className="password-icon" aria-hidden="true">
            <Icon name="shield" />
          </span>
          <span className="password-dots" aria-hidden="true">
            ••••••••
          </span>
          <button
            ref={toggle}
            type="button"
            className="button-secondary password-open"
            onClick={() => {
              setChanged(false);
              setOpen(true);
            }}
          >
            {t('passwordSection')}
          </button>
        </div>
      )}
      <p className="password-done" role="status">
        {changed ? t('passwordChanged') : ''}
      </p>
    </section>
  );
}
