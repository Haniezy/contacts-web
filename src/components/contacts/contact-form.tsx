'use client';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import {
  api,
  ApiError,
  asciiDigits,
  displayDigits,
  isUnreachable,
  upload,
} from '@/lib/api';
import { formatPhone, sameTags, type Contact, type Tag } from '@/lib/contacts';
import { newId, type OfflineBook, type Values } from '@/lib/offline-book';
import { serviceDown } from '@/lib/online';
import { birthdayInput, parseBirthday } from '@/lib/jalali';
import { Icon, type IconName } from '@/components/icon';
import { Avatar } from './avatar';
import { DuplicateConfirm } from './duplicate-confirm';
import { TagPicker } from './tags';

// The date picker package loads only when the calendar is first opened
// (never on the server: it opens on a click). The list loads it ahead of
// time too, through this same function, so it is kept for offline use.
export const loadCalendar = () => import('./birthday-calendar');
const BirthdayCalendar = lazy(loadCalendar);

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
const maxPhoto = 4 * 1024 * 1024;
// What each field lets through as it is typed or pasted: the phone takes
// digits, spaces and one leading +; the birthday digits and separators.
const digit = '0-9۰-۹٠-٩';
const allowed: Partial<Record<keyof Fields, (value: string) => string>> = {
  phone: (value) =>
    value
      .replace(new RegExp(`[^${digit}\\s+]`, 'g'), '')
      .replace(/(?!^)\+/g, ''),
  birthday: (value) =>
    value.replace(new RegExp(`[^${digit}/.\\-\\s]`, 'g'), ''),
};

