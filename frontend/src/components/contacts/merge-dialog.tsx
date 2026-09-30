'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api, ApiError, displayDigits } from '@/lib/api';
import { formatPhone, type Contact, type DuplicateGroup } from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { Avatar } from './avatar';

const fields = ['name', 'phone', 'birthday', 'reminder'] as const;
type Field = (typeof fields)[number];
type Choice = Record<Field, number>;

// Name and phone default to the first version; optional fields default to
// the first version that has a value.
function defaults(contacts: Contact[]): Choice {
  const filled = (field: 'birthday' | 'reminder') =>
    Math.max(
      0,
      contacts.findIndex((c) => c[field]),
    );
  return {
    name: 0,
    phone: 0,
    birthday: filled('birthday'),
    reminder: filled('reminder'),
  };
}

// Full page on mobile, a modal over the duplicates list on desktop.
export function MergeDialog({
  group,
  onClose,
  onMerged,
}: {
  group: DuplicateGroup | null;
  onClose: () => void;
  onMerged: (group: DuplicateGroup) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Keep the content while the closing animation runs.
  const [shown, setShown] = useState(group);
  if (group && group !== shown) setShown(group);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (group && !element.open) element.showModal();
    if (!group && element.open) element.close();
  }, [group]);

  return (
    <dialog
      ref={dialog}
      className="merge-dialog"
      aria-labelledby="merge-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {shown && (
        <MergeSheet
          key={shown.contacts.map((c) => c.id).join()}
          group={shown}
          onClose={onClose}
          onMerged={onMerged}
        />
      )}
    </dialog>
  );
}

function MergeSheet({
  group,
  onClose,
  onMerged,
}: {
  group: DuplicateGroup;
  onClose: () => void;
  onMerged: (group: DuplicateGroup) => void;
}) {
  const t = useTranslations('Duplicates');
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { contacts } = group;
  const [choice, setChoice] = useState(() => defaults(contacts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The kept record is the version whose name was chosen.
  const target = contacts[choice.name];

  const shown = (field: Field, contact: Contact) => {
    if (field === 'phone')
      return displayDigits(formatPhone(contact.phone), locale);
    if (field === 'birthday')
      return contact.birthday
        ? f.dateTime(new Date(contact.birthday), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })
        : t('notSet');
    return contact[field] || t('notSet');
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const pick = (field: Field) => contacts[choice[field]];
    try {
      await api('contacts/merge', {
        targetId: target.id,
        sourceIds: contacts.filter((c) => c !== target).map((c) => c.id),
        overrides: {
          name: pick('name').name,
          phone: pick('phone').phone,
          birthday: pick('birthday').birthday?.slice(0, 10) ?? null,
          reminder: pick('reminder').reminder,
        },
      });
      onMerged(group);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401)
        return router.replace('/login');
      setError(
        err instanceof ApiError && err.status === 404
          ? 'changed'
          : 'mergeFailed',
      );
    }
  }

  return (
    <div className="merge-sheet">
      <div className="merge-decor" aria-hidden="true">
        <span className="form-circle" />
      </div>
      <button
        type="button"
        className="merge-back icon-disc"
        aria-label={t('back')}
        onClick={onClose}
      >
        <Icon name="back" className="directional-icon" />
      </button>
      <header className="merge-head">
        <div>
          <h2 id="merge-title">{t('mergeTitle')}</h2>
          <p className="merge-count">
            {t('versions', { count: contacts.length })}
          </p>
        </div>
        <Avatar contact={target} className="merge-avatar" />
      </header>
      <form method="post" onSubmit={submit} aria-busy={busy}>
        {fields.map((field) => (
          <fieldset key={field} className="merge-field">
            <legend>{t(field)}</legend>
            <div className="merge-options">
              {contacts.map((contact, index) => (
                <label key={contact.id} className="merge-option">
                  <input
                    type="radio"
                    name={field}
                    checked={choice[field] === index}
                    onChange={() =>
                      setChoice((current) => ({ ...current, [field]: index }))
                    }
                  />
                  <span className="merge-check" aria-hidden="true">
                    <Icon name="chevron" />
                  </span>
                  <bdi dir={field === 'phone' ? 'ltr' : undefined}>
                    {shown(field, contact)}
                  </bdi>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
        <div className="merge-actions">
          <button className="button-primary" disabled={busy}>
            <Icon name="users" />
            {t(busy ? 'merging' : 'merge')}
          </button>
          <button type="button" className="merge-cancel" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
