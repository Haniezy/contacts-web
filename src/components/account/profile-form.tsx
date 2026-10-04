'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, upload } from '@/lib/api';
import { Icon } from '@/components/icon';
import {
  UserAvatar,
  type AccountUser,
} from '@/components/contacts/account-menu';

type Photo =
  | { kind: 'keep' }
  | { kind: 'new'; file: File; url: string }
  | { kind: 'remove' };
type Fields = {
  name: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};
type FieldErrors = Partial<Record<keyof Fields, string>>;

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhoto = 4 * 1024 * 1024;

// The API keeps first and last name apart; the form edits them as one.
function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName: firstName ?? '', lastName: rest.join(' ') };
}

function problems(fields: Fields): FieldErrors {
  const errors: FieldErrors = {};
  const { firstName, lastName } = splitName(fields.name);
  // Same rules as signup: first names of 2–16 and last names of 2–28.
  if (firstName.length < 2 || firstName.length > 16) errors.name = 'firstName';
  else if (lastName.length < 2 || lastName.length > 28)
    errors.name = 'lastName';
  const changing =
    fields.currentPassword || fields.newPassword || fields.confirmPassword;
  if (changing) {
    if (!fields.currentPassword) errors.currentPassword = 'currentRequired';
    if (fields.newPassword.length < 6 || fields.newPassword.length > 16)
      errors.newPassword = 'password';
    if (fields.confirmPassword !== fields.newPassword)
      errors.confirmPassword = 'mismatch';
  }
  return errors;
}

