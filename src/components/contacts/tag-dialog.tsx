'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, isUnreachable } from '@/lib/api';
import { tagColors, tagsPath, type Tag, type TagColor } from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { tagStyle } from './tags';

export type TagEdit = { mode: 'new' } | { mode: 'edit'; tag: Tag };

// Makes a tag, or renames, recolours or deletes one. Changing the list
// needs a connection (giving contacts tags does not).
export function TagDialog({
  edit,
  online,
  onClose,
  onSaved,
  onDeleted,
}: {
  edit: TagEdit | null;
  online: boolean;
  onClose: () => void;
  onSaved: (tag: Tag) => void;
  onDeleted: (tag: Tag) => void;
}) {
  const t = useTranslations('Contacts');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>(tagColors[0]);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Keep the content while the closing animation runs.
  const [shown, setShown] = useState(edit);
  if (edit && edit !== shown) {
    setShown(edit);
    setName(edit.mode === 'edit' ? edit.tag.name : '');
    setColor(edit.mode === 'edit' ? edit.tag.color : tagColors[0]);
    setDeleting(false);
    setError('');
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (edit && !element.open) element.showModal();
    if (!edit && element.open) element.close();
  }, [edit]);

  async function send(run: () => Promise<void>) {
    if (busy) return;
    if (!online) return setError('tagOffline');
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        return router.replace('/login');
      setError(
        isUnreachable(err)
          ? 'tagOffline'
          : err instanceof ApiError && err.code === 'TAG_EXISTS'
            ? 'tagExists'
            : err instanceof ApiError && err.code === 'TAG_LIMIT'
              ? 'tagLimit'
              : 'tagFailed',
      );
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 24) return setError('tagNameInvalid');
    void send(async () => {
      const { tag } =
        shown?.mode === 'edit'
          ? await api<{ tag: Tag }>(
              `${tagsPath}/${shown.tag.id}`,
              { name: trimmed, color },
              { method: 'PATCH' },
            )
          : await api<{ tag: Tag }>(tagsPath, { name: trimmed, color });
      onSaved(tag);
    });
  }

  function remove() {
    if (shown?.mode !== 'edit') return;
    const { tag } = shown;
    void send(async () => {
      try {
        await api(`${tagsPath}/${tag.id}`, undefined, { method: 'DELETE' });
      } catch (err) {
        // Already deleted elsewhere: the same outcome.
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      onDeleted(tag);
    });
  }

  return (
    <dialog
      ref={dialog}
      className="tag-dialog"
      aria-labelledby="tag-dialog-title"
      onClose={() => {
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {deleting && shown?.mode === 'edit' ? (
        <div className="tag-sheet">
          <span className="delete-badge">
            <Icon name="trash" />
          </span>
          <h2 id="tag-dialog-title">
            {t('deleteTagTitle', { name: shown.tag.name })}
          </h2>
          <p className="tag-help">{t('deleteTagHelp')}</p>
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
          <div className="delete-actions">
            <button
              type="button"
              className="button-danger-solid"
              disabled={busy}
              onClick={remove}
            >
              {t('delete')}
            </button>
            <button
              type="button"
              className="button-mint"
              disabled={busy}
              onClick={() => setDeleting(false)}
              autoFocus
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <form className="tag-sheet" noValidate onSubmit={save}>
          <h2 id="tag-dialog-title">
            {t(shown?.mode === 'edit' ? 'editTag' : 'newTag')}
          </h2>
          <label className="tag-name">
            <span>{t('tagName')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('tagNamePlaceholder')}
              maxLength={24}
              autoComplete="off"
              autoFocus
            />
          </label>
          <fieldset className="tag-colors">
            <legend>{t('tagColor')}</legend>
            {tagColors.map((option) => (
              <label
                key={option}
                className="tag-swatch"
                style={tagStyle(option)}
              >
                <input
                  type="radio"
                  name="tag-color"
                  value={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                  aria-label={t(`tagColors.${option}`)}
                />
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
          <div className="delete-actions">
            <button className="button-primary" disabled={busy}>
              {t('saveTag')}
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
          {shown?.mode === 'edit' && (
            <button
              type="button"
              className="tag-delete text-link"
              disabled={busy}
              onClick={() => {
                setError('');
                setDeleting(true);
              }}
            >
              <Icon name="trash" />
              {t('deleteTag')}
            </button>
          )}
        </form>
      )}
    </dialog>
  );
}
