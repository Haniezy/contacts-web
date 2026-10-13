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
import { api, ApiError, isUnreachable } from '@/lib/api';
import {
  duplicateCountPath,
  groupByInitial,
  showInitial,
  pageSize,
  tagsPath,
  type Contact,
  type ContactPage,
  type DuplicatePage,
  type Tag,
  trashedKey,
} from '@/lib/contacts';
import { keepForOffline } from '@/lib/offline';
import { markDown, openedFromSavedCopy, serviceDown } from '@/lib/online';
import { Icon } from '@/components/icon';
import { ContactRow } from './contact-row';
import { ContactSheet } from './contact-sheet';
import { DeskList } from './desk-list';
import { DeskSidebar, SideDrawer, useSidebarCollapsed } from './sidebar';
import { DeskTopbar } from './desk-topbar';
import { UserAvatar, type AccountUser } from './account-menu';
import { DeleteDialog } from './delete-dialog';
import { UndoToast, type TrashNote } from './undo-toast';
import { ContactForm, loadCalendar } from './contact-form';
import { SyncToast, useOfflineBook, type SyncState } from './offline-sync';
import { TagDialog, type TagEdit } from './tag-dialog';
import { TagDot, tagStyle } from './tags';

const searchDelay = 300;
// Same alphabetical order as the API (ICU collation).
const collator = new Intl.Collator('fa');
export type FormState = { mode: 'new' } | { mode: 'edit'; contact: Contact };
// First page (null when it could not be read), the duplicate group count
// and the tags (null when they could not be read).
export type InitialContacts = {
  page: ContactPage | null;
  duplicates: number;
  tags: Tag[] | null;
};
const editPath = /^\/contacts\/([0-9a-f-]{36})\/edit$/i;
const skeletonRows = 6;
// How long the desktop side panel takes to slide in or out (the CSS).
const panelMotion = 320;