function problems(fields: Fields, locale: string) {
  const errors: Partial<Record<keyof Fields, string>> = {};
  const name = fields.name.trim();
  // Same rules as the API: printable text, 2–28 characters.
  if (name.length < 2 || name.length > 28 || /\p{Cc}/u.test(name))
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
// submit label differ between the two modes. With `local` (offline, or
// changes still waiting to sync) it saves into the offline book instead,
// and so does a save whose connection drops halfway.
export function ContactForm({
  mode: initialMode,
  contact: initialContact,
  book,
  local,
  tags,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  contact?: Contact;
  book: OfflineBook | null;
  local: boolean;
  // The user's tags to choose from.
  tags: Tag[];
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
  // A new contact's ID, made here: saving again after a lost reply, or
  // syncing an offline save, never creates it twice.
  const [newContactId] = useState(newId);
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
  const [tagIds, setTagIds] = useState(initialContact?.tagIds ?? []);
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
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

  // Is this number already in the book? Asked shortly after typing stops,
  // only for a valid number; the contact being edited is left out.
  const [matches, setMatches] = useState<Pick<Contact, 'id' | 'name'>[]>([]);
  // Save waits for that check (the button stays as it is, just disabled).
  const [checking, setChecking] = useState(false);
  // Save was pressed with a taken number: the confirm window is open.
  const [confirming, setConfirming] = useState<
    Pick<Contact, 'id' | 'name'>[] | null
  >(null);
  const phoneToCheck = errors.phone ? '' : asciiDigits(fields.phone.trim());
  const quotes = locale === 'fa' ? ['«', '»'] : ['“', '”'];
  const ownerNames = (owners: Pick<Contact, 'id' | 'name'>[]) => (
    <>
      {owners.map((owner, i) => (
        <span key={owner.id}>
          {i > 0 && t('nameSeparator')}
          {quotes[0]}
          <bdi>{owner.name}</bdi>
          {quotes[1]}
        </span>
      ))}
    </>
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!phoneToCheck) return setMatches([]);
      if (local && book)
        return setMatches(book.owners(phoneToCheck, saved?.id));
      const query = new URLSearchParams({ phone: phoneToCheck });
      if (saved) query.set('except', saved.id);
      api<{ contacts: Pick<Contact, 'id' | 'name'>[] }>(
        `contacts/match?${query}`,
        undefined,
        { signal: controller.signal },
      )
        .then(({ contacts }) => setMatches(contacts))
        .catch(() => {
          // A missed check only means no note.
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [phoneToCheck, saved, local, book]);
  const shown = (key: keyof Fields) =>
    touched[key] && errors[key] ? t(errors[key]) : undefined;
  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({
      ...current,
      [key]: allowed[key]?.(value) ?? value,
    }));
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
    if (busy || checking) return;
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
    // A number already in the book asks first. Checked again here, so a
    // quick save cannot slip past the note under the field.
    setChecking(true);
    const owners = await phoneOwners();
    setChecking(false);
    if (owners.length) {
      setMatches(owners);
      setConfirming(owners);
      return;
    }
    await save();
  }

  // Others saved with this number. Not asked when editing without changing
  // the number, and a failed check never stops saving.
  async function phoneOwners() {
    const phone = asciiDigits(fields.phone.trim());
    if (saved && phone.replace(/\D/g, '') === saved.phone.replace(/\D/g, ''))
      return [];
    if (local && book) return book.owners(phone, saved?.id);
    try {
      const query = new URLSearchParams({ phone });
      if (saved) query.set('except', saved.id);
      return (
        await api<{ contacts: Pick<Contact, 'id' | 'name'>[] }>(
          `contacts/match?${query}`,
        )
      ).contacts;
    } catch {
      return [];
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    const values: Values = {
      name: fields.name.trim(),
      phone: asciiDigits(fields.phone.trim()),
      birthday: birthdayIso,
      reminder: fields.reminder.trim() || null,
      // Tags deleted meanwhile are dropped by the API.
      tagIds,
    };
    // What an edit changes; the API stores phones as an optional + followed
    // by digits.
    const normalized = (phone: string) =>
      (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
    const changes: Partial<Values> = saved
      ? Object.fromEntries(
          Object.entries(values).filter(([key, value]) =>
            key === 'phone'
              ? normalized(values.phone) !== saved.phone
              : key === 'birthday'
                ? value !== (saved.birthday?.slice(0, 10) ?? null)
                : key === 'tagIds'
                  ? !sameTags(tagIds, saved.tagIds)
                  : value !== saved[key as 'name' | 'reminder'],
          ),
        )
      : values;
    const newPhoto =
      photo.kind === 'new'
        ? photo.file
        : photo.kind === 'remove' && saved?.photoUrl
          ? ('remove' as const)
          : undefined;
    // Kept on this device until the user syncs it. `sent`: the new
    // contact's request went out and no reply came, so it may exist.
    const keep = async (contact = saved, sent = false) =>
      onSaved(
        await book!.save(
          contact?.id ?? newContactId,
          !contact,
          contact === saved ? changes : {},
          newPhoto,
          sent,
        ),
      );
    if (local && book) return keep();
    let contact = saved;
    try {
      if (!contact) {
        const body = Object.fromEntries(
          Object.entries(values).filter(
            ([, value]) =>
              value !== null && !(Array.isArray(value) && !value.length),
          ),
        );
        contact = (
          await api<{ contact: Contact }>('contacts', {
            id: newContactId,
            ...body,
          })
        ).contact;
        setSaved(contact);
      } else {
        if (Object.keys(changes).length)
          contact = (
            await api<{ contact: Contact }>(`contacts/${contact.id}`, changes, {
              method: 'PATCH',
            })
          ).contact;
      }
    } catch (err) {
      // The service cannot be reached: keep it here like an offline save
      // (while the service is checked in the background).
      if (book && isUnreachable(err)) {
        void serviceDown();
        return keep(saved, true);
      }
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
      // Saved, but the photo lost its connection: it waits here.
      if (book && isUnreachable(err)) {
        void serviceDown();
        await book.remember(contact);
        return keep(contact);
      }
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
    await book?.remember(contact);
    onSaved(contact);
  }

  const field = (
    key: keyof Fields,
    label: string,
    options: {
      placeholder: string;
      optional?: boolean;
      icon?: IconName;
      inputMode?: 'tel' | 'numeric' | 'text';
      maxLength: number;
      autoComplete?: string;
      value?: string;
      onFocus?: () => void;
      onBlur?: () => void;
      // A control at the end of the line (in place of the icon) and content
      // under the field, such as the date picker.
      action?: ReactNode;
      after?: ReactNode;
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
        {options.action}
      </div>
      {options.after}
      {shown(key) && (
        <p className="field-error" id={`contact-${key}-error`}>
          {shown(key)}
        </p>
      )}
    </div>
  );

  return (
    <div className={`contact-form form-${mode}`}>
      <div className="form-head">
        <button
          type="button"
          className="form-back icon-disc"
          aria-label={t('back')}
          onClick={onClose}
        >
          <Icon name="back" className="directional-icon" />
        </button>
        {/* On mobile the form is the whole page, so its title is the
            page's h1. */}
        <h1 className="form-title">
          {t(mode === 'new' ? 'newTitle' : 'editTitle')}
        </h1>
        <button
          type="button"
          className="form-close icon-disc"
          aria-label={t('close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
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
            maxLength: 28,
            autoComplete: 'name',
          })}
          {field('phone', t('phoneLabel'), {
            placeholder: t('phonePlaceholder'),
            inputMode: 'tel',
            maxLength: 32,
            autoComplete: 'tel',
            after: matches.length > 0 && (
              <p className="phone-match" role="status">
                <Icon name="users" />
                <span>
                  {t.rich('phoneTaken', { names: () => ownerNames(matches) })}
                </span>
              </p>
            ),
          })}
          {field('birthday', t('birthday'), {
            placeholder: t('birthdayPlaceholder'),
            optional: true,
            inputMode: 'numeric',
            maxLength: 20,
            value: birthdayShown,
            onFocus: () => setEditingBirthday(true),
            onBlur: () => {
              setEditingBirthday(false);
              // Show what was understood, e.g. ۱۳۸۳۲۳ becomes ۳/۲/۱۳۸۳.
              if (birthdayIso)
                set('birthday')(birthdayInput(birthdayIso, locale));
            },
            action: (
              <button
                type="button"
                className="calendar-toggle"
                aria-label={t('pickBirthday')}
                aria-expanded={calendarOpen}
                onClick={() => setCalendarOpen((open) => !open)}
              >
                <Icon name="calendar" />
              </button>
            ),
            after: calendarOpen && (
              <Suspense fallback={null}>
                <BirthdayCalendar
                  locale={locale}
                  label={t('pickBirthday')}
                  selected={
                    // Local midnight of the stored day.
                    birthdayIso ? new Date(`${birthdayIso}T00:00`) : undefined
                  }
                  onSelect={(date) => {
                    const iso = [
                      date.getFullYear(),
                      String(date.getMonth() + 1).padStart(2, '0'),
                      String(date.getDate()).padStart(2, '0'),
                    ].join('-');
                    set('birthday')(birthdayInput(iso, locale));
                    setTouched((current) => ({ ...current, birthday: true }));
                    setCalendarOpen(false);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              </Suspense>
            ),
          })}
          {field('reminder', t('reminder'), {
            placeholder: t('reminderPlaceholder'),
            optional: true,
            icon: 'bell',
            maxLength: 2000,
          })}
          {tags.length > 0 && (
            <fieldset className="contact-field tag-field">
              <legend>
                {t('tags')}
                <span className="optional-chip">{t('optional')}</span>
              </legend>
              <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
            </fieldset>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error === 'rateLimit' ? e('rateLimit') : t(error)}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button-primary"
            disabled={busy || checking}
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
      {confirming && (
        <DuplicateConfirm
          names={ownerNames(confirming)}
          busy={busy}
          onSave={async () => {
            await save();
            setConfirming(null);
          }}
          onBack={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
