'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
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
    let opened: OfflineBook | null = null;
    void OfflineBook.open(userId).then((book) => {
      opened = book;
      if (live) setBook(book);
      else book.close();
    });
    return () => {
      live = false;
      opened?.close();
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

// `skipped`: names of changes set aside as no longer possible.
export type SyncState =
  | { kind: 'waiting' }
  | { kind: 'syncing' }
  // `total`: how many changes were waiting when syncing began.
  | { kind: 'done'; skipped: string[]; total: number }
  | { kind: 'failed'; skipped: string[] }
  // The session ended midway; signing in again (same account) resumes.
  | { kind: 'expired'; skipped: string[] };

// Back online with changes made offline: "Sync changes", which the user
// confirms. Afterwards it says how it went: all saved (and it goes away by
// itself), some set aside (named), stopped before the end (retry), or the
// session ended (sign in).
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
  const locale = useLocale();
  const skipped =
    state.kind === 'done' || state.kind === 'failed' || state.kind === 'expired'
      ? state.skipped
      : [];
  useEffect(() => {
    if (state.kind !== 'done') return;
    const timer = setTimeout(onDone, state.skipped.length ? 12000 : 4000);
    return () => clearTimeout(timer);
  }, [state, onDone]);
  const failed = state.kind === 'failed';
  const expired = state.kind === 'expired';
  const warn = failed || expired || skipped.length > 0;
  const quote = (name: string) => (locale === 'fa' ? `«${name}»` : `“${name}”`);
  const names = skipped.filter(Boolean).map(quote);
  const setAside = skipped.length
    ? t('skipped', {
        count: skipped.length,
        names: names.length
          ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
          : 'none',
      })
    : '';
  return createPortal(
    <div
      className={`sync-toast${warn ? ' is-failed' : ''}`}
      role={warn ? 'alert' : 'status'}
      aria-labelledby="sync-title"
    >
      <span className="sync-icon">
        <Icon name={warn ? 'alert' : 'sync'} />
      </span>
      <div>
        <p className="sync-title" id="sync-title">
          {t(
            state.kind !== 'done'
              ? 'title'
              : skipped.length
                ? 'partialTitle'
                : 'doneTitle',
          )}
        </p>
        <p>
          {state.kind === 'done'
            ? skipped.length
              ? state.total > skipped.length
                ? `${setAside} ${t('rest')}`
                : setAside
              : t('done')
            : failed || expired
              ? `${t(expired ? 'expired' : 'failed')}${setAside ? ` ${setAside}` : ''}`
              : t('waiting', { count: pending })}
        </p>
      </div>
      {expired && (
        <Link href="/login" className="sync-confirm">
          {t('signIn')}
        </Link>
      )}
      {state.kind !== 'done' && !expired && (
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
