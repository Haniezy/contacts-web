'use client';
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import {
  duplicateCountPath,
  groupByInitial,
  showInitial,
  pageSize,
  type Contact,
  type ContactPage,
  type DuplicatePage,
  trashedKey,
} from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { ContactRow } from './contact-row';
import { ContactPanel } from './contact-panel';
import { AccountMenu, UserAvatar, type AccountUser } from './account-menu';
import { DeleteDialog } from './delete-dialog';
import { UndoToast, type TrashNote } from './undo-toast';
import { ContactForm } from './contact-form';

const searchDelay = 300;
// Same alphabetical order as the API (ICU collation).
const collator = new Intl.Collator('fa');
export type FormState = { mode: 'new' } | { mode: 'edit'; contact: Contact };
// First page (null when it could not be read) and the duplicate group count.
export type InitialContacts = { page: ContactPage | null; duplicates: number };
const editPath = /^\/contacts\/([0-9a-f-]{36})\/edit$/i;
const skeletonRows = 6;

// Renders from local state once it exists; before that, from the streamed
// first page, suspending (showing the fallback) until it arrives.
function Loaded({
  data,
  initial,
  onFirst,
  children,
}: {
  data: ContactPage | null | undefined;
  initial: Promise<InitialContacts>;
  onFirst: (first: InitialContacts) => void;
  children: (page: ContactPage | null, duplicates: number) => ReactNode;
}) {
  const first = data === undefined ? use(initial) : null;
  // The page takes the first page over from here, once this boundary is
  // hydrated: updating it earlier makes React render the boundary again on
  // the client and leaves the streamed copy behind, hidden.
  useEffect(() => {
    if (first) onFirst(first);
  }, [first, onFirst]);
  return children(first ? first.page : (data ?? null), first?.duplicates ?? 0);
}

