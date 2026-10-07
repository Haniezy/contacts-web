'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icon';
import type { Contact } from '@/lib/contacts';

// Asks before moving a contact to the trash (where it can still be restored).
export function DeleteDialog({
  contact,
  onCancel,
  onDeleted,
}: {
  contact: Contact | null;
  onCancel: () => void;
  onDeleted: (contact: Contact) => void;
}) {
  const t = useTranslations('Contacts');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Keep the name visible while the closing animation runs.
  const [shown, setShown] = useState(contact);
  if (contact && contact !== shown) {
    setShown(contact);
    setFailed(false);
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (contact && !element.open) element.showModal();
    if (!contact && element.open) element.close();
  }, [contact]);

  async function confirm() {
    if (!contact || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api(`contacts/${contact.id}`, undefined, { method: 'DELETE' });
      onDeleted(contact);
    } catch (error) {
      // Already deleted elsewhere: treat as done.
      if (error instanceof ApiError && error.status === 404)
        onDeleted(contact);
      else if (error instanceof ApiError && error.status === 401)
        router.replace('/login');
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="delete-dialog"
      aria-labelledby="delete-title"
      aria-describedby="delete-help"
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
        <h2 id="delete-title">
          {t('deleteTitle', { name: shown?.name ?? '' })}
        </h2>
        <p id="delete-help">{t('deleteHelp')}</p>
        {failed && (
          <p role="alert" className="form-error">
            {t('deleteFailed')}
          </p>
        )}
        <div className="delete-actions">
          <button
            type="button"
            className="button-danger-solid"
            disabled={busy}
            onClick={confirm}
          >
            {t('delete')}
          </button>
          <button
            type="button"
            className="button-mint"
            disabled={busy}
            onClick={onCancel}
            autoFocus
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
