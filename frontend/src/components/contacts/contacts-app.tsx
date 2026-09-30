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
import { ContactForm } from './contact-form';

const searchDelay = 300;
// Same alphabetical order as the API (ICU collation).
const collator = new Intl.Collator('fa');
export type FormState = { mode: 'new' } | { mode: 'edit'; contact: Contact };
const editPath = /^\/contacts\/([0-9a-f-]{36})\/edit$/i;

export function ContactsApp({
  user,
  initial,
  duplicates: initialDuplicates,
  initialForm = null,
}: {
  user: AccountUser;
  initial: ContactPage | null;
  duplicates: number;
  initialForm?: FormState | null;
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
  const [form, setForm] = useState<FormState | null>(initialForm);
  // True when the form was opened in place (history entry pushed here).
  const pushed = useRef(false);
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

  // The form opens in place (list and search state stay intact) while the
  // address still reflects it, so reload and back behave as expected.
  function openForm(next: FormState) {
    setForm(next);
    setMenuOpen(false);
    const url =
      next.mode === 'new'
        ? '/contacts/new'
        : `/contacts/${next.contact.id}/edit`;
    if (pushed.current) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    pushed.current = true;
    if (!matchMedia('(min-width: 1024px)').matches) scrollTo(0, 0);
  }

  function closeForm() {
    if (pushed.current) {
      pushed.current = false;
      history.back();
      setForm(null);
    } else {
      setForm(null);
      router.replace('/contacts');
    }
  }

  // Back and forward between the list and a form opened in place.
  const listed = useRef(data?.contacts);
  useEffect(() => {
    listed.current = data?.contacts;
  }, [data]);
  useEffect(() => {
    function sync() {
      const path = location.pathname;
      const id = editPath.exec(path)?.[1];
      const contact = id && listed.current?.find((c) => c.id === id);
      pushed.current = path !== '/contacts';
      if (path === '/contacts/new') setForm({ mode: 'new' });
      else if (contact) setForm({ mode: 'edit', contact });
      else setForm(null);
    }
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

  async function saved(contact: Contact) {
    closeForm();
    setSelectedId(contact.id);
    setExpandedId(null);
    // Show the result at once, then re-read the current results so paging
    // and search stay exact.
    setData((current) => {
      if (!current) return current;
      const rest = current.contacts.filter((c) => c.id !== contact.id);
      const at = rest.findIndex(
        (c) => collator.compare(c.name, contact.name) > 0,
      );
      return {
        contacts:
          at === -1
            ? [...rest, contact]
            : [...rest.slice(0, at), contact, ...rest.slice(at)],
        pagination: {
          ...current.pagination,
          total:
            current.pagination.total +
            (rest.length === current.contacts.length ? 1 : 0),
        },
      };
    });
    try {
      setData(await load(query.trim(), 1));
    } catch {
      // The local copy above stays until the next search or reload.
    }
    void refreshDuplicates();
  }

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
    <div className={`contacts-page${form ? ' has-form' : ''}`}>
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
                        onEdit={() => openForm({ mode: 'edit', contact })}
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
            onClick={(event) => {
              event.preventDefault();
              openForm({ mode: 'new' });
            }}
          >
            <Icon name="plus" />
          </Link>
        </section>
        {form ? (
          <aside className="contact-panel is-form">
            <ContactForm
              key={form.mode === 'edit' ? form.contact.id : 'new'}
              mode={form.mode}
              contact={form.mode === 'edit' ? form.contact : undefined}
              onClose={closeForm}
              onSaved={saved}
            />
          </aside>
        ) : (
          <ContactPanel
            contact={selected}
            duplicates={duplicates}
            onNew={() => openForm({ mode: 'new' })}
            onEdit={(contact) => openForm({ mode: 'edit', contact })}
            onDelete={setDeleting}
          />
        )}
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
