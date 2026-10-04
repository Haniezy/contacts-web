import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import type { Contact } from '@/lib/contacts';
import { ContactDetails } from '@/components/contacts/contact-details';

// Owner-scoped: the API returns 404 for another user's id, same as a missing one.
export default async function ContactDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const response = await backendFetch(
    `contacts/${encodeURIComponent(id)}`,
    (await cookies()).toString(),
  );
  if (response.status === 401) redirect('/login');
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error('Contacts service unavailable');
  const { contact } = (await response.json()) as { contact: Contact };
  return <ContactDetails contact={contact} />;
}
