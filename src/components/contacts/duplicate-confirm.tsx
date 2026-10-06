'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// Saving a number someone in the book already has: ask once, like the
// delete confirmation. "Go back" (or Esc, or a click outside) keeps editing.
export function DuplicateConfirm({
  names,
  busy,
  onSave,
  onBack,
}: {
  names: ReactNode;
  busy: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Contacts');
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    // The safe choice takes focus, so Enter never saves by accident.
    back.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="delete-dialog duplicate-confirm"
      aria-labelledby="duplicate-title"
      aria-describedby="duplicate-help"
      onClose={() => {
        if (!busy) onBack();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onBack();
      }}
    >
      <div className="delete-sheet">
        <span className="delete-badge">
          <Icon name="users" />
        </span>
        <h2 id="duplicate-title">{t('saveAnywayTitle')}</h2>
        <p id="duplicate-help">
          {t.rich('saveAnywayHelp', { names: () => names })}
        </p>
        <div className="delete-actions">
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={onSave}
          >
            {t('saveAnyway')}
          </button>
          <button
            ref={back}
            type="button"
            className="button-mint"
            disabled={busy}
            onClick={onBack}
          >
            {t('saveAnywayBack')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