// The last value that was not null, kept for `ms` after it becomes null:
// what the side panel shows while it slides away.
function useLatched<T>(value: T | null, ms: number) {
  const [kept, setKept] = useState(value);
  if (value !== null && value !== kept) setKept(value);
  useEffect(() => {
    if (value !== null) return;
    const timer = setTimeout(() => setKept(null), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return value ?? kept;
}

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
  userId,
  user,
  initial,
  initialForm = null,
}: {
  userId: string;
  user: AccountUser;
  initial: Promise<InitialContacts>;
  initialForm?: FormState | null;
}) {
  const t = useTranslations('Contacts');
  const router = useRouter();
  const locale = useLocale();
  // Offline, and online until the changes made offline are synced, the
  // list and every save go through the book kept on this device.
  const { book, online, pending, local } = useOfflineBook(userId);
  const mode = useRef({ book, local, locale });
  useEffect(() => {
    mode.current = { book, local, locale };
  }, [book, local, locale]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
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
  // Desktop: the list in pages (the phone layout scrolls on instead); pages
  // beyond the ones the phone list has read are fetched on their own.
  const [deskPage, setDeskPage] = useState(1);
  const [deskSize, setDeskSize] = useState(10);
  const [deskFetched, setDeskFetched] = useState<{
    key: string;
    page: ContactPage;
  } | null>(null);
  // The whole book's size (the list's own total follows the search).
  const [bookTotal, setBookTotal] = useState<number>();
  const [collapsed, toggleSidebar] = useSidebarCollapsed();
  // The contact last chosen, for when its page is no longer the one shown.
  const [chosen, setChosen] = useState<Contact | null>(null);
  // The user's tags as the server lists them; the list shows only the
  // contacts with `tagFilter`, when set.
  const [tagList, setTagList] = useState<Tag[]>();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagEdit, setTagEdit] = useState<TagEdit | null>(null);
  const tagRef = useRef(tagFilter);
  // True when the form was opened in place (history entry pushed here).
  const pushed = useRef(false);
  const search = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const firstQuery = useRef(true);

  const load = useCallback(
    async (q: string, page: number, signal?: AbortSignal, size = pageSize) => {
      const { book, local, locale } = mode.current;
      const tag = tagRef.current ?? undefined;
      if (book && local) return book.page(q, page, size, locale, tag);
      try {
        const query = new URLSearchParams({
          q,
          page: String(page),
          pageSize: String(size),
        });
        if (tag) query.set('tag', tag);
        return await api<ContactPage>(`contacts?${query}`, undefined, {
          signal,
        });
      } catch (error) {
        // The service cannot be reached: the copy on this device. (One
        // failed request while the service is up shows the error toast.)
        if (
          book?.hasCopy() &&
          isUnreachable(error) &&
          !signal?.aborted &&
          (await serviceDown())
        )
          return book.page(q, page, size, locale, tag);
        throw error;
      }
    },
    [],
  );
  const shownSearch = useRef(query);
  useEffect(() => {
    shownSearch.current = query;
  }, [query]);
  // Re-reads the current search from its first page.
  const reload = useCallback(async () => {
    const q = shownSearch.current.trim();
    const page = await load(q, 1);
    setData(page);
    setShownQuery(q);
    setFailed(false);
  }, [load]);

  // Choosing a tag (or none) shows that list from its first page.
  const firstTag = useRef(true);
  useEffect(() => {
    tagRef.current = tagFilter;
    if (firstTag.current) {
      firstTag.current = false;
      return;
    }
    setDeskPage(1);
    setExpandedId(null);
    reload().catch(() => setFailed(true));
  }, [tagFilter, reload]);

  // The tags and their counts again, after a change made online (offline,
  // the book counts them itself).
  const refreshTags = useCallback(async () => {
    const { book, local } = mode.current;
    if (local) return;
    try {
      const { tags } = await api<{ tags: Tag[] }>(tagsPath);
      setTagList(tags);
      await book?.keepTags(tags);
    } catch {
      // The counts stay as they were until the next change.
    }
  }, []);

  // Going offline, coming back, or syncing switches the list between the
  // server and this device's book.
  const wasLocal = useRef(false);
  useEffect(() => {
    if (!book || local === wasLocal.current) return;
    wasLocal.current = local;
    void (async () => {
      // Never read in full on this device yet: start from the page the
      // server sent (the saved copy of this page, offline).
      if (local && !book.hasCopy()) await book.seed((await initial).page);
      await reload().catch(() => {});
      // Back on the server (after a sync, say): its counts.
      if (!local) void refreshTags();
    })();
  }, [book, local, initial, reload, refreshTags]);

  // Without a form this is the list's own page. Offline, the service
  // worker answers /contacts/new (or an edit address) with the saved list
  // page; the address follows, so Back and the form work as usual.
  useEffect(() => {
    if (!initialForm && location.pathname !== '/contacts')
      history.replaceState(history.state, '', '/contacts');
  }, [initialForm]);

  // The page may have come from the saved copy because the service is
  // down (see public/sw.js): then work offline at once; otherwise check
  // the service now, before the first save.
  useEffect(() => {
    void openedFromSavedCopy().then((saved) => {
      if (saved) markDown();
      else void serviceDown();
    });
  }, []);

  // Another window changed the book: show the list as it now is.
  useEffect(
    () =>
      book?.onOtherWindow(() => {
        if (mode.current.local) void reload().catch(() => {});
      }),
    [book, reload],
  );

  // Back to the front: another window may have changed the book.
  useEffect(() => {
    if (!book) return;
    async function onShow() {
      if (document.visibilityState !== 'visible') return;
      await book!.reload();
      if (mode.current.local) await reload().catch(() => {});
    }
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [book, reload]);

  // The installed app must open offline: the service worker keeps this
  // page and its files (production only, like the worker itself).
  useEffect(() => {
    if (!online || process.env.NODE_ENV !== 'production') return;
    const timer = setTimeout(() => void keepForOffline(loadCalendar), 1000);
    return () => clearTimeout(timer);
  }, [online]);

  // Online, the copy is brought up to date shortly after the page opens
  // and whenever the connection comes back.
  useEffect(() => {
    if (!book || !online) return;
    const timer = setTimeout(async () => {
      try {
        await book.refresh();
        // With changes waiting, the list shows the copy: the fresh one.
        if (mode.current.local) await reload();
      } catch (error) {
        // The page came from the saved copy while the service is down:
        // switch to the book at once.
        if (isUnreachable(error)) void serviceDown();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [book, online, reload]);

  // The header stays on top; it casts a shadow once content runs under it.
  const [headerStuck, setHeaderStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setHeaderStuck(scrollY > 4);
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  // The API orders the page's own script first, so a language change
  // reloads the first page in the new order.
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
    setTagList((current) => current ?? first.tags ?? undefined);
    if (first.tags) void mode.current.book?.keepTags(first.tags);
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
        setDeskPage(1);
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

  // Desktop pages past what the phone list has read come from the API.
  const deskKey = `${shownQuery}|${tagFilter}|${deskPage}|${deskSize}`;
  useEffect(() => {
    if (!data) return;
    const end = deskPage * deskSize;
    if (end <= data.contacts.length) return;
    if (data.contacts.length >= data.pagination.total) return;
    const controller = new AbortController();
    load(shownQuery, deskPage, controller.signal, deskSize).then(
      (page) => setDeskFetched({ key: deskKey, page }),
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [data, deskPage, deskSize, deskKey, shownQuery, load]);

  // Escape closes the desktop details (not the form, nor under a dialog).
  useEffect(() => {
    if (!selectedId || form) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      setSelectedId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, form]);

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
    // Desktop shows it beside the list, wherever it now falls.
    setChosen(contact);
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
    void refreshTags();
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
    void refreshTags();
  }

  // Moves a contact to the trash; offline (or with changes waiting) the
  // delete waits in the book like any other change.
  async function remove(contact: Contact) {
    if (book && mode.current.local) return book.remove(contact.id);
    try {
      await api(`contacts/${contact.id}`, undefined, { method: 'DELETE' });
    } catch (error) {
      // The service cannot be reached: the delete waits in the book.
      if (book && isUnreachable(error)) {
        void serviceDown();
        return book.remove(contact.id);
      }
      // Already deleted elsewhere: treat as done.
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
    await book?.forget(contact.id);
  }

  // Shows a contact as it now is wherever it appears.
  function replaced(contact: Contact) {
    const swap = (list: Contact[]) =>
      list.map((c) => (c.id === contact.id ? contact : c));
    setData(
      (current) => current && { ...current, contacts: swap(current.contacts) },
    );
    setDeskFetched(
      (current) =>
        current && {
          ...current,
          page: { ...current.page, contacts: swap(current.page.contacts) },
        },
    );
    setChosen((current) => (current?.id === contact.id ? contact : current));
  }

  // Gives a contact another set of tags straight from its details; offline
  // (or with changes waiting) it waits in the book like any edit.
  async function retag(contact: Contact, tagIds: string[]) {
    replaced({ ...contact, tagIds });
    const keep = async () =>
      replaced(await book!.save(contact.id, false, { tagIds }));
    if (book && mode.current.local) return keep();
    try {
      const { contact: next } = await api<{ contact: Contact }>(
        `contacts/${contact.id}`,
        { tagIds },
        { method: 'PATCH' },
      );
      await book?.remember(next);
      replaced(next);
      void refreshTags();
      // Under a tag, a contact that lost it leaves the list.
      if (tagRef.current) void reload().catch(() => {});
    } catch (error) {
      if (book && isUnreachable(error)) {
        void serviceDown();
        return keep();
      }
      if (error instanceof ApiError && error.status === 401)
        return router.replace('/login');
      replaced(contact);
      setFailed(true);
    }
  }

  // A tag made or changed in its dialog.
  function tagSaved(tag: Tag) {
    setTagEdit(null);
    setTagList((list = []) =>
      list.some((t) => t.id === tag.id)
        ? list.map((t) => (t.id === tag.id ? tag : t))
        : [...list, tag],
    );
    void refreshTags();
  }
  // A tag deleted: it comes off every contact shown, and its list closes.
  function tagDeleted(tag: Tag) {
    setTagEdit(null);
    setTagList((list = []) => list.filter((t) => t.id !== tag.id));
    const without = (list: Contact[]) =>
      list.map((c) =>
        c.tagIds?.includes(tag.id)
          ? { ...c, tagIds: c.tagIds.filter((id) => id !== tag.id) }
          : c,
      );
    setData(
      (current) =>
        current && { ...current, contacts: without(current.contacts) },
    );
    setChosen((current) => current && without([current])[0]);
    if (tagFilter === tag.id) setTagFilter(null);
    void refreshTags();
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
    // A delete still waiting in the book is simply taken back.
    if (await book?.undo(id)) {
      setTrashCount((count) => Math.max(0, (count ?? 1) - 1));
      return reload().catch(() => {});
    }
    try {
      const { contact } = await api<{ contact: Contact }>(
        `contacts/${id}/restore`,
        {},
      );
      await book?.remember(contact);
      setTrashCount((count) => Math.max(0, (count ?? 1) - 1));
      setData(await load(shownQuery, 1));
      void refreshDuplicates();
      void refreshTags();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return router.replace('/login');
      setTrashNote({ kind: 'restoreFailed' });
    }
  }

  // The user confirmed syncing the changes made offline. Once none wait,
  // the list goes back to the server (the effect above).
  async function sync() {
    if (!book) return;
    setSyncState({ kind: 'syncing' });
    const total = book.pending();
    const { skipped, error } = await book.sync();
    void refreshDuplicates();
    if (error) {
      // The session ended: say so here (the changes wait on this device
      // for the same account) rather than leaving for the login page.
      if (error instanceof ApiError && error.status === 401)
        return setSyncState({ kind: 'expired', skipped });
      if (isUnreachable(error)) void serviceDown();
      return setSyncState({ kind: 'failed', skipped });
    }
    // "Done" only once nothing waits: a change made just now is offered
    // again instead.
    setSyncState(book.pending() ? null : { kind: 'done', skipped, total });
  }
  const syncDone = useCallback(() => setSyncState(null), []);

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

  if (data && !shownQuery && !tagFilter && data.pagination.total !== bookTotal)
    setBookTotal(data.pagination.total);
  // Offline (or with changes waiting) the book counts the tags itself.
  const tags = (local && book?.hasTags() ? book.tags() : tagList) ?? [];
  const currentTag = tags.find((tag) => tag.id === tagFilter);
  // Nothing at all in the book (not a search or a tag with no results).
  const emptyBook = (page: ContactPage | null) =>
    page?.pagination.total === 0 && !shownQuery && !query.trim() && !tagFilter;
  const selected = selectedId
    ? (data?.contacts.find((c) => c.id === selectedId) ??
      (deskFetched?.page.contacts.find((c) => c.id === selectedId) ||
        (chosen?.id === selectedId ? chosen : null)))
    : null;
  // The desktop side panel: the form, else the chosen contact; while it
  // slides away it keeps showing what it showed.
  const keptForm = useLatched(form, panelMotion);
  const keptContact = useLatched(selected, panelMotion);
  const panelForm = form ?? (selected ? null : keptForm);
  const panelContact = panelForm ? null : (selected ?? keptContact);
  const panelOpen = Boolean(form || selected);
  // The page of the desktop list, from the phone list's pages when it has
  // read that far, else fetched.
  const deskView = (source: ContactPage | null) => {
    if (!source) return { pages: 1 };
    const total = source.pagination.total;
    const pages = Math.max(1, Math.ceil(total / deskSize));
    const page = Math.min(deskPage, pages);
    const start = (page - 1) * deskSize;
    if (
      start + deskSize <= source.contacts.length ||
      source.contacts.length >= total
    )
      return {
        contacts: source.contacts.slice(start, start + deskSize),
        total,
        pages,
        page,
      };
    if (deskFetched?.key === deskKey)
      return { contacts: deskFetched.page.contacts, total, pages, page };
    return { total, pages, page };
  };
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
    <div
      className={`contacts-page contacts-home${form ? ' has-form' : ''}${collapsed ? ' sidebar-collapsed' : ''}`}
    >
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
      </div>
      <header className={`contacts-header${headerStuck ? ' is-stuck' : ''}`}>
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
        <div className="contacts-title">
          <h1>{t('title')}</h1>
          {count}
        </div>
      </header>
      {loaded(
        <DeskSidebar
          user={user}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          addLink={addLink}
          tags={tags}
          tagFilter={tagFilter}
          onTag={setTagFilter}
          onNewTag={() => setTagEdit({ mode: 'new' })}
          onEditTag={(tag) => setTagEdit({ mode: 'edit', tag })}
        />,
        (page, first) => (
          <DeskSidebar
            user={user}
            total={
              bookTotal ??
              (shownQuery || tagFilter ? undefined : page?.pagination.total)
            }
            duplicates={duplicates ?? first}
            trash={trashCount ?? page?.trashCount}
            collapsed={collapsed}
            onToggle={toggleSidebar}
            addLink={addLink}
            tags={tags}
            tagFilter={tagFilter}
            onTag={setTagFilter}
            onNewTag={() => setTagEdit({ mode: 'new' })}
            onEditTag={(tag) => setTagEdit({ mode: 'edit', tag })}
          />
        ),
      )}
      <DeskTopbar
        query={query}
        onQuery={setQuery}
        user={user}
        online={online}
      />
      <main className={`contacts-main${panelOpen ? ' panel-open' : ''}`}>
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
          {/* Phones and tablets: the tag chosen in the drawer, with a way
              back to everyone. */}
          {currentTag && (
            <button
              type="button"
              className="tag-chip tag-current"
              style={tagStyle(currentTag.color)}
              aria-label={t('clearTag', { name: currentTag.name })}
              onClick={() => setTagFilter(null)}
            >
              <TagDot color={currentTag.color} />
              <bdi>{currentTag.name}</bdi>
              <Icon name="close" />
            </button>
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
                !page ? null : emptyBook(page) ? (
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
                  <p className="contacts-empty">
                    {t(tagFilter && !shownQuery ? 'tagEmpty' : 'noResults')}
                  </p>
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
                            inPlace={local || !online}
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
        {loaded(null, (page) => {
          const view = deskView(page);
          return (
            <DeskList
              contacts={view.contacts}
              total={view.total}
              emptyBook={emptyBook(page)}
              title={currentTag?.name}
              empty={t(tagFilter && !shownQuery ? 'tagEmpty' : 'noResults')}
              page={view.page ?? 1}
              pages={view.pages}
              size={deskSize}
              selectedId={selectedId}
              onSelect={(contact) => {
                setChosen(contact);
                setSelectedId(contact.id);
              }}
              onPage={(next) => {
                setDeskPage(next);
                document.querySelector('.desk-rows')?.scrollTo(0, 0);
              }}
              onSize={(next) => {
                setDeskSize(next);
                setDeskPage(1);
              }}
              addLink={addLink}
            />
          );
        })}
        {/* Desktop: the details (or the form) slide in beside the list and
            out again; on a phone this wrapper is transparent and only the
            form, a page of its own, shows. */}
        <div
          className={`desk-panel${panelOpen ? ' is-open' : ''}${panelForm ? ' is-form-view' : ''}`}
          inert={!panelOpen}
        >
          <div className="desk-panel-inner">
            {panelForm ? (
              <aside
                className={`contact-panel is-form${form ? '' : ' is-closing'}`}
              >
                <ContactForm
                  key={panelForm.mode === 'edit' ? panelForm.contact.id : 'new'}
                  mode={panelForm.mode}
                  contact={
                    panelForm.mode === 'edit' ? panelForm.contact : undefined
                  }
                  book={book}
                  local={local}
                  tags={tags}
                  onClose={closeForm}
                  onSaved={saved}
                />
              </aside>
            ) : panelContact ? (
              <ContactSheet
                key={panelContact.id}
                contact={panelContact}
                tags={tags}
                onTags={(tagIds) => retag(panelContact, tagIds)}
                onClose={() => setSelectedId(null)}
                onEdit={() => openForm({ mode: 'edit', contact: panelContact })}
                onDelete={() => setDeleting(panelContact)}
              />
            ) : null}
          </div>
        </div>
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
      <SideDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        total={bookTotal}
        duplicates={duplicates ?? 0}
        trash={trashCount ?? 0}
        addLink={addLink}
        tags={tags}
        tagFilter={tagFilter}
        onTag={setTagFilter}
        onNewTag={() => setTagEdit({ mode: 'new' })}
        onEditTag={(tag) => setTagEdit({ mode: 'edit', tag })}
      />
      <TagDialog
        edit={tagEdit}
        online={online && !local}
        onClose={() => setTagEdit(null)}
        onSaved={tagSaved}
        onDeleted={tagDeleted}
      />
      <DeleteDialog
        contact={deleting}
        remove={remove}
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
      {/* Back online with changes made offline. It steps aside while the
          trash notice uses the same spot, and while the form is open (on a
          phone it would cover the form's buttons). */}
      {online &&
        !trashNote &&
        !form &&
        (pending > 0 || syncState?.kind === 'done') && (
          <SyncToast
            state={
              !syncState || (syncState.kind === 'done' && pending > 0)
                ? { kind: 'waiting' }
                : syncState
            }
            pending={pending}
            onSync={sync}
            onDone={syncDone}
          />
        )}
    </div>
  );
}
