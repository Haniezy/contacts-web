import { api, ApiError, asciiDigits, isUnreachable, upload } from './api';
import {
  duplicateCountPath,
  sameTags,
  tagsPath,
  type Contact,
  type ContactPage,
  type DuplicatePage,
  type Tag,
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
  tagIds?: string[];
};
type Photo = Blob | 'remove';
// At most one change per contact: later edits fold into it. A chosen photo
// carries a stamp (`photoAt`, from the book's counter), so a finished
// upload removes that photo only, never one chosen while it was on its way.
type Change =
  | {
      kind: 'create';
      id: string;
      values: Values;
      photo?: Blob;
      photoAt?: number;
      // Its request may have reached the server (the reply was lost, or
      // it is on its way): the contact may already exist there, with
      // `values`. Those stay as sent; later edits wait in `edits`.
      sent?: true;
      edits?: Partial<Values>;
    }
  | {
      kind: 'update';
      id: string;
      values: Partial<Values>;
      photo?: Photo;
      photoAt?: number;
    }
  // `before` is what the delete replaced, so Undo can bring it back. A
  // contact created offline and deleted again never reaches the server.
  // `sent`: the delete is on its way (or its reply was lost). Undo then
  // sets `restore`: once that request is over the contact is restored on
  // the server, and what `before` holds is sent after it.
  | {
      kind: 'delete';
      id: string;
      before?: Change;
      sent?: true;
      restore?: true;
    };
type Book = {
  userId: string;
  // Null until the server's list has been read once on this device.
  contacts: Contact[] | null;
  trashCount: number;
  duplicates: number;
  // The user's tags as the server last listed them (changing the list
  // itself needs a connection; giving a contact tags does not).
  tags?: Tag[];
  changes: Change[];
  // The last photo stamp handed out.
  rev?: number;
};
// What one request to the server carried: a new contact, fields of an
// edit, a photo (by its stamp) or a delete. Its answer settles that much.
type Part =
  | { kind: 'create' }
  | { kind: 'values'; values: Partial<Values> }
  | { kind: 'photo'; photoAt?: number }
  | { kind: 'delete' }
  | { kind: 'restore' };

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

// One address per waiting photo, by contact and stamp: the book is read
// again from storage after every change, as new Blob objects, and a new
// address each time would reload the picture and never be released.
const photoUrls = new Map<
  string,
  { stamp?: number; blob: Blob; url: string }
