import { api, ApiError, asciiDigits, isUnreachable, upload } from './api';
import {
  duplicateCountPath,
  type Contact,
  type ContactPage,
  type DuplicatePage,
} from './contacts';

// The book kept on this device, so the installed app works offline: the
// last full copy of the contacts from the server, and the changes made
// without a connection. Those wait here until the user confirms syncing
// them; until then the list shows the copy with the changes on top.
// Stored in IndexedDB, one record per account; signing out deletes it all.

export type Values = {
  name: string;
  phone: string;
  birthday: string | null;
  reminder: string | null;
};
type Photo = Blob | 'remove';
// At most one change per contact: later edits fold into it.
type Change =
  | { kind: 'create'; id: string; values: Values; photo?: Blob }
  | { kind: 'update'; id: string; values: Partial<Values>; photo?: Photo }
  // `before` is what the delete replaced, so Undo can bring it back. A
  // contact created offline and deleted again never reaches the server.
  | { kind: 'delete'; id: string; before?: Change };
type Book = {
  userId: string;
  // Null until the server's list has been read once on this device.
  contacts: Contact[] | null;
  trashCount: number;
  duplicates: number;
  changes: Change[];
};

const dbName = 'dafarche-offline';
const storeName = 'books';
const fullPage = 100;

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let opening: Promise<IDBDatabase> | null = null;
function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(storeName, { keyPath: 'userId' });
    req.onsuccess = () => {
      // Another tab deleting the database (signing out) closes this one.
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return opening;
}
async function store(mode: IDBTransactionMode) {
  return (await database()).transaction(storeName, mode).objectStore(storeName);
}

