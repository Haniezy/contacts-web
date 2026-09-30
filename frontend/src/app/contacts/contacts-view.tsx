import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import {
  countDuplicates,
  pageSize,
  type Contact,
  type ContactPage,
} from '@/lib/contacts';
import {
  ContactsApp,
  type FormState,
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
  // First page, duplicate counts and the edited contact load in parallel.
  const [list, byPhone, byName, edited] = await Promise.all([
    backendFetch(`contacts?page=1&pageSize=${pageSize}`, cookie),
    backendFetch('contacts/duplicates?by=phone&pageSize=100', cookie),
    backendFetch('contacts/duplicates?by=name&pageSize=100', cookie),
    form?.mode === 'edit'
      ? backendFetch(`contacts/${encodeURIComponent(form.id)}`, cookie)
      : null,
  ]);
  if (list.status === 401 || edited?.status === 401) redirect('/login');
  if (edited && (edited.status === 404 || edited.status === 400)) notFound();
  if (edited && !edited.ok) throw new Error('Contacts service unavailable');
  const initial = list.ok ? ((await list.json()) as ContactPage) : null;
  const duplicates =
    byPhone.ok && byName.ok
      ? countDuplicates(await Promise.all([byPhone.json(), byName.json()]))
      : 0;
  const initialForm: FormState | null = edited
    ? {
        mode: 'edit',
        contact: ((await edited.json()) as { contact: Contact }).contact,
      }
    : form
      ? { mode: 'new' }
      : null;
  const name = `${user.firstName} ${user.lastName}`.trim();
  const shown = name || user.email.split('@')[0];
  return (
    <ContactsApp
      user={{ name: shown, email: user.email, initial: [...shown][0] ?? '?' }}
      initial={initial}
      duplicates={duplicates}
      initialForm={initialForm}
    />
  );
}