>();
function photoUrl(id: string, photo: Blob, stamp?: number) {
  const kept = photoUrls.get(id);
  if (
    kept &&
    (stamp === undefined ? kept.blob === photo : kept.stamp === stamp)
  )
    return kept.url;
  if (kept) URL.revokeObjectURL(kept.url);
  const url = URL.createObjectURL(photo);
  photoUrls.set(id, { stamp, blob: photo, url });
  return url;
}
function shaped(
  base: Contact,
  values: Partial<Values>,
  photo?: Photo,
  stamp?: number,
) {
  const { birthday, ...rest } = values;
  return {
    ...base,
    ...rest,
    ...(rest.phone !== undefined ? { phone: storedPhone(rest.phone) } : {}),
    ...(birthday !== undefined
      ? { birthday: birthday && `${birthday}T00:00:00.000Z` }
      : {}),
    photoUrl:
      photo === 'remove'
        ? null
        : photo
          ? photoUrl(base.id, photo, stamp)
          : base.photoUrl,
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
// A delete that never needs the server: its contact was made here and its
// creation was never sent.
const isTombstone = (change: Change) =>
  change.kind === 'delete' &&
  change.before?.kind === 'create' &&
  !change.before.sent;
const newContact = (
  id: string,
  values: Values,
  photo: Photo | undefined,
  stamp: number,
  sent: boolean,
): Change => ({
  kind: 'create',
  id,
  values,
  ...(photo instanceof Blob ? { photo, photoAt: stamp } : {}),
  ...(sent ? { sent: true as const } : {}),
});
// An edit folds into the change already waiting for that contact.
function folded(
  before: Change | undefined,
  id: string,
  values: Partial<Values>,
  photo: Photo | undefined,
  stamp: number,
): Change {
  if (before?.kind === 'create')
    return {
      ...before,
      ...(before.sent
        ? { edits: { ...before.edits, ...values } }
        : { values: { ...before.values, ...values } }),
      // A contact not yet on the server has no photo there to remove.
      ...(photo === 'remove'
        ? { photo: undefined, photoAt: undefined }
        : photo
          ? { photo, photoAt: stamp }
          : {}),
    };
  const earlier = before?.kind === 'update' ? before : undefined;
  return {
    kind: 'update',
    id,
    values: { ...earlier?.values, ...values },
    ...(photo
      ? { photo, photoAt: stamp }
      : { photo: earlier?.photo, photoAt: earlier?.photoAt }),
  };
}
// One field's value, as sent and as now (tags compare as a set).
const sameValue = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? sameTags(a, b) : a === b;
// What is left of an edit once the server has `part`: fields still holding
// the value that was sent are done; a field changed since stays, and so
// does a photo chosen since. Nothing left: undefined.
function remainder(change: Change, part: Part): Change | undefined {
  if (change.kind !== 'update') return change;
  const values =
    part.kind === 'values'
      ? Object.fromEntries(
          Object.entries(change.values).filter(
            ([key, value]) =>
              !(key in part.values) ||
              !sameValue(part.values[key as keyof Values], value),
          ),
        )
      : change.values;
  const photoDone = part.kind === 'photo' && change.photoAt === part.photoAt;
  const next = {
    ...change,
    values,
    ...(photoDone ? { photo: undefined, photoAt: undefined } : {}),
  };
  return Object.keys(next.values).length || next.photo ? next : undefined;
}
// A new contact the server now has: what was changed here since its
// request went out (edits, a photo) becomes an edit, sent next.
function confirmed(change: Change): Change | undefined {
  if (change.kind !== 'create') return change;
  const values = change.edits ?? {};
  return Object.keys(values).length || change.photo
    ? {
        kind: 'update',
        id: change.id,
        values,
        photo: change.photo,
        photoAt: change.photoAt,
      }
    : undefined;
}

export class OfflineBook {
  private listeners = new Set<() => void>();
  private writing = Promise.resolve();
  private shown: Contact[] | null = null;
  // Bumped by saves made online, so an older full read never undoes them.
  private touched = 0;
  // Other windows of the app on this account (the installed app beside a
  // browser tab): each change here is announced, and theirs re-read here.
  private channel: BroadcastChannel | null = null;
  private others = new Set<() => void>();
  private constructor(
    private book: Book,
    private stored: boolean,
  ) {
    if (!stored || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(`dafarche-book-${book.userId}`);
    this.channel.onmessage = () =>
      void this.reload().then(() => this.others.forEach((other) => other()));
  }

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
  // When the page that opened it goes away.
  close() {
    this.channel?.close();
    this.channel = null;
    this.others.clear();
  }
  // Called after another window changed the book (already re-read here).
  onOtherWindow = (listener: () => void) => {
    this.others.add(listener);
    return () => {
      this.others.delete(listener);
    };
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
        this.channel?.postMessage('changed');
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
    for (const waiting of this.book.changes) {
      // A delete being undone shows what it replaced, or the contact.
      const change =
        waiting.kind === 'delete' && waiting.restore ? waiting.before : waiting;
      if (!change) continue;
      const base = byId.get(change.id);
      if (change.kind === 'delete') byId.delete(change.id);
      else if (change.kind === 'create')
        byId.set(
          change.id,
          shaped(
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
              change.photoAt,
            ),
            change.edits ?? {},
          ),
        );
      else if (base)
        byId.set(
          change.id,
          shaped(base, change.values, change.photo, change.photoAt),
        );
    }
    return (this.shown = [...byId.values()]);
  }

  // The tags, each with how many contacts here carry it.
  tags(): Tag[] {
    const contacts = this.contacts();
    return (this.book.tags ?? []).map((tag) => ({
      ...tag,
      count: contacts.filter((c) => c.tagIds?.includes(tag.id)).length,
    }));
  }
  hasTags = () => this.book.tags !== undefined;

  // A page of results like the API's: same search, same order.
  page(
    q: string,
    page: number,
    pageSize: number,
    locale: string,
    tag?: string,
  ) {
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
          (!tag || c.tagIds?.includes(tag)) &&
          (!q ||
            nameKey(c.name).includes(name) ||
            (phone !== '' && phoneDigits(c.phone).includes(phone))),
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
    const { tags } = await api<{ tags: Tag[] }>(tagsPath);
    if (mark !== this.touched) return;
    await this.update((book) => ({
      ...book,
      contacts: [...byId.values()],
      trashCount,
      duplicates,
      tags,
    }));
  }

  // The tag list as the server now has it (after a change made online).
  keepTags(tags: Tag[]) {
    return this.update((book) => ({ ...book, tags }));
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
  // `sent`: a new contact whose request may already have reached the
  // server (it was sent and no reply came).
  async save(
    id: string,
    create: boolean,
    values: Partial<Values>,
    photo?: Photo,
    sent = false,
  ) {
    await this.update((book) => {
      const before = book.changes.find((c) => c.id === id);
      const stamp = (book.rev ?? 0) + 1;
      const change = create
        ? newContact(id, values as Values, photo, stamp, sent)
        : before?.kind === 'delete' && before.restore
          ? // Its delete is being undone: the edit waits behind that.
            {
              ...before,
              before: folded(before.before, id, values, photo, stamp),
            }
          : folded(before, id, values, photo, stamp);
      return {
        ...book,
        rev: stamp,
        changes: [...book.changes.filter((c) => c.id !== id), change],
      };
    });
    return this.contacts().find((c) => c.id === id)!;
  }

  remove(id: string) {
    return this.update((book) => {
      const before = book.changes.find((c) => c.id === id);
      const change: Change =
        before?.kind === 'delete' && before.restore
          ? // Deleted again while that delete was being undone.
            { ...before, restore: undefined }
          : { kind: 'delete', id, before };
      return {
        ...book,
        changes: [...book.changes.filter((c) => c.id !== id), change],
        trashCount: book.trashCount + (isTombstone(change) ? 0 : 1),
      };
    });
  }

  // Undo of a delete waiting here; false when there is none (it is done,
  // and the server restores it). A delete already on its way is not
  // called back: the contact is restored on the server once it is over.
  async undo(id: string) {
    let undone = false;
    await this.update((book) => {
      const change = book.changes.find((c) => c.id === id);
      if (change?.kind !== 'delete' || change.restore) return book;
      undone = true;
      if (change.sent)
        return {
          ...book,
          changes: book.changes.map((c) =>
            c === change ? { ...change, restore: true as const } : c,
          ),
          trashCount: book.trashCount - 1,
        };
      const changes = book.changes.filter((c) => c.id !== id);
      return {
        ...book,
        changes: change.before ? [...changes, change.before] : changes,
        trashCount: book.trashCount - (isTombstone(change) ? 0 : 1),
      };
    });
    return undone;
  }

  // Sends the waiting changes to the server, oldest first, one request at
  // a time. Each answer settles only what its request carried (see
  // `settle`), so a change made meanwhile is never lost, and an
  // interrupted sync resumes where it stopped. Resolves with the names of
  // changes set aside because they can no longer apply (the contact was
  // deleted elsewhere, say) and, when it stopped before the queue was
  // empty, the error that stopped it.
  // One window syncs at a time (a lock shared by the account's windows):
  // a second one waits, then finds what the first already sent gone.
  async sync(): Promise<{ skipped: string[]; error?: unknown }> {
    const run = () => this.syncNow();
    if (typeof navigator === 'undefined' || !navigator.locks) return run();
    return await navigator.locks.request(
      `dafarche-sync-${this.book.userId}`,
      run,
    );
  }
  private async syncNow(): Promise<{ skipped: string[]; error?: unknown }> {
    const skipped: string[] = [];
    await this.reload();
    for (
      let change = this.book.changes[0];
      change;
      change = this.book.changes[0]
    ) {
      const { id } = change;
      const name = this.nameOf(change);
      this.sending = undefined;
      try {
        await this.push(change);
      } catch (error) {
        if (retryable(error)) return { skipped, error };
        const gone = error instanceof ApiError && error.status === 404;
        const latest = this.book.changes.find((c) => c.id === id);
        // Deleted here and gone there: what was wanted happened (unless
        // the delete was being undone).
        if (!(gone && latest?.kind === 'delete' && !latest.restore))
          skipped.push(name);
        // Gone, or a new contact refused: nothing of it can apply. An edit
        // refused: that request's part is set aside, what was changed here
        // since stays.
        // (`sending` is set by `push`, which TypeScript cannot follow.)
        const sent = this.sending as Part | undefined;
        const part = sent?.kind === 'create' ? undefined : sent;
        await this.settle(id, gone ? 'gone' : 'kept', part);
      }
    }
    return { skipped };
  }
  // What the request in flight carries, for setting it aside if refused.
  private sending: Part | undefined;

  private nameOf(change: Change) {
    const shown = this.contacts().find((c) => c.id === change.id)?.name;
    const known = this.book.contacts?.find((c) => c.id === change.id)?.name;
    const made =
      change.kind === 'delete' && change.before?.kind === 'create'
        ? change.before.values.name
        : undefined;
    return shown ?? known ?? made ?? '';
  }

  // The server's answer to one request. `contact`: the contact as it now
  // is there; 'gone': not there any more; 'kept': no answer to take (the
  // request was refused). Only `part` leaves the queue: what was changed
  // here since, stays. Without `part`, or gone without a delete having
  // been asked for, nothing of the change can apply and it all goes.
  private settle(id: string, contact: Contact | 'gone' | 'kept', part?: Part) {
    this.touched++;
    return this.update((book) => {
      const others = (book.contacts ?? []).filter((c) => c.id !== id);
      const changes = book.changes.flatMap((change): Change[] => {
        if (change.id !== id) return [change];
        if (!part || (contact === 'gone' && part.kind !== 'delete')) return [];
        let next: Change | undefined;
        if (part.kind === 'create')
          next =
            change.kind === 'delete' && change.before
              ? { ...change, before: confirmed(change.before) }
              : confirmed(change);
        else if (part.kind === 'delete')
          next =
            change.kind !== 'delete'
              ? change
              : change.restore
                ? change
                : undefined;
        else if (part.kind === 'restore')
          next =
            change.kind !== 'delete' || !change.restore
              ? change
              : contact === 'kept'
                ? // Never created: its creation is sent again.
                  change.before
                : change.before && confirmed(change.before);
        else if (change.kind === 'delete' && change.before)
          next = { ...change, before: remainder(change.before, part) };
        else next = remainder(change, part);
        return next ? [next] : [];
      });
      // Deleted there, but being undone here: the copy keeps it.
      const restoring = changes.some(
        (c) => c.id === id && c.kind === 'delete' && c.restore,
      );
      return {
        ...book,
        changes,
        contacts:
          contact === 'kept' || (contact === 'gone' && restoring)
            ? book.contacts
            : contact === 'gone'
              ? book.contacts && others
              : [...others, contact],
      };
    });
  }

  // Sends one request for the change at the head of the queue and settles
  // its answer.
  private async push(change: Change) {
    const { id } = change;
    if (change.kind === 'delete' && change.restore) return this.restore(change);
    if (change.kind === 'delete') {
      const part: Part = { kind: 'delete' };
      this.sending = part;
      if (!isTombstone(change)) {
        // Changed meanwhile (undone): start over from the queue.
        if (!(await this.mark(id, 'delete')).change) return;
        try {
          await api(`contacts/${id}`, undefined, { method: 'DELETE' });
        } catch (error) {
          // Already gone elsewhere: the same outcome.
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      }
      return this.settle(id, 'gone', part);
    }
    if (change.kind === 'create') {
      const { change: marked, wasSent: ambiguous } = await this.mark(
        id,
        'create',
      );
      // Changed meanwhile (deleted): start over from the queue.
      if (marked?.kind !== 'create') return;
      const { values } = marked;
      const part: Part = { kind: 'create' };
      this.sending = part;
      const body = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== null),
      );
      // The ID was made on this device; repeating the call creates nothing
      // and answers with the contact as the server has it.
      let { contact } = await api<{ contact: Contact }>('contacts', {
        id,
        ...body,
      });
      // That answer comes even for a contact since moved to the trash
      // elsewhere; a 404 here sets the change aside as not applied.
      if (ambiguous)
        contact = (await api<{ contact: Contact }>(`contacts/${id}`)).contact;
      return this.settle(id, contact, part);
    }
    if (Object.keys(change.values).length) {
      const part: Part = { kind: 'values', values: change.values };
      this.sending = part;
      const { contact } = await api<{ contact: Contact }>(
        `contacts/${id}`,
        change.values,
        { method: 'PATCH' },
      );
      return this.settle(id, contact, part);
    }
    const part: Part = { kind: 'photo', photoAt: change.photoAt };
    this.sending = part;
    let contact: Contact | 'kept' = 'kept';
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
    return this.settle(id, contact, part);
  }

  // An undone delete that may have reached the server: restore it there.
  // Not in the trash (404) means the delete never arrived, so the contact
  // is checked; if it was made here and never created, its creation waits
  // to be sent again.
  private async restore(change: Change) {
    const { id } = change;
    const part: Part = { kind: 'restore' };
    this.sending = part;
    let contact: Contact | 'kept';
    try {
      ({ contact } = await api<{ contact: Contact }>(
        `contacts/${id}/restore`,
        {},
      ));
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      try {
        ({ contact } = await api<{ contact: Contact }>(`contacts/${id}`));
      } catch (missing) {
        const made =
          change.kind === 'delete' && change.before?.kind === 'create';
        if (!(missing instanceof ApiError && missing.status === 404) || !made)
          throw missing;
        contact = 'kept';
      }
    }
    return this.settle(id, contact, part);
  }

  // Before a create or delete goes out it is marked as sent, and stored,
  // so a lost reply or a closed window leaves it known as maybe done. For
  // a create this also fixes the values sent: later edits go to `edits`.
  // Resolves with the change as marked (none when the contact's change is
  // no longer of that kind) and whether it was sent before: a create sent
  // before had its reply lost, so the contact may exist already.
  private async mark(id: string, kind: 'create' | 'delete') {
    let marked: Change | undefined;
    let wasSent = false;
    await this.update((book) => ({
      ...book,
      changes: book.changes.map((change) => {
        if (change.id !== id || change.kind !== kind) return change;
        wasSent = Boolean(change.sent);
        marked = change.sent ? change : { ...change, sent: true };
        return marked;
      }),
    }));
    return { change: marked, wasSent };
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