// Signing out (or deleting the account) leaves nothing behind.
export async function forgetBooks() {
  try {
    if (opening) (await opening).close();
  } catch {
    // It never opened.
  }
  opening = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// Same rules as the API's search and duplicate check.
const nameKey = (value: string) =>
  value
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const phoneDigits = (value: string) =>
  asciiDigits(value).replace(/[^0-9]/g, '');
const phoneKey = (value: string) =>
  phoneDigits(value)
    .replace(/^(0098|98|0)([1-9][0-9]{9})$/, '0$2')
    .replace(/^(9[0-9]{9})$/, '0$1');
// The API stores a phone as an optional + and digits.
const storedPhone = (phone: string) =>
  (phone.startsWith('+') ? '+' : '') + phoneDigits(phone);
const arabicFirst = /^\s*[ء-يٮ-ۓۺ-ۿ]/;
const latinFirst = /^\s*[A-Za-zÀ-ɏ]/;
const collator = new Intl.Collator('fa');

const photoUrls = new WeakMap<Blob, string>();
function photoUrl(photo: Blob) {
  let url = photoUrls.get(photo);
  if (!url) photoUrls.set(photo, (url = URL.createObjectURL(photo)));
  return url;
}
function shaped(base: Contact, values: Partial<Values>, photo?: Photo) {
  const { birthday, ...rest } = values;
  return {
    ...base,
    ...rest,
    ...(rest.phone !== undefined ? { phone: storedPhone(rest.phone) } : {}),
    ...(birthday !== undefined
      ? { birthday: birthday && `${birthday}T00:00:00.000Z` }
      : {}),
    photoUrl:
      photo === 'remove' ? null : photo ? photoUrl(photo) : base.photoUrl,
  };
}
// Errors worth trying again later; anything else can never succeed (the
// contact was deleted elsewhere, say) and that change is set aside.
const retryable = (error: unknown) =>
  !(error instanceof ApiError) ||
  isUnreachable(error) ||
  error.status === 401 ||
  error.status === 429 ||
  (error.status >= 500 && error.code !== 'PHOTO_STORAGE_NOT_CONFIGURED');
const isTombstone = (change: Change) =>
  change.kind === 'delete' && change.before?.kind === 'create';
const newContact = (id: string, values: Values, photo?: Photo): Change => ({
  kind: 'create',
  id,
  values,
  photo: photo instanceof Blob ? photo : undefined,
});
// An edit folds into the change already waiting for that contact.
function folded(
  before: Change | undefined,
  id: string,
  values: Partial<Values>,
  photo?: Photo,
): Change {
  if (before?.kind === 'create')
    return {
      ...before,
      values: { ...before.values, ...values },
      photo:
        photo === 'remove'
          ? undefined
          : photo instanceof Blob
            ? photo
            : before.photo,
    };
  return {
    kind: 'update',
    id,
    values: { ...(before?.kind === 'update' ? before.values : {}), ...values },
    photo: photo ?? (before?.kind === 'update' ? before.photo : undefined),
  };
}

export class OfflineBook {
  private listeners = new Set<() => void>();
  private writing = Promise.resolve();
  private shown: Contact[] | null = null;
  // Bumped by saves made online, so an older full read never undoes them.
  private touched = 0;
  private constructor(
    private book: Book,
    private stored: boolean,
  ) {}

  static async open(userId: string) {
    try {
      const keys = await request((await store('readonly')).getAllKeys());
      // Another account's copy (its session ended elsewhere) goes.
      for (const key of keys)
        if (key !== userId)
          await request((await store('readwrite')).delete(key));
      const saved = await request((await store('readonly')).get(userId));
      return new OfflineBook(
        (saved as Book | undefined) ?? {
          userId,
          contacts: null,
          trashCount: 0,
          duplicates: 0,
          changes: [],
        },
        true,
      );
    } catch {
      // No storage (a private window): it works until the page closes.
      return new OfflineBook(
        { userId, contacts: null, trashCount: 0, duplicates: 0, changes: [] },
        false,
      );
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  // Changes waiting to be synced.
  pending = () => this.book.changes.filter((c) => !isTombstone(c)).length;
  hasCopy = () => this.book.contacts !== null;
  get trashCount() {
    return this.book.trashCount;
  }
  get duplicates() {
    return this.book.duplicates;
  }

  // Re-reads the stored book: another window of the app (the installed
  // app beside a browser tab) may have changed it.
  private async latest() {
    if (!this.stored) return;
    try {
      const saved = await request(
        (await store('readonly')).get(this.book.userId),
      );
      if (saved) {
        this.book = saved as Book;
        this.shown = null;
      }
    } catch {
      // Unavailable: the copy in memory stands.
    }
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  // Every change goes one after another, each on the latest stored book,
  // so no window's change is written over.
  private update(change: (book: Book) => Book) {
    const run = async () => {
      await this.latest();
      this.book = change(this.book);
      this.shown = null;
      this.notify();
      if (!this.stored) return;
      try {
        await request((await store('readwrite')).put(this.book));
      } catch {
        // Full or unavailable: the copy in memory still serves this visit.
      }
    };
    this.writing = this.writing.then(run, run);
    return this.writing;
  }
  // When this window comes back to the front.
  reload() {
    const run = async () => {
      await this.latest();
      this.notify();
    };
    this.writing = this.writing.then(run, run);
    return this.writing;
  }

  // The copy with the waiting changes applied.
  contacts() {
    if (this.shown) return this.shown;
    const byId = new Map((this.book.contacts ?? []).map((c) => [c.id, c]));
    for (const change of this.book.changes) {
      const base = byId.get(change.id);
      if (change.kind === 'delete') byId.delete(change.id);
      else if (change.kind === 'create')
        byId.set(
          change.id,
          shaped(
            {
              id: change.id,
              photoUrl: null,
              // Its public link exists once the server has it.
              shareToken: '',
              ...change.values,
            },
            change.values,
            change.photo,
          ),
        );
      else if (base)
        byId.set(change.id, shaped(base, change.values, change.photo));
    }
    return (this.shown = [...byId.values()]);
  }

  // A page of results like the API's: same search, same order.
  page(q: string, page: number, pageSize: number, locale: string) {
    const name = nameKey(q);
    const phone = /^[+0-9\s().-]+$/.test(asciiDigits(q)) ? phoneDigits(q) : '';
    const rank = (value: string) =>
      arabicFirst.test(value)
        ? locale === 'fa'
          ? 0
          : 1
        : latinFirst.test(value)
          ? locale === 'fa'
            ? 1
            : 0
          : 2;
    const found = this.contacts()
      .filter(
        (c) =>
          !q ||
          nameKey(c.name).includes(name) ||
          (phone !== '' && phoneDigits(c.phone).includes(phone)),
      )
      .sort(
        (a, b) =>
          rank(a.name) - rank(b.name) ||
          collator.compare(a.name, b.name) ||
          (a.id < b.id ? -1 : 1),
      );
    return {
      contacts: found.slice((page - 1) * pageSize, page * pageSize),
      trashCount: this.book.trashCount,
      pagination: {
        page,
        pageSize,
        total: found.length,
        totalPages: Math.ceil(found.length / pageSize),
      },
    } satisfies ContactPage;
  }

  // Others with this number, by the API's rule (+98, 0098, 0 alike).
  owners(phone: string, except?: string) {
    const key = phoneKey(phone);
    return this.contacts()
      .filter((c) => c.id !== except && phoneKey(c.phone) === key)
      .sort((a, b) => collator.compare(a.name, b.name))
      .slice(0, 3)
      .map(({ id, name }) => ({ id, name }));
  }

  // Before the first full read, the page the server sent is the copy.
  seed(page: ContactPage | null) {
    if (!page) return Promise.resolve();
    return this.update((book) =>
      book.contacts
        ? book
        : {
            ...book,
            contacts: page.contacts,
            trashCount: page.trashCount ?? 0,
          },
    );
  }

  // Reads the whole book from the server into the copy.
  async refresh() {
    const mark = this.touched;
    const byId = new Map<string, Contact>();
    let trashCount = 0;
    for (let page = 1; page <= 100; page++) {
      const result = await api<ContactPage>(
        `contacts?page=${page}&pageSize=${fullPage}`,
      );
      if (page === 1) trashCount = result.trashCount ?? 0;
      for (const contact of result.contacts) byId.set(contact.id, contact);
      if (page >= result.pagination.totalPages) break;
    }
    const duplicates = (await api<DuplicatePage>(duplicateCountPath)).pagination
      .total;
    if (mark !== this.touched) return;
    await this.update((book) => ({
      ...book,
      contacts: [...byId.values()],
      trashCount,
      duplicates,
    }));
  }

  // Keeps the copy current with what was just saved online.
  remember(contact: Contact) {
    this.touched++;
    return this.update((book) =>
      book.contacts
        ? {
            ...book,
            contacts: [
              ...book.contacts.filter((c) => c.id !== contact.id),
              contact,
            ],
          }
        : book,
    );
  }
  forget(id: string) {
    this.touched++;
    return this.update((book) =>
      book.contacts
        ? {
            ...book,
            contacts: book.contacts.filter((c) => c.id !== id),
            trashCount: book.trashCount + 1,
          }
        : book,
    );
  }

  // Saves a new contact or an edit on this device until the next sync.
  async save(
    id: string,
    create: boolean,
    values: Partial<Values>,
    photo?: Photo,
  ) {
    await this.update((book) => {
      const before = book.changes.find((c) => c.id === id);
      const change = create
        ? newContact(id, values as Values, photo)
        : folded(before, id, values, photo);
      return {
        ...book,
        changes: [...book.changes.filter((c) => c.id !== id), change],
      };
    });
    return this.contacts().find((c) => c.id === id)!;
  }

  remove(id: string) {
    return this.update((book) => {
      const before = book.changes.find((c) => c.id === id);
      const change: Change = { kind: 'delete', id, before };
      return {
        ...book,
        changes: [...book.changes.filter((c) => c.id !== id), change],
        trashCount: book.trashCount + (isTombstone(change) ? 0 : 1),
      };
    });
  }

  // Undo of a delete made offline; false when there was none to undo.
  async undo(id: string) {
    let undone = false;
    await this.update((book) => {
      const change = book.changes.find((c) => c.id === id);
      if (change?.kind !== 'delete') return book;
      undone = true;
      const changes = book.changes.filter((c) => c.id !== id);
      return {
        ...book,
        changes: change.before ? [...changes, change.before] : changes,
        trashCount: book.trashCount - (isTombstone(change) ? 0 : 1),
      };
    });
    return undone;
  }

  // Sends the waiting changes to the server, oldest first. Each one leaves
  // the queue once the server has it, so an interrupted sync resumes where
  // it stopped. Resolves with the names of changes that could not apply.
  async sync() {
    const skipped: string[] = [];
    await this.reload();
    while (this.book.changes.length) {
      const change = this.book.changes[0];
      const name =
        change.kind === 'delete'
          ? (this.book.contacts?.find((c) => c.id === change.id)?.name ?? '')
          : (this.contacts().find((c) => c.id === change.id)?.name ?? '');
      try {
        await this.push(change);
      } catch (error) {
        if (retryable(error)) throw error;
        skipped.push(name);
        const gone = error instanceof ApiError && error.status === 404;
        await this.settle(change.id, null, gone ? 'gone' : 'kept');
      }
    }
    return skipped;
  }

  // The change is done (or replaced by what is left of it); the copy takes
  // the server's answer.
  private settle(
    id: string,
    rest: Change | null,
    result: Contact | 'gone' | 'kept',
  ) {
    return this.update((book) => {
      const changes = book.changes.map((c) => (c.id === id ? rest : c));
      const contacts = book.contacts ?? [];
      return {
        ...book,
        changes: changes.filter((c): c is Change => c !== null),
        contacts:
          result === 'kept'
            ? contacts
            : [
                ...contacts.filter((c) => c.id !== id),
                ...(result === 'gone' ? [] : [result]),
              ],
      };
    });
  }

  private async push(change: Change): Promise<void> {
    const { id } = change;
    if (change.kind === 'delete') {
      if (change.before?.kind !== 'create')
        try {
          await api(`contacts/${id}`, undefined, { method: 'DELETE' });
        } catch (error) {
          // Already gone elsewhere: the same outcome.
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      return this.settle(id, null, 'gone');
    }
    if (change.kind === 'create') {
      const body = Object.fromEntries(
        Object.entries(change.values).filter(([, value]) => value !== null),
      );
      // The ID was made on this device; repeating the call is harmless.
      const { contact } = await api<{ contact: Contact }>('contacts', {
        id,
        ...body,
      });
      const rest: Change | null = change.photo
        ? { kind: 'update', id, values: {}, photo: change.photo }
        : null;
      await this.settle(id, rest, contact);
      return rest ? this.push(rest) : undefined;
    }
    let contact: Contact | null = null;
    if (Object.keys(change.values).length) {
      contact = (
        await api<{ contact: Contact }>(`contacts/${id}`, change.values, {
          method: 'PATCH',
        })
      ).contact;
      if (change.photo)
        await this.settle(id, { ...change, values: {} }, contact);
    }
    if (change.photo === 'remove')
      contact = (
        await api<{ contact: Contact }>(`contacts/${id}/photo`, undefined, {
          method: 'DELETE',
        })
      ).contact;
    else if (change.photo)
      contact = (
        await upload<{ contact: Contact }>(
          `contacts/${id}/photo`,
          'photo',
          change.photo,
        )
      ).contact;
    await this.settle(id, null, contact ?? 'kept');
  }
}

// A contact's ID, made here so the same save is never created twice.
export function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
