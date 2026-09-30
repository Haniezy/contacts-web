'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import {
  countDuplicates,
  groupByInitial,
  pageSize,
  type Contact,
  type ContactPage,
} from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { ThemeSwitch } from '@/components/preferences/theme-switch';
import { LanguageSwitch } from '@/components/preferences/language-switch';
import { ContactRow } from './contact-row';
import { ContactPanel } from './contact-panel';
import { AccountMenu, type AccountUser } from './account-menu';
import { DeleteDialog } from './delete-dialog';

const searchDelay = 300;

export function ContactsApp({
  user,
  initial,
  duplicates: initialDuplicates,
}: {
  user: AccountUser;
  initial: ContactPage | null;
  duplicates: number;
}) {
  const t = useTranslations('Contacts');
  const a = useTranslations('Auth');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(initial === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [duplicates, setDuplicates] = useState(initialDuplicates);
  const search = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const firstQuery = useRef(true);

  const load = useCallback(
    async (q: string, page: number, signal?: AbortSignal) =>
      api<ContactPage>(
        `contacts?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
        undefined,
        { signal },
      ),
    [],
  );

  // Debounced search; a newer query aborts the request of an older one.
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      search.current?.abort();
      const controller = new AbortController();
      search.current = controller;
      try {
        setData(await load(query.trim(), 1, controller.signal));
        setFailed(false);
      } catch (error) {
        if (!controller.signal.aborted) setFailed(true);
        if (error instanceof ApiError && error.status === 401)
          router.replace('/login');
      }
    }, searchDelay);
    return () => clearTimeout(timer);
  }, [query, load, router]);

  // Infinite scroll: fetch the next page when the end of the list is near.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !data || data.pagination.page >= data.pagination.totalPages)
      return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore) return;
        setLoadingMore(true);
        const controller = search.current ?? new AbortController();
        try {
          const next = await load(
            query.trim(),
            data.pagination.page + 1,
            controller.signal,
          );
          setData((current) =>
            current && current.pagination.page === data.pagination.page
              ? {
                  contacts: [
                    ...current.contacts,
                    ...next.contacts.filter(
                      (c) => !current.contacts.some((o) => o.id === c.id),
                    ),
                  ],
                  pagination: next.pagination,
                }
              : current,
          );
        } catch {
          if (!controller.signal.aborted) setFailed(true);
        } finally {
          setLoadingMore(false);
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [data, loadingMore, load, query]);

  const refreshDuplicates = useCallback(async () => {
    try {
      const results = await Promise.all(
        (['phone', 'name'] as const).map((by) =>
          api<Parameters<typeof countDuplicates>[0][number]>(
            `contacts/duplicates?by=${by}&pageSize=100`,
          ),
        ),
      );
      setDuplicates(countDuplicates(results));
    } catch {
      // The badge keeps its previous value; the list is already correct.
    }
  }, []);

  function removed(id: string) {
    setData(
      (current) =>
        current && {
          contacts: current.contacts.filter((c) => c.id !== id),
          pagination: {
            ...current.pagination,
            total: Math.max(0, current.pagination.total - 1),
          },
        },
    );
    if (selectedId === id) setSelectedId(null);
    if (expandedId === id) setExpandedId(null);
    setDeleting(null);
    void refreshDuplicates();
  }

  const contacts = data?.contacts ?? [];
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const count = (
    <span className="count-chip">
      {t('count', { count: data?.pagination.total ?? 0 })}
    </span>
  );

  return (
    <div className="contacts-page">
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
      </div>
      <header className="contacts-header">
        <Link href="/contacts" className="contacts-logo">
          <span>
            <Icon name="book" />
          </span>
          {a('brand')}
        </Link>
        <form
          role="search"
          className="contacts-search"
          onSubmit={(event) => event.preventDefault()}
        >
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            maxLength={200}
            enterKeyHint="search"
          />
        </form>
        <button
          type="button"
          className="menu-button"
          aria-label={t('menu')}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <div className="header-preferences">
          <ThemeSwitch />
          <LanguageSwitch />
          <button
            type="button"
            className="account-button"
            aria-label={t('account')}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="chevron" />
            <span className="user-avatar">{user.initial}</span>
          </button>
        </div>
        <div className="contacts-title">
          <h1>{t('title')}</h1>
          {count}
        </div>
      </header>
      <main className="contacts-main">
        <section className="contacts-column" aria-labelledby="contacts-title">
          <div className="contacts-title">
            <h1 id="contacts-title">{t('title')}</h1>
            {count}
          </div>
          <div className="contacts-scroll">
            {failed ? (
              <p role="alert" className="form-error">
                {t('failed')}
              </p>
            ) : contacts.length === 0 ? (
              <p className="contacts-empty">
                {t(query.trim() ? 'noResults' : 'empty')}
              </p>
            ) : (
              groupByInitial(contacts).map((group) => (
                <section key={group.letter} className="contact-group">
                  <h2 className="letter-chip">{group.letter}</h2>
                  <ul>
                    {group.contacts.map((contact) => (
                      <ContactRow
                        key={contact.id}
                        contact={contact}
                        expanded={expandedId === contact.id}
                        selected={selectedId === contact.id}
                        onToggle={() => {
                          setExpandedId((id) =>
                            id === contact.id ? null : contact.id,
                          );
                          setSelectedId(contact.id);
                        }}
                        onDelete={() => setDeleting(contact)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
            <div ref={sentinel} className="list-sentinel" aria-hidden="true" />
            {loadingMore && (
              <p className="contacts-loading" role="status">
                {t('loading')}
              </p>
            )}
          </div>
          <Link
            href="/contacts/new"
            prefetch={false}
            className="contacts-fab"
            aria-label={t('addContact')}
          >
            <Icon name="plus" />
          </Link>
        </section>
        <ContactPanel
          contact={selected}
          duplicates={duplicates}
          onDelete={setDeleting}
        />
      </main>
      <div className="contacts-fade" aria-hidden="true" />
      <AccountMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        duplicates={duplicates}
      />
      <DeleteDialog
        contact={deleting}
        onCancel={() => setDeleting(null)}
        onDeleted={removed}
      />
    </div>
  );
}
