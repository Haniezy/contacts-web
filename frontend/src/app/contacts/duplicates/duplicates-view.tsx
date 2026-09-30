import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { duplicatesPath, type DuplicatePage } from '@/lib/contacts';
import { DuplicatesApp } from '@/components/contacts/duplicates-app';

// Shared by /contacts/duplicates and /contacts/duplicates/merge?ids=…: the
// list, optionally with one group's merge view already open.
export async function DuplicatesView({ ids }: { ids?: string }) {
  await requireUser();
  const response = await backendFetch(
    duplicatesPath,
    (await cookies()).toString(),
  );
  if (response.status === 401) redirect('/login');
  const initial = response.ok
    ? ((await response.json()) as DuplicatePage)
    : null;
  const initialMerge =
    ids === undefined
      ? null
      : (initial?.groups.find(
          (group) => group.contacts.map((c) => c.id).join() === ids,
        ) ?? null);
  // A merged, ignored or changed group has nothing left to review.
  if (ids !== undefined && !initialMerge) redirect('/contacts/duplicates');
  return <DuplicatesApp initial={initial} initialMerge={initialMerge} />;
}