export function ProfileForm({
  user,
  initialName,
}: {
  user: AccountUser;
  initialName: string;
}) {
  const t = useTranslations('Account');
  const c = useTranslations('Contacts');
  const e = useTranslations('Errors');
  // Labels for the show/hide buttons come from the sign-in screens.
  const a = useTranslations('Auth');
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({
    name: initialName,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );
  const [visible, setVisible] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [photo, setPhoto] = useState<Photo>({ kind: 'keep' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(
    () => () => {
      if (photo.kind === 'new') URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const errors = { ...problems(fields), ...serverErrors };
  const message = (key: string) =>
    ['currentRequired', 'wrongCurrent'].includes(key) ? t(key) : e(key);
  const shown = (key: keyof Fields) =>
    touched[key] && errors[key] ? message(errors[key]) : undefined;
  const hasPhoto =
    photo.kind === 'new' || (photo.kind === 'keep' && Boolean(user.photoUrl));

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    if (!photoTypes.includes(chosen.type)) return setError('photoType');
    if (chosen.size > maxPhoto) return setError('photoSize');
    setError('');
    setPhoto({ kind: 'new', file: chosen, url: URL.createObjectURL(chosen) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTouched({
      name: true,
      currentPassword: true,
      newPassword: true,
      confirmPassword: true,
    });
    const local = problems(fields);
    const first = (Object.keys(fields) as (keyof Fields)[]).find(
      (key) => local[key],
    );
    if (first) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setServerErrors({});
    try {
      if (fields.name.trim() !== initialName)
        await api('account', splitName(fields.name), { method: 'PATCH' });
      if (fields.newPassword)
        await api('account/password', {
          currentPassword: fields.currentPassword,
          newPassword: fields.newPassword,
        });
      if (photo.kind === 'new')
        await upload('account/photo', 'photo', photo.file);
      else if (photo.kind === 'remove' && user.photoUrl)
        await api('account/photo', undefined, { method: 'DELETE' });
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'UNAUTHENTICATED') return router.replace('/login');
      if (code === 'INVALID_CREDENTIALS') {
        setServerErrors({ currentPassword: 'wrongCurrent' });
        form.current
          ?.querySelector<HTMLInputElement>('[name="currentPassword"]')
          ?.focus();
        return;
      }
      setError(
        code === 'TOO_MANY_REQUESTS'
          ? 'rateLimit'
          : code === 'INVALID_IMAGE'
            ? 'photoType'
            : code === 'LIMIT_FILE_SIZE'
              ? 'photoSize'
              : code === 'PHOTO_STORAGE_NOT_CONFIGURED'
                ? 'photoUnavailable'
                : 'saveFailed',
      );
      return;
    }
    // Back to the list, rendered again with the new name and photo.
    router.push('/contacts');
    router.refresh();
  }

  const set = (key: keyof Fields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === 'currentPassword') setServerErrors({});
  };
  const password = (
    key: 'currentPassword' | 'newPassword' | 'confirmPassword',
    label: string,
    placeholder: string,
    autoComplete: string,
  ) => (
    <div className={`contact-field field-${key}`}>
      <label htmlFor={`profile-${key}`}>{label}</label>
      <div className="field-line">
        <input
          id={`profile-${key}`}
          name={key}
          type={visible[key] ? 'text' : 'password'}
          value={fields[key]}
          onChange={(event) => set(key)(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={key === 'currentPassword' ? 128 : 16}
          dir="ltr"
          aria-invalid={Boolean(shown(key))}
          aria-describedby={shown(key) ? `profile-${key}-error` : undefined}
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
        <p className="field-error" id={`profile-${key}-error`}>
          {shown(key)}
        </p>
      )}
    </div>
  );

  return (
    <div className="profile-card">
      <div className="profile-head">
        <div>
          <h1>{t('profileTitle')}</h1>
          <p className="profile-help">{t('profileHelp')}</p>
        </div>
        <div className="photo-field profile-photo">
          <div className="photo-current">
            {photo.kind === 'new' ? (
              // Local preview of the chosen file.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="user-avatar profile-avatar"
                src={photo.url}
                alt=""
              />
            ) : (
              <UserAvatar
                user={{
                  initial: user.initial,
                  photoUrl: photo.kind === 'keep' ? user.photoUrl : null,
                }}
                className="profile-avatar"
              />
            )}
            <button
              type="button"
              className="photo-change"
              aria-label={c('changePhoto')}
              onClick={() => file.current?.click()}
            >
              <Icon name="camera" />
            </button>
          </div>
          {hasPhoto && (
            <button
              type="button"
              className="photo-remove text-link"
              onClick={() => setPhoto({ kind: 'remove' })}
            >
              {c('removePhoto')}
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept={photoTypes.join(',')}
            hidden
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <form
        ref={form}
        method="post"
        noValidate
        onSubmit={submit}
        aria-busy={busy}
      >
        <div className="profile-fields">
          <div className="contact-field">
            <label htmlFor="profile-name">{t('name')}</label>
            <div className="field-line">
              <input
                id="profile-name"
                name="name"
                value={fields.name}
                onChange={(event) => set('name')(event.target.value)}
                onBlur={() =>
                  setTouched((current) => ({ ...current, name: true }))
                }
                placeholder={t('namePlaceholder')}
                autoComplete="name"
                maxLength={45}
                aria-invalid={Boolean(shown('name'))}
                aria-describedby={
                  shown('name') ? 'profile-name-error' : undefined
                }
              />
            </div>
            {shown('name') && (
              <p className="field-error" id="profile-name-error">
                {shown('name')}
              </p>
            )}
          </div>
          <div className="contact-field profile-email">
            <label htmlFor="profile-email">
              {t('email')}
              <span className="locked-chip">{t('locked')}</span>
            </label>
            <div className="field-line">
              <input
                id="profile-email"
                value={user.email}
                readOnly
                dir="ltr"
                aria-describedby="profile-email-locked"
              />
              <Icon name="shield" />
            </div>
            <span id="profile-email-locked" hidden>
              {t('locked')}
            </span>
          </div>
        </div>
        <p className="profile-divider">
          <span>{t('passwordSection')}</span>
        </p>
        <div className="password-fields">
          {password(
            'currentPassword',
            t('currentPassword'),
            '••••••••',
            'current-password',
          )}
          {password(
            'newPassword',
            t('newPassword'),
            t('newPasswordHint'),
            'new-password',
          )}
          {password(
            'confirmPassword',
            t('confirmPassword'),
            t('confirmHint'),
            'new-password',
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error === 'rateLimit'
              ? e('rateLimit')
              : error === 'saveFailed'
                ? t('saveFailed')
                : c(error)}
          </p>
        )}
        <div className="profile-actions">
          <button
            className="button-primary"
            disabled={busy}
            // Keep focus in the field: its blur error would move this
            // button away mid-click. Submitting validates every field.
            onMouseDown={(event) => event.preventDefault()}
          >
            {t(busy ? 'saving' : 'save')}
          </button>
          <Link href="/contacts" className="profile-cancel">
            {t('cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
