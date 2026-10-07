'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api, ApiError, displayDigits } from '@/lib/api';
import { formatPhone, type TrashedContact } from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { Avatar } from './avatar';

const day = 24 * 60 * 60 * 1000;

// The trash: deleted contacts stay a week. Each can be restored or deleted
// for good, and the whole trash emptied; both of those ask first.
export function TrashApp({ initial }: { initial: TrashedContact[] | null }) {
  const t = useTranslations('Trash');
  const c = useTranslations('Contacts');
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [contacts, setContacts] = useState(initial ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // What "delete for good" was asked for: one contact, or everything.
  const [confirming, setConfirming] = useState<TrashedContact | 'all' | null>(
    null,
  );

  async function run(id: string, work: () => Promise<unknown>) {
    setBusy(id);
    setFailed(false);
    try {
      await work();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.replace('/login?next=%2Fcontacts%2Ftrash');
      // Already gone (restored or deleted elsewhere): drop it here too.
      else if (error instanceof ApiError && error.status === 404) return true;
      else setFailed(true);
      return false;
    } finally {
      setBusy(null);
    }
  }
  const drop = (id: string) =>
    setContacts((current) => current.filter((x) => x.id !== id));

  async function restore(contact: TrashedContact) {
    if (await run(contact.id, () => api(`contacts/${contact.id}/restore`, {})))
      drop(contact.id);
  }
  async function deleteForGood() {
    const target = confirming;
    if (!target) return;
    const done = await run(target === 'all' ? 'all' : target.id, () =>
      api(
        target === 'all' ? 'contacts/trash' : `contacts/trash/${target.id}`,
        undefined,
        { method: 'DELETE' },
      ),
    );
    setConfirming(null);
    if (done) {
      if (target === 'all') setContacts([]);
      else drop(target.id);
    }
  }

  // Days left are counted from when the page opened.
  const [now] = useState(() => Date.now());
  const daysLeft = (contact: TrashedContact) =>
    Math.max(1, Math.ceil((Date.parse(contact.purgeAt) - now) / day));

  return (
    <div className="contacts-page duplicates-page trash-page">
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
      </div>
      <header className="duplicates-header">
        <Link
          href="/contacts"
          className="duplicates-back icon-disc"
          aria-label={c('back')}
        >
          <Icon name="back" className="directional-icon" />
        </Link>
        <span className="duplicates-icon trash-icon" aria-hidden="true">
          <Icon name="trash" />
        </span>
        <h1>{t('title')}</h1>
      </header>
      <main className="duplicates-main">
        <div className="trash-summary">
          <p className="duplicates-summary" role="status">
            {initial === null
              ? c('failed')
              : contacts.length > 0
                ? t('summary', { count: contacts.length })
                : t('empty')}
          </p>
          {contacts.length > 0 && (
            <button
              type="button"
              className="trash-empty"
              disabled={busy !== null}
              onClick={() => setConfirming('all')}
            >
              <Icon name="trash" />
              {t('emptyTrash')}
            </button>
          )}
        </div>
        <p className="trash-note">{t('note')}</p>
        {failed && (
          <p role="alert" className="form-error">
            {t('failed')}
          </p>
        )}
        <ul className="trash-list">
          {contacts.map((contact) => (
            <li key={contact.id} className="duplicate-card trash-card">
              <div className="duplicate-member">
                <Avatar contact={contact} />
                <div>
                  <p className="member-name">
                    <bdi>{contact.name}</bdi>
                  </p>
                  <p className="member-phone" dir="ltr">
                    {displayDigits(formatPhone(contact.phone), locale)}
                  </p>
                  <p className="trash-left">
                    {t('daysLeft', { count: daysLeft(contact) })}
                    {' · '}
                    {t('deletedOn', {
                      date: f.dateTime(new Date(contact.deletedAt), {
                        day: 'numeric',
                        month: 'long',
                      }),
                    })}
                  </p>
                </div>
              </div>
              <div className="trash-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy !== null}
                  onClick={() => restore(contact)}
                  aria-label={t('restoreLabel', { name: contact.name })}
                >
                  <Icon name="back" className="restore-icon" />
                  {t('restore')}
                </button>
                <button
                  type="button"
                  className="button-danger"
                  disabled={busy !== null}
                  onClick={() => setConfirming(contact)}
                  aria-label={t('deleteLabel', { name: contact.name })}
                >
                  <Icon name="trash" />
                  {t('deleteForGood')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
      {confirming && (
        <ForeverConfirm
          title={
            confirming === 'all'
              ? t('emptyTitle', { count: contacts.length })
              : t('deleteTitle', { name: confirming.name })
          }
          busy={busy !== null}
          onConfirm={deleteForGood}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

// Deleting for good cannot be undone: ask, with "Cancel" focused.
function ForeverConfirm({
  title,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Trash');
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="delete-dialog"
      aria-labelledby="forever-title"
      aria-describedby="forever-help"
      onClose={() => {
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="delete-sheet">
        <span className="delete-badge">
          <Icon name="trash" />
        </span>
        <h2 id="forever-title">{title}</h2>
        <p id="forever-help">{t('foreverHelp')}</p>
        <div className="delete-actions">
          <button
            type="button"
            className="button-danger-solid"
            disabled={busy}
            onClick={onConfirm}
          >
            {t('deleteForGood')}
          </button>
          <button
            ref={cancel}
            type="button"
            className="button-mint"
            disabled={busy}
            onClick={onCancel}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