export function ContactsApp({
  user,
  initial,
  initialForm = null,
}: {
  user: AccountUser;
  initial: Promise<InitialContacts>;
  initialForm?: FormState | null;
}) {
  const t = useTranslations('Contacts');
  const a = useTranslations('Auth');
  const router = useRouter();
  const [query, setQuery] = useState('');
  // The search the shown results belong to (the empty state needs none).
  const [shownQuery, setShownQuery] = useState('');
  // Undefined until the streamed first page has been taken over.
  const [data, setData] = useState<ContactPage | null>();
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  // After a delete: the "moved to the trash" notice with Undo.
  const [trashNote, setTrashNote] = useState<TrashNote | null>(null);
  // How many contacts are in the trash; undefined until the first page.
  const [trashCount, setTrashCount] = useState<number>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<number>();
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

  // The header stays on top; it casts a shadow once content runs under it.
  const [headerStuck, setHeaderStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setHeaderStuck(scrollY > 4);
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  // The API orders the page's own script first, so a language change
  // reloads the first page in the new order.
  const locale = useLocale();
  const listedLocale = useRef(locale);
  useEffect(() => {
    if (listedLocale.current === locale) return;
    listedLocale.current = locale;
    load(shownQuery, 1)
      .then(setData)
      .catch(() => setFailed(true));
  }, [locale, load, shownQuery]);

  // Take over the streamed first page, unless a search already replaced it.
  const takeOver = useCallback((first: InitialContacts) => {
    setData((current) => (current === undefined ? first.page : current));
    setDuplicates((current) => current ?? first.duplicates);
    setTrashCount((current) => current ?? first.page?.trashCount ?? 0);
  }, []);

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
        setShownQuery(query.trim());
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
      setDuplicates(
        (await api<DuplicatePage>(duplicateCountPath)).pagination.total,
      );
    } catch {
      // The badge keeps its previous value; the list is already correct.
    }
  }, []);

  // The error toast's retry: re-read the current results from the start.
  async function retry() {
    setRetrying(true);
    try {
      setData(await load(query.trim(), 1));
      setShownQuery(query.trim());
      setFailed(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.replace('/login');
    } finally {
      setRetrying(false);
    }
  }

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
      setShownQuery(query.trim());
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
    void refreshDuplicates();
  }

  // Once the dialog has moved it to the trash: Undo for a few seconds.
  function trashed(contact: Contact) {
    setDeleting(null);
    removed(contact.id);
    setTrashCount((count) => (count ?? 0) + 1);
    setTrashNote({ kind: 'moved', id: contact.id, name: contact.name });
  }

  async function undo(id: string) {
    setTrashNote(null);
    try {
      await api(`contacts/${id}/restore`, {});
      setTrashCount((count) => Math.max(0, (count ?? 1) - 1));
      setData(await load(shownQuery, 1));
      void refreshDuplicates();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return router.replace('/login');
      setTrashNote({ kind: 'restoreFailed' });
    }
  }

  // A contact deleted on its own page comes back here with the same notice.
  useEffect(() => {
    let handed: string | null = null;
    try {
      handed = sessionStorage.getItem(trashedKey);
      sessionStorage.removeItem(trashedKey);
    } catch {
      // Storage may be unavailable; the notice is only a convenience.
    }
    if (!handed) return;
    const { id, name } = JSON.parse(handed) as { id: string; name: string };
    const timer = setTimeout(() => setTrashNote({ kind: 'moved', id, name }));
    return () => clearTimeout(timer);
  }, []);

  const selected = data?.contacts.find((c) => c.id === selectedId) ?? null;
  // Parts that need the first page wait for it behind their own skeleton;
  // the header and everything else render straight away.
  const loaded = (
    fallback: ReactNode,
    render: (page: ContactPage | null, duplicates: number) => ReactNode,
  ) => (
    <Suspense fallback={fallback}>
      <Loaded data={data} initial={initial} onFirst={takeOver}>
        {render}
      </Loaded>
    </Suspense>
  );
  const countSkeleton = (
    <span className="shimmer count-skeleton" aria-hidden="true" />
  );
  const count = loaded(countSkeleton, (page) =>
    page ? (
      <span className="count-chip">
        {t('count', { count: page.pagination.total })}
      </span>
    ) : (
      countSkeleton
    ),
  );
  const addLink = (className: string, children: ReactNode, label?: string) => (
    <Link
      href="/contacts/new"
      prefetch={false}
      className={className}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        openForm({ mode: 'new' });
      }}
    >
      {children}
    </Link>
  );

  return (
    <div className={`contacts-page${form ? ' has-form' : ''}`}>
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
      </div>
      <header className={`contacts-header${headerStuck ? ' is-stuck' : ''}`}>
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
        {addLink(
          'contacts-add',
          <>
            <Icon name="plus" />
            <span className="contacts-add-label">{t('addContact')}</span>
          </>,
        )}
        <button
          type="button"
          className="menu-button"
          aria-label={t('menu')}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <UserAvatar user={user} />
          <Icon name="menu" />
        </button>
        <div className="header-preferences">
          <button
            type="button"
            className="account-button"
            aria-label={t('account')}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <UserAvatar user={user} />
            <span className="account-name">
              <bdi>{user.firstName}</bdi>
            </span>
            <span className="account-divider" aria-hidden="true" />
            <Icon name="menu" />
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
          {/* Duplicates as a compact banner above the list, on every size. */}
          {loaded(null, (page, first) =>
            page && page.pagination.total > 0 && (duplicates ?? first) > 0 ? (
              <Link
                href="/contacts/duplicates"
                prefetch={false}
                className="duplicates-banner"
              >
                <span className="banner-icon">
                  <Icon name="users" />
                </span>
                <span className="banner-text">
                  {t('duplicatesFound', { count: duplicates ?? first })}
                </span>
                <span className="banner-action">
                  {t('review')}
                  <Icon name="chevron" className="banner-chevron" />
                </span>
              </Link>
            ) : null,
          )}
          <div className="contacts-scroll">
            {loaded(
              <>
                <div className="contacts-skeleton" aria-hidden="true">
                  {Array.from({ length: skeletonRows }, (_, i) => (
                    <div key={i} className="row-skeleton">
                      <span className="row-skeleton-avatar" />
                      <span className="row-skeleton-text">
                        <span className="shimmer" />
                        <span className="shimmer" />
                      </span>
                    </div>
                  ))}
                </div>
                <p className="sr-only" role="status">
                  {t('loading')}
                </p>
              </>,
              (page) =>
                !page ? null : page.pagination.total === 0 &&
                  !shownQuery &&
                  !query.trim() ? (
                  <div className="contacts-blank">
                    <span className="blank-avatar" aria-hidden="true">
                      <Icon name="user" />
                    </span>
                    <h2>{t('emptyTitle')}</h2>
                    <p>{t('emptyHelp')}</p>
                    {addLink(
                      'button-primary blank-add',
                      <>
                        <Icon name="plus" />
                        {t('add')}
                      </>,
                    )}
                    <span className="sphere sphere-1" aria-hidden="true" />
                    <span className="sphere sphere-2" aria-hidden="true" />
                  </div>
                ) : page.contacts.length === 0 ? (
                  <p className="contacts-empty">{t('noResults')}</p>
                ) : (
                  groupByInitial(page.contacts).map((group) => (
                    <section key={group.letter} className="contact-group">
                      <h2 className="letter-chip">
                        {showInitial(group.letter)}
                      </h2>
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
                ),
            )}
            <div ref={sentinel} className="list-sentinel" aria-hidden="true" />
            {loadingMore && (
              <p className="contacts-loading" role="status">
                {t('loading')}
              </p>
            )}
          </div>
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
          loaded(
            <aside className="contact-panel is-loading">
              <div className="panel-decor" aria-hidden="true">
                <span className="sphere sphere-1" />
                <span className="sphere sphere-4" />
              </div>
              <span className="panel-spinner" />
              <p aria-hidden="true">{t('loading')}</p>
            </aside>,
            () => (
              <ContactPanel
                contact={selected}
                onEdit={(contact) => openForm({ mode: 'edit', contact })}
                onDelete={setDeleting}
              />
            ),
          )
        )}
      </main>
      {loaded(null, (page) =>
        failed || !page ? (
          <div className="error-toast" role="alert">
            <span className="error-icon">
              <Icon name="alert" />
            </span>
            <div>
              <p className="error-title">{t('errorTitle')}</p>
              <p>{t('errorHelp')}</p>
            </div>
            <button
              type="button"
              className="error-retry"
              disabled={retrying}
              onClick={retry}
            >
              {t('retry')}
            </button>
          </div>
        ) : null,
      )}
      <div className="contacts-fade" aria-hidden="true" />
      <AccountMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        duplicates={duplicates ?? 0}
        trash={trashCount ?? 0}
      />
      <DeleteDialog
        contact={deleting}
        onCancel={() => setDeleting(null)}
        onDeleted={trashed}
      />
      {trashNote && (
        <UndoToast
          note={trashNote}
          onUndo={undo}
          onDone={() => setTrashNote(null)}
        />
      )}
    </div>
  );
}
