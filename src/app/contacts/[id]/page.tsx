import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loginPath } from '@/lib/next-path';
import { backendFetch } from '@/lib/backend';
import type { Contact } from '@/lib/contacts';
import { ContactDetails } from '@/components/contacts/contact-details';

// Owner-scoped: the API returns 404 for another user's id, same as a missing one.
export default async function ContactDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A copied contact link opened while signed out comes back here.
  await requireUser(`/contacts/${id}`);
  const response = await backendFetch(
    `contacts/${encodeURIComponent(id)}`,
    (await cookies()).toString(),
  );
  if (response.status === 401) redirect(loginPath(`/contacts/${id}`));
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error('Contacts service unavailable');
  const { contact } = (await response.json()) as { contact: Contact };
  return <ContactDetails contact={contact} />;
}
