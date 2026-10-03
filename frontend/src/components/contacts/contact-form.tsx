'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api, ApiError, asciiDigits, displayDigits, upload } from '@/lib/api';
import { formatPhone, type Contact } from '@/lib/contacts';
import { birthdayInput, parseBirthday } from '@/lib/jalali';
import { Icon, type IconName } from '@/components/icon';
import { Avatar } from './avatar';

export type FormMode = 'new' | 'edit';
type Photo =
  | { kind: 'keep' }
  | { kind: 'new'; file: File; url: string }
  | { kind: 'remove' };
type Fields = {
  name: string;
  phone: string;
  birthday: string;
  reminder: string;
};

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhoto = 5 * 1024 * 1024;

function problems(fields: Fields, locale: string) {
  const errors: Partial<Record<keyof Fields, string>> = {};
  const name = fields.name.trim();
  // Same rules as the API: printable text, 1–200 characters.
  if (!name || name.length > 200 || /\p{Cc}/u.test(name))
    errors.name = 'nameInvalid';
  const phone = asciiDigits(fields.phone.trim());
  const digits = phone.replace(/\D/g, '');
  if (
    !/^\+?[0-9\s().-]+$/.test(phone) ||
    digits.length < 3 ||
    digits.length > 15
  )
    errors.phone = 'phoneInvalid';
  if (fields.birthday.trim()) {
    const iso = parseBirthday(fields.birthday, locale);
    if (!iso) errors.birthday = 'birthdayInvalid';
    else if (iso > new Date().toISOString().slice(0, 10))
      errors.birthday = 'birthdayFuture';
  }
  if (fields.reminder.trim().length > 2000) errors.reminder = 'reminderInvalid';
  return errors;
}

