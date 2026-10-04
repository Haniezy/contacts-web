import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { backendFetch } from './backend';

export const getUser = cache(async () => {
  const cookie = (await cookies()).toString();
  if (!(await cookies()).has('contacts_session')) return null;
  const response = await backendFetch('auth/me', cookie);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Authentication service unavailable');
  return (await response.json()).user as {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
  };
});
// Display fields shared by the header, the menu and the account pages.
export function accountUser(
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>,
) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  const shown = name || user.email.split('@')[0];
  return {
    name: shown,
    email: user.email,
    initial: [...shown][0] ?? '?',
    photoUrl: user.photoUrl,
  };
}
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
