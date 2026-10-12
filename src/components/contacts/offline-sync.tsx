'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { OfflineBook } from '@/lib/offline-book';
import { onlineStore } from '@/lib/online';
import { Icon } from '@/components/icon';

const nothing = () => () => {};

// This account's offline book, the connection, and how many changes wait
// to be synced. `local` is true while the list and every save go through
// the book: offline, and online until the waiting changes are synced.
export function useOfflineBook(userId: string) {
  const [book, setBook] = useState<OfflineBook | null>(null);
  useEffect(() => {
    let live = true;
    void OfflineBook.open(userId).then((opened) => {
      if (live) setBook(opened);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  const online = useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.get,
    onlineStore.server,
  );
  const pending = useSyncExternalStore(
    book?.subscribe ?? nothing,
    () => book?.pending() ?? 0,
    () => 0,
  );
  return { book, online, pending, local: !!book && (!online || pending > 0) };
}

export type SyncState =
  | { kind: 'waiting' }
  | { kind: 'syncing' }
  | { kind: 'done'; skipped: number }
  | { kind: 'failed' };

// Back online with changes made offline: "Sync changes", which the user
// confirms. Afterwards it says how it went and goes away by itself.
export function SyncToast({
  state,
  pending,
  onSync,
  onDone,
}: {
  state: SyncState;
  pending: number;
  onSync: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('Sync');
  useEffect(() => {
    if (state.kind !== 'done') return;
    const timer = setTimeout(onDone, state.skipped ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [state, onDone]);
  const failed = state.kind === 'failed';
  return createPortal(
    <div
      className={`sync-toast${failed ? ' is-failed' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-labelledby="sync-title"
    >
      <span className="sync-icon">
        <Icon name={failed ? 'alert' : 'sync'} />
      </span>
      <div>
        <p className="sync-title" id="sync-title">
          {t(state.kind === 'done' ? 'doneTitle' : 'title')}
        </p>
        <p>
          {state.kind === 'done'
            ? state.skipped
              ? t('skipped', { count: state.skipped })
              : t('done')
            : failed
              ? t('failed')
              : t('waiting', { count: pending })}
        </p>
      </div>
      {state.kind !== 'done' && (
        <button
          type="button"
          className="sync-confirm"
          disabled={state.kind === 'syncing'}
          onClick={onSync}
        >
          {t(
            state.kind === 'syncing' ? 'syncing' : failed ? 'retry' : 'confirm',
          )}
        </button>
      )}
    </div>,
    document.body,
  );
}