// One form for creating and editing; only the title, initial values and
// submit label differ between the two modes.
export function ContactForm({
  mode: initialMode,
  contact: initialContact,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  contact?: Contact;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const t = useTranslations('Contacts');
  const e = useTranslations('Errors');
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  // After a partial failure (contact saved, photo not) the form keeps
  // editing the saved contact instead of creating another one.
  const [saved, setSaved] = useState(initialContact);
  const mode = saved ? 'edit' : initialMode;
  const [fields, setFields] = useState<Fields>(() => ({
    name: initialContact?.name ?? '',
    phone: initialContact
      ? displayDigits(formatPhone(initialContact.phone), locale)
      : '',
    birthday: initialContact?.birthday
      ? birthdayInput(initialContact.birthday, locale)
      : '',
    reminder: initialContact?.reminder ?? '',
  }));
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );
  const [editingBirthday, setEditingBirthday] = useState(false);
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

  const errors = problems(fields, locale);
  const shown = (key: keyof Fields) =>
    touched[key] && errors[key] ? t(errors[key]) : undefined;
  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const blur = (key: keyof Fields) => () =>
    setTouched((current) => ({ ...current, [key]: true }));

  const birthdayIso = parseBirthday(fields.birthday, locale);
  const birthdayShown =
    !editingBirthday && birthdayIso && !errors.birthday
      ? f.dateTime(new Date(birthdayIso), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : fields.birthday;

  const existingPhoto = photo.kind === 'keep' ? saved?.photoUrl : null;
  const hasPhoto = photo.kind === 'new' || Boolean(existingPhoto);

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
    setTouched({ name: true, phone: true, birthday: true, reminder: true });
    const first = (['name', 'phone', 'birthday', 'reminder'] as const).find(
      (key) => errors[key],
    );
    if (first) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError('');
    const values = {
      name: fields.name.trim(),
      phone: asciiDigits(fields.phone.trim()),
      birthday: birthdayIso,
      reminder: fields.reminder.trim() || null,
    };
    let contact = saved;
    try {
      if (!contact) {
        const body = Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== null),
        );
        contact = (await api<{ contact: Contact }>('contacts', body)).contact;
        setSaved(contact);
      } else {
        const original = {
          name: contact.name,
          phone: contact.phone,
          birthday: contact.birthday?.slice(0, 10) ?? null,
          reminder: contact.reminder,
        };
        // The API stores phones as an optional + followed by digits.
        const normalized = (phone: string) =>
          (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
        const changes = Object.fromEntries(
          Object.entries(values).filter(([key, value]) =>
            key === 'phone'
              ? normalized(values.phone) !== original.phone
              : value !== original[key as keyof typeof original],
          ),
        );
        if (Object.keys(changes).length)
          contact = (
            await api<{ contact: Contact }>(`contacts/${contact.id}`, changes, {
              method: 'PATCH',
            })
          ).contact;
      }
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401)
        return router.replace('/login');
      setError(
        err instanceof ApiError && err.status === 404
          ? 'notFound'
          : 'saveFailed',
      );
      return;
    }
    try {
      if (photo.kind === 'new')
        contact = (
          await upload<{ contact: Contact }>(
            `contacts/${contact.id}/photo`,
            'photo',
            photo.file,
          )
        ).contact;
      else if (photo.kind === 'remove' && saved?.photoUrl)
        contact = (
          await api<{ contact: Contact }>(
            `contacts/${contact.id}/photo`,
            undefined,
            { method: 'DELETE' },
          )
        ).contact;
    } catch (err) {
      setSaved(contact);
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      setError(
        code === 'PHOTO_STORAGE_NOT_CONFIGURED'
          ? 'photoUnavailable'
          : code === 'INVALID_IMAGE'
            ? 'photoType'
            : code === 'LIMIT_FILE_SIZE'
              ? 'photoSize'
              : code === 'TOO_MANY_REQUESTS'
                ? 'rateLimit'
                : 'photoFailed',
      );
      return;
    }
    onSaved(contact);
  }

  const field = (
    key: keyof Fields,
    label: string,
    options: {
      placeholder: string;
      optional?: boolean;
      icon?: IconName;
      inputMode?: 'tel' | 'text';
      maxLength: number;
      autoComplete?: string;
      value?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => (
    <div className="contact-field">
      <label htmlFor={`contact-${key}`}>
        {label}
        {options.optional && (
          <span className="optional-chip">{t('optional')}</span>
        )}
      </label>
      <div className="field-line">
        <input
          id={`contact-${key}`}
          name={key}
          value={options.value ?? fields[key]}
          onChange={(event) => set(key)(event.target.value)}
          onFocus={options.onFocus}
          onBlur={() => {
            options.onBlur?.();
            blur(key)();
          }}
          placeholder={options.placeholder}
          inputMode={options.inputMode}
          maxLength={options.maxLength}
          autoComplete={options.autoComplete ?? 'off'}
          dir={key === 'phone' ? 'ltr' : undefined}
          aria-invalid={Boolean(shown(key))}
          aria-describedby={shown(key) ? `contact-${key}-error` : undefined}
        />
        {options.icon && <Icon name={options.icon} />}
      </div>
      {shown(key) && (
        <p className="field-error" id={`contact-${key}-error`}>
          {shown(key)}
        </p>
      )}
    </div>
  );

  return (
    <div className={`contact-form form-${mode}`}>
      <div className="form-decor" aria-hidden="true">
        <span className="form-circle" />
        <span className="form-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
        <span className="sphere sphere-3" />
      </div>
      <button
        type="button"
        className="form-back icon-disc"
        aria-label={t('back')}
        onClick={onClose}
      >
        <Icon name="back" className="directional-icon" />
      </button>
      <button
        type="button"
        className="form-close icon-disc"
        aria-label={t('close')}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      {/* On mobile the form is the whole page, so its title is the page's h1. */}
      <h1 className="form-title">
        {t(mode === 'new' ? 'newTitle' : 'editTitle')}
      </h1>
      <form
        ref={form}
        method="post"
        noValidate
        onSubmit={submit}
        aria-busy={busy}
      >
        <div className="photo-field">
          {photo.kind === 'new' || existingPhoto || mode === 'edit' ? (
            <div className="photo-current">
              {photo.kind === 'new' ? (
                // Local preview of the chosen file.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar avatar-xl" src={photo.url} alt="" />
              ) : (
                <Avatar
                  contact={{
                    id: saved?.id ?? 'new',
                    name: fields.name || saved?.name || '?',
                    photoUrl: existingPhoto ?? null,
                  }}
                  className="avatar-xl"
                />
              )}
              <button
                type="button"
                className="photo-change"
                aria-label={t('changePhoto')}
                onClick={() => file.current?.click()}
              >
                <Icon name="camera" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="photo-add"
              onClick={() => file.current?.click()}
            >
              <Icon name="camera" />
              {t('addPhoto')}
            </button>
          )}
          {hasPhoto && (
            <button
              type="button"
              className="photo-remove text-link"
              onClick={() => setPhoto({ kind: 'remove' })}
            >
              {t('removePhoto')}
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
        <div className="form-fields">
          {field('name', t('nameLabel'), {
            placeholder: t('namePlaceholder'),
            maxLength: 200,
            autoComplete: 'name',
          })}
          {field('phone', t('phoneLabel'), {
            placeholder: t('phonePlaceholder'),
            inputMode: 'tel',
            maxLength: 32,
            autoComplete: 'tel',
          })}
          {field('birthday', t('birthday'), {
            placeholder: t('birthdayPlaceholder'),
            optional: true,
            icon: 'calendar',
            maxLength: 20,
            value: birthdayShown,
            onFocus: () => setEditingBirthday(true),
            onBlur: () => setEditingBirthday(false),
          })}
          {field('reminder', t('reminder'), {
            placeholder: t('reminderPlaceholder'),
            optional: true,
            icon: 'bell',
            maxLength: 2000,
          })}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error === 'rateLimit' ? e('rateLimit') : t(error)}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button-primary"
            disabled={busy}
            // Keep focus in the field: its blur error would move this
            // button away mid-click. Submitting validates every field.
            onMouseDown={(event) => event.preventDefault()}
          >
            {t(busy ? 'saving' : mode === 'new' ? 'saveNew' : 'saveEdit')}
          </button>
          <button type="button" className="form-cancel" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
