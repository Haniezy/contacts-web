import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { loginPath } from '@/lib/next-path';
import type { TrashedContact } from '@/lib/contacts';
import { TrashApp } from '@/components/contacts/trash-app';

export default async function Trash() {
  await requireUser('/contacts/trash');
  const response = await backendFetch(
    'contacts/trash',
    (await cookies()).toString(),
  );
  if (response.status === 401) redirect(loginPath('/contacts/trash'));
  const initial = response.ok
    ? ((await response.json()) as { contacts: TrashedContact[] }).contacts
    : null;
  return <TrashApp initial={initial} />;
}
