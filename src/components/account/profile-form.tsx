'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, upload } from '@/lib/api';
import { Icon } from '@/components/icon';
import { PhotoCropper } from '@/components/photo-cropper';
import {
  UserAvatar,
  type AccountUser,
} from '@/components/contacts/account-menu';
import { PasswordChange } from './password-change';

type Photo =
  | { kind: 'keep' }
  | { kind: 'new'; file: File; url: string }
  | { kind: 'remove' };

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhoto = 4 * 1024 * 1024;

// The API keeps first and last name apart; the form edits them as one.
function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName: firstName ?? '', lastName: rest.join(' ') };
}

// Same rules as signup: first names of 2–16 and last names of 2–28.
function nameProblem(name: string) {
  const { firstName, lastName } = splitName(name);
  if (firstName.length < 2 || firstName.length > 16) return 'firstName';
  if (lastName.length < 2 || lastName.length > 28) return 'lastName';
  return null;
}

// Name and photo, saved together. The password has its own section and
// form below (PasswordChange), so saving here never touches it.
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
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const [photo, setPhoto] = useState<Photo>({ kind: 'keep' });
  // A chosen file waiting in the crop window.
  const [cropping, setCropping] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (photo.kind === 'new') URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const problem = nameProblem(name);
  const shownProblem = touched && problem ? e(problem) : undefined;
  const hasPhoto =
    photo.kind === 'new' || (photo.kind === 'keep' && Boolean(user.photoUrl));

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    if (!photoTypes.includes(chosen.type)) return setError('photoType');
    if (chosen.size > maxPhoto) return setError('photoSize');
    setError('');
    setCropping(chosen);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (problem) return nameInput.current?.focus();
    setBusy(true);
    setError('');
    try {
      if (name.trim() !== initialName)
        await api('account', splitName(name), { method: 'PATCH' });
      if (photo.kind === 'new')
        await upload('account/photo', 'photo', photo.file);
      else if (photo.kind === 'remove' && user.photoUrl)
        await api('account/photo', undefined, { method: 'DELETE' });
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'UNAUTHENTICATED') return router.replace('/login');
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
              // Local preview of the cropped photo.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="user-avatar profile-avatar"
                src={photo.url}
                alt=""
              />
            ) : (
              <UserAvatar
                user={{
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
      {cropping && (
        <PhotoCropper
          file={cropping}
          onCancel={() => setCropping(null)}
          onDone={(cropped) => {
            setCropping(null);
            setPhoto({
              kind: 'new',
              file: cropped,
              url: URL.createObjectURL(cropped),
            });
          }}
        />
      )}
      <form method="post" noValidate onSubmit={submit} aria-busy={busy}>
        <div className="profile-fields">
          <div className="contact-field">
            <label htmlFor="profile-name">{t('name')}</label>
            <div className="field-line">
              <input
                ref={nameInput}
                id="profile-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('namePlaceholder')}
                autoComplete="name"
                maxLength={45}
                aria-invalid={Boolean(shownProblem)}
                aria-describedby={
                  shownProblem ? 'profile-name-error' : undefined
                }
              />
            </div>
            {shownProblem && (
              <p className="field-error" id="profile-name-error">
                {shownProblem}
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
      <PasswordChange />
    </div>
  );
}
