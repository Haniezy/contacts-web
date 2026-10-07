'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';

// After a delete: "“…” moved to the trash" with Undo, for six seconds.
// Also says when restoring failed.
export type TrashNote =
  | { kind: 'moved'; id: string; name: string }
  | { kind: 'restoreFailed' };

export function UndoToast({
  note,
  onUndo,
  onDone,
}: {
  note: TrashNote;
  onUndo: (id: string) => void;
  onDone: () => void;
}) {
  const t = useTranslations('Trash');
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [note, paused, onDone]);
  return createPortal(
    <div
      className={`undo-toast${note.kind === 'moved' ? '' : ' is-failed'}`}
      role="status"
      // Hovering or focusing keeps it open long enough to reach Undo.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={note.kind === 'moved' ? 'trash' : 'alert'} />
      <span>
        {note.kind === 'moved'
          ? t.rich('moved', { name: () => <bdi>{note.name}</bdi> })
          : t(note.kind)}
      </span>
      {note.kind === 'moved' && (
        <button type="button" onClick={() => onUndo(note.id)}>
          {t('undo')}
        </button>
      )}
    </div>,
    document.body,
  );
}
