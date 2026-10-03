'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, displayDigits } from '@/lib/api';
import {
  duplicatePageSize,
  duplicatesPath,
  formatPhone,
  type DuplicateGroup,
  type DuplicatePage,
} from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { Avatar } from './avatar';
import { MergeDialog } from './merge-dialog';

const listPath = '/contacts/duplicates';
const ids = (group: DuplicateGroup) => group.contacts.map((c) => c.id).join();
// Phone and name groups share the list, so the kind is part of the key.
const keyOf = (group: DuplicateGroup) => `${group.by}:${group.value}`;
const mergePath = (group: DuplicateGroup) =>
  `${listPath}/merge?ids=${ids(group)}`;

export function DuplicatesApp({
  initial,
  initialMerge = null,
}: {
  initial: DuplicatePage | null;
  initialMerge?: DuplicateGroup | null;
}) {
  const t = useTranslations('Duplicates');
  const c = useTranslations('Contacts');
  const locale = useLocale();
  const router = useRouter();
  const [groups, setGroups] = useState(initial?.groups ?? []);
  const [total, setTotal] = useState(initial?.pagination.total ?? 0);
  const [merging, setMerging] = useState(initialMerge);
  const [more, setMore] = useState(
    initial ? initial.pagination.page < initial.pagination.totalPages : false,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // True when the merge view was opened in place (history entry pushed here).
  const pushed = useRef(false);
  // Set after a merge until the list address is back: pages the router
  // cached earlier (contacts, duplicate count) are then refreshed.
  const stale = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const listed = useRef(groups);
  useEffect(() => {
    listed.current = groups;
  }, [groups]);

  const refreshIfStale = useCallback(() => {
    if (!stale.current || location.pathname !== listPath) return;
    stale.current = false;
    router.refresh();
  }, [router]);

  // Further groups load as the end of the list comes into view.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !more) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore) return;
        setLoadingMore(true);
        // Merged or ignored groups shift later ones back, so this re-reads
        // the page that holds the next unseen group and skips listed ones.
        const page = Math.floor(listed.current.length / duplicatePageSize) + 1;
        try {
          const next = await api<DuplicatePage>(
            `${duplicatesPath}&page=${page}`,
          );
          setGroups((current) => [
            ...current,
            ...next.groups.filter(
              (g) => !current.some((o) => keyOf(o) === keyOf(g)),
            ),
          ]);
          setTotal(next.pagination.total);
          setMore(page < next.pagination.totalPages);
        } catch {
          // The next intersection tries again.
        } finally {
          setLoadingMore(false);
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [more, loadingMore]);

  // The merge view opens in place while the address reflects it, so reload
  // and the browser's back and forward buttons behave as expected.
  function openMerge(group: DuplicateGroup) {
    setMerging(group);
    history.pushState(null, '', mergePath(group));
    pushed.current = true;
  }

  function closeMerge() {
    setMerging(null);
    if (pushed.current) {
      pushed.current = false;
      history.back();
    } else {
      history.replaceState(null, '', listPath);
      refreshIfStale();
    }
  }

  useEffect(() => {
    function sync() {
      const wanted =
        location.pathname === `${listPath}/merge`
          ? new URLSearchParams(location.search).get('ids')
          : null;
      const group = listed.current.find((g) => ids(g) === wanted) ?? null;
      pushed.current = Boolean(group);
      setMerging(group);
      refreshIfStale();
    }
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [refreshIfStale]);

  function drop(group: DuplicateGroup) {
    setGroups((current) => current.filter((g) => g !== group));
    setTotal((current) => Math.max(0, current - 1));
  }

  // A merge can change other groups too (a contact in both a phone and a
  // name group, or a new name or number), so the loaded pages are re-read.
  async function reload() {
    const pages = Math.max(
      1,
      Math.ceil(listed.current.length / duplicatePageSize),
    );
    try {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          api<DuplicatePage>(`${duplicatesPath}&page=${i + 1}`),
        ),
      );
      const seen = new Set<string>();
      setGroups(
        results
          .flatMap((r) => r.groups)
          .filter((g) => !seen.has(keyOf(g)) && seen.add(keyOf(g))),
      );
      const last = results.at(-1)!.pagination;
      setTotal(last.total);
      setMore(pages < last.totalPages);
    } catch {
      // The list already shows the merge; other groups update on reload.
    }
  }

  async function ignore(group: DuplicateGroup) {
    if (busy) return;
    setBusy(keyOf(group));
    setFailed(null);
    try {
      await api('contacts/duplicates/ignore', {
        by: group.by,
        contactIds: group.contacts.map((c) => c.id),
      });
      drop(group);
      stale.current = true;
      refreshIfStale();
    } catch (error) {
      // Gone or no longer duplicates: the group has nothing left to ignore.
      if (error instanceof ApiError && [404, 409].includes(error.status))
        drop(group);
      else if (error instanceof ApiError && error.status === 401)
        router.replace('/login');
      else setFailed(keyOf(group));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="contacts-page duplicates-page">
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
          aria-label={t('back')}
        >
          <Icon name="back" className="directional-icon" />
        </Link>
        <span className="duplicates-icon" aria-hidden="true">
          <Icon name="users" />
        </span>
        <h1>{t('title')}</h1>
      </header>
      <main className="duplicates-main">
        <p className="duplicates-summary" role="status">
          {initial === null ? (
            c('failed')
          ) : total > 0 ? (
            <>
              {t('summary', { count: total })}
              <span className="only-desktop"> — {t('summaryHint')}</span>
            </>
          ) : (
            t('empty')
          )}
        </p>
        <ul className="duplicate-groups">
          {groups.map((group) => (
            <li key={keyOf(group)} className="duplicate-card">
              <div className="duplicate-members">
                {group.contacts.map((contact, index) => (
                  <Fragment key={contact.id}>
                    {index > 0 && (
                      <span className="duplicate-link" aria-hidden="true">
                        <Icon name="users" />
                      </span>
                    )}
                    <div className="duplicate-member">
                      <Avatar contact={contact} />
                      <div>
                        <p className="member-name">
                          <bdi>{contact.name}</bdi>
                        </p>
                        <p className="member-phone" dir="ltr">
                          {displayDigits(formatPhone(contact.phone), locale)}
                        </p>
                      </div>
                    </div>
                  </Fragment>
                ))}
              </div>
              {failed === keyOf(group) && (
                <p role="alert" className="form-error">
                  {t('ignoreFailed')}
                </p>
              )}
              <div className="duplicate-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => openMerge(group)}
                >
                  <Icon name="users" />
                  {t('review')}
                </button>
                <button
                  type="button"
                  className="duplicate-ignore"
                  disabled={busy === keyOf(group)}
                  onClick={() => ignore(group)}
                >
                  {t('ignore')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div ref={sentinel} className="list-sentinel" aria-hidden="true" />
        {loadingMore && (
          <p className="contacts-loading" role="status">
            {c('loading')}
          </p>
        )}
      </main>
      <MergeDialog
        group={merging}
        onClose={closeMerge}
        onMerged={(group) => {
          drop(group);
          stale.current = true;
          closeMerge();
          void reload();
        }}
      />
    </div>
  );
}
