import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { accountUser, requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import {
  duplicateCountPath,
  pageSize,
  tagsPath,
  type Contact,
  type ContactPage,
  type DuplicatePage,
  type Tag,
} from '@/lib/contacts';
import {
  ContactsApp,
  type FormState,
  type InitialContacts,
} from '@/components/contacts/contacts-app';

// Shared by /contacts, /contacts/new and /contacts/[id]/edit: the list page,
// optionally with the contact form already open.
export async function ContactsView({
  form,
}: {
  form?: { mode: 'new' } | { mode: 'edit'; id: string };
}) {
  const user = await requireUser();
  const cookie = (await cookies()).toString();
  // The list, the duplicate count and the tags stream in behind the real
  // header (the page shows skeletons meanwhile); a failed list becomes the
  // retry toast.
  const initial: Promise<InitialContacts> = Promise.all([
    backendFetch(`contacts?page=1&pageSize=${pageSize}`, cookie)
      .then(async (list) =>
        list.ok ? ((await list.json()) as ContactPage) : null,
      )
      .catch(() => null),
    backendFetch(duplicateCountPath, cookie)
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as DuplicatePage).pagination.total
          : 0,
      )
      .catch(() => 0),
    backendFetch(tagsPath, cookie)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { tags: Tag[] }).tags : null,
      )
      .catch(() => null),
  ]).then(([page, duplicates, tags]) => ({ page, duplicates, tags }));
  const edited =
    form?.mode === 'edit'
      ? await backendFetch(`contacts/${encodeURIComponent(form.id)}`, cookie)
      : null;
  if (edited?.status === 401) redirect('/login');
  if (edited && (edited.status === 404 || edited.status === 400)) notFound();
  if (edited && !edited.ok) throw new Error('Contacts service unavailable');
  const initialForm: FormState | null = edited
    ? {
        mode: 'edit',
        contact: ((await edited.json()) as { contact: Contact }).contact,
      }
    : form
      ? { mode: 'new' }
      : null;
  return (
    <ContactsApp
      userId={user.id}
      user={accountUser(user)}
      initial={initial}
      initialForm={initialForm}
    />
  );
}
