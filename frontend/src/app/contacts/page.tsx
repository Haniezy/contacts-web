import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { countDuplicates, pageSize, type ContactPage } from '@/lib/contacts';
import { ContactsApp } from '@/components/contacts/contacts-app';

export default async function Contacts() {
  const user = await requireUser();
  const cookie = (await cookies()).toString();
  // First page and duplicate counts load in parallel on the server.
  const [list, ...duplicateResponses] = await Promise.all([
    backendFetch(`contacts?page=1&pageSize=${pageSize}`, cookie),
    backendFetch('contacts/duplicates?by=phone&pageSize=100', cookie),
    backendFetch('contacts/duplicates?by=name&pageSize=100', cookie),
  ]);
  if (list.status === 401) redirect('/login');
  const initial = list.ok ? ((await list.json()) as ContactPage) : null;
  const duplicates = duplicateResponses.every((r) => r.ok)
    ? countDuplicates(
        await Promise.all(duplicateResponses.map((r) => r.json())),
      )
    : 0;
  const name = `${user.firstName} ${user.lastName}`.trim();
  const shown = name || user.email.split('@')[0];
  return (
    <ContactsApp
      user={{ name: shown, email: user.email, initial: [...shown][0] ?? '?' }}
      initial={initial}
      duplicates={duplicates}
    />
  );
}
