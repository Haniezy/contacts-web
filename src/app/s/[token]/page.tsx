import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import {
  SharedContact,
  type SharedContactData,
} from '@/components/contacts/shared-contact';

// A contact's public link: open to anyone who has it, no sign-in.
const load = cache(async (token: string) => {
  const response = await backendFetch(`share/${encodeURIComponent(token)}`, '');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Contacts service unavailable');
  return ((await response.json()) as { contact: SharedContactData }).contact;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const contact = await load((await params).token);
  // Shared contacts are personal; keep them out of search engines.
  return {
    title: contact?.name,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharedContactPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contact = await load(token);
  if (!contact) notFound();
  return <SharedContact contact={contact} token={token} />;
}
